-- Corrected Hindi customer names. Bills, WhatsApp and the screens show name_hindi_unicode when
-- it is filled, and fall back to the old name_hindi when it is empty. name_hindi is not changed.
-- The names themselves are not in this repository: they come from customer_hindi_import.csv.

-- PART 1: run this first.
ALTER TABLE customer ADD COLUMN IF NOT EXISTS name_hindi_unicode TEXT;

CREATE TABLE IF NOT EXISTS customer_hindi_fix (
  customer_id INTEGER PRIMARY KEY,
  name_hindi_unicode TEXT
);
ALTER TABLE customer_hindi_fix ENABLE ROW LEVEL SECURITY;

-- PART 2: Table Editor > customer_hindi_fix > Insert > Import data from CSV,
-- then choose customer_hindi_import.csv. It should show 24,630 rows.

-- PART 3: run this after the import, once only. Running it later would undo names edited in the app.
SELECT count(*) AS rows_imported FROM customer_hindi_fix;

UPDATE customer c
SET name_hindi_unicode = f.name_hindi_unicode
FROM customer_hindi_fix f
WHERE f.customer_id = c.customer_id
  AND c.name_hindi_unicode IS DISTINCT FROM f.name_hindi_unicode;

SELECT count(*) AS names_filled FROM customer WHERE name_hindi_unicode IS NOT NULL;

DROP TABLE customer_hindi_fix;
