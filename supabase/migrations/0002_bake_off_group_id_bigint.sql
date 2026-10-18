-- bake_off_group_id holds Date.now()-based ids (~1.7e12), which overflow int.
alter table public.cloud_items alter column bake_off_group_id type bigint;
