-- STEP 3 of customer_hindi_names.sql: run this after the CSV import, once only.
-- Running it later would undo names edited in the app.
DO $$
BEGIN
  IF (SELECT count(*) FROM customer_hindi_fix) <> 24630 THEN
    RAISE EXCEPTION 'customer_hindi_fix must have 24,630 rows. Import customer_hindi_import.csv first.';
  END IF;
END $$;

UPDATE customer c
SET name_hindi_unicode = f.name_hindi_unicode
FROM customer_hindi_fix f
WHERE f.customer_id = c.customer_id
  AND c.name_hindi_unicode IS DISTINCT FROM f.name_hindi_unicode;

DROP TABLE customer_hindi_fix;

SELECT count(*) AS names_filled FROM customer WHERE name_hindi_unicode IS NOT NULL;
