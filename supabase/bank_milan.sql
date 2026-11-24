-- Run ONCE in the Supabase SQL Editor.
-- Bank Milan (बैंक जमा मिलान): every UPI / bank credit from the PNB statement, and which customer
-- it came from. Moved onto the website from Himanshu's own matching project (Nov 2026).

create table if not exists public.bank_credits (
  key           text primary key,        -- UTR, or "<Txn No>_<amount>"; "<UTR>-1", "-2" for parts of a shared credit
  txn_no        text,
  credit_date   date not null,
  amount        numeric(12,2) not null,
  narration     text,
  payer_name    text,                    -- the bank's short sender name
  payer_bank    text,
  payer_vpa     text,                    -- payer's UPI ID
  payer_mobile  text,                    -- 10 digits, when the UPI ID starts with a mobile number
  phonepe_name  text,                    -- the full name PhonePe shows for the same UTR
  parent_key    text,                    -- set on a part of a shared credit
  customer_id   integer,                 -- confirmed customer (status 'ok') or the imported suggestion
  status        text not null default '',-- '' open, 'ok' confirmed, 'out' not a customer (BR, cash sale...)
  note          text,
  receipt_no    text,                    -- रसीद नं.
  hawker        text,                    -- collecting hawker
  updated_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists bank_credits_date on public.bank_credits (credit_date);

-- A payer's UPI ID once staff confirm whose it is: that customer is suggested next time
create table if not exists public.upi_id_links (
  vpa          text primary key,         -- lower case
  customer_id  integer not null,
  note         text,
  set_at       timestamptz not null default now()
);

alter table public.bank_credits enable row level security;
alter table public.upi_id_links enable row level security;
revoke all on public.bank_credits from anon, authenticated;
revoke all on public.upi_id_links from anon, authenticated;
