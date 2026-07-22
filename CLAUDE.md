# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Atelier is an AI image/video generator web app backed by OpenRouter. It's a client-only **React 19 + TypeScript + Tailwind CSS v4 + Vite** SPA (no backend, no router, no state library — a small hand-rolled store). UI text is Thai; code identifiers are English. Icons come from `lucide-react`.

The original single-file vanilla-JS implementation is preserved at `legacy/index.html` for reference — it is feature-equivalent to the React app and can still be opened directly in a browser. Don't add features to it; it's frozen.

```bash
npm run dev       # Vite dev server (default port 5173)
npm run build     # tsc --noEmit (strict) + vite build → dist/
npm run preview   # serve the production build (default port 4173)
```

There are no tests or lint config.

## Architecture

```
src/
├── main.tsx / App.tsx        # bootstrap, layout, initial loadModels/loadVideoModels + key-modal auto-open
├── index.css                 # Tailwind v4 @theme — the legacy palette mapped 1:1 (--color-bg, --color-surface, …)
├── lib/
│   ├── types.ts              # Mode, GenItem, ModeState, AppState, ORModel, …
│   ├── constants.ts          # RATIOS/COUNTS/DURATIONS, KEYWORDS_BY_MODE, MODE_META, EXTRA_MODELS, PREFERRED, VIDEO_MODEL_IDS, MODE_MODEL_FILTER, model ids
│   ├── store.ts              # the state singleton + mutate() + useApp() + localStorage persistence helpers
│   ├── actions.ts            # ALL logic: model loading, generation, video polling, queue, history, optimizer, chat, export/import, downloads
│   └── utils.ts              # keyword regex toggling, convertDataUrl, randomFileName, video price/progress helpers
└── components/
    ├── Header.tsx            # brand, mode tabs, Export/Import, API-key status
    ├── Sidebar.tsx           # prompt + optimizer panel, history, keyword builder, model select, usage bar, segs, queue, generate
    ├── Gallery.tsx           # grid + Card + VideoProgress + multi-select bar
    ├── Lightbox.tsx / KeyModal.tsx / ChatPanel.tsx / Toast.tsx
```

### State model (store.ts)

`state` is a **mutable singleton**; components subscribe via `useApp()` (a `useSyncExternalStore` on a version counter) and re-render whenever `mutate(fn?)` is called. This deliberately mirrors the legacy "mutate then `render()`" model: async flows (generation, video polling) mutate items in place from `actions.ts` and call `mutate()` to broadcast. **Every state change must go through `mutate()`** — direct mutation without it silently doesn't re-render.

Per-mode state lives in `state.modes.home/.infographic/.video` (each a `ModeState`: `prompt`, `modelId`, `ratio`, `count`, `duration`, `audio`, `images`, `queue`, `history`, `selected`, `lbIndex`). `cur()` returns the active mode's slice. Shared/global fields (`apiKey`, model lists, chat, optimizer result, toast, …) sit directly on `AppState`. When adding a per-mode field, add it to `ModeState` + `freshModeState()`; global fields go on `AppState`.

Persistence: only prompt history (`atelier_history_<mode>`), chat history (`atelier_chat_history`), and sidebar width (`atelier_sidebar_w`) survive a reload, via `localStorage`. `apiKey`, galleries, and queues are memory-only **by design** (see the note in the key modal).

### Generation routing (actions.ts)

Each image/video in a batch or queue is an independent request with its own `status` (`loading`/`done`/`error`) and retry. Items are tagged with the mode they were started from (`item.mode`); if the user switches modes while a job is in flight, the result still lands in the correct mode's `images` array (items are mutated by reference, then `mutate()` broadcasts).

Three request paths, chosen in `runRequest`:
- **image+text models** (e.g. Gemini, GPT Image) → `POST /chat/completions` with `modalities: ["image","text"]`; image comes back at `choices[0].message.images[0].image_url.url`.
- **image-only models** (e.g. Grok Imagine) → `POST /api/v1/images` directly, because `chat/completions` errors with "No endpoints found" if you request the `text` modality from a model that doesn't support it. Routing decision is based on `architecture.output_modalities`.
- **video mode** → `POST /api/v1/videos` returns a job id, polled via `GET /api/v1/videos/{id}` every 10s (10 min timeout); on `completed` the file is immediately fetched from `unsigned_urls[0]` (with the Authorization header — 401 without it) and kept as a blob URL. A `jobId` still on the item is **resumed** on retry instead of resubmitted, to avoid double charges; it's cleared on permanent failure/completion.

