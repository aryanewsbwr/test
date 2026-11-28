-- The old software's subscription number (customer_detail.sno in VB6: 1, 2, 3... per customer).
-- Bill lines carry it as their sno. The restore fills it from the backup; a subscription made on the
-- website gets the customer's next number. Run once in Supabase (SQL Editor), before deploying.
alter table customer_detail add column if not exists line_no integer;
create index if not exists customer_detail_customer_line_no on customer_detail (customer_id, line_no);
