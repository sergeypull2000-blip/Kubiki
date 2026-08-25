import { X } from "lucide-react";
import { Logo } from "../Logo.jsx";
import { dismissOnBackdrop, useModalDismiss } from "./modalDismiss.js";

const sections = [
  ["Декомпозируйте клиентские брифы", "Опишите задачу своими словами или импортируйте бриф от клиента — Kubiki поможет разложить его на этапы и задачи и собрать первую версию сметы."],
  ["Импортируйте готовую смету", "Если вы хотите создать шаблон из уже готовой сметы — импортируйте её в Kubiki и сохраните как шаблон. Kubiki сможет учитывать её структуру при дальнейших релевантных генерациях."],
  ["Дорабатывайте через AI", "Меняйте смету вручную или попросите AI Edit добавить задачи, изменить структуру, сроки или состав работ."],
  ["Используйте память студии", "Сохраняйте удачные проекты как шаблоны и добавляйте исполнителей в базу. Kubiki сможет учитывать релевантные шаблоны и исполнителей вашей студии при подготовке следующих смет."],
  ["Настраивайте ИИ под себя", "В «Настройки → Персонализация ИИ» можно задать правила для генераций в свободном формате, а также выбрать, должен ли Kubiki использовать шаблоны студии и историю прошлых проектов при подготовке новых смет."],
  ["Экспортируйте готовые сметы", "Настройте оформление в соответствии со студийным брендингом и экспортируйте готовую смету в PDF или Excel."],
];

export function OnboardingModal({ onClose }) {
  useModalDismiss(onClose);
  return <div className="kb-modal-overlay" onMouseDown={dismissOnBackdrop(onClose)}>
    <div className="kb-modal kb-onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="kb-onboarding-content">
        <div className="kb-onboarding-brand"><Logo size={22} /><button type="button" className="kb-icon-btn kb-onboarding-close" onClick={onClose} aria-label="Закрыть"><X size={16} /></button></div>
        <h1 className="kb-onboarding-title" id="onboarding-title">Память вашей студии</h1>
        <div className="kb-onboarding-sections">
          {sections.map(([heading, text]) => <section key={heading}><h2>{heading}</h2><p>{text}</p></section>)}
        </div>
      </div>
      <div className="kb-modal-actions"><button type="button" className="kb-btn kb-btn-primary" onClick={onClose}>Начать работу</button></div>
    </div>
  </div>;
}
