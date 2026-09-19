# ENV — environment check (2026-09-19, macOS 15 / Darwin 24.5.0, Apple Silicon)

| Requirement | Result | Notes |
|---|---|---|
| node ≥ 20 | **v24.16.0** ✅ | |
| npm | 11.13.0 ✅ | workspaces supported |
| git | 2.39.5 ✅ | |
| ffmpeg / ffprobe | ❌ missing | `brew install ffmpeg` — needed to integration-test `video`, `audio`, `transcribe` |
| whisper-cli (whisper.cpp) | ❌ missing | `brew install whisper-cpp` — needed for `transcribe` |
| soffice (LibreOffice) | ❌ missing | `brew install --cask libreoffice` — needed for `verify.render_document` |
| Chrome / Edge / Chromium | ✅ `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` | not on PATH; `shared/detect.ts` checks the app bundle path |
| pdftoppm (poppler) | ❌ missing | `brew install poppler` — optional for `pdf.pdf_to_images` |
| jq | ✅ `/usr/bin/jq` | used by `context.extract` when present; pure-TS fallback otherwise |
| python3 | ✅ 3.14 | not used by the build |
| claude CLI | ✅ 2.1.247 at `~/.local/bin/claude` | headless evals (`claude -p --mcp-config …`) can run locally |

**Consequence for this build:** Phase 0–2 (shared, context, images, pdf) are fully testable locally. Phase 3 packages (video, audio, transcribe, verify.render_document) can only test their *missing-binary teach-error* path here unless the binaries above are installed. `verify.render_html` / `render_pdf_page` / `visual_diff` / `check_links` can be tested (Chrome present).

**npm name check:** `tiny-context`, `tiny-images`, `tiny-audio`, `tiny-context-mcp` are already taken on npm → all packages use the `@tinytools/*` scope (§13 fallback). Bin names stay `tiny-<name>` / `tiny-<name>-mcp`.
