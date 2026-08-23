import { useEffect, useRef } from "react";

const dismissStack = [];
let listening = false;

const onKeyDown = (event) => {
  if (event.key !== "Escape") return;
  const top = dismissStack.at(-1);
  if (!top) return;
  event.preventDefault();
  top.current();
};

function syncListener() {
  if (typeof window === "undefined") return;
  if (dismissStack.length && !listening) { window.addEventListener("keydown", onKeyDown); listening = true; }
  if (!dismissStack.length && listening) { window.removeEventListener("keydown", onKeyDown); listening = false; }
}

export function useModalDismiss(onDismiss, enabled = true) {
  const callback = useRef(onDismiss);
  callback.current = onDismiss;
  useEffect(() => {
    if (!enabled) return undefined;
    dismissStack.push(callback);
    syncListener();
    return () => {
      const index = dismissStack.lastIndexOf(callback);
      if (index >= 0) dismissStack.splice(index, 1);
      syncListener();
    };
  }, [enabled]);
}

export function dismissOnBackdrop(onDismiss) {
  return (event) => { if (event.target === event.currentTarget) onDismiss(); };
}
