// End-to-end MCP handoff acceptance with an isolated SQLite store and model adapter.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkCore } from "../dist/core/index.js";
import { WorkPetHttpBridge } from "../dist/bridge/http-bridge.js";
import { WorkPetMcpHandler } from "../dist/bridge/mcp-handler.js";
import { ContinuationService } from "../dist/handoff/continuation.js";

const run = new Date().toISOString().replace(/[:.]/g, "-");
const output = join(process.cwd(), "output/handoff-stages", run);
mkdirSync(output, { recursive: true });
const directory = mkdtempSync(join(tmpdir(), "worket-handoff-stages-"));
const core = createWorkCore({ databasePath: join(directory, "workpet.sqlite") });
const scenarios = new Map();
const generated = new Map();
let activeScenario = null;

function newWork(name) {
  const work = core.createWork({
    definition: { key: "general-work", name, version: 1 },
    executor: { type: "AGENT", name: "fixture" },
    environment: { type: "CODEX_DESKTOP", name: "QA" },
    source: { adapter: "qa", conversationId: randomUUID() },
  });
  return work.instance.id;
}

function append(workId, externalId, kind, content) {
  const work = core.getWork(workId);
  const sequence = Math.max(0, ...work.sourceArchive.map(event => event.sequence)) + 1;
  const event = core.appendSourceEvents(workId, [{
    externalId,
    sequence,
    kind,
    content,
    timestamp: new Date(Date.now() + sequence).toISOString(),
    executorType: kind === "user.prompt" ? "HUMAN" : "TOOL",
    environmentType: "CODEX_DESKTOP",
    metadata: { worketSource: { adapter: "qa", conversationId: work.activeBinding.conversationId, externalId } },
    artifactRefs: [],
  }]).work.sourceArchive.find(item => item.externalId === externalId);
  return event;
}

function attachArtifact(workId, filename, text) {
  const path = join(directory, filename);
  writeFileSync(path, text);
  const stat = readFileSync(path);
  core.addArtifactRef(workId, {
    path,
    filename,
    role: "OUTPUT",
    mimeType: "text/plain",
    size: stat.byteLength,
    sha256: createHash("sha256").update(stat).digest("hex"),
    lastModifiedAt: new Date().toISOString(),
    availability: "AVAILABLE",
  });
  return core.getWork(workId).artifactRefs.find(artifact => artifact.path === path);
}

const claim = (event, text, excerptTexts = [event.content.slice(0, Math.min(90, event.content.length))]) => ({
  text,
  sourceEventIds: [event.id],
  excerpts: excerptTexts.map(excerpt => ({ sourceEventId: event.id, text: excerpt })),
});
const evidence = (event, object, version, result, excerpt = event.content.slice(0, Math.min(90, event.content.length))) => ({
  id: "evidence-" + event.id,
  object,
  version,
  scope: object,
  result,
  sourceEventId: event.id,
  excerpt,
});
const requirement = (id, kind, item, scope = { kind: "WORK", ids: [] }, status = "ACTIVE", supersedes = [], replacementEvidence = []) =>
  ({ id, kind, claim: item, scope, status, supersedes, replacementEvidence });

