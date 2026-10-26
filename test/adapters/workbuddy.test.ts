import assert from "node:assert/strict";
import test from "node:test";

import { buildWorkBuddyDeepLink } from "../../src/adapters/workbuddy/deep-link.ts";
import { buildWorkBootstrap } from "../../dist/executors/work-bootstrap.js";

test("WorkBuddy 长工作说明通过 deep link 传递关联标记和 MCP 指令", () => {
  const prompt = buildWorkBootstrap({
    workId: "work-123",
    title: "准备客户提案",
  });
  const link = buildWorkBuddyDeepLink(prompt);
  const url = new URL(link);

  assert.equal(url.protocol, "workbuddy:");
  assert.equal(url.hostname, "task");
  assert.equal(url.searchParams.get("action"), "start");
  assert.equal(url.searchParams.get("welcomeMode"), "work");
  assert.equal(url.searchParams.get("permissionMode"), "default");
  assert.match(url.searchParams.get("prompt") ?? "", /\[WORKPET:work-123\]/);
  assert.match(url.searchParams.get("prompt") ?? "", /get_work_context/);
  assert.doesNotMatch(url.searchParams.get("prompt") ?? "", /完整历史/);
});

test("WorkBuddy deep link 拒绝超过产品上限的 prompt", () => {
  assert.throws(() => buildWorkBuddyDeepLink("x".repeat(8_001)), /8000/);
});
