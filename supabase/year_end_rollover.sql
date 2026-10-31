-- Opens a new financial year: makes its yearly tables and carries each customer's closing
-- balance into a Dues row, the way the old software opened 2026-27.
--
-- Closing balance = Dues + bills + delivery - discount - receipts - less amount.
-- Customers in the Court region are left out, because the old software never carried theirs.
--
-- Run this file once, after the March bills are generated. Then, in the SQL Editor:
--
--   SELECT year_end_rollover('20262027', '20272028');         -- preview, changes nothing
--   SELECT year_end_rollover('20262027', '20272028', false);  -- does it
--
-- It is all or nothing, and refuses to run twice for the same year.

CREATE OR REPLACE FUNCTION year_end_rollover(from_fy text, to_fy text, preview boolean DEFAULT true)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  yearly_table text;
  new_table text;
  has_march boolean;
  already_done boolean;
  carried bigint;
  total numeric;
BEGIN
  IF from_fy !~ '^\d{8}$' OR to_fy !~ '^\d{8}$'
     OR substr(from_fy, 5, 4) <> substr(to_fy, 1, 4)
     OR substr(from_fy, 1, 4)::int + 1 <> substr(from_fy, 5, 4)::int
     OR substr(to_fy, 1, 4)::int + 1 <> substr(to_fy, 5, 4)::int THEN
    RAISE EXCEPTION 'Years must follow on, like 20262027 then 20272028';
  END IF;

  EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE lower(trim(month)) = ''march'')', 'billno' || from_fy)
    INTO has_march;
  IF NOT has_march THEN
    RAISE EXCEPTION 'No March bills in billno%. Generate them first, so the closing balances are complete', from_fy;
  END IF;

  IF to_regclass('public.billno' || to_fy) IS NOT NULL THEN
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE lower(trim(month)) = ''dues'')', 'billno' || to_fy)
      INTO already_done;
    IF already_done THEN
      RAISE EXCEPTION 'billno% already has Dues rows, so this year is already open', to_fy;
    END IF;
  END IF;

  DROP TABLE IF EXISTS rollover_dues;
  EXECUTE format($sql$
    CREATE TEMP TABLE rollover_dues ON COMMIT DROP AS
    WITH movements AS (
      SELECT customer_id,
             CASE WHEN lower(trim(month)) = 'dues' THEN coalesce(due_amt, 0)
                  ELSE coalesce(del_amt, 0) - coalesce(dis_amt, 0) END AS amount
      FROM %I
      UNION ALL
      SELECT customer_id, coalesce(total_amt, 0) FROM %I
      UNION ALL
      SELECT customer_id, -coalesce(mal_recp_amt, 0) - coalesce(less_amt, 0) FROM %I
    ),
    closing AS (
      SELECT customer_id, round(sum(amount), 2) AS due_amt
      FROM movements
      GROUP BY customer_id
    )
    SELECT row_number() OVER (ORDER BY closing.customer_id) AS bill_id,
           closing.customer_id, customer.region_id, closing.due_amt
    FROM closing
    LEFT JOIN customer ON customer.customer_id = closing.customer_id
    LEFT JOIN regiond ON regiond.region_id = customer.region_id
    WHERE closing.due_amt <> 0
      AND coalesce(lower(trim(regiond.region_name)), '') <> 'court'
  $sql$, 'billno' || from_fy, 'bill' || from_fy, 'receipt' || from_fy);

  SELECT count(*), coalesce(sum(due_amt), 0) INTO carried, total FROM rollover_dues;

  IF preview THEN
    RETURN format('Preview only: %s customers, opening Dues %s', carried, total);
  END IF;

  FOREACH yearly_table IN ARRAY ARRAY['billno', 'bill', 'billdel', 'receipt', 'retailsale'] LOOP
    new_table := yearly_table || to_fy;
    EXECUTE format('CREATE TABLE IF NOT EXISTS %I (LIKE %I INCLUDING ALL)', new_table, yearly_table || from_fy);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', new_table);
    EXECUTE format('REVOKE ALL ON %I FROM anon, authenticated', new_table);
  END LOOP;

  EXECUTE format(
    'INSERT INTO %I (bill_id, customer_id, region_id, due_amt, month, year)
     SELECT bill_id, customer_id, region_id, due_amt, ''Dues'', %L FROM rollover_dues',
    'billno' || to_fy, substr(to_fy, 1, 4)
  );

  RETURN format('Done: %s customers, opening Dues %s', carried, total);
END;
$$;

REVOKE ALL ON FUNCTION year_end_rollover(text, text, boolean) FROM PUBLIC, anon, authenticated;
