import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, basename, join } from 'node:path';

/** Replays provider bytes, never substitutes an answer for a different source. */
export function verifyReplay(directory) {
  const manifestPath = join(dirname(directory), 'manifest.json');
  if (existsSync(manifestPath)) {
    const entry = JSON.parse(readFileSync(manifestPath, 'utf8')).cases.find(c => c.id === basename(directory));
    assert.ok(entry, 'replay case is absent from manifest');
    for (const [file, expected] of Object.entries(entry.sha256)) {
      const actual = createHash('sha256').update(readFileSync(join(directory, file))).digest('hex');
      assert.equal(actual, expected, `frozen replay changed: ${file}`);
    }
  }
}
export function contractReplay(directory) {
  verifyReplay(directory);
  return (messages, call) => {
    const recorded = JSON.parse(readFileSync(join(directory, `request-${call}.json`), 'utf8'));
    assert.deepEqual(JSON.parse(messages[1].content), JSON.parse(recorded[1].content),
      'replay input differs from original source/intermediate; run a new model trial');
    return JSON.parse(readFileSync(join(directory, `response-${call}.json`), 'utf8'));
  };
}
