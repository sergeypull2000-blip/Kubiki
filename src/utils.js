/* ---------- helpers ---------- */
export const uid = () => Math.random().toString(36).slice(2, 10);

export const fmt = (n) => {
  const v = Number.isFinite(n) ? Math.round(n) : 0;
  return v.toLocaleString("ru-RU").replace(/,/g, " ");
};

export const numVal = (v) => {
  if (v === "" || v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
