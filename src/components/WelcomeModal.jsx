import { Logo } from "../Logo.jsx";

/* Одноразовое приветствие Beta. Показывается только при beta_welcome_seen=false;
   закрывается единственной кнопкой «Начать работу» (без X/отмены). */
export function WelcomeModal({ onStart }) {
  return <div className="kb-modal-overlay kb-welcome-overlay">
    <div className="kb-modal kb-welcome-modal" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="kb-welcome-brand"><Logo size={40} /><span>Kubiki <em>Beta</em></span></div>
      <h2 className="kb-welcome-title" id="welcome-title">Добро пожаловать в Kubiki</h2>
      <p className="kb-welcome-text">Kubiki — умная смета для креативных и производственных проектов. Продукт в бета-версии: ИИ-генерация и ИИ-редактирование работают, но интерфейс и поведение могут меняться.</p>
      <div className="kb-welcome-points">
        <div><strong>Генерация смет</strong><span>По описанию проекта ИИ собирает черновую смету.</span></div>
        <div><strong>ИИ-редактирование</strong><span>Изменяйте смету командами на естественном языке.</span></div>
        <div><strong>Бесплатный лимит</strong><span>До 5 $ на ИИ-вызовы в месяц.</span></div>
      </div>
      <div className="kb-modal-actions">
        <button type="button" className="kb-btn kb-btn-primary" onClick={onStart}>Начать работу</button>
      </div>
    </div>
  </div>;
}
