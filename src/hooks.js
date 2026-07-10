import { useEffect } from "react";

/* ============================================================
   Загрузка шрифта Geist (Google Fonts).
   Для реального проекта в ЕС: `npm i @fontsource/geist` (self-host),
   прямая загрузка с Google CDN — источник GDPR-риска. Здесь — для превью.
   ============================================================ */
export function useGeistFont() {
  useEffect(() => {
    if (document.getElementById("kubiki-geist-font")) return;
    const link = document.createElement("link");
    link.id = "kubiki-geist-font";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Geist:wght@400..600&display=swap";
    document.head.appendChild(link);
  }, []);
}

/* ============================================================
   Общий дропдаун состояний тега (используется в палитре и на строке).
   onClose === null/undefined → слушатель не вешаем (компонент неактивен,
   не должен реагировать на «внешние» клики — важно там, где несколько
   инстансов делят одно состояние, см. openTagId в ExecutorTag: иначе
   любой клик по СОСЕДНЕМУ тегу той же строки гасит чужой открытый список
   раньше, чем отработает его собственный клик).
   ============================================================ */
export function useOutsideClose(ref, onClose) {
  useEffect(() => {
    if (!onClose) return;
    // capture-фаза: многие элементы приложения останавливают всплытие
    // mousedown (e.stopPropagation()) для управления выделением строк/этапов —
    // на bubble-фазе это не даёт событию дойти до document, и дропдаун не
    // закрывается по клику в другое место. Capture срабатывает раньше любых
    // stopPropagation() из React-обработчиков на bubble-фазе.
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener("mousedown", onDoc, true);
    return () => document.removeEventListener("mousedown", onDoc, true);
  }, [onClose]);
}
