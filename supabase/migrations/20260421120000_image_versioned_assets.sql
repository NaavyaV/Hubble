-- Versioned image metadata for deterministic, cache-friendly asset URLs.
alter table if exists public.profiles
  add column if not exists avatar_path text,
  add column if not exists avatar_version integer not null default 1,
  add column if not exists avatar_width integer,
  add column if not exists avatar_height integer,
  add column if not exists avatar_blurhash text,
  add column if not exists avatar_file_size_bytes bigint,
  add column if not exists avatar_mime_type text;

alter table if exists public.events
  add column if not exists cover_path text,
  add column if not exists cover_version integer not null default 1,
  add column if not exists cover_width integer,
  add column if not exists cover_height integer,
  add column if not exists cover_blurhash text,
  add column if not exists cover_file_size_bytes bigint,
  add column if not exists cover_mime_type text;

alter table if exists public.organizations
  add column if not exists icon_path text,
  add column if not exists icon_version integer not null default 1,
  add column if not exists icon_width integer,
  add column if not exists icon_height integer,
  add column if not exists icon_file_size_bytes bigint,
  add column if not exists icon_mime_type text;

