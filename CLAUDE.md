# Aryan News Agency — rules for changing this code

The old software (VB6 / MySQL) is the master copy. The website must be able to take its backup and give
it back without changing a single bill. These rules exist because this broke more than once.

## VB6 backup restore — never change (regression-tested)
- Restore copies `billno*`, `bill*`, `billdel*`, `receipt*` rows EXACTLY as in the .sql backup:
  same Bill_id, same Month text (`'Oct'`, `'Nov'`, `'Sept'` — never `'October'`), same sno,
  same Rate (0 for free papers), same Balance (VB6 = −previous due, current bill NOT included).
- Restore must never call bill generation, renumber ids, match bills by amount, or skip months that
  already exist in the app. A bill that differs in any field is deleted and the backup's bill goes in
  (replace, not merge). All deletions run before any insert. Code: `exactBills` in `src/lib/backupClient.ts`.
- After a restore, run `npm run verify:restore -- <backup.sql>` (counts, min/max Bill_id, month names,
  totals per month vs the backup). Any mismatch = fail. Do not edit or weaken this check to make it pass.
- Any change to import/restore code must keep `npm run test:restore` (tests/restore_roundtrip.ts) passing.

## Bill generation on the website
- Generating a month again must not renumber: a customer who already has a bill for that month keeps its
  Bill_id (its Month text is rewritten the old software's way); only a customer with no bill that month gets the next number (MAX+1).
- Month text is written the old software's way (`OLD_MONTH` in `src/lib/oldSoftwareExport.ts`:
  Dues, April, May, June, July, Aug, Sept, Oct, Nov, Dec, Jan, Feb, March).
- A customer with a paper open during the month gets a bill even with no copies delivered (no lines,
  total = previous due), as VB6 does.

## Pre-printed bill print (`src/lib/billPreprintedExport.ts`)
- Positions were calibrated on real prints (PLACES, NUDGE, ROW_GAP, SHEET_TILT, DEFAULT_SIZE 98.6).
  Do not change them without a new flat scan of a test print.

## Working rules
- Push each finished fix and check it live; explain money-affecting changes before making them.
- Never put passwords or keys in files or commits.
