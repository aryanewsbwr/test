-- Run before restoring an old software file. This only reads; it changes nothing.
-- Every row should say OK. The table names are for 2026-2027: change them after the year-end rollover.

-- 1. The numbers the database gives new rows must be past the highest number already used
SELECT t.table_name, t.highest, s.last_number,
       CASE WHEN s.seq IS NULL THEN 'CHECK' WHEN COALESCE(s.last_number, 0) >= COALESCE(t.highest, 0) THEN 'OK' ELSE 'FIX' END AS result
FROM (VALUES
  ('customer_detail',    'sno', (SELECT max(sno) FROM customer_detail)),
  ('bill20262027',       'id',  (SELECT max(id) FROM bill20262027)),
  ('billdel20262027',    'id',  (SELECT max(id) FROM billdel20262027)),
  ('receipt20262027',    'id',  (SELECT max(id) FROM receipt20262027))
) AS t(table_name, column_name, highest)
CROSS JOIN LATERAL (
  SELECT pg_get_serial_sequence('public.' || t.table_name, t.column_name) AS seq
) AS q
CROSS JOIN LATERAL (
  SELECT q.seq, pg_sequence_last_value(q.seq::regclass) AS last_number
) AS s;

-- 2. Columns that must be filled but have no default. The list should be only key columns.
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND is_nullable = 'NO'
  AND column_default IS NULL
  AND is_identity = 'NO'
  AND table_name IN ('customer', 'customer_detail', 'bill20262027', 'billno20262027', 'billdel20262027', 'receipt20262027',
                     'retailsale20262027', 'discontinue', 'hawker', 'publication', 'rate', 'ratechange', 'holiday')
ORDER BY table_name, column_name;
