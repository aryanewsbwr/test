-- Run ONCE in the Supabase SQL Editor (before April 2027).
-- Lets Tools > Balance Forward move the year before last out of the database, so the free
-- 500 MB database never fills: the website first saves that year's bill, billno, billdel and
-- receipt tables as files in storage and checks them, then calls this to remove the tables.
-- This function removes a table only if its row count is exactly the count found in the saved
-- file, and never the running year or the year just closed.

CREATE OR REPLACE FUNCTION archive_closed_year(fy text, counts jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  kind text;
  tname text;
  n bigint;
  running_start int := extract(year from now())::int - (CASE WHEN extract(month from now()) <= 3 THEN 1 ELSE 0 END);
  dropped text[] := '{}';
BEGIN
  IF fy !~ '^\d{8}$' OR substr(fy, 5, 4)::int <> substr(fy, 1, 4)::int + 1 THEN
    RAISE EXCEPTION 'BAD_YEAR %', fy;
  END IF;
  -- Only a year at least two years old: the running year and the year just closed stay
  IF substr(fy, 1, 4)::int > running_start - 2 THEN
    RAISE EXCEPTION 'TOO_RECENT %', fy;
  END IF;

  -- Check every table first; remove nothing unless all of them match their saved file
  FOREACH kind IN ARRAY ARRAY['bill', 'billno', 'billdel', 'receipt'] LOOP
    tname := kind || fy;
    IF to_regclass('public.' || tname) IS NOT NULL THEN
      IF NOT (counts ? tname) THEN
        RAISE EXCEPTION 'NO_FILE %', tname;
      END IF;
      EXECUTE format('SELECT count(*) FROM %I', tname) INTO n;
      IF n <> (counts ->> tname)::bigint THEN
        RAISE EXCEPTION 'COUNT_MISMATCH % database % file %', tname, n, counts ->> tname;
      END IF;
    END IF;
  END LOOP;

  FOREACH kind IN ARRAY ARRAY['bill', 'billno', 'billdel', 'receipt'] LOOP
    tname := kind || fy;
    IF to_regclass('public.' || tname) IS NOT NULL THEN
      EXECUTE format('DROP TABLE %I', tname);
      dropped := dropped || tname;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('dropped', to_jsonb(dropped));
END;
$$;

REVOKE ALL ON FUNCTION archive_closed_year(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION archive_closed_year(text, jsonb) TO service_role;
