-- Opens a new financial year: makes its yearly tables and carries each customer's closing
-- balance into a Dues row, the way the old software opened 2026-27.
--
-- Closing balance = Dues + bills + delivery - discount - receipts - less amount.
-- Customers in the Court region are left out, because the old software never carried theirs.
--
-- Run this file once in the SQL Editor. After that staff open each new year from
-- Tools > Balance Forward, which previews the total first and then does it.
-- It is all or nothing, and refuses to run twice for the same year.

DROP FUNCTION IF EXISTS year_end_rollover(text, text, boolean);

CREATE FUNCTION year_end_rollover(from_fy text, to_fy text, preview boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yearly_table text;
  old_table text;
  new_table text;
  has_march boolean;
  already_done boolean;
  carried bigint;
  total numeric;
  grant_row record;
  policy_row record;
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
    RAISE EXCEPTION 'NO_MARCH_BILLS';
  END IF;

  IF to_regclass('public.billno' || to_fy) IS NOT NULL THEN
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE lower(trim(month)) = ''dues'')', 'billno' || to_fy)
      INTO already_done;
    IF already_done THEN
      RAISE EXCEPTION 'ALREADY_OPEN';
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
    RETURN jsonb_build_object('done', false, 'from_fy', from_fy, 'to_fy', to_fy, 'customers', carried, 'total', total);
  END IF;

  -- Each new table gets the same access as last year's, so every screen keeps working
  FOREACH yearly_table IN ARRAY ARRAY['billno', 'bill', 'billdel', 'receipt', 'retailsale', 'receiptissue'] LOOP
    old_table := yearly_table || from_fy;
    new_table := yearly_table || to_fy;
    CONTINUE WHEN to_regclass('public.' || old_table) IS NULL OR to_regclass('public.' || new_table) IS NOT NULL;
    EXECUTE format('CREATE TABLE %I (LIKE %I INCLUDING ALL)', new_table, old_table);

    FOR grant_row IN
      SELECT grantee, privilege_type FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = old_table
    LOOP
      EXECUTE format('GRANT %s ON %I TO %s', grant_row.privilege_type, new_table,
        CASE WHEN grant_row.grantee = 'PUBLIC' THEN 'PUBLIC' ELSE quote_ident(grant_row.grantee) END);
    END LOOP;

    IF (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || old_table)::regclass) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', new_table);
    END IF;
    FOR policy_row IN SELECT * FROM pg_policies WHERE schemaname = 'public' AND tablename = old_table LOOP
      EXECUTE format('CREATE POLICY %I ON %I AS %s FOR %s TO %s %s %s',
        policy_row.policyname, new_table, policy_row.permissive, policy_row.cmd,
        array_to_string(policy_row.roles, ', '),
        CASE WHEN policy_row.qual IS NOT NULL THEN 'USING (' || policy_row.qual || ')' ELSE '' END,
        CASE WHEN policy_row.with_check IS NOT NULL THEN 'WITH CHECK (' || policy_row.with_check || ')' ELSE '' END);
    END LOOP;
  END LOOP;

  EXECUTE format(
    'INSERT INTO %I (bill_id, customer_id, region_id, due_amt, month, year)
     SELECT bill_id, customer_id, region_id, due_amt, ''Dues'', %L FROM rollover_dues',
    'billno' || to_fy, substr(to_fy, 1, 4)
  );

  RETURN jsonb_build_object('done', true, 'from_fy', from_fy, 'to_fy', to_fy, 'customers', carried, 'total', total);
END;
$$;

REVOKE ALL ON FUNCTION year_end_rollover(text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION year_end_rollover(text, text, boolean) TO service_role;
