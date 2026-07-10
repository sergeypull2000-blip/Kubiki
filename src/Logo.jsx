export function Logo({ size = 20 }) {
  const s = size / 2 - 1;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <rect x="0" y="0" width={s} height={s} rx="2" fill="#1A2230" />
      <rect x={s + 2} y="0" width={s} height={s} rx="2" fill="#CBD5E1" />
      <rect x="0" y={s + 2} width={s} height={s} rx="2" fill="#CBD5E1" />
      <rect x={s + 2} y={s + 2} width={s} height={s} rx="2" fill="#5B8DEF" />
    </svg>
  );
}