function makeM1Candidate(input, workId) {
  const events = input.events;
  const find = marker => events.find(event => event.content.includes(marker));
  const objective = find("年度销售汇报");
  const clean = find("清洗阶段完成");
  const cleanCheck = find("检查结果：data-v1");
  const cleanAccept = find("用户确认 data-v1");
  const chart = find("图表阶段完成");
  const chartCheck = find("检查结果：chart-v1");
  const chartAccept = find("用户确认 chart-v1");
  const report = find("当前阶段：撰写汇报");
  const cleanArtifact = core.getWork(workId).artifactRefs.find(item => item.filename === "data-v1.txt");
  const chartArtifact = core.getWork(workId).artifactRefs.find(item => item.filename === "chart-v1.txt");
  const dataOutcome = {
    id: "data-v1",
    summary: claim(clean, "完成数据清洗，输出 data-v1。"),
    artifactRefId: cleanArtifact.id,
    version: "sha256:" + cleanArtifact.sha256,
    checks: [evidence(cleanCheck, "data-v1", "source:" + cleanCheck.id, "检查通过")],
    acceptance: "ACCEPTED",
    acceptanceEvidence: [evidence(cleanAccept, "data-v1", "source:" + cleanAccept.id, "用户确认可复用")],
  };
  const chartOutcome = {
    id: "chart-v1",
    summary: claim(chart, "基于 data-v1 完成 chart-v1。"),
    artifactRefId: chartArtifact.id,
    version: "sha256:" + chartArtifact.sha256,
    checks: [evidence(chartCheck, "chart-v1", "source:" + chartCheck.id, "检查通过")],
    acceptance: "ACCEPTED",
    acceptanceEvidence: [evidence(chartAccept, "chart-v1", "source:" + chartAccept.id, "用户确认可复用")],
  };
  const stages = [
    { id: "clean", task: claim(clean, "清洗数据"), execution: "SUPPORTED_DONE", completionEvidence: [evidence(cleanCheck, "data-v1", "source:" + cleanCheck.id, "检查通过")], outcomes: [dataOutcome], dependsOn: [], remaining: [], blockers: [] },
    { id: "chart", task: claim(chart, "根据 data-v1 制图"), execution: "SUPPORTED_DONE", completionEvidence: [evidence(chartCheck, "chart-v1", "source:" + chartCheck.id, "检查通过")], outcomes: [chartOutcome], dependsOn: [{ stageId: "clean", outcomeId: "data-v1", version: dataOutcome.version }], remaining: [], blockers: [] },
    { id: "report", task: claim(report, "撰写销售汇报"), execution: "IN_PROGRESS", completionEvidence: [], outcomes: [], dependsOn: [{ stageId: "chart", outcomeId: "chart-v1", version: chartOutcome.version }], remaining: [claim(report, "基于 data-v1 和 chart-v1 撰写汇报")], blockers: [] },
  ];
  return {
    coveredSourceEventIds: events.map(event => event.id),
    objective: [claim(objective, "完成年度销售汇报")],
    currentStageId: "report",
    currentStageBasis: [claim(report, "当前阶段是撰写汇报")],
    stages,
    requirements: [requirement("currency-rmb", "CONSTRAINT", claim(objective, "金额使用人民币"))],
    uncertainties: [],
  };
}

function makeM2Candidate(input) {
  const find = marker => input.events.find(event => event.content.includes(marker));
  const goal = find("完成报表交付");
  const csv = find("先导出 CSV");
  const pdf = find("取消 CSV，改为 PDF");
  const scope = find("人民币金额");
  const task = claim(pdf, "按最新要求导出 PDF");
  return {
    coveredSourceEventIds: input.events.map(event => event.id),
    objective: [claim(goal, "完成报表交付")],
    currentStageId: "export-pdf",
    currentStageBasis: [task],
    stages: [{ id: "export-pdf", task, execution: "IN_PROGRESS", completionEvidence: [], outcomes: [], dependsOn: [], remaining: [task], blockers: [] }],
    requirements: [
      requirement("format-csv", "DECISION", claim(csv, "交付 CSV"), { kind: "WORK", ids: [] }, "SUPERSEDED"),
      requirement("format-pdf", "DECISION", task, { kind: "WORK", ids: [] }, "ACTIVE", ["format-csv"], [claim(pdf, "取消 CSV，改为 PDF")]),
      requirement("currency-rmb", "CONSTRAINT", claim(scope, "金额使用人民币")),
    ],
    uncertainties: [],
  };
}

function makeM3Candidate(input) {
  const find = marker => input.events.find(event => event.content.includes(marker));
  const goal = find("整体目标：完成销售汇报");
  const clean = find("Agent 自报：数据清洗完成");
  const chart = find("现在开始制作图表");
  const task = claim(chart, "开始制作图表");
  const output = {
    id: "clean-output-v1",
    summary: claim(clean, "Agent 报告已产出 clean-output-v1。"),
    artifactRefId: null,
    version: "source:" + clean.id,
    checks: [],
    acceptance: "UNKNOWN",
    acceptanceEvidence: [],
  };
  return {
    coveredSourceEventIds: input.events.map(event => event.id),
    objective: [claim(goal, "完成销售汇报")],
    currentStageId: "chart",
    currentStageBasis: [task],
    stages: [
      { id: "clean", task: claim(clean, "清洗数据"), execution: "REPORTED_DONE", completionEvidence: [evidence(clean, "clean-output-v1", output.version, "Agent 自报完成，尚未独立核验")], outcomes: [output], dependsOn: [], remaining: [], blockers: [] },
      { id: "chart", task, execution: "IN_PROGRESS", completionEvidence: [], outcomes: [], dependsOn: [{ stageId: "clean", outcomeId: output.id, version: output.version }], remaining: [task], blockers: [claim(clean, "先核查 Agent 自报的 clean-output-v1 是否存在且可用。")] },
    ],
    requirements: [requirement("currency-rmb", "CONSTRAINT", claim(goal, "金额使用人民币"))],
    uncertainties: [claim(clean, "清洗阶段只有 Agent 自报，缺少可独立核验的产物或检查结果。")],
  };
}

