import csv
import json
import os

CSV_DIR = r"B:\himanshu uncle\Rahul"
OUT_DIR = r"B:\AI_Projects\Software\public\data"
os.makedirs(OUT_DIR, exist_ok=True)

def safe_float(val, default=0.0):
    if not val: return default
    val_str = str(val).strip()
    if not val_str: return default
    try:
        return float(val_str)
    except ValueError:
        return default

def safe_int(val, default=0):
    if not val: return default
    val_str = str(val).strip()
    if not val_str: return default
    try:
        return int(val_str)
    except ValueError:
        return default

print("1. Exporting ALL 24,581 customers from 5.1custinfo.csv...")
all_customers = []
with open(os.path.join(CSV_DIR, "5.1custinfo.csv"), 'r', encoding='utf-8', errors='ignore') as f:
    reader = csv.DictReader(f)
    for r in reader:
        cid = safe_int(r.get('Customer_id'))
        if cid == 0: continue
        all_customers.append({
            "customer_id": cid,
            "name_eng": r.get('name_eng', ''),
            "name_hindi": r.get('name_hindi', ''),
            "add1": r.get('add1', ''),
            "add2": r.get('add2', ''),
            "phone": r.get('phone', ''),
            "priority": safe_int(r.get('Priority'), cid),
            "region_id": safe_int(r.get('Region_id'), 1),
            "dueamount": safe_float(r.get('dueamount')),
            "cbal": safe_float(r.get('Cbal')),
            "delivery": safe_float(r.get('Delivery')),
            "discount": safe_float(r.get('Discount')),
            "security_deposit": safe_float(r.get('Security_Deposit')),
            "is_self": r.get('Self_Agent') != '0',
            "paid": r.get('Paid', 'P'),
            "type_cust": safe_int(r.get('Type_Cust'), -1)
        })

with open(os.path.join(OUT_DIR, "all_customers.json"), 'w', encoding='utf-8') as f:
    json.dump(all_customers, f, ensure_ascii=False)
print(f"   Exported {len(all_customers)} customers successfully!")

print("\n2. Exporting ALL 39,681 subscriptions from 5.2cust info.csv...")
all_subs = []
with open(os.path.join(CSV_DIR, "5.2cust info.csv"), 'r', encoding='utf-8', errors='ignore') as f:
    reader = csv.DictReader(f)
    for r in reader:
        sno = safe_int(r.get('sno'))
        cid = safe_int(r.get('Customer_id'))
        pid = safe_int(r.get('Publica_id'))
        if cid == 0 or pid == 0: continue
        all_subs.append({
            "sno": sno,
            "customer_id": cid,
            "publica_id": pid,
            "hawker_id": safe_int(r.get('Hawker_id'), 1),
            "qty": safe_int(r.get('Qty'), 1),
            "circulation": r.get('Circulation', 'Morning'),
            "s_date": r.get('S_Date', ''),
            "c_date": r.get('C_Date', '') if r.get('C_Date') else None,
            "from_day": r.get('From_Day', '1-7') if r.get('From_Day') else '1-7',
            "dely": safe_float(r.get('Dely')),
            "dis": safe_float(r.get('Dis'))
        })

# Subscriptions export decommissioned - using live Supabase customer_detail

print("\n3. Exporting ALL 18,382 receipts from 13 payment recipt.csv...")
all_receipts = []
with open(os.path.join(CSV_DIR, "13 payment recipt.csv"), 'r', encoding='utf-8', errors='ignore') as f:
    reader = csv.DictReader(f)
    for r in reader:
        all_receipts.append({
            "receipt_id": safe_int(r.get('Receipt_id')),
            "bill_id": safe_int(r.get('Bill_id')) if r.get('Bill_id') else None,
            "receipt_no": r.get('ReceiptNo', ''),
            "manual_rep_no": r.get('ManualRepNo', ''),
            "bill_date": r.get('BillDate', ''),
            "bill_amt": safe_float(r.get('BillAmt')),
            "mal_recp_dt": r.get('MalRecpDt', ''),
            "month": r.get('Month', ''),
            "year": r.get('Year', ''),
            "due_amt": safe_float(r.get('DueAmt')),
            "mal_recp_amt": safe_float(r.get('MalRecpAmt')),
            "balance": safe_float(r.get('Balance')),
            "less_amt": safe_float(r.get('LessAmt')),
            "r_amt": safe_float(r.get('RAmt')),
            "cheque_no": r.get('ChequeNo', ''),
            "cheque_date": r.get('ChequeDate', ''),
            "cash_chq": r.get('Cash_Chq', 'Cash'),
            "narr": r.get('Narr', ''),
            "customer_id": safe_int(r.get('customer_id'))
        })

with open(os.path.join(OUT_DIR, "all_receipts.json"), 'w', encoding='utf-8') as f:
    json.dump(all_receipts, f, ensure_ascii=False)
print(f"   Exported {len(all_receipts)} receipts successfully!")

print("\n4. Exporting ALL 26,521 bill headers from 14.3 billl no..csv...")
all_bills = []
with open(os.path.join(CSV_DIR, "14.3 billl no..csv"), 'r', encoding='utf-8', errors='ignore') as f:
    reader = csv.DictReader(f)
    for r in reader:
        all_bills.append({
            "bill_id": safe_int(r.get('Bill_id')),
            "customer_id": safe_int(r.get('Customer_id')),
            "region_id": safe_int(r.get('Region_id'), 1),
            "due_amt": safe_float(r.get('Due_Amt')),
            "del_amt": safe_float(r.get('Del_Amt')),
            "dis_amt": safe_float(r.get('Dis_Amt')),
            "month": r.get('Month', ''),
            "year": r.get('year', ''),
            "balance": safe_float(r.get('Balance'))
        })

with open(os.path.join(OUT_DIR, "all_bills.json"), 'w', encoding='utf-8') as f:
    json.dump(all_bills, f, ensure_ascii=False)
print(f"   Exported {len(all_bills)} bills successfully!")
