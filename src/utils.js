/* ---------- helpers ---------- */
export const uid = () => Math.random().toString(36).slice(2, 10);

export const fmt = (n) => {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
};

export const roundMoney = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const numVal = (v) => {
  if (v === "" || v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