function makeM6Candidate(input) {
  const find = marker => input.events.find(event => event.content.includes(marker));
  const goal = find("目标：完成周报");
  const clean = find("用户要求回到清洗");
  const cleanCheck = find("旧清洗结果通过检查");
  const cleanAccept = find("用户此前确认 clean-v1");
  const chart = find("暂停后续图表");
  const report = find("之后再撰写周报");
  const task = claim(clean, "回到数据清洗阶段并核验输入");
  const oldClean = {
    id: "clean-v1",
    summary: claim(cleanCheck, "此前 clean-v1 曾通过检查。"),
    artifactRefId: null,
    version: "source:" + cleanCheck.id,
    checks: [evidence(cleanCheck, "clean-v1", "source:" + cleanCheck.id, "历史检查通过")],
    acceptance: "ACCEPTED",
    acceptanceEvidence: [evidence(cleanAccept, "clean-v1", "source:" + cleanAccept.id, "用户此前确认")],
  };
  return {
    coveredSourceEventIds: input.events.map(event => event.id),
    objective: [claim(goal, "完成周报")],
    currentStageId: "clean",
    currentStageBasis: [task],
    stages: [
      { id: "clean", task, execution: "IN_PROGRESS", completionEvidence: [], outcomes: [oldClean], dependsOn: [], remaining: [task], blockers: [] },
      { id: "chart", task: claim(chart, "基于清洗结果更新图表"), execution: "REPORTED_DONE", completionEvidence: [], outcomes: [{ id: "chart-v2", summary: claim(chart, "已有 chart-v2，需核验数据依赖。"), artifactRefId: null, version: "source:" + chart.id, checks: [], acceptance: "UNKNOWN", acceptanceEvidence: [] }], dependsOn: [{ stageId: "clean", outcomeId: "clean-v1", version: oldClean.version }], remaining: [claim(chart, "清洗阶段回退后，核对图表是否仍匹配当前数据版本。")], blockers: [] },
      { id: "report", task: claim(report, "更新周报"), execution: "NOT_STARTED", completionEvidence: [], outcomes: [], dependsOn: [{ stageId: "chart", outcomeId: "chart-v2", version: "source:" + chart.id }], remaining: [claim(report, "图表核验后再撰写周报")], blockers: [] },
    ],
    requirements: [requirement("pause-downstream", "DECISION", claim(clean, "先暂停下游图表和周报，核查清洗阶段"))],
    uncertainties: [],
  };
}

