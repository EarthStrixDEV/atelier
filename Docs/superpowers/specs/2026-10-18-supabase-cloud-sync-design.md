# Supabase Cloud Sync — Design

Date: 2026-10-18 · Owner: Earth (single user) · Status: draft for review

## Intent

Earth uses Atelier alone, from more than one browser/device, via the public Vercel deployment. Today:

- The OpenRouter key lives in `sessionStorage` by default (gone when the tab closes). An opt-in "remember" flag (`atelier_api_key_remember`, `store.ts`) moves it to `localStorage`, but that is still one browser only.
- Generated media is memory-only unless Gallery Persistence (IndexedDB, `galleryStore.ts`), Auto Save, or Drive is on — all local to one browser or one-way exports.

Earth wants the key remembered and outputs stored in Supabase, so logging in on any browser brings back both the key and the gallery. The whole feature is **optional**: without logging in, Atelier behaves exactly as it does now.

## Goals

1. **Login** — Supabase Auth, email + password, one account (Earth's). Session persists in the browser until explicit logout.
2. **API key sync** — while logged in, the OpenRouter key is stored in Supabase and auto-filled on every new tab/device.
3. **Cloud gallery** — outputs can be stored in Supabase Storage, two ways:
   - manual: a per-item "save to cloud" action (same placement/pattern as Save to Drive, including batch from multi-select);
   - automatic: a toggle that uploads every finished item.
4. **Restore** — on login (and on boot with an existing session), cloud items appear in the Gallery of the matching mode, with metadata intact.
5. **Delete follows** — two delete paths, both also delete from Supabase (row + file):
   - **Delete all** — the existing "ล้างแกลเลอรี" (`resetModeGallery`) for the current mode;
   - **Delete selected** — a new action in the existing multi-select bar (next to download / Save to Drive batch), deleting the checked items.
   There is no per-item delete button (Earth's choice).
6. **Favorite follows** — toggling favorite updates the cloud row.

## Non-goals

- Multiple users, sign-up, sharing, public links.
- Syncing anything else (prompt history, templates, chat, settings, theme, spend ledger).
- Encrypting the key beyond what Supabase provides (see Security).
- Auto-migrating items already in local IndexedDB to the cloud.
- Retrying failed uploads after a page reload (failed state is per-session; Earth retries manually).
- Replacing Gallery Persistence, Auto Save or Drive — all keep working unchanged and independently.

## Anti-goals (would be a failure even if it "works")

- Anyone opening the Vercel URL can read Earth's key or files.
- The app breaks, nags, or changes behavior for a not-logged-in user (including the "try before entering a key" flow).
- A storage/network failure breaks or blocks generation.
- Items appear twice in the Gallery.
- Video job resume (`reconcilePendingJobs`) runs before the cloud key has loaded — with an empty `state.apiKey` it drops pending jobs permanently (actions.ts ~308). Likewise a Generate / Bake-off press during the cloud fetch must not open the key modal (`requireApiKey`) for a key Earth already stored. (There is no boot-time key-modal auto-open any more — removed in R1.)

## Decisions made with Earth

- Single user; deployed publicly on Vercel → login is mandatory to access cloud data.
- New Supabase project, created via Supabase MCP in org **ES Cloud AI & DEV** (`urbxwgqxbbebyyurtlmk`, Pro plan). Cost is confirmed with Earth before creation.
- Email + password via Supabase Auth.
- Both manual save and an auto-upload toggle.
- Logging in on another device restores the gallery.
- Deleting in Gallery deletes in Supabase.

## Design

### Configuration

- Dependency: `@supabase/supabase-js` (v2).
- Env vars (Vite, set in Vercel and `.env.local`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (the public anon/publishable key — safe to ship; RLS is the protection).
- If either is missing, the whole feature is hidden (no Settings section, no card action, no network calls). `npm run build` must pass without them.
- New module `src/lib/supabase.ts` owns the client, auth, key read/write, and storage CRUD — a plain async module like `galleryStore.ts` / `googleDrive.ts`, not a store. `actions.ts` bridges it into `AppState` via `mutate()`, same as the existing gallery-persist bridge.

### Supabase project setup

- Region: Southeast Asia (Singapore) — *my call*, closest to Earth.
- Auth: email provider on, **sign-ups disabled**, email confirmation irrelevant (no sign-up). Earth's user is created by Earth in the Supabase dashboard (Authentication → Add user) so the password never passes through the builder — *my call*.
- Schema (via migration):

```sql
create table public.user_secrets (
  user_id uuid primary key references auth.users on delete cascade,
  openrouter_key text not null,
  updated_at timestamptz not null default now()
);

create table public.cloud_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  mode text not null,
  storage_path text not null,
  mime text not null,
  bytes bigint not null,
  prompt text not null default '',
  model text not null default '',
  model_name text not null default '',
  ratio text not null default '',
  duration int not null default 0,
  audio boolean not null default false,
  neg_prompt text not null default '',
  bake_off_group_id int not null default 0,
  favorite boolean not null default false,
  tts_voice_id text,
  created_at timestamptz not null default now()
);
create index on public.cloud_items (user_id, mode, created_at);
```

  RLS enabled on both tables; policies allow select/insert/update/delete only where `user_id = auth.uid()`. No anon access.
- Storage: private bucket `media`. Object path `{auth.uid()}/{mode}/{cloud_items.id}.{ext}`. Storage policies restrict all operations to objects whose first path segment equals `auth.uid()`. Allowed MIME: `image/*`, `video/*`, `audio/*` (mirror `galleryStore.ts`'s `ALLOWED_MIME_PREFIX`).
- Run Supabase security advisors after migrations; no warnings left on these tables/bucket.

`cloud_items` columns are an **allowlist**, mirroring `PersistedGenItem`: never `refs`, `apiKey`, `jobId`, or error text. Add `parent_cloud_id uuid null references cloud_items on delete set null` — local persistence keeps `parentId`, so the cloud must keep cinematic chain links too; on restore, map `parent_cloud_id` back to the restored parent's in-memory id (*my call*, parity with local).

### Login UI

- New "Cloud (Supabase)" section in `SettingsModal.tsx`:
  - logged out: email + password fields, Login button, error text on failure (error toast per the toast convention).
  - logged in: account email, Logout button, auto-upload toggle, cloud usage (item count + total bytes from `cloud_items`).
- Header API-key status keeps working as-is; no new header control (*my call* — Settings is enough for a single user).
- All UI strings through `i18n.ts`; colors via theme tokens only; focus-ring convention respected.

### API key flow

- **Boot with existing session**: fetch `user_secrets` → if present, set `state.apiKey` (via `mutate`). The cloud key wins over a locally stored one. `reconcilePendingJobs` and `requireApiKey` (Generate / Bake-off) must wait until this fetch resolves (or fails/times out) — define a single "key ready" promise. When the feature is unconfigured or there is no session, it resolves immediately.
- **Login**: same fetch. If the cloud has no key but the browser currently has one, upload it (so first login on the main device seeds the cloud).
- **Key changed while logged in** (KeyModal save): upsert `user_secrets`.
- **Key cleared while logged in** (KeyModal remove): delete the `user_secrets` row too.
- **Logout**: clear `state.apiKey` and remove the key from both `localStorage` and `sessionStorage`, sign out. Cloud data is untouched. Do **not** use `saveApiKey("", false)` as-is — it also rewrites `atelier_api_key_remember` to `"0"`; Earth's remember preference must survive logout (*my call*).
- While logged in, the local remember/session storage behavior is unchanged — the cloud is an extra source, not a replacement.

### Cloud gallery flow

- `GenItem` gains in-memory fields: `cloudId?: string` and `cloudStatus?: "uploading" | "done" | "error"` (+ optional error text, memory only). Neither goes into `PersistedGenItem` except `cloudId` (below).
- **Upload** (manual or auto): fetch `item.url` → Blob → MIME check → insert `cloud_items` row (get id) → upload to `media/{uid}/{mode}/{id}.{ext}`. If the upload fails, delete the row (no orphan rows). Set `cloudStatus`, `mutate()`. Never throws into the generation path; failures show `cloudStatus = "error"` with a retry action on the card.
- **Auto-upload**: hooks the same "item became done" point that Gallery Persistence uses (`persistIfEnabled` area in `actions.ts`). Toggle stored per browser in `localStorage` as `atelier_cloud_autoupload`, default off (*my call*).
- **Manual**: card action + lightbox action + multi-select batch, following the Save to Drive pattern. Hidden when logged out. Already-uploaded items show a "saved to cloud" state instead.
- **Restore limit**: restore at most the **30 most recent** cloud items **per mode** (Earth: "max 30"; per-mode is *my call*). Older items stay in the cloud and are not deleted; there is no cloud size cap. Put the 30 in `constants.ts`.
- **Restore**: on login / boot-with-session, list `cloud_items` for all modes (newest 30 each), and add to each mode's gallery items that are not already present. Must run **after** IndexedDB rehydration has finished (`galleryRehydrated`), since that restore is fire-and-forget and dedupe depends on it. Note `rehydrateGallery()` keeps stored ids and raises `s.seq`; cloud rows carry no session id, so they get fresh ids via `++s.seq`. Newest-first, `registerBlobUrl` for every object URL.
- **Media URLs for restored items**: left to the builder — either download to Blob → object URL (simplest fit with existing blob-URL code paths: downloads, Drive, share card, compare) or signed URLs. Constraint: every existing action on a card (download, Save to Drive, Auto Save, compare, share card, extend video) must work on restored items, and boot must not block the UI while many large videos download.
- **No duplicates with local persistence**: add `cloudId` to `PersistedGenItem` (bump `PERSISTED_ITEM_VERSION` to 3 with a `migrateRecord` step). When restoring from the cloud, skip rows whose id matches a `cloudId` already present in the gallery (from IndexedDB rehydration or the current session).
- **Favorite**: `toggleFavorite` already touches several items sharing a `favoriteKeyOf`; update every touched item that has a `cloudId` (fire-and-forget, same as the local sync).
- **Delete**: the cloud delete is its own bridge, **not** inside `forgetPersistedItems` (that one returns early when Gallery Persistence is off). Called from:
  - `resetModeGallery` — for the items it actually drops. It keeps favorites today; that stays, so favorites survive "delete all" both locally and in the cloud (*my call*, keeps existing semantics).
  - the new "delete selected" action — removes the checked items from the gallery (release blob URLs, local `forgetPersistedItems`, cloud delete), clears the selection. Selected favorites **are** deleted: it's an explicit pick.
  - When any of the affected items has a `cloudId`, show a confirm first, because the cloud copy is permanent loss (*my call*). Without cloud items, behavior stays as today.
  - Fire-and-forget after the confirm; a failed cloud delete gets an error toast but the card does not come back.
- **Logout**: remove cloud-restored items from the Gallery? → left to the builder only if trivial; default is **leave the current gallery as-is** and just stop syncing (*my call*).

### Security

- Anon key in the bundle is expected; RLS on every table and storage policy on the bucket are the actual protection — verified with advisors and by checking an unauthenticated request returns nothing.
- Sign-ups disabled, so nobody else can create an account to pass RLS.
- The OpenRouter key is stored as plain text in `user_secrets`, protected by RLS + Supabase encryption at rest. Client-side encryption was rejected: the decryption secret would have to ship in the same bundle.
- Never log the key or session tokens; never put them into the session snapshot, export JSON, or IndexedDB.

## Constraints

- Client-only SPA, no backend, no Edge Functions needed.
- `npm run build` (strict `tsc --noEmit` + vite build) is the gate.
- Every state change via `mutate()`.
- Generation, Request Governor and Spend Guard are not touched beyond the done-hook.
- Gallery is virtualized — no logic may assume all cards are mounted.

## Left to the builder

- Exact module/function names, file split within `src/lib/`.
- Media-URL strategy for restored items (within the constraint above; with 30/mode, downloading in the background after the metadata appears is acceptable).
- Batch concurrency for multi-upload / restore downloads.
- Visual design of the Settings section and card cloud badge (within existing patterns).
- Login timeout/error wording.

## Setup steps that need Earth

1. Confirm the project cost when the builder creates it via MCP.
2. Create the single user in Supabase dashboard (email + password).
3. Add `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` to Vercel env vars and redeploy.
