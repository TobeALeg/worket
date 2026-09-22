import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const child = spawnSync(process.execPath, ['scripts/qa-contract-e2e.mjs'], {
  stdio: 'inherit', timeout: 180000,
  env: { ...process.env, WORKET_E2E_SCENARIO: 'video', WORKET_E2E_EVOLUTION: '1',
    WORKET_E2E_REPLAY: fileURLToPath(new URL('../test/fixtures/contracts/video', import.meta.url)),
    WORKET_E2E_EVOLUTION_REPLAY: fileURLToPath(new URL('../test/fixtures/evolution/video', import.meta.url)),
  },
});
if (child.error) console.error(child.error.message);
process.exitCode = child.status ?? 1;
