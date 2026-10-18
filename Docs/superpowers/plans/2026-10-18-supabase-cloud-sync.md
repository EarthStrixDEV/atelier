# Supabase Cloud Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Optional Supabase login that syncs Earth's OpenRouter key and stores/restores generated media in Supabase Storage.

**Architecture:** New plain async module `src/lib/supabase.ts` (client, auth, key, cloud items — no AppState access), bridged into state by `actions.ts` via `mutate()`, exactly like `galleryStore.ts` / `googleDrive.ts`. Supabase side: two RLS tables + one private bucket, created through Supabase MCP. Whole feature hidden when env vars are absent.

**Tech Stack:** React 19, TypeScript (strict), Vite, Tailwind v4, `@supabase/supabase-js` v2, Supabase MCP.

**Spec:** `Docs/superpowers/specs/2026-10-18-supabase-cloud-sync-design.md`

## Global Constraints

- No test framework exists; `npm run build` (tsc strict + vite build) is the gate after every task. Do not add a test runner.
- Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Missing either → feature fully hidden, zero Supabase network calls, build still passes.
- Supabase org `urbxwgqxbbebyyurtlmk` (ES Cloud AI & DEV), region `ap-southeast-1`. Confirm cost with Earth before `create_project`.
- Every state change via `mutate()`. Never `!capUsd`-style falsy checks on optional numbers.
- UI strings through `t()` in `src/lib/i18n.ts`; colors only via theme utilities; elements drawing their own focus ring use `js-focus-ring-owned`.
- Toasts: `"error"` only when Earth's action failed/was rejected.
- `cloud_items` / upload payload is an allowlist: never `refs`, `apiKey`, `jobId`, error text.
- The key and session tokens never go into logs, session snapshot, export JSON, or IndexedDB.
- Storage path: `{uid}/{mode}/{cloudId}.{ext}` in private bucket `media`.
- `CLOUD_RESTORE_PER_MODE = 30` in `constants.ts`.
- Auto-upload flag: `localStorage["atelier_cloud_autoupload"] === "1"`, default off.
- Don't commit unrelated untracked files under `Docs/`.

## Review Focus

1. Not-logged-in / unconfigured user — app must behave byte-for-byte as before (try-before-key flow, KeyModal, Gallery Persistence). Checked in Task 2 and Task 7 Step "unconfigured run".
2. Boot with session + pending video job — `reconcilePendingJobs` must see the cloud key, not drop the job. Checked in Task 3.
3. Upload failure midway (row inserted, file upload fails) — no orphan row; card shows retry. Checked in Task 4.
4. Same item restored from IndexedDB and cloud — appears once. Checked in Task 5.
5. "Delete all" with favorites — favorites survive in gallery and cloud; non-favorites gone from both. Checked in Task 6.

---

### Task 1: Supabase project, schema, storage, auth

**Files:**
- Create: `supabase/migrations/0001_cloud_sync.sql` (copy of what is applied, for the record)
- Create: `.env.example`

**Interfaces:**
- Produces: project URL + anon key (into `.env.local`, untracked), tables `user_secrets`, `cloud_items`, bucket `media`.

- [ ] **Step 1:** `get_cost` (type project, org `urbxwgqxbbebyyurtlmk`) → show Earth the amount → `confirm_cost` only after Earth says yes → `create_project` name `atelier`, region `ap-southeast-1`.
- [ ] **Step 2:** `apply_migration` `cloud_sync` with the two tables from the spec, plus `parent_cloud_id uuid null references public.cloud_items(id) on delete set null` on `cloud_items`. Enable RLS on both; policies `for all using (user_id = auth.uid()) with check (user_id = auth.uid())` to role `authenticated`.
- [ ] **Step 3:** Same migration (or second): `insert into storage.buckets (id, name, public, allowed_mime_types) values ('media','media',false, array['image/*','video/*','audio/*'])`; storage policies on `storage.objects` for select/insert/update/delete to `authenticated` where `bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text`.
- [ ] **Step 4:** Disable sign-ups: ask Earth to toggle Authentication → Sign In / Providers → "Allow new users to sign up" off, and create their user (Authentication → Users → Add user, auto-confirm). The password never passes through the builder.
- [ ] **Step 5: Verify** — `get_advisors` (security) shows no issue on these objects; `execute_sql` `set role anon; select count(*) from public.cloud_items;` returns 0 rows/permission denied.
- [ ] **Step 6:** `get_project_url` + `get_publishable_keys` → write `.env.local`; write `.env.example` with both names and empty values. Confirm `.env.local` is gitignored (add if not).
- [ ] **Step 7: Commit** `supabase/migrations/0001_cloud_sync.sql`, `.env.example`, `.gitignore` if changed — `chore: add Supabase schema for cloud sync`.

