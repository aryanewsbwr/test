-- Hawker priority and Hindi name (Hawker Master). Run once in the Supabase SQL Editor.
-- Kept in its own table, one row per hawker NAME (a name can have several hawker numbers),
-- so the old software's hawker table stays exactly as it is for backups.
-- A hawker name without a priority here is not shown in any list.
create table if not exists public.hawker_priority (
  name_key   text primary key,          -- lower-case hawker name
  name       text not null,
  priority   integer not null,
  hindi_name text,
  updated_at timestamptz not null default now()
);
alter table public.hawker_priority enable row level security;
revoke all on public.hawker_priority from anon, authenticated;

insert into public.hawker_priority (name_key, name, priority, hindi_name) values
  ('1', '1', 1, 'पाली बाज़ार'),
  ('3', '3', 8, 'विमल'),
  ('3imorning', '3IMorning', 9, 'मेवाड़ी बाज़ार'),
  ('4cnagar', '4CNagar', 14, 'चम्पा नगर'),
  ('5adarshnagar', '5Adarshnagar', 17, 'आदर्श नगर'),
  ('5dayanagar', '5Dayanagar', 20, 'भजन नगर'),
  ('5delwararoad', '5DelwaraRoad', 16, 'देलवाड़ा रोड'),
  ('5gayatrinagar', '5Gayatrinagar', 18, 'गायत्री नगर'),
  ('5rhb', '5RHB', 19, 'रीको'),
  ('ag', 'Ag', 24, 'पंजाबी जीन'),
  ('collegeroad', 'CollegeRoad', 7, 'जटिया कॉलोनी'),
  ('dungarifatak', 'DungariFatak', 15, 'डूंगरी रोड'),
  ('ganeshpura', 'Ganeshpura', 12, 'गणेशपुरा'),
  ('hb', 'HB', 11, 'हाउसिंग बोर्ड'),
  ('iocroad', 'IocRoad', 6, 'आई.ओ.सी. रोड'),
  ('jamalpura', 'Jamalpura', 4, 'जमालपुरा'),
  ('masudaroad i', 'MasudaRoad I', 21, 'मसूदा रोड I'),
  ('masudaroad ii', 'MasudaRoad II', 22, 'मसूदा रोड II'),
  ('mg3ii', 'MG3II', 10, 'लोकाशा विनोद नगर'),
  ('nandnagar', 'NandNagar', 3, 'नंद नगर'),
  ('ngate', 'NGate', 13, 'नेहरू गेट'),
  ('pratapnagar', 'Pratapnagar', 2, 'प्रताप नगर'),
  ('scl', 'Scl', 23, 'श्री सीमेंट'),
  ('sroad', 'SRoad', 5, 'सेंदड़ा रोड'),
  ('whatsapp', 'Whatsapp', 0, 'टेस्ट')
on conflict (name_key) do update set name = excluded.name, priority = excluded.priority, hindi_name = excluded.hindi_name, updated_at = now();
