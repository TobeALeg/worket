#!/usr/bin/env node
import { resolve, join } from 'node:path';
import { createReviewServer } from './lib/human-review/server.mjs';
import { loadDistillationSample } from './lib/human-review/distillation-sample.mjs';

const [directoryArg, portArg = '4319', outputArg] = process.argv.slice(2);
if (!directoryArg) throw new Error('用法：node scripts/review-distillation.mjs RUN_DIRECTORY [PORT] [REVIEW_DIRECTORY]');
const directory = resolve(directoryArg), outputDir = outputArg ? resolve(outputArg) : join(directory, 'human-reviews');
const sample = loadDistillationSample(directory);
const { server } = await createReviewServer({ samples: [sample], outputDir,
  reviewer: process.env.WORKET_REVIEW_REVIEWER ?? 'work-owner' });
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? '端口已占用，请换一个端口，已有审阅不会被覆盖。' : error.message); process.exitCode = 1; });
server.listen(Number(portArg), '127.0.0.1', () => console.log(JSON.stringify({
  url: `http://127.0.0.1:${server.address().port}/#${sample.id}`, outputDir,
  candidates: sample.draft.requirements.length, questions: sample.draft.questions.length,
})));
