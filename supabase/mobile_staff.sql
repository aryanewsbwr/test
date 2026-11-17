-- Mobile app (/m): each staff member's 4-digit PIN, the lines (regions) they see and the
-- collector whose receipt books their receipts are cut from. One row per login user (app_users.id).
-- Only the server key reads this table, so the PIN hashes never reach a browser.
create table if not exists mobile_staff (
  user_id      text primary key,
  pin_hash     text,
  region_ids   integer[],            -- null or empty: every line
  collect_id   integer,              -- collect.Collect_id; null: receipt no. is typed
  fails        integer not null default 0,
  locked_until timestamptz,
  updated_at   timestamptz not null default now()
);

alter table mobile_staff enable row level security;

-- Who saved what from the mobile app, and when (stops, new papers, extra papers).
-- Payments keep this inside the receipt itself. Run once; the app works without it.
create table if not exists mobile_log (
  id          bigserial primary key,
  user_id     text not null,
  user_name   text,
  action      text not null,       -- stop | start | extra
  customer_id integer,
  details     jsonb,
  created_at  timestamptz not null default now()
);
alter table mobile_log enable row level security;