Aspect ratio is sent via `image_config.aspect_ratio` on `chat/completions` **and** appended as a text hint to the prompt, since not all models honor `image_config`. The Image API and Video API take `aspect_ratio` as a native param instead.

### Model lists

- **Home** — every OpenRouter model whose `architecture.output_modalities` includes `"image"`, with OpenAI models filtered down to `openai/gpt-image-2` only (see the filter in `loadModels`).
- **Infographic** — restricted via `MODE_MODEL_FILTER.infographic`, a regex allowlist applied on top of the same fetched list.
- **Video** — separate fetch from `/api/v1/videos/models`, filtered to `VIDEO_MODEL_IDS`. Capability fields (`supported_durations`, `supported_aspect_ratios`, `generate_audio`, `pricing_skus`) come straight from the API; `applyVideoCapabilities()` snaps invalid duration/ratio/audio selections and the Sidebar disables unsupported buttons — no hardcoded per-model UI logic.
- `EXTRA_MODELS` merges in models OpenRouter's `/api/v1/models` doesn't list yet; `PREFERRED` floats specific models to the top of the dropdown.

> When changing which OpenAI model id is canonical, update it in **both** `EXTRA_MODELS` (fallback entry) and the `openai/*` allow-check in `loadModels` — and check `MODE_MODEL_FILTER.infographic`, which references model ids independently and can drift out of sync.

### Video progress ring

The API sends no real progress; `videoProgressPct` estimates from elapsed time (`95 × (1 − e^(−t/60))`), capped at 95% until the job actually completes. The 1-second ticker lives inside the `VideoProgress` component (local `setTick` state), so only the ring re-renders — finished `<video>` cards keep stable React keys (`item.id`) and are never remounted, so playback isn't interrupted.

### LLM-assisted features (Optimizer & Chat)

Both call the free text model `openai/gpt-oss-20b:free` (`OPTIMIZER_MODEL`/`CHAT_MODEL` in constants.ts) via `POST /chat/completions` — **verify this id still exists on OpenRouter before changing it**; free-tier ids get renamed/retired without notice. Free-tier responses are slow; that's expected, not a bug.

- **Optimizer** (`runOptimize`) — instructs the model to return strict JSON `{prompt, keywords}` (markdown fences stripped defensively before `JSON.parse`). Result renders in the Sidebar panel: rewritten prompt (one-click apply) + keyword chips reusing `toggleKeyword`. `state.optimize` is reset on mode switch since it belongs to the prompt that was active.
- **Chat with Atelier** (ChatPanel FAB) — one **global** conversation, not per-mode. The system prompt names the currently-open mode tab but knows nothing about the user's prompt or generated images.

### Usage bar / multi-select / session export

- **Usage bar** (in Sidebar) — no OpenRouter spend API exists, so cost is estimated from `pricing` (image) / `pricing_skus` (video, `videoPricePerSec`) × completed items in the current mode. Session-only.
- **Multi-select download** — per-mode `selected: Set<number>`; `downloadSelected` loops with a 150ms delay between `<a download>` clicks to avoid browser blocking.
- **Export/Import** — JSON of per-mode metadata only (`prompt`, `ratio`, `count`, `duration`, `audio`, `queue`, `history`), never images. The format is identical to what the legacy app produced, so old exports still import.

### Styling

Tailwind v4 with the theme defined in `src/index.css` via `@theme` — the same palette names as legacy (`--color-bg`, `--color-surface`, `--color-surface-2`, `--color-border`, `--color-border-strong`, `--color-text`, `--color-text-dim`, `--color-text-faint`, `--color-accent`, `--color-accent-ink`, `--color-danger`). Use the mapped utilities (`bg-surface`, `text-text-dim`, `border-border-strong`, …) rather than hardcoding colors. Dark theme only.
