# Incremental evolution replay

Four original `deepseek-flash` calls from synthetic run `2026-09-22T17-50-59-469Z`, untouched requests/responses with SHA-256 in manifest.json. Calls 1–2 of that run replayed the existing video contract fixture; these files preserve the new calls 3–6 only.

First pair: change 30 words to 20, add bilingual subtitles, repeat MP4, keep a 12-second exception local. Second pair: repeat the effective obligations without growing the definition. No gold was sent to generation, and no real business delivery was accepted.

`npm run qa:contract:evolution` replays the complete desktop flow. A fresh test DB generates a different opaque definition hash; replay verifies all other input and intermediate content exactly, checks the recorded response hash, then rebinds only this identity. This is explicitly logged as `baselineIdentityRebound`. It does not rerun the current prompt or establish new semantic quality.
