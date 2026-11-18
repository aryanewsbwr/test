-- Numbers of the office and staff (not customers). Their WhatsApp messages are left out of the
-- Online Payments list. Run once; the list works without it, only the "hide" button needs it.
create table if not exists wa_own_numbers (
  number     text primary key,          -- 91 + 10 digits, as WhatsApp sends it
  name       text,
  created_at timestamptz not null default now()
);
alter table wa_own_numbers enable row level security;
