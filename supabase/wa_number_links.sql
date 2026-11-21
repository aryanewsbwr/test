-- Run ONCE in the Supabase SQL Editor.
-- WhatsApp Replies: staff can confirm or correct which customer a WhatsApp number belongs to.
-- The link is used to match that number's messages from then on; it does not change the
-- customer's saved phone numbers (bills keep going where they went before).
create table if not exists public.wa_number_links (
  number      text primary key,          -- last 10 digits of the WhatsApp number
  customer_id integer not null,
  set_at      timestamptz not null default now()
);
alter table public.wa_number_links enable row level security;
revoke all on public.wa_number_links from anon, authenticated;
