import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Each scenario runs in its own Electron profile/database; no provider calls.
for (const scenario of ['video', 'report', 'code']) {
  const replay = fileURLToPath(new URL(`../test/fixtures/contracts/${scenario}`, import.meta.url));
  console.log(`Contract desktop baseline: ${scenario} (recorded response, not a new model trial)`);
  const child = spawnSync(process.execPath, ['scripts/qa-contract-e2e.mjs'], {
    stdio: 'inherit', timeout: 180000,
    env: { ...process.env, WORKET_E2E_SCENARIO: scenario, WORKET_E2E_REPLAY: replay },
  });
  if (child.status !== 0) { if (child.error) console.error(child.error.message); process.exit(child.status ?? 1); }
}