function makeAstroCandidate(input) {
  const find = marker => input.events.find(event => event.content.includes(marker));
  const initial = find("review 这个 Astro 项目");
  const mapConfirm = find("是，按这个效果修改");
  const oldFeedback = find("我之前");
  const conversion = find("file:///Users/dandi/geo-website/MentiFem/index.html");
  const hero = find("找到认同感，然后往下去看");
  const mapReport = find("三张医院卡片重新悬浮在地图上");
  const mapStage = {
    id: "map",
    task: claim(initial, "完成地图 redesign：保留医院浮卡，不连接城市；航线持续流动，箭头模糊汇聚中国中部。", ["医院卡片和箭头并不是连起来的， 卡片只有在鼠标浮上去的时候才会动，但是线是无论如何都在流动的"]),
    execution: "REPORTED_DONE",
    completionEvidence: [evidence(mapReport, "map redesign", "source:" + mapReport.id, "Agent 历史报告称恢复三张浮卡、使用五张图片，构建和桌面/手机检查通过；当前文件状态未复核。", "三张医院卡片重新悬浮在地图上。")],
    outcomes: [{
      id: "地图",
      summary: claim(conversion, "用户认可地图 redesign 的方向；这不等于当前文件实现验收，具体源码版本未绑定。", ["这点你刚刚已经做的很好了"]),
      artifactRefId: null,
      version: "source:" + conversion.id,
      checks: [],
      acceptance: "ACCEPTED",
      acceptanceEvidence: [evidence(conversion, "地图", "source:" + conversion.id, "用户明确正向评价此前地图 redesign 方向", "这点你刚刚已经做的很好了")],
    }],
    dependsOn: [],
    remaining: [],
    blockers: [],
  };
  const heroTask = claim(hero, "重新设计 Hero：先建立处境认同，再引导继续向下阅读。", ["找到认同感，然后往下去看"]);
  const stages = [
    mapStage,
    { id: "hero", task: heroTask, execution: "IN_PROGRESS", completionEvidence: [], outcomes: [], dependsOn: [{ stageId: "map", outcomeId: "地图", version: mapStage.outcomes[0].version }], remaining: [claim(oldFeedback, "只读定位 09:33 切点源码快照；若不可用，记录当前页与旧版差异及拟改范围，不执行历史接力修改，也不声称复现该切点。")], blockers: [] },
  ];
  return {
    coveredSourceEventIds: input.events.map(event => event.id),
    objective: [claim(conversion, "以转化为第一优先级精修 MentiFem Astro landing page", ["转化是第一要素"])],
    currentStageId: "hero",
    currentStageBasis: [heroTask],
    stages,
    requirements: [
      requirement("map-layout", "DECISION", claim(initial, "医院卡片悬浮在地图上，不连城市线；卡片只在 hover 时轻微移动，航线持续流动，箭头模糊汇聚中国中部。", ["医院卡片和箭头并不是连起来的， 卡片只有在鼠标浮上去的时候才会动，但是线是无论如何都在流动的， 并且，那些箭头们指向的并不是具体的地方， 只要是模糊地在中央就可以了。"]), { kind: "STAGE", ids: ["map"] }),
      requirement("map-interaction-confirmed", "DECISION", claim(mapConfirm, "用户确认按已复述的地图交互规则修改。", ["是，按这个效果修改"]), { kind: "STAGE", ids: ["map"] }),
      requirement("page-polish", "CONSTRAINT", claim(initial, "全页精简冗长和 AI 腔文案，修正不合理排版及模块间距。", ["把里面太多废话的地方，以及 Ai 味道太重的地方， 还有格式不合理的地方， 模块之间的间距很多地方都不对， 都要修改一下。"])),
      requirement("keep-conversion", "CONSTRAINT", claim(conversion, "以旧版 index.html 为主要参考，保留已有价格；费用比较、服务卖点和转化入口按旧版核对后保留。", ["file:///Users/dandi/geo-website/MentiFem/index.html 我希望你主要参考这个", "价格你也帮我删掉了。 我这个是 landiing page， 转化是第一要素"])),
      requirement("rich-imagery", "CONSTRAINT", claim(oldFeedback, "使用丰富图片背景提升真实性与视觉冲击。", ["我需要非常丰富的图片作为背景提升真实性。"])),
      requirement("hero-recognition", "SUCCESS_CRITERION", heroTask, { kind: "STAGE", ids: ["hero"] }),
    ],
    uncertainties: [claim(conversion, "仅凭这段对话无法证明 09:33 切点的源码版本；接手时应先定位历史版本并与当前状态分开。", ["我希望你主要参考这个", "这点你刚刚已经做的很好了"])],
  };
}

function makeInvalidCandidate(input, scenario) {
  const candidate = makeM2Candidate(input);
  if (scenario === "missing-coverage") candidate.coveredSourceEventIds.pop();
  if (scenario === "dependency-cycle") {
    candidate.stages[0].dependsOn = [{ stageId: "export-pdf", outcomeId: "one", version: "source:" + input.events[0].id }];
    candidate.stages[0].outcomes = [{ id: "one", summary: candidate.stages[0].task, artifactRefId: null, version: "source:" + input.events[0].id, checks: [], acceptance: "UNKNOWN", acceptanceEvidence: [] }];
  }
  return candidate;
}

const workM1 = newWork("M1 sequential report");
append(workM1, "m1-goal", "user.prompt", "整体目标：完成年度销售汇报，金额使用人民币。");
append(workM1, "m1-clean", "agent.message", "清洗阶段完成，输出 data-v1。");
append(workM1, "m1-clean-check", "tool.result", "检查结果：data-v1 校验通过。");
append(workM1, "m1-clean-accept", "user.prompt", "用户确认 data-v1 清洗结果可以复用。");
append(workM1, "m1-chart", "agent.message", "图表阶段完成，基于 data-v1 输出 chart-v1。");
append(workM1, "m1-chart-check", "tool.result", "检查结果：chart-v1 构建校验通过。");
append(workM1, "m1-chart-accept", "user.prompt", "用户确认 chart-v1 图表可以复用。");
append(workM1, "m1-report", "user.prompt", "当前阶段：撰写汇报。");
append(workM1, "m1-progress", "user.prompt", "现在进度怎么样？");
attachArtifact(workM1, "data-v1.txt", "data v1");
attachArtifact(workM1, "chart-v1.txt", "chart v1");
core.applyExtractorPatch(workM1, {
  constraints: [{ id: "rmb", text: "金额使用人民币", origin: "USER_STATED", sourceMessageIds: [core.getWork(workM1).sourceArchive[0].id] }],
});
scenarios.set(workM1, input => makeM1Candidate(input, workM1));

