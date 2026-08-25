import { X } from "lucide-react";
import { Logo } from "../Logo.jsx";
import { dismissOnBackdrop, useModalDismiss } from "./modalDismiss.js";

export function OnboardingModal({ onClose }) {
  useModalDismiss(onClose);
  return <div className="kb-modal-overlay" onMouseDown={dismissOnBackdrop(onClose)}>
    <div className="kb-modal kb-onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="kb-modal-head"><span className="kb-modal-title" id="onboarding-title"><Logo size={24} /> Как работать в Kubiki</span><button type="button" className="kb-icon-btn" onClick={onClose} aria-label="Закрыть"><X size={16} /></button></div>
      <div className="kb-onboarding-grid">
        <section><h3>Начните со сметы</h3><p>Опишите проект — ИИ создаст структуру сметы. Готовый Excel можно импортировать и продолжить редактирование.</p></section>
        <section><h3>Уточняйте через AI Edit</h3><p>Выберите смету или её часть и попросите изменить задачи, этапы, ставки или исполнителей. Перед применением вы увидите результат.</p></section>
        <section><h3>Переиспользуйте наработки</h3><p>Сохраняйте шаблоны студии и карточки исполнителей, чтобы быстро добавлять привычные работы и ставки.</p></section>
        <section><h3>Отдавайте результат</h3><p>Настройте оформление и экспортируйте смету в PDF или Excel.</p></section>
      </div>
      <div className="kb-onboarding-shortcuts"><strong>Быстрые действия</strong><span><kbd>Ctrl/⌘ C</kbd> и <kbd>Ctrl/⌘ V</kbd> — копировать исполнителя между задачами</span><span><kbd>Enter</kbd> — сохранить название · <kbd>Esc</kbd> — отменить</span></div>
      <div className="kb-modal-actions"><button type="button" className="kb-btn kb-btn-primary" onClick={onClose}>Понятно, начать работу</button></div>
    </div>
  </div>;
}
