// The payment reminder sent on WhatsApp from the Due Region Wise Summary. WhatsApp only lets a
// business start a chat with a template Meta has approved, so this text is submitted once in
// WhatsApp Manager under the name below (category Utility, language Hindi, header: Image, the
// reminder bill from reminderBillImage.ts) and must match it. Bills keep their own monthly_bill_hi.
export const REMINDER_TEMPLATE_NAME = 'payment_reminder_hi';

export const REMINDER_TEMPLATE_TEXT =
  'नमस्ते {{1}} जी,\n' +
  'आर्यन न्यूज़ एजेंसी, ब्यावर की ओर से विनम्र निवेदन है कि आपके अखबार खाते (ग्राहक नं. {{2}}) में दिनांक {{3}} तक ₹{{4}} का भुगतान बाकी है।\n' +
  'कृपया सुविधानुसार भुगतान करने की कृपा करें। यदि आप भुगतान कर चुके हैं तो इस संदेश को अनदेखा करें।\n' +
  'धन्यवाद 🙏';

// Today as the reminder shows it, 08/11/2026
export function reminderDate(day = new Date()): string {
  return `${String(day.getDate()).padStart(2, '0')}/${String(day.getMonth() + 1).padStart(2, '0')}/${day.getFullYear()}`;
}

// The amount as the reminder shows it: whole rupees with Indian commas, paise only when there are any
export function reminderAmount(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return rounded.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2, maximumFractionDigits: 2 });
}

// The message one customer receives, for the preview before sending
export function reminderText(name: string, customerId: number | string, amount: number, day = new Date()): string {
  return [name, String(customerId), reminderDate(day), reminderAmount(amount)]
    .reduce((text, value, i) => text.replace(`{{${i + 1}}}`, value), REMINDER_TEMPLATE_TEXT);
}
