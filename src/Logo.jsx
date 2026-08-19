/*
   Канонический логотип Kubiki: 4 скруглённых квадрата 2×2.
   Единственный визуальный источник знака во всём приложении.

   Цвета (референс):
     top-left     — тёмно-синий        #162138
     top-right    — светлый cool gray   #c9d2e3
     bottom-left  — светло-голубой      #b4d6fd
     bottom-right — Kubiki blue         #4780f3
   Мягкая градиентная заливка (свет сверху-слева) без сильных теней.
   Геометрия/порядок квадратов одинаковы на всех размерах.
*/
export function Logo({ size = 20 }) {
  const s = size / 2 - 1;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" role="img" aria-label="Kubiki">
      <defs>
        <linearGradient id="kb-logo-tl" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#20305a" />
          <stop offset="1" stopColor="#162138" />
        </linearGradient>
        <linearGradient id="kb-logo-tr" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#dbe2ee" />
          <stop offset="1" stopColor="#c9d2e3" />
        </linearGradient>
        <linearGradient id="kb-logo-bl" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c9e2ff" />
          <stop offset="1" stopColor="#b4d6fd" />
        </linearGradient>
        <linearGradient id="kb-logo-br" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6396f5" />
          <stop offset="1" stopColor="#4780f3" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={s} height={s} rx="2" fill="url(#kb-logo-tl)" />
      <rect x={s + 2} y="0" width={s} height={s} rx="2" fill="url(#kb-logo-tr)" />
      <rect x="0" y={s + 2} width={s} height={s} rx="2" fill="url(#kb-logo-bl)" />
      <rect x={s + 2} y={s + 2} width={s} height={s} rx="2" fill="url(#kb-logo-br)" />
    </svg>
  );
}

