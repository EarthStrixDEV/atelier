# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Atelier is an AI media studio (images, infographics, video, cinematic storyboards, audio) backed by OpenRouter. It's a client-only **React 19 + TypeScript + Tailwind CSS v4 + Vite** SPA — no backend, no state library (a small hand-rolled store), but it *does* use `react-router-dom` for three routes and `react-window` for gallery virtualization. UI text is Thai; code identifiers are English. Icons come from `lucide-react`; chat messages render through `react-markdown`.

The original single-file vanilla-JS implementation is preserved at `legacy/index.html` for reference. It's frozen and no longer feature-equivalent — the React app has moved far past it. Don't add features to it.

```bash
npm run dev       # Vite dev server (default port 5173, falls through to 5174+ if taken)
npm run build     # tsc --noEmit (strict) + vite build → dist/
npm run preview   # serve the production build (default port 4173)
```

There are no tests or lint config. `npm run build` is the gate — it must pass before any change is considered done.

## Routes

`react-router-dom` (`BrowserRouter` in `main.tsx`, no basename — the app is served from the root):
- `/` — `pages/Landing.tsx`, a marketing hero page
- `/studio` — `pages/StudioApp.tsx`, the actual app (header + sidebar + gallery + modals)
- `/models` — `pages/ModelCatalog.tsx`, a standalone public page (no API key required). See [Model Catalog page](#model-catalog-page) below.

When testing in a browser, the studio is at `http://localhost:<port>/studio`, not the root.

## Architecture

```
src/
├── main.tsx / App.tsx        # bootstrap + router
├── index.css                 # Tailwind v4 @theme + global :focus-visible ring
├── pages/
│   ├── Landing.tsx           # hero / marketing route
│   └── StudioApp.tsx         # studio layout, initial model loads, key-modal auto-open
├── lib/
│   ├── types.ts              # Mode, GenItem, ModeState, AppState, ORModel, ToastVariant, …
│   ├── constants.ts          # RATIOS/COUNTS/DURATIONS, KEYWORDS_BY_MODE, MODE_META, EXTRA_MODELS,
│   │                         #   PREFERRED, VIDEO_MODEL_IDS, MODE_MODEL_FILTER, assist-model ids
│   ├── store.ts              # state singleton + mutate() + useApp() + all persistence helpers
│   ├── actions.ts            # ALL logic: model loading, generation, video polling, queue, history,
│   │                         #   optimizer, chat, grill, bake-off, export/import, downloads,
│   │                         #   Request Governor, Spend Guard ledger, gallery-persist bridging
│   ├── blobUrls.ts           # blob URL registry + lifecycle/cleanup
│   ├── fsAccess.ts           # Auto Save via File System Access API
│   ├── galleryStore.ts       # IndexedDB persistence for generated media (opt-in, see Persistence)
│   ├── supabase.ts           # Supabase client + auth/key/cloud_items/Storage helpers (see Cloud Sync)
│   ├── googleDrive.ts        # Google Drive OAuth (GIS) + upload
│   ├── shortcuts.ts          # global keyboard shortcut handling
│   ├── shareCard.ts          # share-card image generation
│   ├── alerts.ts             # SweetAlert2 wrapper — `confirmAction()` for every simple confirm
│   ├── notify.ts             # Notification API wrapper
│   ├── catalogData.ts        # hand-curated WORKFLOW_RECOMMENDATIONS + MODEL_QUALITY_TAGS for /models
│   └── utils.ts              # keyword regex toggling, convertDataUrl, randomFileName, video helpers
├── components/
│   ├── Header.tsx            # brand, mode tabs, Import/Export, Auto Save, Drive, Settings, API-key status
│   ├── Sidebar.tsx           # prompt, optimizer, history, keyword builder, refs, model select,
│   │                         #   bake-off, usage bar, ratio/duration/count, queue, generate
│   ├── PromptComposer.tsx    # prompt input — can live in the sidebar or float bottom-center
│   ├── Gallery.tsx           # virtualized grid (react-window) + Card + VideoProgress + multi-select
│   ├── ChatPanel.tsx         # "คุยกับ Atelier" FAB + panel
│   ├── GrillPanel.tsx        # "ตกผลึกไอเดีย" FAB — AI interviews you, outputs prompt variants
│   ├── ExtendTool.tsx        # pick a frame from a video to extend from
│   ├── CompareModal.tsx      # 2 images = swipe compare, 3–4 = side-by-side grid
│   ├── SettingsModal.tsx     # assist model, custom model JSON, storage breakdown, gallery-persist toggle
│   ├── SpendGuardModal.tsx   # confirms a batch that would exceed/already exceeds the spend cap
│   ├── KeyModal.tsx / Lightbox.tsx / Toast.tsx / ShortcutsModal.tsx
│   ├── BakeOffConfirmModal.tsx / ImportPreviewModal.tsx / RestoreBanner.tsx
│   ├── ExplainedChip.tsx / RefCropPreview.tsx
│   └── catalog/              # used only by pages/ModelCatalog.tsx
│       ├── ModelGridShowroom.tsx      # card-grid view, plain CSS grid (not react-window)
│       ├── ModelComparisonTable.tsx   # table view, domain-specific columns
│       └── WorkflowRecommendations.tsx # resolves catalogData ids against live fetched models
supabase/migrations/          # SQL for Cloud Sync (tables, RLS, private `media` bucket) — run by hand in Supabase
└── pages/
    └── ModelCatalog.tsx      # /models — see Model Catalog page
```

## Modes

Five modes (`Mode` in types.ts): `home` (image), `infographic`, `video`, `cinematic` (storyboard chains), `audio`. Per-mode state lives in `state.modes.<mode>`.

### State model (store.ts)

`state` is a **mutable singleton**; components subscribe via `useApp()` (a `useSyncExternalStore` on a version counter) and re-render whenever `mutate(fn?)` is called. Async flows (generation, video polling) mutate items in place from `actions.ts` and call `mutate()` to broadcast. **Every state change must go through `mutate()`** — direct mutation without it silently doesn't re-render.

`cur()` returns the active mode's slice. Shared/global fields (`apiKey`, model lists, chat, optimizer result, toast, …) sit directly on `AppState`. When adding a per-mode field, add it to `ModeState` + `freshModeState()`; global fields go on `AppState`.

### Persistence

More survives a reload than you'd expect. `localStorage` keys (all prefixed `atelier_`): prompt history per mode, user templates per mode, chat history, export log, user-added models, assist model id, prompt placement, pending video jobs, queue-non-empty flags, Auto Save handle metadata, Drive settings, and a **session snapshot** (autosaved ~every 30s) that `RestoreBanner` offers to restore.

The API key (`atelier_api_key`) is in **`sessionStorage`** by design — cleared when the tab closes.

What is *not* persisted: the generated images/videos themselves. `state.modes.*.images` holds blob/data URLs in memory only. The session snapshot saves metadata, not media. Finished results reach disk only through **Auto Save** (File System Access API, `fsAccess.ts`), **Save to Drive** (`googleDrive.ts`), or **Gallery Persistence** (below) — all opt-in and Auto Save/Drive require re-granting permission each session.

#### Gallery Persistence (`galleryStore.ts`)

Opt-in IndexedDB persistence for generated media itself, so results survive a reload without needing Auto Save or Drive. Toggled via `atelier_gallery_persist` in localStorage (default **off**), switched on/off from the Advanced section of `SettingsModal.tsx`. Uses its own IndexedDB database, `atelier_gallery` — deliberately separate from `fsAccess.ts`'s `atelier_fs` database so enabling/disabling this never touches Auto Save handle state.

`galleryStore.ts` is a plain async CRUD module — **not** a `mutate()`/`useSyncExternalStore` store like `store.ts`. `actions.ts` is the bridge into `AppState`: it keeps a module-level `persistKeys: Map<GenItem['id'], string>` mapping in-memory items to IndexedDB record keys, and calls `mutate()` manually after each await (on generation completion, favorite toggle, deletion, and boot-time rehydration).

Two things worth knowing before touching this:
- `PersistedGenItem` is a strict allowlist type, not `Omit<GenItem, ...>` — it explicitly excludes `refs`, `apiKey`, `jobId`, and error messages. **New `GenItem` fields do not reach disk automatically** — add them to the allowlist by hand if they should be persisted.
- Records carry their own `PERSISTED_ITEM_VERSION`, migrated lazily per-record on read via `migrateRecord()` — this is independent of the IndexedDB `DB_VERSION` itself, so a schema change doesn't require a blocking bulk migration over potentially large blobs.

Eviction is enforced by two caps in `constants.ts` (per-mode item count, global byte total); non-favorites are evicted before favorites, oldest first within each group.

#### Cloud Sync (Supabase)

Opt-in via login; independent of Gallery Persistence. `src/lib/supabase.ts` is the only module that talks to Supabase; `actions.ts` bridges into `AppState` (search "cloud"). Needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — if either is missing, `isCloudConfigured()` is false and every cloud UI (Settings Cloud section, card cloud buttons) is hidden and no request to Supabase is made. Schema lives in `supabase/migrations/`: `user_secrets` (OpenRouter key), `cloud_items` (metadata), and a **private** Storage bucket `media` with RLS; object path is `{uid}/{mode}/{id}.{ext}`.

- **Auth** — Supabase Auth email+password, sign-ups disabled, single user. The session lives in localStorage under `atelier_supabase_auth` (supabase-js's own storage; prefixed so the Settings storage breakdown counts it). It is not part of the session snapshot or Export JSON, and neither is the OpenRouter key (`buildSessionData` whitelists fields).
- **Key sync** — cloud wins on login; the local key is uploaded only when the cloud read succeeded **and** was empty (a failed read never seeds). Logout clears the in-memory/session key but not the "remember" flag.
- **`cloudKeyLoaded` vs `keyReady`** — `cloudKeyLoaded` is the untimed load (30 s safety ceiling only) and gates pending-job resume/drop, so a slow login can't make jobs look lost. `keyReady` is the same promise raced against 5 s and gates `requireApiKey` so UI buttons don't stay silent.
- **Upload** — manual per card / selection, plus auto-upload (`atelier_cloud_autoupload`, off by default). Queue width is `CLOUD_UPLOAD_CONCURRENCY`, separate from the Request Governor (no OpenRouter spend).
- **Restore** — after `galleryRehydrated`, the latest `CLOUD_RESTORE_PER_MODE` (30) items per mode are listed; items already present are skipped by `cloudId`. Each gets an immediate `loading` placeholder card with `cloudRestoring` set, files download in the background (`CLOUD_RESTORE_CONCURRENCY`), failures offer retry.
- **Delete** — "delete all" keeps favorites; "delete selected" deletes favorites too. Both go through `confirmAction()` and also delete the cloud copies (Storage object + row). Favorite toggles sync to `cloud_items`.
- **Allowlist** — `cloud_items` columns are a hand-kept allowlist (`CloudItemMeta`), same idea as `PersistedGenItem`: no refs/apiKey/jobId/error text. New `GenItem.cloud*` fields are in-memory only; the only ones that reach IndexedDB are `cloudId` and `cloudPath` (`PERSISTED_ITEM_VERSION` 3).

### Generation routing (actions.ts)

Each image/video in a batch or queue is an independent request with its own `status` (`loading`/`done`/`error`) and retry. Items are tagged with the mode they were started from (`item.mode`), so switching modes mid-flight still lands the result in the right gallery.

Request paths, chosen in `runRequest`:
- **image+text models** (e.g. Gemini, GPT Image) → `POST /chat/completions` with `modalities: ["image","text"]`; image comes back at `choices[0].message.images[0].image_url.url`.
- **image-only models** (e.g. Grok Imagine) → `POST /api/v1/images` directly, because `chat/completions` errors with "No endpoints found" if you request the `text` modality from a model that doesn't support it. Routing is based on `architecture.output_modalities`.
- **video** → `POST /api/v1/videos` returns a job id, polled every 10s (10 min timeout); on `completed` the file is fetched from `unsigned_urls[0]` **with** the Authorization header (401 without it) and kept as a blob URL. A `jobId` still on the item is **resumed** on retry instead of resubmitted, to avoid double charges. Pending jobs are also written to localStorage so they can resume after a reload.

Aspect ratio goes via `image_config.aspect_ratio` on `chat/completions` **and** as a text hint appended to the prompt, since not all models honor `image_config`. The Image and Video APIs take `aspect_ratio` natively.

#### Request Governor & Spend Guard (`actions.ts`)

The **Request Governor** is a semaphore + `AbortController` registry that caps in-flight requests at `MAX_CONCURRENT_REQUESTS`, shared by normal `generate()` and Bake-off — everything queues through the same governor regardless of entry point.

The **Spend Guard** hooks in at the single point a queued request is about to leave the governor and go in-flight (per the code's own comment: the one place in the app where a request escapes the queue and starts spending money). If the batch would exceed — or already exceeds — the user's spend cap, `state.spendConfirm` is set and `SpendGuardModal.tsx` blocks until `confirmSpend()` or `cancelSpend()` (`actions.ts`) resolves it.

A cross-mode spend ledger (`ledger()`, `capUsd`, `totalUsd`, all in `actions.ts`) tracks cumulative spend independent of any single mode's usage bar. `capUsd === undefined` means the feature is off entirely (no cap set); `capUsd === 0` is a valid, active zero-dollar cap. Always check with `=== undefined`, never `!capUsd` — the code has an explicit comment warning about this collapsing the two cases.

### Model lists

- **Home** — every OpenRouter model whose `architecture.output_modalities` includes `"image"`, with OpenAI models filtered down to one canonical id (see the filter in `loadModels`).
- **Infographic** — restricted via `MODE_MODEL_FILTER.infographic`, a regex allowlist on top of the same list.
- **Video** — separate fetch from `/api/v1/videos/models`, filtered to `VIDEO_MODEL_IDS`. Capability fields (`supported_durations`, `supported_aspect_ratios`, `generate_audio`, `pricing_skus`) come from the API; `applyVideoCapabilities()` snaps invalid selections and the Sidebar disables unsupported buttons — no hardcoded per-model UI logic.
- `EXTRA_MODELS` merges in models the API doesn't list yet; `PREFERRED` floats specific models to the top. Users can add their own via SettingsModal (persisted as `atelier_user_extra_models`).

> When changing which OpenAI model id is canonical, update it in **both** `EXTRA_MODELS` (fallback entry) and the `openai/*` allow-check in `loadModels` — and check `MODE_MODEL_FILTER.infographic`, which references model ids independently and can drift out of sync.

### Gallery

Virtualized with `react-window` (`List` + `useDynamicRowHeight`) — rows are grouped into `columnCount` cards, measured after render. Cards outside the viewport **unmount**; any logic that assumes all cards are in the DOM is wrong.

**Card repaint (`cardRev`)** — items are mutated in place, so the item object identity never changes and `React.memo` can't see edits. `VirtualGrid` computes a per-item `cardRev(item)` primitive snapshot once per render and Cards memo on that. **Any new field a card renders must be added to `cardRev`**, or the card won't repaint when it changes.

**Gallery Focus Mode** — arrow keys move focus card-to-card, Enter opens the lightbox. Focus is tracked by `id`, not index. Implemented as a **roving tabindex**: exactly one card has `tabIndex=0` (the entry point) and the rest are `-1`, so Tab enters the grid once and arrows take over. The entry point must always be a card that's currently mounted — `onRowsRendered` reports the rendered range for this. Card `onFocus` filters `e.target === e.currentTarget` because React's `onFocus` bubbles from the buttons inside the card.

### Video progress ring

The API sends no real progress; `videoProgressPct` estimates from elapsed time (`95 × (1 − e^(−t/60))`), capped at 95% until the job completes. The 1-second ticker lives inside `VideoProgress` (local state) so only the ring re-renders — finished `<video>` cards keep stable React keys (`item.id`) and are never remounted, so playback isn't interrupted.

### LLM-assisted features

All call a free text model (see `constants.ts`) via `POST /chat/completions` — **verify the id still exists on OpenRouter before changing it**; free-tier ids get renamed/retired without notice. Free-tier responses are slow; that's expected. Users can override the assist model in SettingsModal. Rate-limit retry/backoff exists for assist calls (`ASSIST_RATE_LIMIT_*`) but **not** for generation requests.

- **Optimizer** (`runOptimize`) — returns strict JSON `{prompt, keywords}` (markdown fences stripped before `JSON.parse`). Reset on mode switch since it belongs to the prompt that was active.
- **Chat** (`ChatPanel`) — one **global** conversation, not per-mode. Renders markdown via `react-markdown` (no `rehype-raw`, so raw HTML stays text).
- **Grill me** (`GrillPanel`) — the model interviews the user, then crystallizes the answers into a set of prompt variants.

### Bake-off

Run one prompt across several models at once to compare. Selected in the Sidebar, confirmed through `BakeOffConfirmModal` (which shows the cost breakdown). Results are tagged with `bakeOffGroupId` and badged in the gallery.

### Model Catalog page

`/models` (`pages/ModelCatalog.tsx`) is a standalone public page, separate from the in-studio model select — no API key required, and it fetches its own `loadModels()`/`loadVideoModels()` independently of `StudioApp`'s mount effect. It's an editorial/comparison view: domain tabs (image/video/audio) plus a grid/table toggle.

`lib/catalogData.ts` holds hand-curated content, **not** derived from the OpenRouter API — `WORKFLOW_RECOMMENDATIONS` (use-case → model id → rationale) and `MODEL_QUALITY_TAGS` (model id → short descriptive tags). Both are resolved against the live fetched model list at render time; if OpenRouter has since removed an id, `WorkflowRecommendations` falls back to showing the raw id with a "not found" note instead of erroring.

`ModelGridShowroom` (card grid) and `ModelComparisonTable` (table, domain-specific columns) are plain CSS grid/table — each domain only has ~10-15 models, so `react-window` virtualization isn't warranted here the way it is in the main Gallery.

### Usage bar / multi-select / export

- **Usage bar** — no OpenRouter spend API exists, so cost is estimated from `pricing` (image) / `pricing_skus` (video) × completed items in the current mode. Session-only.
- **Multi-select** — per-mode `selected: Set<number>`; `downloadSelected` loops with a 150ms delay between `<a download>` clicks to avoid browser blocking. Also supports batch Save to Drive.
- **Export/Import** — JSON of per-mode metadata only (`prompt`, `ratio`, `count`, `duration`, `audio`, `queue`, `history`), never images. `ImportPreviewModal` diffs the file first and offers Merge (additive) or Replace (overwrites). Old legacy exports still import.

## Conventions

### Confirmations

Yes/no confirms go through `confirmAction()` in `lib/alerts.ts` (SweetAlert2; focuses Cancel, resolves `true` only on confirm). Content-heavy modals (BakeOff/SpendGuard/ImportPreview) stay React modals. Never call `Swal.fire` directly elsewhere, and never use Swal for toasts — it shows one popup at a time and would close an open confirm. `shortcuts.ts` checks `isConfirmOpen()` so global shortcuts don't fire under a dialog.

### Toasts

`toast(msg)` defaults to the `success` variant; pass `toast(msg, "error")` for anything where the user's action was **rejected or failed** — that's the line, not "did the system crash". `"info"` exists for neutral status. Error toasts announce with `aria-live="assertive"`, the rest `polite`.

### Styling & focus

Tailwind v4 with the theme defined in `src/index.css` via `@theme`. The palette is **19 tokens** — the 11 legacy names (`--color-bg`, `--color-surface`, `--color-surface-2`, `--color-border`, `--color-border-strong`, `--color-text`, `--color-text-dim`, `--color-text-faint`, `--color-accent`, `--color-accent-ink`, `--color-danger`) plus `--color-success`, `--color-warning`, `--color-info`, `--color-overlay`, `--color-media-scrim`, `--color-on-media`, `--color-on-media-dim`, `--color-interactive` (button/link `:active` press state). Always use the mapped utilities (`bg-surface`, `text-text-dim`, `border-border-strong`, `bg-overlay`, `text-on-media`, …) — **never hardcode a color**, or it won't follow the theme. Generated media (images/video) is still previewed in its actual colors — theming applies to UI chrome only.

**Themes** — 7 picker options: 6 palettes (`paper` light default, `ink`, `contrast`, `sepia`, `midnight`, `nocturne`) plus `system`, which resolves to `paper`/`ink` via `prefers-color-scheme`. `src/lib/themes.ts` is the **source of truth for color values** (`THEMES`, `DEFAULT_THEME`, `CSS_VAR_BY_TOKEN`); `src/index.css` mirrors them as `[data-theme="…"]` blocks that override the `@theme` defaults — change a color and you must change **both**, `--color-interactive` included. Switching a theme just sets `document.documentElement.dataset.theme`; the choice persists in `localStorage` under `atelier_theme`, and an inline script in `index.html` applies it before first paint (FOUC guard) — it can't `import`, so `"paper"` is duplicated there on purpose. `--logo-invert` (outside `@theme`, since it's not a color) is `1` on light themes and `0` on dark ones, for the logo's `filter: invert()`. `media-scrim`/`on-media`/`on-media-dim` are theme-invariant by design (same value across all 7 themes) — they sit on media-preview surfaces (Gallery cards, CompareModal, the Landing hero mock card) that stay dark/legible regardless of the active theme, not on regular page chrome.

`index.css` also defines a global focus ring:

```css
:focus-visible:not(.js-focus-ring-owned) { outline: 2px solid var(--color-accent); outline-offset: 2px; }
```

It's declared **unlayered**, which beats every Tailwind `@layer utilities` rule per the CSS cascade spec — so it wins even over `outline-none` classes without having to touch them. Any element that draws its own focus indicator opts out with the `js-focus-ring-owned` marker class (Gallery Card does this).

### Testing UI changes in a browser

- `.focus()` from JS does **not** trigger `:focus-visible` — press Tab for real when testing focus rings.
- `dispatchEvent(new KeyboardEvent(...))` does **not** trigger React synthetic handlers — press keys for real.
- Vite dev mode injects CSS lazily, so querying `document.styleSheets` may show far fewer rules than production. Check `dist/assets/*.css` after a build instead.
- Tailwind v4 compiles `max-[480px]:` to `@media not all and (min-width:480px)`, not `@media (max-width:480px)` — grep accordingly.
