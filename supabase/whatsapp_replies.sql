-- =====================================================================
-- Aryan News Agency — WhatsApp replies webhook: tables + report view
-- Run once in Supabase → SQL Editor (Postgres, NOT MySQL)
-- Created 03-Nov-2026
-- =====================================================================

-- 1) Every message a customer sends to 9462558949 (text, button, photo, voice…)
create table if not exists public.wa_incoming (
  id             bigserial primary key,
  wamid          text unique not null,      -- WhatsApp message id (no duplicates)
  from_number    text not null,             -- 91XXXXXXXXXX (same format as customer_mobile)
  profile_name   text,                      -- customer's WhatsApp name
  msg_type       text,                      -- text / button / image / audio / document / ...
  body           text,                      -- text, button text or photo caption
  button_payload text,                      -- payload of a template quick-reply button
  reply_to_wamid text,                      -- which of our messages (bill) they replied to
  media_id       text,
  media_mime     text,
  media_path     text,                      -- file path in Storage bucket 'wa-media'
  msg_time       timestamptz,
  received_at    timestamptz default now(),
  handled        boolean default false,     -- office ticks this after action
  note           text,                      -- office remark
  raw            jsonb
);
create index if not exists wa_incoming_from_idx on public.wa_incoming (from_number);
create index if not exists wa_incoming_time_idx on public.wa_incoming (msg_time);

-- 2) Delivery status of every message WE send (sent / delivered / read / failed)
--    'failed' rows show bills that never reached the customer (number not on WhatsApp etc.)
create table if not exists public.wa_status (
  id               bigserial primary key,
  wamid            text not null,
  status           text not null,
  recipient        text,
  status_time      timestamptz,
  error_code       int,
  error_title      text,
  pricing_category text,
  billable         boolean,
  received_at      timestamptz default now(),
  unique (wamid, status)
);
create index if not exists wa_status_recipient_idx on public.wa_status (recipient);

-- 3) Private storage bucket for photos / voice notes customers send
insert into storage.buckets (id, name, public)
values ('wa-media', 'wa-media', false)
on conflict (id) do nothing;

-- 4) Security: customer messages must NOT be readable with the public (anon) key.
--    Only the webhook (service role) and server-side code can read them.
alter table public.wa_incoming enable row level security;
alter table public.wa_status   enable row level security;
revoke all on public.wa_incoming, public.wa_status from anon, authenticated;

-- 5) Daily report view with a rough automatic category.
--    Category is keyword-based; always check rows marked 'खुद देखें'.
--    id (last column) lets the WhatsApp Replies screen tick a row as handled.
create or replace view public.wa_replies_report
with (security_invoker = true) as
select
  (msg_time at time zone 'Asia/Kolkata')::date                as tareekh,
  to_char(msg_time at time zone 'Asia/Kolkata', 'HH24:MI')    as samay,
  from_number,
  profile_name,
  msg_type,
  body,
  case
    when msg_type in ('button', 'interactive')
         and (coalesce(button_payload, '') ~* '(not|wrong|nahi)' or coalesce(body, '') ~ 'मेरा बिल नहीं')
      then 'गलत नंबर (बटन)'
    when msg_type in ('image', 'document')       then 'फोटो/फाइल – शायद पेमेंट'
    when msg_type = 'audio'                       then 'वॉइस मैसेज – खुद सुनें'
    when body ~* '(wrong|galat|गलत|मेरा नहीं|mera nahi|not my|kaun|कौन)'
      then 'गलत नंबर / पहचान नहीं'
    when body ~* '(band|बंद|stop|मत भेज|nahi chahiye|नहीं चाहिए)'
      then 'पेपर बंद / बदलाव'
    when body ~* '(cash|nakad|नकद|hawker|हॉकर|vendor|ले जाना|ले जाए)'
      then 'नकद / हॉकर को देंगे'
    when body ~* '(paid|payment|done|kar diya|kr diya|कर दिया|भेज दिया|जमा|भुगतान|transfer|upi|phonepe|gpay|paytm)'
      then 'पेमेंट किया'
    when body ~* '^\s*(ok|okay|ओके|👍|thanks|thank you|धन्यवाद|ji|जी)\s*\.?\s*$'
      then 'सामान्य जवाब'
    else 'खुद देखें'
  end                                                          as shreni,
  media_path,
  handled,
  note,
  reply_to_wamid,
  id
from public.wa_incoming
order by msg_time;

revoke all on public.wa_replies_report from anon, authenticated;

-- 6) Bills that FAILED to deliver (wrong / non-WhatsApp numbers)
create or replace view public.wa_failed_report
with (security_invoker = true) as
select recipient, status_time at time zone 'Asia/Kolkata' as samay, error_code, error_title, wamid
from public.wa_status
where status = 'failed'
order by status_time;

revoke all on public.wa_failed_report from anon, authenticated;
