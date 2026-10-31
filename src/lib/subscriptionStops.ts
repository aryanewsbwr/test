import { supabaseAdmin } from './supabaseAdmin';

// Closes the open subscriptions a permanent stop covers. A subscription that began after
// the stop is a re-subscription and stays open. Paper 0 means all of the customer's papers.
export async function closeSubscriptions(customerId: number, publicaId: number, stopDate: string) {
  let query = supabaseAdmin
    .from('customer_detail')
    .update({ c_date: stopDate })
    .eq('customer_id', customerId)
    .is('c_date', null)
    .or(`s_date.is.null,s_date.lte.${stopDate}`);
  if (publicaId > 0) query = query.eq('publica_id', publicaId);

  const { error } = await query;
  if (error) throw new Error(`Could not close the subscription: ${error.message}`);
}