const workM2 = newWork("M2 revised output requirement");
append(workM2, "m2-goal", "user.prompt", "目标：完成报表交付。");
append(workM2, "m2-csv", "user.prompt", "先导出 CSV。");
append(workM2, "m2-pdf", "user.prompt", "取消 CSV，改为 PDF。");
append(workM2, "m2-currency", "user.prompt", "人民币金额。");
scenarios.set(workM2, input => makeM2Candidate(input));

const workM3 = newWork("M3 prior agent report not accepted");
append(workM3, "m3-goal", "user.prompt", "整体目标：完成销售汇报，金额使用人民币。");
append(workM3, "m3-clean", "agent.message", "Agent 自报：数据清洗完成，已有 clean-output-v1。");
append(workM3, "m3-chart", "user.prompt", "现在开始制作图表。");
scenarios.set(workM3, input => makeM3Candidate(input));

const workM5 = newWork("M5 denial is not completion");
append(workM5, "m5-goal", "user.prompt", "目标：完成报表交付。");
append(workM5, "m5-csv", "user.prompt", "先导出 CSV。");
append(workM5, "m5-pdf", "user.prompt", "取消 CSV，改为 PDF。");
append(workM5, "m5-currency", "user.prompt", "人民币金额。");
append(workM5, "m5-user", "user.prompt", "不能声称已完成导出，导出还没跑。");
scenarios.set(workM5, input => {
  const candidate = makeM2Candidate(input);
  candidate.stages[0].execution = "SUPPORTED_DONE";
  candidate.stages[0].completionEvidence = [evidence(input.events.at(-1), "PDF", "source:" + input.events.at(-1).id, "导出完成")];
  return candidate;
});

const workM6 = newWork("M6 return to previous stage");
append(workM6, "m6-goal", "user.prompt", "目标：完成周报。");
append(workM6, "m6-check", "tool.result", "旧清洗结果通过检查，clean-v1。");
append(workM6, "m6-accept", "user.prompt", "用户此前确认 clean-v1 可以复用。");
append(workM6, "m6-clean", "user.prompt", "用户要求回到清洗阶段；核验新的数据输入。");
append(workM6, "m6-chart", "user.prompt", "暂停后续图表，清洗通过后再更新图表。");
append(workM6, "m6-report", "user.prompt", "之后再撰写周报。");
scenarios.set(workM6, input => makeM6Candidate(input));

const workAstro = newWork("MentiFem Astro selected real conversation");
append(workAstro, "01a0c330-3be6-7b10-a899-fbc25ac82960", "user.prompt",
  "/Users/dandi/geo-website/MentiFem， review 这个 Astro 项目， 把里面太多废话的地方，以及 Ai 味道太重的地方， 还有格式不合理的地方， 模块之间的间距很多地方都不对， 都要修改一下。 同时我还需要你， 再修改一下，那个地图，医院卡片和箭头并不是连起来的， 卡片只有在鼠标浮上去的时候才会动，但是线是无论如何都在流动的， 并且，那些箭头们指向的并不是具体的地方， 只要是模糊地在中央就可以了。");
append(workAstro, "01a0c330-d872-7691-8594-0c87d9daedbb", "user.prompt", "是，按这个效果修改。");
append(workAstro, "01a0c33e-e6e4-7e62-8faf-4ac6ccd77290", "user.prompt",
  "我之前， 做的那些就完全不参考了吗，还有我在地图上浮动的卡片， 你这个版本，和之前我做的差太多了吧。 还有我的图片背景，我需要非常丰富的图片作为背景提升真实性。");
