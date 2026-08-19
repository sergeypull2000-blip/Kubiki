import { useState, useRef, useLayoutEffect } from "react";
import { ChevronDown, LogOut, MessageSquare, Sparkles, Gauge } from "lucide-react";
import { useOutsideClose } from "../hooks.js";

/* Переиспользуемая кнопка аккаунта (аватар + имя + меню «Использование и лимиты» /
   «Персонализация ИИ» / «Выйти»). Используется в палитре проекта (Workspace)
   и в левой панели дашборда.

   Меню позиционируется как position:fixed по координатам кнопки
   (getBoundingClientRect), а не position:absolute: родительские сайдбары
   (kb-palette / kb-dash-sidebar) задают overflow:hidden и обрезали бы
   абсолютное меню. Координаты пересчитываются при resize/scroll и
   зажимаются в viewport (меню не уходит за край экрана). */
const PROFILE_MENU_WIDTH = 232;
const PROFILE_MENU_GAP = 8;
const PROFILE_MENU_MARGIN = 8;

function computeProfileMenuPosition(trigger, menu) {
  const rect = trigger.getBoundingClientRect();
  const width = Math.min(PROFILE_MENU_WIDTH, window.innerWidth - PROFILE_MENU_MARGIN * 2);
  const height = menu.offsetHeight;
  const spaceBelow = window.innerHeight - rect.bottom;
  const spaceAbove = rect.top;
  const openUp = spaceBelow < height + PROFILE_MENU_GAP && spaceAbove > spaceBelow;
  const top = openUp
    ? Math.max(PROFILE_MENU_MARGIN, rect.top - height - PROFILE_MENU_GAP)
    : Math.min(rect.bottom + PROFILE_MENU_GAP, window.innerHeight - height - PROFILE_MENU_MARGIN);
  const left = Math.max(PROFILE_MENU_MARGIN, Math.min(rect.left, window.innerWidth - width - PROFILE_MENU_MARGIN));
  return { top, left, width };
}

export function AccountControl({ userAccount, onOpenAiSettings, onOpenUsage, onSignOut, onOpenFeedback }) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileMenuPos, setProfileMenuPos] = useState(null);
  const profileRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useLayoutEffect(() => {
    if (!profileOpen) return;
    const update = () => {
      if (triggerRef.current && menuRef.current) {
        setProfileMenuPos(computeProfileMenuPosition(triggerRef.current, menuRef.current));
      }
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [profileOpen]);

  useOutsideClose(profileRef, profileOpen ? () => setProfileOpen(false) : null);
  return <div className="kb-profile kb-profile-sidebar" ref={profileRef}>
    <button type="button" ref={triggerRef} className="kb-profile-trigger kb-profile-row" onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen} aria-haspopup="menu">
      <span className="kb-profile-avatar">{(userAccount?.displayName || userAccount?.accountLabel || "K").trim().charAt(0).toUpperCase()}</span>
      <span className="kb-profile-row-copy"><strong>{userAccount?.displayName || "Аккаунт Kubiki"}</strong><small>{userAccount?.accountLabel || "Авторизованный пользователь"}</small></span>
      <ChevronDown size={13} />
    </button>
    {profileOpen && <div ref={menuRef} className="kb-profile-menu kb-profile-menu-anchored" style={profileMenuPos} role="menu">
      {onOpenUsage && <button type="button" role="menuitem" onClick={() => { setProfileOpen(false); onOpenUsage(); }}><Gauge size={15} />Использование и лимиты</button>}
      {onOpenAiSettings && <button type="button" role="menuitem" onClick={() => { setProfileOpen(false); onOpenAiSettings(); }}><Sparkles size={15} />Персонализация ИИ</button>}
      {onOpenFeedback && <button type="button" role="menuitem" onClick={() => { setProfileOpen(false); onOpenFeedback(); }}><MessageSquare size={15} />Оставить отзыв</button>}
      <button type="button" role="menuitem" onClick={onSignOut}><LogOut size={15} />Выйти</button>
    </div>}
  </div>;
}
