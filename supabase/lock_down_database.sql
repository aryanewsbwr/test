-- Closes the database to the public key. Afterwards only the website's server can reach it.
-- Run this only after the live site uses the login, and a new user saves from the Users screen.

DO $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', item.policyname, item.schemaname, item.tablename);
  END LOOP;

  FOR item IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', item.tablename);
  END LOOP;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- To undo, if the site stops loading its data:
--
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
-- DO $$
-- DECLARE
--   item record;
-- BEGIN
--   FOR item IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'app_users' LOOP
--     EXECUTE format('CREATE POLICY open_again ON public.%I FOR ALL USING (true) WITH CHECK (true)', item.tablename);
--   END LOOP;
-- END $$;
