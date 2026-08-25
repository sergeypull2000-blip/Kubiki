import { X } from "lucide-react";
import { Logo } from "../Logo.jsx";
import { dismissOnBackdrop, useModalDismiss } from "./modalDismiss.js";

export function OnboardingModal({ onClose }) {
  useModalDismiss(onClose);
  return <div className="kb-modal-overlay" onMouseDown={dismissOnBackdrop(onClose)}>
    <div className="kb-modal kb-onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="kb-modal-head"><span className="kb-modal-title" id="onboarding-title"><Logo size={24} /> Как работать в Kubiki</span><button type="button" className="kb-icon-btn" onClick={onClose} aria-label="Закрыть"><X size={16} /></button></div>
      <div className="kb-onboarding-content">
        <p className="kb-onboarding-lead">Память вашей студии</p>
        <section><h3>Начните с проекта</h3><p>Опишите задачу своими словами — Kubiki поможет разложить её на этапы и задачи и собрать первую версию сметы.</p></section>
        <section><h3>Или импортируйте готовую смету</h3><p>Если смета уже существует, импортируйте её в Kubiki и продолжите работу вместо того, чтобы собирать всё заново.</p></section>
        <section><h3>Доработайте через AI Edit</h3><p>Меняйте смету вручную или попросите AI Edit добавить задачи, изменить структуру, сроки или состав работ.</p></section>
        <section><h3>Используйте память студии</h3><p>Сохраняйте удачные проекты как шаблоны и добавляйте исполнителей. Kubiki сможет учитывать накопленные наработки в следующих сметах.</p></section>
        <section><h3>Настройте ИИ под себя</h3><p>В «Настройки → Персонализация ИИ» можно выбрать, должен ли Kubiki использовать шаблоны студии и историю прошлых проектов при подготовке новых смет.</p></section>
        <section><h3>Отправьте клиенту</h3><p>Настройте оформление и экспортируйте готовую смету в PDF или Excel.</p></section>
      </div>
      <div className="kb-modal-actions"><button type="button" className="kb-btn kb-btn-primary" onClick={onClose}>Начать работу</button></div>
    </div>
  </div>;
}
