-- Atelier cloud sync: single-user key storage + media archive.
-- Every row/object is scoped to its owner via RLS; anon has no access.

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
  parent_cloud_id uuid null references public.cloud_items(id) on delete set null,
  created_at timestamptz not null default now()
);
create index cloud_items_user_mode_created on public.cloud_items (user_id, mode, created_at desc);
create index cloud_items_parent on public.cloud_items (parent_cloud_id);

alter table public.user_secrets enable row level security;
alter table public.cloud_items enable row level security;

create policy "own secrets" on public.user_secrets
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "own items" on public.cloud_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, allowed_mime_types)
values ('media', 'media', false, array['image/*', 'video/*', 'audio/*']);

create policy "own media select" on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "own media insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "own media update" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "own media delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
