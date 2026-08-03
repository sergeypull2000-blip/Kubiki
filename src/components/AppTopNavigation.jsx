import { Logo } from "../Logo.jsx";
import { APP_SECTIONS, isAppSectionActive } from "../appNavigation.js";

export function AppTopNavigation({ activeSection, onSectionChange, onSignOut }) {
  return <header className="kb-header kb-app-header">
    <div className="kb-header-inner">
      <div className="kb-app-brand"><Logo size={21} /><span className="kb-brand-name">Kubiki</span></div>
      <nav className="kb-app-nav" aria-label="Основная навигация">
        <button type="button" className={isAppSectionActive(activeSection, APP_SECTIONS.PROJECTS) ? "is-active" : ""}
          aria-current={isAppSectionActive(activeSection, APP_SECTIONS.PROJECTS) ? "page" : undefined}
          onClick={() => onSectionChange(APP_SECTIONS.PROJECTS)}>Проекты</button>
        <button type="button" className={isAppSectionActive(activeSection, APP_SECTIONS.KNOWLEDGE_BASE) ? "is-active" : ""}
          aria-current={isAppSectionActive(activeSection, APP_SECTIONS.KNOWLEDGE_BASE) ? "page" : undefined}
          onClick={() => onSectionChange(APP_SECTIONS.KNOWLEDGE_BASE)}>База знаний</button>
      </nav>
      <div className="kb-spacer" />
      <button type="button" className="kb-sign-out" onClick={onSignOut}>Выйти</button>
    </div>
  </header>;
}