### Task 2: `supabase.ts` client, auth, key storage

**Files:**
- Create: `src/lib/supabase.ts`
- Modify: `package.json` (dep), `src/lib/store.ts` (new `clearApiKeyStorage`)

**Interfaces:**
- Produces (all in `supabase.ts`, none throw unless noted):
  - `isCloudConfigured(): boolean`
  - `cloudGetSession(): Promise<{ userId: string; email: string } | null>`
  - `cloudSignIn(email: string, password: string): Promise<{ ok: true } | { ok: false; message: string }>`
  - `cloudSignOut(): Promise<void>`
  - `onCloudAuthChange(fn: (user: { userId: string; email: string } | null) => void): void`
  - `cloudLoadKey(): Promise<string | null>` (null = none or failed)
  - `cloudSaveKey(key: string): Promise<boolean>` (upsert)
  - `cloudDeleteKey(): Promise<boolean>`
  - `store.ts`: `clearApiKeyStorage(): void` — removes `atelier_api_key` from both storages, leaves `atelier_api_key_remember` untouched.

- [ ] **Step 1:** `npm i @supabase/supabase-js@^2`.
- [ ] **Step 2:** Implement `supabase.ts`: lazy client created only when both env vars are non-empty (`createClient(url, anon, { auth: { persistSession: true, storageKey: "atelier_supabase_auth" } })` — `atelier_` prefix so the storage breakdown counts it). Every exported fn returns its "empty" value when not configured.
- [ ] **Step 3:** Implement `clearApiKeyStorage()` in `store.ts` next to `saveApiKey`.
- [ ] **Step 4: Verify** — `npm run build` passes with no `.env.local` (temporarily rename it) and with it.
- [ ] **Step 5: Commit** — `feat: add Supabase client module for auth and key storage`.

### Task 3: Key flow + Settings "Cloud (Supabase)" section (login only)

