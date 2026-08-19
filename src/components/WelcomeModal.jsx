import { Logo } from "../Logo.jsx";

/* Одноразовое приветствие Beta. Показывается только при beta_welcome_seen=false;
   закрывается единственной кнопкой «Начать работу» (без X/отмены). */
export function WelcomeModal({ onStart }) {
  return <div className="kb-modal-overlay kb-welcome-overlay">
    <div className="kb-modal kb-welcome-modal" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="kb-welcome-brand"><Logo size={44} /></div>
      <h2 className="kb-welcome-title" id="welcome-title">Добро пожаловать в Kubiki Beta</h2>
      <p className="kb-welcome-text">Команда Kubiki рада приветствовать вас на закрытом бета-тестировании первой версии продукта.</p>
      <p className="kb-welcome-text">Kubiki помогает создавать и переиспользовать сметы, хранить знания студии и работать с ними через ИИ.</p>
      <div className="kb-welcome-list">
        <span className="kb-welcome-list-label">Что уже можно:</span>
        <ul>
          <li>создавать и редактировать сметы вручную или через ИИ;</li>
          <li>сохранять исполнителей, ставки и знания студии;</li>
          <li>импортировать и экспортировать готовые сметы в PDF и Excel.</li>
        </ul>
      </div>
      <p className="kb-welcome-text">Это beta-версия - некоторые вещи ещё могут меняться. Будем очень рады вашему фидбэку.</p>
      <p className="kb-welcome-text kb-welcome-feedback">Если у вас появятся замечания, идеи или что-то окажется неудобным, вы всегда можете нажать «Оставить отзыв» и написать нам прямо из Kubiki.</p>
      <div className="kb-modal-actions">
        <button type="button" className="kb-btn kb-btn-primary" onClick={onStart}>Начать работу</button>
      </div>
    </div>
  </div>;
}