append(workAstro, "msg_04ec62a834450836016ab0f811351487d2b7fdd8294b21cdeb", "agent.message",
  "上一版确实改偏了，应该在你的原稿上精修。\n\n现已修正：\n- 恢复原 Logo、首屏照片背景和关注点切换面板。\n- 三张医院卡片重新悬浮在地图上。\n- 使用原有 5 张图片丰富医院、陪诊、病房等区域背景。\n- 保留卡片悬停才动、航线持续流动、箭头模糊汇聚的效果。\n\n构建和桌面、手机交互检查通过。[查看新版](http://127.0.0.1:4321/?lang=cn)\n\n（这是 Agent 历史报告；本次交接没有绑定可复核的产物或源码版本。）");
append(workAstro, "01a0c34f-66ec-78a1-8156-ac735729cb47", "user.prompt",
  "file:///Users/dandi/geo-website/MentiFem/index.html 我希望你主要参考这个， 你主要需要修改的就是hero 的展示和 地图的 redesign， 这点你刚刚已经做的很好了。 可是一些之前我觉得很不错的，比如， 价格你也帮我删掉了。 我这个是 landiing page， 转化是第一要素， 所以我需要你使用大量的图片来做视觉渲染和冲击。 以及，");
append(workAstro, "01a0c350-6d93-7840-ae69-9ce75fe81be1", "user.prompt",
  "hero 的目的是让用户进来看到， 看到之后找到认同感，然后往下去看， 但是现在的展现形式非常不好， 需要重新设计");
scenarios.set(workAstro, input => makeAstroCandidate(input));

const badCoverage = newWork("bad missing coverage");
append(badCoverage, "bad-goal", "user.prompt", "目标：完成报表交付。");
append(badCoverage, "bad-csv", "user.prompt", "先导出 CSV。");
append(badCoverage, "bad-pdf", "user.prompt", "取消 CSV，改为 PDF。");
append(badCoverage, "bad-currency", "user.prompt", "人民币金额。");
scenarios.set(badCoverage, input => makeInvalidCandidate(input, "missing-coverage"));

const cycle = newWork("bad dependency cycle");
append(cycle, "cycle-goal", "user.prompt", "目标：完成报表交付。");
append(cycle, "cycle-csv", "user.prompt", "先导出 CSV。");
append(cycle, "cycle-pdf", "user.prompt", "取消 CSV，改为 PDF。");
append(cycle, "cycle-currency", "user.prompt", "人民币金额。");
scenarios.set(cycle, input => makeInvalidCandidate(input, "dependency-cycle"));

const noModelWork = newWork("no permission to call semantic model");
append(noModelWork, "no-model-goal", "user.prompt", "目标：完成报表交付。");

const oversized = newWork("oversized input is explicitly partial");
append(oversized, "oversized-goal", "user.prompt", "目标：整理全部来源，不得截断。");
append(oversized, "oversized-history", "user.prompt", "历史材料：" + "x".repeat(81000));

const staleWork = newWork("basis changes during model generation");
append(staleWork, "stale-goal", "user.prompt", "目标：完成报表交付。");
append(staleWork, "stale-csv", "user.prompt", "先导出 CSV。");
append(staleWork, "stale-pdf", "user.prompt", "取消 CSV，改为 PDF。");
append(staleWork, "stale-currency", "user.prompt", "人民币金额。");
let staleInjected = false;
scenarios.set(staleWork, input => {
  const candidate = makeM2Candidate(input);
  if (!staleInjected) {
    staleInjected = true;
    append(staleWork, "stale-during-generation", "user.prompt", "整理过程中追加的新要求，旧候选必须作废。");
  }
  return candidate;
});

const loader = async workId => {
  const work = core.getWork(workId);
  if (!work) throw new Error("WORK_NOT_FOUND");
  return {
    work,
    materials: [],
    ...(core.getLatestHandoffPackage(workId)?.continuation
      ? { cached: core.getLatestHandoffPackage(workId).continuation }
      : {}),
  };
};
const continuations = new ContinuationService({
  load: loader,
  generator: workId => workId === noModelWork ? null : ({
    generate: async input => {
      generated.set(workId, (generated.get(workId) ?? 0) + 1);
      return scenarios.get(workId)(input);
    },
  }),
});
const bridge = new WorkPetHttpBridge({
  configPath: join(directory, "bridge.json"),
  mcp: new WorkPetMcpHandler(core, { prepareContinuation: id => continuations.prepareContinuation(id) }),
  onHook: async () => ({ accepted: false }),
});

