-- Recalculates every billed customer's balance (cbal) the way the old software's
-- "Calculating Dues" did: Dues brought forward + this year's bills - this year's receipts.
-- Minus means owed, plus means advance. Bills and receipts are not changed.
-- The current balances are saved first in customer_cbal_backup_20261031.
-- Also removes customer #24858, a copy of #23322 made by the old edit bug, if it has nothing attached.

BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_cbal_backup_20261031 AS
SELECT customer_id, cbal, now() AS saved_at FROM public.customer;

WITH bill_totals AS (
  SELECT h.customer_id,
         SUM(CASE WHEN lower(trim(h.month)) = 'dues' THEN COALESCE(h.due_amt, 0)
                  ELSE COALESCE(p.paper, 0) + COALESCE(h.del_amt, 0) - COALESCE(h.dis_amt, 0) END) AS billed
  FROM public.billno20262027 h
  LEFT JOIN (
    SELECT bill_id, customer_id, SUM(COALESCE(total_amt, 0)) AS paper
    FROM public.bill20262027 GROUP BY bill_id, customer_id
  ) p ON p.bill_id = h.bill_id AND p.customer_id = h.customer_id
  GROUP BY h.customer_id
),
-- A receipt number counts once per customer, the same rule billing uses
receipts AS (
  SELECT customer_id, SUM(COALESCE(mal_recp_amt, 0) + COALESCE(less_amt, 0)) AS paid
  FROM (
    SELECT DISTINCT ON (customer_id, CASE WHEN COALESCE(recp_no, 0) <> 0 THEN recp_no::text ELSE 'id' || id END)
           customer_id, mal_recp_amt, less_amt
    FROM public.receipt20262027
    ORDER BY customer_id, CASE WHEN COALESCE(recp_no, 0) <> 0 THEN recp_no::text ELSE 'id' || id END, id
  ) r
  GROUP BY customer_id
)
UPDATE public.customer c
SET cbal = -ROUND((b.billed - COALESCE(r.paid, 0))::numeric, 2)
FROM bill_totals b
LEFT JOIN receipts r ON r.customer_id = b.customer_id
WHERE c.customer_id = b.customer_id;

DELETE FROM public.customer c
WHERE c.customer_id = 24858
  AND c.name_eng = 'Sunil ji Chauhan Mr1'
  AND NOT EXISTS (SELECT 1 FROM public.customer_detail WHERE customer_id = 24858)
  AND NOT EXISTS (SELECT 1 FROM public.billno20262027 WHERE customer_id = 24858)
  AND NOT EXISTS (SELECT 1 FROM public.receipt20262027 WHERE customer_id = 24858);

COMMIT;

-- Check: should show about 5280 customers owing about 1280871, and 0 for the duplicate
SELECT (SELECT count(*) FROM public.customer WHERE cbal < 0) AS customers_owing,
       (SELECT ROUND(-SUM(cbal)) FROM public.customer WHERE cbal < 0) AS total_owed,
       (SELECT count(*) FROM public.customer WHERE customer_id = 24858) AS duplicate_left;

-- To undo the balance change:
-- UPDATE public.customer c SET cbal = b.cbal FROM public.customer_cbal_backup_20261031 b WHERE b.customer_id = c.customer_id;
