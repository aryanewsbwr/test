-- Corrected Hindi customer names. Bills, WhatsApp and the screens show name_hindi_unicode when
-- it is filled, and fall back to the old name_hindi when it is empty. name_hindi is not changed.
-- The names themselves are not in this repository: they come from customer_hindi_import.csv.

-- STEP 1: run this whole file.
ALTER TABLE customer ADD COLUMN IF NOT EXISTS name_hindi_unicode TEXT;

CREATE TABLE IF NOT EXISTS customer_hindi_fix (
  customer_id INTEGER PRIMARY KEY,
  name_hindi_unicode TEXT
);
ALTER TABLE customer_hindi_fix ENABLE ROW LEVEL SECURITY;

-- STEP 2: Table Editor > customer_hindi_fix > Insert > Import data from CSV,
-- then choose customer_hindi_import.csv. It should show 24,630 rows.

-- STEP 3: run customer_hindi_names_after_import.sql.
