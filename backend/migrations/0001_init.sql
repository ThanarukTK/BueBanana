-- 0001_init.sql — schema for the NFC boardgame café backend.
--
-- Source of truth for the database: tables, indexes, triggers and retention live here as plain SQL so
-- the identical files run against a local container and against Supabase (`docs/supabase-migration-plan.md`).
--
-- Conventions (`docs/api-convention.md` §7): money as integer satang (never float), timestamptz for every
-- timestamp, app-generated UUIDs for exposed IDs so the wire contract's ID format does not change with the
-- storage, snake_case columns mapped to camelCase API fields in the store layer.

create table if not exists schema_migrations (
  version     text primary key,
  applied_at  timestamptz not null default now()
);

-- Registered card identities (PB-15). `uid_hash` is HMAC-SHA256(rawUid, TAG_UID_PEPPER) computed by the
-- backend: the raw UID is never stored, and the pepper keeps the hash from being enumerable back to a
-- physical card (PDPA, docs/rule.md).
create table if not exists tags (
  tag_id      uuid primary key,
  uid_hash    text not null unique,
  label       text,
  status      text not null default 'active' check (status in ('active', 'disabled')),
  created_at  timestamptz not null default now()
);

-- One row per visit/party.
create table if not exists groups (
  group_id    uuid primary key,
  status      text not null check (status in ('active', 'closed')),
  start_time  timestamptz not null,
  created_at  timestamptz not null default now()
);

-- One row per member per group. The roster is derived from here (no denormalised array on `groups`).
create table if not exists sessions (
  session_id      uuid primary key,
  tag_id          uuid not null references tags (tag_id),
  group_id        uuid not null references groups (group_id),
  check_in_time   timestamptz not null,
  check_out_time  timestamptz,
  status          text not null check (status in ('open', 'closed')),
  created_at      timestamptz not null default now()
);

-- Integrity guard the in-memory store got for free: at most one open session per card. Two concurrent
-- taps for the same tag cannot both start a visit — the second one violates this index instead of
-- quietly creating a second bill.
create unique index if not exists sessions_one_open_per_tag on sessions (tag_id) where status = 'open';
create index if not exists sessions_group_idx on sessions (group_id);

-- Confirmed check-out evidence (ETA §9): amount, staff, timestamp, bill version.
create table if not exists receipts (
  session_id            uuid primary key references sessions (session_id),
  amount_satang         integer not null check (amount_satang >= 0),
  rate_per_hour_satang  integer not null,
  staff_id              text not null,
  confirmed_at          timestamptz not null,
  bill_version          text not null
);

-- CCA §26 traffic log. Append-only, retained ≥90 days (see the retention function below).
create table if not exists audit_log (
  audit_id    uuid primary key,
  actor       text not null,
  tag_id      uuid,
  action      text not null,
  endpoint    text not null,
  result      text not null check (result in ('success', 'failure')),
  logged_at   timestamptz not null default now()
);
create index if not exists audit_log_logged_at_idx on audit_log (logged_at desc);

-- Reader coordination (§3.1 open join window, §3.2 pending terminal outcome). One row each, so the
-- window and the un-claimed outcome survive a restart and are visible to more than one server instance.
create table if not exists reader_state (
  id            boolean primary key default true check (id),
  open_group_id uuid,
  open_until    timestamptz
);
insert into reader_state (id) values (true) on conflict (id) do nothing;

-- The pending reader outcome lives in its own single row so claiming it is a `DELETE … RETURNING`:
-- `UPDATE … RETURNING` hands back the *new* values, which makes an atomic claim awkward and wrong.
-- DELETE also gives claim-once for free — a second claim blocks on the row lock, then finds nothing.
create table if not exists reader_outcome (
  id      boolean primary key default true check (id),
  group_id uuid not null,
  payload jsonb not null,
  at      timestamptz not null default now()
);

-- POST /scans idempotency window (`api-convention.md` §10): a firmware retry must not double-create.
create table if not exists scan_dedupe (
  uid_hash  text primary key,
  at        timestamptz not null,
  response  jsonb not null
);

-- ---------------------------------------------------------------------------------------------
-- Compliance enforced in the database, not in TypeScript
-- ---------------------------------------------------------------------------------------------

/**
 * The audit log is append-only as a property of the database. Deletion is allowed only inside the
 * retention job, which raises the `app.audit_purge` flag for its own statement.
 *
 * Honest limit: the backend connects as the table owner on Supabase's `postgres` role, so this trigger
 * is tamper-*evident*, not tamper-*proof* — the owner could drop it. A non-owner application role is
 * the hardening step after the demo (`docs/supabase-migration-plan.md`).
 */
create or replace function audit_log_append_only() returns trigger
language plpgsql as $$
begin
  if current_setting('app.audit_purge', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'audit_log is append-only (CCA §26): % is not permitted', tg_op;
end $$;

drop trigger if exists audit_log_no_change on audit_log;
create trigger audit_log_no_change
  before update or delete on audit_log
  for each row execute function audit_log_append_only();

/**
 * Retention: `docs/rule.md` requires traffic logs kept at least 90 days, deleted after that unless a
 * lawful hold applies. This is the only supported deletion path, and it is a scheduled job — never an
 * API route (`api-convention.md` §8.2). Run it with `bun run retention`.
 */
create or replace function purge_audit_log_before(cutoff timestamptz) returns integer
language plpgsql as $$
declare removed integer;
begin
  perform set_config('app.audit_purge', 'on', true);
  delete from audit_log where logged_at < cutoff;
  get diagnostics removed = row_count;
  perform set_config('app.audit_purge', 'off', true);
  return removed;
end $$;