const report = { run, status: "RUNNING", kind: "isolated SQLite + authenticated MCP HTTP + deterministic model adapter; no cloud calls or Electron UI", actualProviderCalls: 0, checks: {} };
let port;
try {
  port = await bridge.start();
  const config = JSON.parse(readFileSync(join(directory, "bridge.json"), "utf8"));
  const request = async (workId, tool, args = {}) => {
    const response = await fetch("http://" + config.host + ":" + config.port + "/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", "x-workpet-token": config.token },
      body: JSON.stringify({ jsonrpc: "2.0", id: randomUUID(), method: "tools/call", params: { name: tool, arguments: { work_id: workId, ...args } } }),
      signal: AbortSignal.timeout(10000),
    });
    return response.json();
  };
  const oldV1 = await request(workM1, "get_work_context");
  assert.equal(JSON.parse(oldV1.result.content[0].text).workInstanceId, workM1);
  const oldV2 = await request(workM1, "get_work_context", { context_version: 2 });
  assert.equal(JSON.parse(oldV2.result.content[0].text).contextVersion, 2);
  const m1Result = await request(workM1, "get_work_context", { context_version: 3 });
  const m1 = JSON.parse(m1Result.result.content[0].text);
  assert.equal(m1.resolution, "RESOLVED");
  assert.equal(m1.currentStage.id, "report");
  assert.deepEqual(m1.completedPriorStages.map(stage => stage.id), ["clean", "chart"]);
  assert.equal(m1.currentStage.dependsOn[0].outcomeId, "chart-v1");
  assert.equal(m1.activeRequirements[0].claim.text, "金额使用人民币");
  assert.notEqual(m1.currentStageBasis[0].sourceEventIds[0], core.getWork(workM1).sourceArchive.find(event => event.externalId === "m1-progress")?.id,
    "a progress question must not move the current stage");
  assert.equal("pendingActions" in m1, false);
  assert.ok(!m1.workPackage || !("state" in m1.workPackage));
  assert.equal(generated.get(workM1), 1);
  const m1Again = JSON.parse((await request(workM1, "get_work_context", { context_version: 3 })).result.content[0].text);
  assert.equal(m1Again.currentStage.id, "report");
  assert.equal(generated.get(workM1), 1, "MCP read audit events must not invalidate continuation cache");
  const oldMaterialDigest = m1Again.basis.materialDigest;
  attachArtifact(workM1, "supplement-v1.txt", "supplemental material");
  const afterMaterialChange = JSON.parse((await request(workM1, "get_work_context", { context_version: 3 })).result.content[0].text);
  assert.notEqual(afterMaterialChange.basis.materialDigest, oldMaterialDigest);
  assert.equal(generated.get(workM1), 2, "a material version change must invalidate the cached semantic snapshot");
  report.checks.sequentialStagesAndCachedRead = true;

  const m2 = JSON.parse((await request(workM2, "get_work_context", { context_version: 3 })).result.content[0].text);
  assert.equal(m2.currentStage.id, "export-pdf");
  assert.deepEqual(m2.supersededRequirements.map(item => item.id), ["format-csv"]);
  assert.ok(m2.activeRequirements.some(item => item.id === "format-pdf"));
  assert.ok(m2.activeRequirements.some(item => item.id === "currency-rmb"));
  report.checks.scopedReplacementKeepsConstraints = true;

  const m3 = JSON.parse((await request(workM3, "get_work_context", { context_version: 3 })).result.content[0].text);
  assert.equal(m3.currentStage.id, "chart");
  assert.equal(m3.completedPriorStages[0].execution, "REPORTED_DONE");
  assert.equal(m3.completedPriorStages[0].outcomes[0].acceptance, "UNKNOWN");
  assert.ok(m3.currentStage.blockers.length);
  report.checks.agentReportNotPromotedToAccepted = true;

  const astro = JSON.parse((await request(workAstro, "get_work_context", { context_version: 3 })).result.content[0].text);
  writeFileSync(join(output, "astro-context-v3.json"), JSON.stringify(astro, null, 2));
  const heroEventId = core.getWork(workAstro).sourceArchive.find(event => event.externalId === "01a0c350-6d93-7840-ae69-9ce75fe81be1")?.id;
  assert.equal(astro.currentStage.id, "hero");
  assert.ok(astro.completedPriorStages.some(stage => stage.id === "map" && stage.outcomes[0].acceptance === "ACCEPTED"));
  assert.ok(astro.activeRequirements.some(item => item.id === "keep-conversion"));
  assert.ok(astro.activeRequirements.some(item => item.id === "rich-imagery"));
  assert.ok(astro.activeRequirements.some(item => item.id === "map-layout"));
  assert.ok(astro.activeRequirements.some(item => item.id === "page-polish"));
  assert.match(astro.firstAction.text, /只读定位/u);
  assert.match(astro.firstAction.text, /不执行历史接力修改/u);
  assert.match(astro.completedPriorStages.find(stage => stage.id === "map").completionEvidence[0].result, /三张浮卡、使用五张图片/u);
  assert.match(astro.completedPriorStages.find(stage => stage.id === "map").completionEvidence[0].excerpt, /三张医院卡片重新悬浮/u);
  assert.match(astro.completedPriorStages.find(stage => stage.id === "map").outcomes[0].summary.excerpts[0].text, /这点你刚刚已经做的很好了/u);
  assert.ok(astro.evidenceIndex.some(item => item.id === astro.completedPriorStages.find(stage => stage.id === "map").outcomes[0].acceptanceEvidence[0].sourceEventId), "acceptance source must be discoverable in evidence index");
  assert.equal(astro.currentStageBasis[0].sourceEventIds[0], heroEventId);
  report.checks.realAstroConversationCutPreservesAcceptedMapAndTargetsHero = true;

  const m5 = JSON.parse((await request(workM5, "get_work_context", { context_version: 3 })).result.content[0].text);
  assert.equal(m5.resolution, "UNRESOLVED", "a user warning must not be accepted as execution evidence");
  report.checks.userDenialCannotProveExecution = true;

  const m6 = JSON.parse((await request(workM6, "get_work_context", { context_version: 3 })).result.content[0].text);
  assert.equal(m6.resolution, "RESOLVED", JSON.stringify(m6, null, 2));
  assert.equal(m6.currentStage.id, "clean", "an explicit return can reactivate an earlier stage");
  assert.ok(m6.remainingStages.some(stage => stage.id === "chart"), "a completed downstream stage with stale dependency needs revalidation");
  report.checks.explicitReturnReactivatesPriorStage = true;

  const invalidCoverage = JSON.parse((await request(badCoverage, "get_work_context", { context_version: 3 })).result.content[0].text);
  assert.equal(invalidCoverage.resolution, "UNRESOLVED");
  assert.equal(invalidCoverage.fallbackV2.contextVersion, 2);
  assert.ok(invalidCoverage.latestUserMessages.some(item => item.excerpt.includes("取消 CSV")));
  report.checks.missingCoverageFallsBackWithLatestEvidence = true;

  const invalidCycle = JSON.parse((await request(cycle, "get_work_context", { context_version: 3 })).result.content[0].text);
  assert.equal(invalidCycle.resolution, "UNRESOLVED");
  report.checks.dependencyCycleRejected = true;

  const noModel = JSON.parse((await request(noModelWork, "get_work_context", { context_version: 3 })).result.content[0].text);
  assert.equal(noModel.resolution, "UNRESOLVED");
  assert.ok(noModel.latestUserMessages.length);
  assert.equal(generated.has(noModelWork), false, "no permission must not call the generator");
  report.checks.noModelPermissionFallsBackWithoutCall = true;

  const partial = JSON.parse((await request(oversized, "get_work_context", { context_version: 3 })).result.content[0].text);
  assert.equal(partial.resolution, "PARTIAL");
  assert.equal(partial.basis.coverage, "PARTIAL");
  assert.equal(generated.has(oversized), false, "over-limit input must not be silently truncated and sent to the model");
  report.checks.oversizedInputMarkedPartialWithoutModelCall = true;

  const stale = JSON.parse((await request(staleWork, "get_work_context", { context_version: 3 })).result.content[0].text);
  assert.equal(stale.resolution, "UNRESOLVED");
  assert.ok(stale.latestUserMessages.some(event => event.excerpt.includes("整理过程中追加")));
  report.checks.changedBasisDiscardsStaleCandidate = true;

  const stored = core.getLatestHandoffPackage(workM1);
  assert.equal(stored.continuation.currentStageId, "report");
  const storedPayload = core.definitions.db.prepare("SELECT payload_json FROM handoff_packages WHERE id=?").get(stored.id).payload_json;
  assert.ok(JSON.parse(storedPayload).continuation);
  report.checks.snapshotPersistedAndHistoryRetained = true;
  report.status = "PASSED";
} catch (error) {
  report.status = "FAILED";
  report.error = error instanceof Error ? error.stack ?? error.message : String(error);
  process.exitCode = 1;
} finally {
  await bridge.close().catch(() => {});
  core.close();
  writeFileSync(join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
