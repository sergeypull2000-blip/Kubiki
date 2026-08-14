const QUANTITY_FIELDS = Object.freeze({ fix_task: "units", hourly: "hours", shift: "shifts" });

export function generatedPaymentSemantics(draft) {
  const type = draft.paymentType || (draft.compensation !== undefined ? "fix_total" : null);
  return { type, quantityField: QUANTITY_FIELDS[type] || null };
}