**Files:**
- Modify: `src/lib/actions.ts` (`reconcilePendingJobs` ~267, `requireApiKey` ~459), `src/lib/types.ts` (`AppState`), `src/lib/store.ts` (fresh state), `src/components/KeyModal.tsx` (save ~52, remove ~66), `src/components/SettingsModal.tsx`, `src/lib/i18n.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `AppState.cloudUser: { userId: string; email: string } | null` (fresh: `null`)
  - `actions.ts`: `keyReady: Promise<void>` (module-level), `initCloud(): void` (called first thing in `reconcilePendingJobs`), `cloudLogin(email, password): Promise<boolean>`, `cloudLogout(): Promise<void>`, `onApiKeySaved(key: string): void`, `onApiKeyCleared(): void`.
  - Hook for later tasks: `initCloud` calls `restoreCloudGallery()` (Task 5) after key load; leave a no-op stub until then.

- [ ] **Step 1:** `initCloud()`: if not configured → `keyReady = Promise.resolve()`. Else `keyReady = (async () => { session → set cloudUser; cloudLoadKey → if non-empty set state.apiKey; else if state.apiKey non-empty cloudSaveKey(state.apiKey) })()`, with a 5 s timeout race so a dead network never blocks forever.
- [ ] **Step 2:** In `reconcilePendingJobs`, move the ledger part (from `const ledger = loadPendingJobs()` on) behind `void keyReady.then(() => { … })`. Gallery rehydrate stays where it is (sync, unblocked).
- [ ] **Step 3:** `requireApiKey`: if `!state.apiKey` and `keyReady` not yet settled, await it then re-check before opening the modal. Signature stays `boolean`-returning: return `false`, and on settle either call `resume()` (key arrived) or open the modal as today. Track settled state with a module boolean.
- [ ] **Step 4:** `cloudLogin` → `cloudSignIn`; on ok, same key logic as Step 1 + set `cloudUser`; on fail `toast(message, "error")`. `cloudLogout` → `cloudSignOut`, `clearApiKeyStorage()`, `mutate(s => { s.apiKey = ""; s.cloudUser = null; })`. Gallery left as is.
- [ ] **Step 5:** KeyModal: after the existing save `mutate`, call `onApiKeySaved(v)`; after remove, `onApiKeyCleared()`. Both no-op unless `state.cloudUser`.
- [ ] **Step 6:** SettingsModal: new section rendered only if `isCloudConfigured()`. Logged out: email + password inputs (`type="email"`, `type="password"`, `autoComplete` set), Login button disabled while pending. Logged in: email, Logout. (Auto-upload toggle + usage added in Task 4.)
- [ ] **Step 7: Verify** — build passes. Browser (`/atelier/studio`): login with Earth's account → key appears (header shows "API Key ใส่แล้ว"); close tab, reopen → key present without KeyModal; change key in KeyModal → `execute_sql select updated_at from user_secrets` changed; Logout → header shows no key, `localStorage.atelier_api_key_remember` unchanged. Pending-job check: start a video, reload immediately with "remember" off → job resumes (not counted lost).
- [ ] **Step 8: Commit** — `feat: sync OpenRouter key via Supabase login`.

### Task 4: Upload (manual + auto) and card cloud status

**Files:**
- Modify: `src/lib/supabase.ts`, `src/lib/types.ts` (`GenItem` ~71), `src/lib/actions.ts` (done hook ~1560, near `saveItemToDrive` ~1960), `src/lib/constants.ts`, `src/components/Gallery.tsx` (card action ~775, multi-select bar ~1181), `src/components/Lightbox.tsx`, `src/components/SettingsModal.tsx`, `src/lib/i18n.ts`

**Interfaces:**
- Consumes: Task 3 `state.cloudUser`.
- Produces:
  - `GenItem.cloudId?: string`, `GenItem.cloudPath?: string` (storage path, set on upload and restore), `GenItem.cloudStatus?: "uploading" | "done" | "error"`, `GenItem.cloudErrMsg?: string`
  - `supabase.ts`: `CloudItemMeta` (allowlist fields of `cloud_items` incl. `parentCloudId: string | null`), `cloudUploadItem(meta: Omit<CloudItemMeta,"id"|"createdAt"|"storagePath"|"bytes"|"mime">, blob: Blob): Promise<{ ok: true; id: string; storagePath: string } | { ok: false; message: string }>`, `cloudUsage(): Promise<{ count: number; bytes: number }>`
  - `actions.ts`: `saveItemToCloud(item: GenItem): void`, `saveSelectedToCloud(): void`, `isCloudAutoUpload(): boolean`, `setCloudAutoUpload(on: boolean): void`

- [ ] **Step 1:** `cloudUploadItem`: MIME prefix check → insert row (returns id) → `storage.upload(path, blob, { contentType })` → on upload error delete the row, return `{ok:false}`. Never throws.
- [ ] **Step 2:** `saveItemToCloud`: guard `state.cloudUser && item.status==="done" && item.url && !item.cloudId && item.cloudStatus!=="uploading"`; `fetch(item.url).blob()`; `parentCloudId` = parent item's `cloudId` if any; set statuses via `mutate`. Run uploads through a 2-wide queue (same idea as `enqueueDriveSave`).
- [ ] **Step 3:** Auto: at actions.ts ~1560, next to `persistItemToGallery(item)`, add `if (state.cloudUser && isCloudAutoUpload()) saveItemToCloud(item)`.
- [ ] **Step 4:** UI: card + Lightbox "เก็บขึ้น Cloud" action placed beside the Drive one, visible only when `cloudUser`; states: none → button, uploading → spinner, done → "อยู่บน Cloud" badge (no button), error → retry button with `cloudErrMsg` as title. Multi-select bar button calls `saveSelectedToCloud`. Settings section gets the auto-upload toggle and `cloudUsage()` line.
- [ ] **Step 5: Verify** — build passes. Browser: manual upload of an image and a video → row + object exist (`execute_sql`), badge shows. Auto toggle on → new generation uploads by itself. Failure path: in DevTools block `*/storage/v1/*` → upload shows error + retry, and `select count(*) from cloud_items` did not grow.
- [ ] **Step 6: Commit** — `feat: upload gallery items to Supabase Storage`.

### Task 5: Restore + dedupe with local persistence

**Files:**
- Modify: `src/lib/supabase.ts`, `src/lib/galleryStore.ts` (`PersistedGenItem` ~66, `PERSISTED_ITEM_VERSION` ~131, `migrateRecord` ~140, new setter), `src/lib/actions.ts` (`rehydrateGallery` ~1734, `persistKeys` ~1584, Task 3 stub), `src/lib/constants.ts`

**Interfaces:**
- Consumes: Task 4 `CloudItemMeta`, `GenItem.cloudId`.
- Produces:
  - `supabase.ts`: `cloudListRecent(mode: Mode, limit: number): Promise<CloudItemMeta[]>` (newest first), `cloudDownload(storagePath: string): Promise<Blob | null>`
  - `galleryStore.ts`: `PersistedGenItem.cloudId?: string`, `PERSISTED_ITEM_VERSION = 3`, `setCloudId(key: string, cloudId: string): Promise<boolean>`
  - `actions.ts`: `restoreCloudGallery(): Promise<void>`
  - `constants.ts`: `CLOUD_RESTORE_PER_MODE = 30`

- [ ] **Step 1:** galleryStore: add `cloudId` to the allowlist and to `saveItem`'s record; `migrateRecord` v2→v3 is a pure version bump; `setCloudId` mirrors `setFavorite`. In `rehydrateGallery`, copy `r.cloudId` onto the restored `GenItem`.
- [ ] **Step 2:** After a successful cloud upload (Task 4), if `persistKeys.get(item.id)` exists → `setCloudId(key, id)`.
- [ ] **Step 3:** `restoreCloudGallery`: `await galleryRehydrated`; for each mode `cloudListRecent(mode, CLOUD_RESTORE_PER_MODE)`; skip rows whose id equals any existing `item.cloudId` across all modes; insert placeholders with fresh `++s.seq` ids, `status:"done"`, `cloudStatus:"done"`, metadata from row, in newest-first position consistent with the gallery's order; then download blobs in the background (2 at a time), `registerBlobUrl` + set `item.url` via `mutate`. Map `parentCloudId` → `parentId` after all modes are inserted. One info toast with the restored count if > 0.
- [ ] **Step 4:** Call it from `initCloud` (after key) and from `cloudLogin` success.
- [ ] **Step 5: Verify** — build passes. Browser A uploads 2 items; browser B (other profile) login → both appear with prompt/model; reload B with Gallery Persistence **on** and those items persisted locally → each appears once. Cinematic chain uploaded → restored chain still linked. Every card action (download, Drive, compare, share card) works on a restored item.
- [ ] **Step 6: Commit** — `feat: restore cloud gallery on login`.

### Task 6: Delete all / delete selected / favorite sync

**Files:**
- Modify: `src/lib/supabase.ts`, `src/lib/actions.ts` (`resetModeGallery` ~1017, `toggleFavorite` ~2698, new `deleteSelected`), `src/components/Gallery.tsx` (clear handler ~1143, multi-select bar ~1181), `src/lib/i18n.ts`

**Interfaces:**
- Consumes: Task 4/5 `cloudId`.
- Produces:
  - `supabase.ts`: `cloudDeleteItems(items: { id: string; storagePath: string }[]): Promise<boolean>` (storage `remove` then row delete), `cloudSetFavorite(ids: string[], favorite: boolean): Promise<boolean>`
  - `actions.ts`: `deleteSelected(): number` (sync; returns removed count), `selectionHasCloudItems(): boolean`, `modeResetHasCloudItems(mode: Mode): boolean`; internal `forgetCloudItems(items: GenItem[]): void`
  - Delete reads `GenItem.cloudPath` (Task 4) so it needs no extra query.

- [ ] **Step 1:** `forgetCloudItems` — independent of `forgetPersistedItems`; no-op without `cloudUser`; fire-and-forget; on failure `toast(t(...), "error")`.
- [ ] **Step 2:** `resetModeGallery`: collect dropped items (not just ids) and call `forgetCloudItems` after `forgetPersistedItems`. Favorites skipped as today.
- [ ] **Step 3:** `deleteSelected`: remove selected items of the current mode (favorites included), `releaseBlobUrls`, clear selection, `lbIndex = -1`, `forgetPersistedItems(ids)`, `forgetCloudItems(items)`.
- [ ] **Step 4:** Gallery: before calling `resetModeGallery` / `deleteSelected`, if `modeResetHasCloudItems` / `selectionHasCloudItems` → confirm dialog (existing modal pattern in the app, not `window.confirm`) stating cloud copies will be deleted permanently. Add "ลบที่เลือก" button to the multi-select bar.
- [ ] **Step 5:** `toggleFavorite`: after the existing local sync, collect `cloudId`s of every touched item → `cloudSetFavorite`.
- [ ] **Step 6: Verify** — build passes. Browser: 3 cloud items, 1 favorite → "ล้างแกลเลอรี" → confirm shown → favorite stays in gallery and in `cloud_items`, other 2 rows + objects gone. Select 1 → "ลบที่เลือก" → gone from both. Favorite toggle → `favorite` column flips.
- [ ] **Step 7: Commit** — `feat: delete and favorite sync for cloud items`.

### Task 7: Docs and final check

**Files:**
- Modify: `CLAUDE.md` (Architecture tree, Persistence section, new "Cloud Sync (Supabase)" subsection: env vars, allowlist, keyReady gate, delete semantics, restore cap)

- [ ] **Step 1:** Update `CLAUDE.md`.
- [ ] **Step 2: Unconfigured run** — remove `.env.local`, `npm run build` and `npm run dev`: no Cloud section, no card cloud button, Network tab shows no `supabase.co` requests, try-before-key flow unchanged.
- [ ] **Step 3:** `npm run build` with env restored passes.
- [ ] **Step 4: Commit** — `docs: document Supabase cloud sync`.
- [ ] **Step 5:** Remind Earth: add both env vars in Vercel and redeploy.
