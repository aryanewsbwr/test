-- Keeps the record behind Master > Numbers > History: each customer number change, who made it
-- and when. Run once in Supabase. Nothing else changes, and it is safe to run again.

CREATE TABLE IF NOT EXISTS public.customer_phone_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id integer NOT NULL,
  customer_name text,
  region_id integer,
  old_phone text,
  new_phone text,
  changed_by text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_phone_history_customer ON public.customer_phone_history (customer_id);
CREATE INDEX IF NOT EXISTS customer_phone_history_changed_at ON public.customer_phone_history (changed_at DESC);

-- Shows 0 the first time
SELECT count(*) AS changes_saved FROM public.customer_phone_history;
