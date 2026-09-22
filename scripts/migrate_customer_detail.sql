-- ==============================================================================
-- MIGRATION: Modernize public.customer_detail & Ingest from customer_detailback
-- ==============================================================================

-- 1. Ensure columns exist on public.customer_detail
ALTER TABLE public.customer_detail
  ADD COLUMN IF NOT EXISTS s_date DATE,
  ADD COLUMN IF NOT EXISTS c_date DATE,
  ADD COLUMN IF NOT EXISTS from_day TEXT DEFAULT '1-7',
  ADD COLUMN IF NOT EXISTS hawk_sub INT DEFAULT -1;

-- 2. Create index on s_date and c_date for high-speed date range lookups during billing
CREATE INDEX IF NOT EXISTS idx_customer_detail_dates ON public.customer_detail (customer_id, s_date, c_date);

-- 3. Ingest authoritative subscriptions from customer_detailback into customer_detail
-- Note: Excludes the 576 orphaned records where customer_id is not in customer table
-- to strictly satisfy customer_detail_customer_id_fkey constraint.
INSERT INTO public.customer_detail (
  sno,
  customer_id,
  publication_id,
  hawker_id,
  qty,
  circulation,
  s_date,
  c_date,
  from_day,
  hawk_sub,
  delivery_days,
  discount_percent,
  delivery_charge,
  created_at
)
SELECT
  cdb.sno,
  cdb."Customer_id",
  cdb."Publica_id",
  cdb."Hawker_id",
  COALESCE(cdb."Qty", 1),
  COALESCE(cdb."Circulation", 'Morning'),
  CASE 
    WHEN cdb."S_Date" IS NOT NULL AND trim(cdb."S_Date") ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
    THEN to_date(trim(cdb."S_Date"), 'DD/MM/YYYY')
    ELSE NULL
  END,
  CASE 
    WHEN cdb."C_Date" IS NOT NULL AND trim(cdb."C_Date") ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$'
    THEN to_date(trim(cdb."C_Date"), 'DD/MM/YYYY')
    ELSE NULL
  END,
  COALESCE(cdb."From_Day", '1-7'),
  COALESCE(cdb."Hawk_Sub", -1),
  ARRAY[1,2,3,4,5,6,7],
  CASE WHEN cdb."Dis" ~ '^[0-9]+(\.[0-9]+)?$' THEN cdb."Dis"::numeric ELSE 0 END,
  COALESCE(cdb."Dely", 0),
  NOW()
FROM public.customer_detailback cdb
JOIN public.customer c ON c.customer_id = cdb."Customer_id"
ON CONFLICT (sno) DO UPDATE SET
  customer_id = EXCLUDED.customer_id,
  publication_id = EXCLUDED.publication_id,
  hawker_id = EXCLUDED.hawker_id,
  qty = EXCLUDED.qty,
  circulation = EXCLUDED.circulation,
  s_date = EXCLUDED.s_date,
  c_date = EXCLUDED.c_date,
  from_day = EXCLUDED.from_day,
  hawk_sub = EXCLUDED.hawk_sub,
  discount_percent = EXCLUDED.discount_percent,
  delivery_charge = EXCLUDED.delivery_charge;

-- 4. Verification queries
SELECT count(*) AS total_customer_detail_after_migration FROM public.customer_detail;
