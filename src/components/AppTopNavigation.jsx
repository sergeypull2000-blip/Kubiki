import { Logo } from "../Logo.jsx";
import { APP_SECTIONS, isAppSectionActive } from "../appNavigation.js";
import { Sparkles } from "lucide-react";
import { BetaBadge } from "./BetaBadge.jsx";

export function AppTopNavigation({ activeSection, onSectionChange, onOpenAiSettings, onSignOut, hideAccountActions = false, edge = false }) {
  return <header className={`kb-header kb-app-header${edge ? " kb-app-header--edge" : ""}`}>
    <div className="kb-header-inner">
      <div className="kb-app-brand"><Logo size={21} /><span className="kb-brand-name">Kubiki</span><BetaBadge /></div>
      <nav className="kb-app-nav" aria-label="Основная навигация">
        <button type="button" className={isAppSectionActive(activeSection, APP_SECTIONS.PROJECTS) ? "is-active" : ""}
          aria-current={isAppSectionActive(activeSection, APP_SECTIONS.PROJECTS) ? "page" : undefined}
          onClick={() => onSectionChange(APP_SECTIONS.PROJECTS)}>Проекты</button>
        <button type="button" className={isAppSectionActive(activeSection, APP_SECTIONS.KNOWLEDGE_BASE) ? "is-active" : ""}
          aria-current={isAppSectionActive(activeSection, APP_SECTIONS.KNOWLEDGE_BASE) ? "page" : undefined}
          onClick={() => onSectionChange(APP_SECTIONS.KNOWLEDGE_BASE)}>База знаний</button>
      </nav>
      <div className="kb-spacer" />
      {!hideAccountActions && <>
        {onOpenAiSettings && <button type="button" className="kb-ai-settings-open" onClick={onOpenAiSettings}><Sparkles size={14} />Персонализация ИИ</button>}
        <button type="button" className="kb-sign-out" onClick={onSignOut}>Выйти</button>
      </>}
    </div>
  </header>;
}
