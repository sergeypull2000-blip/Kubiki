import { useState, useRef } from "react";
import { ChevronDown, LogOut, Sparkles } from "lucide-react";
import { useOutsideClose } from "../hooks.js";

/* Переиспользуемая кнопка аккаунта (аватар + имя + меню «Персонализация ИИ» / «Выйти»).
   Используется в палитре проекта (Workspace) и в левой панели дашборда. */
export function AccountControl({ userAccount, onOpenAiSettings, onSignOut }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);
  useOutsideClose(profileRef, profileOpen ? () => setProfileOpen(false) : null);
  return <div className="kb-profile kb-profile-sidebar" ref={profileRef}>
    <button type="button" className="kb-profile-trigger kb-profile-row" onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen} aria-haspopup="menu">
      <span className="kb-profile-avatar">{(userAccount?.displayName || userAccount?.accountLabel || "K").trim().charAt(0).toUpperCase()}</span>
      <span className="kb-profile-row-copy"><strong>{userAccount?.displayName || "Аккаунт Kubiki"}</strong><small>{userAccount?.accountLabel || "Авторизованный пользователь"}</small></span>
      <ChevronDown size={13} />
    </button>
    {profileOpen && <div className="kb-profile-menu kb-profile-menu-up" role="menu">
      {onOpenAiSettings && <button type="button" role="menuitem" onClick={() => { setProfileOpen(false); onOpenAiSettings(); }}><Sparkles size={15} />Персонализация ИИ</button>}
      <button type="button" role="menuitem" onClick={onSignOut}><LogOut size={15} />Выйти</button>
    </div>}
  </div>;
}
