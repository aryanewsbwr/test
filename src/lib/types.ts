export interface Publisher {
  publish_id: number;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  mobile?: string;
  fax?: string;
  email?: string;
  website?: string;
  category?: string;
  type?: string;
}

export interface Publication {
  publica_id: number;
  public_name: string;
  type_p?: string;
  publish_id?: number | null;
  abrv?: string;
  circulation?: string;
  duration?: string;
  magzine_day?: number;
  magzine_month?: number;
  chr_del?: number;
  pub_hindi?: string;
  is_closed?: boolean;
  is_permanent?: boolean;
  closed_from?: string | null;
  closed_to?: string | null;
  current_rates?: Record<number, number> | null;
  today_rate?: number;
}

export interface Region {
  region_id: number;
  region_name: string;
  hindi_name?: string;
  zone?: string;
}

export interface Hawker {
  hawker_id: number;
  name: string;
  hindi_name?: string;
  address?: string;
  city?: string;
  phone?: string;
  mobile?: string;
  region_id: number;
  commission_rate?: number;
}

export interface CollectionAgent {
  collect_id: number;
  name: string;
  address?: string;
  city?: string;
  phone?: string;
  mobile?: string;
}

export interface Customer {
  customer_id: number;
  name_eng: string;
  type_cust?: number;
  name_hindi?: string;
  add1?: string;
  add2?: string;
  phone?: string;
  security_deposit: number;
  type?: string;
  priority: number;
  self_agent?: number;
  font_type?: number;
  dueamount: number; // Starting Due
  due_amount?: number;
  region_id: number;
  paid?: string;
  delivery: number;
  discount: number;
  govt_supply?: number;
  hindi_add?: string;
  cbal: number; // Closing / Current Balance
  pmonth?: string;
  pyear?: string;
  is_self?: boolean;
}

export interface CustomerDetail {
  sno: number;
  customer_id: number;
  publica_id: number;
  publication_id?: number;
  publication_name?: string;
  hawker_id?: number;
  hawker_name?: string;
  qty: number;
  circulation?: string;
  s_date?: string;
  c_date?: string | null;
  from_day: string; // "1-7" where 1=Sun .. 7=Sat
  hawk_sub?: number;
  dis?: number;
  dely: number;
  is_active?: boolean;
  hold_info?: {
    is_on_hold: boolean;
    from: string;
    to: string;
    type: string;
  } | null;
}

export interface Rate {
  rate_id?: number;
  publica_id: number;
  rate: number;
  dayofweek: number; // 1=Sun, 2=Mon, 3=Tue, 4=Wed, 5=Thu, 6=Fri, 7=Sat
}

export interface RateChange {
  change_id?: number;
  publica_id: number;
  old_rate?: number | null;
  new_rate: number;
  dated: string; // YYYY-MM-DD
  dayofweek: number;
}

export interface Holiday {
  holiday_id?: number;
  oc_date: string;
  occasion?: string;
  publica_id?: number | null;
}

export interface Discontinue {
  discontinue_id?: number;
  sno?: number;
  entry_date?: string;
  customer_id: number;
  customer_name?: string;
  publica_id?: number | null;
  publication_name?: string;
  temp_perma: 'Temporary' | 'Permanent' | 'T' | 'P';
  temp_from: string;
  temp_to?: string | null;
  s_date?: string;
  c_date?: string;
  hawker_id?: number;
}

export interface PaymentReceipt {
  receipt_id?: number;
  bill_id?: number | null;
  receipt_no: string;
  manual_rep_no?: string;
  bill_date?: string;
  bill_amt?: number;
  mal_recp_dt: string;
  month?: string;
  year?: string;
  due_amt?: number;
  mal_recp_amt: number;
  balance?: number;
  less_amt: number;
  r_amt: number;
  cheque_no?: string;
  cheque_date?: string;
  debit?: number;
  credit?: number;
  cash_chq: 'Cash' | 'Cheque' | 'Online' | 'UPI' | string;
  narr?: string;
  customer_id: number;
  customer_name?: string;
}

export interface BillItem {
  bill_id?: number;
  customer_id: number;
  publica_id: number;
  publication_name?: string;
  region_id?: number;
  qty: number;
  rate: number;
  d_charges: number;
  total_amt: number;
  month: string;
  year: string;
  sno?: number;
}

export interface BillHeader {
  bill_id: number;
  customer_id: number;
  customer_name?: string;
  region_id?: number;
  region_name?: string;
  due_amt: number; // Previous Due
  del_amt: number; // Delivery Charges
  dis_amt: number; // Discount Amount
  month: string;
  year: string;
  balance: number; // Total Net Payable
  total_copies?: number;
  paper_amount?: number;
}

export interface CounterSale {
  id?: number | string;
  publica_id: number;
  Publica_id?: number;
  pub_name?: string;
  public_name?: string;
  pub_hindi?: string;
  qty: number;
  Qty?: number;
  rate: number;
  Rate?: number;
  amt: number;
  Amt?: number;
  sale_date: string; // YYYY-MM-DD
  Sale_Date?: string;
  customer_name?: string;
  remarks?: string;
  created_at?: string;
}
