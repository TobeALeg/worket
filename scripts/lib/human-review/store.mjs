import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { hash, createReview, applyCommand, summary } from './model.mjs';

const json = async path => JSON.parse(await readFile(path, 'utf8'));
export class ReviewStore {
  constructor(samples, outputDir, reviewer = 'work-owner') { this.samples = samples; this.outputDir = resolve(outputDir); this.reviewer = reviewer; this.reviews = new Map(); this.queue = Promise.resolve(); }
  async initialize() {
    await mkdir(this.outputDir, { recursive: true, mode: 0o700 });
    for (const sample of this.samples) {
      let review;
      try { review = await json(this.path(sample.id)); }
      catch (error) { if (error.code !== 'ENOENT') throw error; review = { ...createReview(sample), reviewer: this.reviewer }; }
      if (review.draftHash !== hash(sample.draft) || review.snapshotHash !== sample.draft.snapshotHash || review.workInstanceId !== sample.draft.workInstanceId) throw new Error(`${sample.id}: 审阅与来源不匹配`);
      this.reviews.set(sample.id, review);
    }
  }
  path(id) { return join(this.outputDir, `${id}.json`); }
  sample(id) { const sample = this.samples.find(sample => sample.id === id); if (!sample) throw Object.assign(new Error('工作不存在'), { status: 404 }); return sample; }
  detail(id) { const sample = this.sample(id), review = this.reviews.get(id); return { sample, review, summary: summary(sample, review) }; }
  list() { return this.samples.map(sample => ({ id: sample.id, title: sample.title, group: sample.group, focus: sample.record.work.focus, summary: summary(sample, this.reviews.get(sample.id)), updatedAt: this.reviews.get(sample.id).updatedAt })); }
  mutate(id, command) {
    const operation = this.queue.then(async () => {
      const sample = this.sample(id), review = applyCommand(sample, this.reviews.get(id), command);
      const path = this.path(id), temp = `${path}.${randomUUID()}.tmp`;
      await writeFile(temp, JSON.stringify(review, null, 2) + '\n', { mode: 0o600 });
      await rename(temp, path);
      this.reviews.set(id, review);
      return this.detail(id);
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
  export(id) {
    const { sample, review, summary: metrics } = this.detail(id);
    return { kind: 'HumanRequirementsReviewExport', schemaVersion: 1, exportedAt: new Date().toISOString(),
      sample, review, metrics, limitations: ['单一工作发起人对已见样本的回顾审阅', '新决定不计入历史提炼认可率', '问题评价与要求评价分别统计', '不是跨实例复用验收或正式工作定义发布', '投入时间为页面前台活动估计，不含所有线下审阅时间'] };
  }
}
