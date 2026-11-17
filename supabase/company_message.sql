-- Master > Company and Master > Message, in the old software's tables (company, message),
-- with the website's extra company columns. Run once; it does not change any other data.

create table if not exists company (
  id       integer primary key,
  name     text,
  address  text,
  city     text,
  pincode  text,
  phone    text,
  mobile   text,
  fax      text,
  email    text
);
alter table company add column if not exists hindi_name    text;
alter table company add column if not exists short_address text;
alter table company add column if not exists proprietor    text;

create table if not exists message (
  message_id integer primary key,
  dated      text,
  message    text
);

alter table company enable row level security;
alter table message enable row level security;
