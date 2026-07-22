# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Atelier is an AI image/video generator web app backed by OpenRouter. The entire application lives in a single file, `index.html` — inline CSS and vanilla JS (an IIFE, no framework, no build step, no dependencies, no tests). UI text is Thai; code identifiers are English.

To run it, just open `index.html` in a browser (or serve it statically, e.g. `npx serve .` / `python -m http.server 8000`). There are no build, lint, or test commands.

## Architecture of index.html

### Per-mode state via Proxy

The app has three modes — **Home** (general images), **Infographic** (restricted model set, infographic-specific prompt builder), **Video** — switchable via tabs. `apiKey` and the full fetched model lists are shared across modes (`shared` object), but `prompt`, `ratio`, `count`, `duration`, `audio`, `images`, `queue`, `lbIndex`, `seq`, and `selected` are each kept in a separate `freshModeState()` object per mode (`modeStates.home/.infographic/.video`).

`state` is a `Proxy` that transparently reads/writes to `shared` if the key exists there, otherwise to `modeStates[currentMode]`. This means switching `currentMode` instantly redirects all `state.x` access to that mode's own data — no manual copying. When adding new per-mode fields, add them to `freshModeState()`; when adding shared/global fields, add them to `shared`.

UI updates flow through one `render()` function that rebuilds the whole gallery grid from `state.images` — there is no incremental DOM patching, so mutate state then call `render()`. The exception is video generation progress (ring/%), which is patched in-place by a `setInterval` ticker instead of a full `render()`, specifically to avoid restarting `<video>` playback on cards that already finished.

### Generation routing

Each image/video in a batch or queue is an independent request with its own `status` (`loading`/`done`/`error`) and retry. Jobs are tagged with the mode they were started from (`item.mode`); if the user switches modes while a job is in flight, the result still lands in the correct mode's `images` array, and the screen only re-renders if that mode is still the one on screen.

Three distinct request paths depending on mode + model capability:
- **image+text models** (e.g. Gemini, GPT Image) → `POST /chat/completions` with `modalities: ["image","text"]`; image comes back at `choices[0].message.images[0].image_url.url`.
- **image-only models** (e.g. Grok Imagine) → `POST /api/v1/images` directly, because `chat/completions` errors with "No endpoints found" if you request the `text` modality from a model that doesn't support it. Routing decision is based on `architecture.output_modalities` from the model list.
- **video mode** → `POST /api/v1/videos` returns a job id, polled via `GET /api/v1/videos/{id}` every 10s (10 min timeout); on `completed`, the file is immediately fetched from `unsigned_urls[0]` and kept as a blob in memory (signed URLs expire while the tab stays open). A `jobId` already in flight is resumed on retry instead of resubmitted, to avoid double charges.

Aspect ratio is sent via `image_config.aspect_ratio` on `chat/completions` **and** appended as a text hint to the prompt, since not all models honor `image_config`. The Image API and Video API take `aspect_ratio` as a native param instead.

### Model lists

- **Home** — every OpenRouter model whose `architecture.output_modalities` includes `"image"`, with OpenAI models filtered down to `openai/gpt-image-2` only (all other `openai/*` are excluded — see the filter in `loadModels()`).
- **Infographic** — restricted via `MODE_MODEL_FILTER.infographic`, a regex allowlist applied on top of the same fetched list.
- **Video** — separate fetch from `/api/v1/videos/models`, filtered to `VIDEO_MODEL_IDS`. Model capability fields (`supported_durations`, `supported_aspect_ratios`, `generate_audio`, `pricing_skus`) come straight from the API, and the duration/ratio/audio controls disable and snap automatically based on what the selected model actually supports — no hardcoded per-model UI logic.
- `EXTRA_MODELS` merges in models OpenRouter's `/api/v1/models` doesn't list yet (e.g. Grok Imagine Image Quality); `PREFERRED` is a regex list that floats specific models to the top of the dropdown.

> When changing which OpenAI model id is canonical, update it in **both** `EXTRA_MODELS` (fallback entry) and the `openai/*` allow-check in `loadModels()` — and check `MODE_MODEL_FILTER.infographic`, which references model ids independently and can drift out of sync.

### Usage bar

There's no OpenRouter API for per-model spend, so cost is estimated client-side from each model's `pricing` (image) or `pricing_skus` (video, via `videoPricePerSec`) multiplied against completed (`status === "done"`) items in the current mode's `images`. This is session-only, resets per mode, and is recomputed on every `render()` (`updateUsageBar()`).

### Multi-select download

Each finished gallery card gets a checkbox (visible on hover or when selected) tracked by id in the per-mode `selected` Set. `downloadSelected()` reuses the same `convertDataUrl`/`randomFileName` helpers as the single-image lightbox download, looping over selected items with a short delay between each `<a download>` click to avoid the browser blocking rapid multi-file downloads.

### Styling

CSS custom properties are defined in `:root` (dark theme). Follow the existing variables (`--bg`, `--surface`, `--surface-2`, `--border`, `--border-strong`, `--accent`, `--text`, `--text-dim`, `--text-faint`, `--radius`, `--mono`) rather than hardcoding colors.
