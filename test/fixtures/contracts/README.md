# Contract replay baseline

Unmodified provider requests and responses from the synthetic desktop trials of 2026-09-22. `manifest.json` records SHA-256 and original run IDs. No private business conversations or credentials are included. Usage belongs to the original calls; replay costs no provider tokens.

Three accepted outputs support `npm run qa:contract`. Two historical failures remain frozen: malformed document binding must be rejected, and a repeated numeric limit remains a known semantic error. Reproducing either failure does not count as extraction quality passing. These cases were used during tuning and are not a blind set. Full historical evidence remains in `docs/acceptance/working-contract-v2-results.json`.

The replay helper verifies the original input and intermediate data. Changing source data requires a new model trial, not substituting an old answer. System prompts may change; replay validates program compatibility only, never the new prompt's generation quality.
