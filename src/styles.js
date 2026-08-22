/* ============================================================
   CSS — Raw Minimal / B2B SaaS, Geist
   ============================================================ */
export const CSS = `
.kb-server-screen{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f7f7f7;padding:24px}.kb-server-card{width:min(440px,calc(100vw - 32px));padding:24px;background:#fff;border:1px solid #ddd;border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.08)}.kb-server-title{font-size:18px;font-weight:600;margin-bottom:10px}.kb-server-text{font-size:14px;line-height:1.55;color:#666}.kb-server-error{margin-top:10px;color:#b42318;font-size:13px}.kb-server-overlay{z-index:1000}.kb-save-status{display:flex;align-items:center;gap:7px;font-size:11px;color:#888;white-space:nowrap}.kb-save-status.is-error{color:#b42318}.kb-save-status button,.kb-toast-retry{border:0;background:none;padding:0;color:inherit;text-decoration:underline;cursor:pointer}.kb-toast-retry{margin-left:8px}
:root{
  --bg:#FCFDFE;
  --bg-elevated:#FEFEFF;
  --surface:#FFFFFF;
  --surface-sunken:#FAFBFD;
  --line:#EAEEF3;
  --line-strong:#D3DAE3;
  --text:#1A2230;
  --text-muted:#64748B;
  --text-faint:#94A3B8;
  --accent:#5B8DEF;
  --accent-soft:#EEF4FE;

  --fs-2xs:11px; --fs-xs:12px; --fs-sm:13.5px; --fs-base:14px;
  --fs-md:15.5px; --fs-lg:17px; --fs-xl:23px;
  --fw-regular:400; --fw-medium:500; --fw-semibold:600;

  /* п.2: общая ширина группы «палитра + рабочее поле + правая панель» —
     держит шапку (лого / «ИТОГО») и layout в одной сетке, чтобы панели
     были прижаты к рабочему поле, а не растянуты по краям экрана */
  --layout-max: 1602px;
  /* Ширина центрального Workspace рассчитана на полный ряд Executor-тегов и полей. */
  --workspace-fixed-width: 1350px;
  --workspace-sidebar-gap: 24px;

  /* dashboard sidebar */
  --dash-sidebar-w: 240px;

  /* единая высота шапок приложения (дашборд = проект) */
  --kb-header-h: 84px;
}
/* ============================================================
   Scrollbars — скрыты глобально, прокрутка сохраняется
   ============================================================ */
*{scrollbar-width:none;-ms-overflow-style:none}
*::-webkit-scrollbar{width:0;height:0;display:none}
.kb-root *{box-sizing:border-box}
.kb-root{
  font-family:'Geist','Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
  color:var(--text); background:var(--bg); min-height:100%;
  line-height:1.5; font-weight:var(--fw-regular); font-feature-settings:"tnum" 1;
}
.kb-root button{font-family:inherit}
/* рабочая зона: фиксируем высоту под вьюпорт, скролл — внутри палитры и листа */
.kb-root-workspace{height:100vh; overflow:hidden; display:flex; flex-direction:column}
.kb-root-workspace .kb-header{position:static}
.kb-root-dash{height:100vh; overflow:hidden; display:flex; flex-direction:column}
.kb-root-dash .kb-header{position:static}

/* header */
.kb-header{display:flex; align-items:center; gap:16px; padding:13px 24px;
  border-bottom:1px solid var(--line); position:sticky; top:0; background:var(--bg); z-index:20}
.kb-header-dash{padding:17px 24px}
.kb-app-header{padding:0 24px;background:var(--surface)}
.kb-app-header .kb-header-inner{height:calc(var(--kb-header-h) - 1px);gap:34px}
.kb-app-header--edge .kb-header-inner{max-width:none;margin:0}
.kb-app-brand{display:flex;align-items:center;gap:11px;flex:none}
.kb-app-nav{display:flex;align-self:stretch;gap:30px}
.kb-app-nav button{position:relative;border:0;background:transparent;padding:2px 0 0;color:var(--text-muted);font:inherit;font-size:var(--fs-base);cursor:pointer}
.kb-app-nav button:hover,.kb-app-nav button.is-active{color:var(--text)}
.kb-app-nav button.is-active::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;border-radius:2px 2px 0 0;background:var(--accent)}
.kb-ai-settings-open{display:flex;align-items:center;gap:6px;border:0;background:transparent;color:var(--text-muted);font:inherit;font-size:12px;cursor:pointer}.kb-ai-settings-open:hover{color:var(--text)}
.kb-ai-settings-modal{max-width:620px}.kb-ai-settings-text{width:100%;resize:vertical;min-height:180px;line-height:1.5}.kb-ai-settings-count{text-align:right;color:var(--text-muted);font-size:11px;margin-top:5px}.kb-ai-history-option{display:flex;align-items:flex-start;gap:10px;margin-top:18px;padding:12px;border:1px solid var(--line);border-radius:8px;cursor:pointer}.kb-ai-history-option input{margin-top:3px}.kb-ai-history-option span{display:flex;flex-direction:column;gap:4px;font-size:13px}.kb-ai-history-option small{color:var(--text-muted);line-height:1.4}
.kb-sign-out{border:1px solid var(--line);background:transparent;color:var(--text-muted);font-size:var(--fs-sm);font-weight:var(--fw-medium);padding:6px 11px;border-radius:6px;cursor:pointer;transition:.15s}
.kb-sign-out:hover{color:var(--text);background:var(--accent-soft);border-color:var(--accent)}
/* п.2: содержимое шапки рабочей зоны выровнено по той же ширине/центру,
   что и .kb-layout ниже — лого и «ИТОГО» оказываются точно над панелями */
.kb-header-inner{display:flex; align-items:center; gap:12px; width:100%; max-width:var(--layout-max); margin:0 auto}
.kb-header-min .kb-header-inner{max-width:none; margin:0}
.kb-brand{display:flex; flex-direction:column; line-height:1.2}
.kb-brand-name{font-weight:var(--fw-semibold); font-size:var(--fs-lg); letter-spacing:-.02em}
.kb-brand-sub{font-size:var(--fs-2xs); color:var(--text-muted); text-transform:uppercase; letter-spacing:.06em; margin-top:2px; font-weight:var(--fw-medium)}
.kb-back{display:flex; align-items:center; gap:6px; background:none; border:none;
  color:var(--text-muted); font-size:var(--fs-base); font-weight:var(--fw-medium); cursor:pointer; padding:6px 4px; border-radius:5px}
.kb-back:hover{color:var(--text)}
.kb-project-name{font-size:var(--fs-lg); font-weight:var(--fw-semibold); letter-spacing:-.02em; min-width:160px; max-width:320px}
.kb-spacer{flex:1}
.kb-btn-secondary{border:1px solid var(--line); background:transparent; color:var(--text);
  font-size:var(--fs-base); font-weight:var(--fw-medium); padding:7px 13px; border-radius:6px; cursor:pointer; transition:.15s}
.kb-btn-secondary:hover{background:var(--accent-soft); border-color:var(--accent)}
.kb-auth-screen{min-height:100vh;display:grid;place-items:center;padding:24px;background:var(--bg);font-family:'Geist','Inter',system-ui,-apple-system,'Segoe UI',sans-serif;color:var(--text)}
.kb-auth-loading{font-size:var(--fs-base);color:var(--text-muted)}
.kb-auth-card{width:100%;max-width:360px;display:flex;flex-direction:column;gap:18px;padding:30px;background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:0 12px 32px rgba(26,34,48,.06)}
.kb-auth-heading{font-size:var(--fs-xl);font-weight:var(--fw-semibold);letter-spacing:-.02em}
.kb-auth-field{display:flex;flex-direction:column;gap:7px;color:var(--text-muted);font-size:var(--fs-sm);font-weight:var(--fw-medium)}
.kb-auth-field .kb-input{width:100%;font-size:var(--fs-base);color:var(--text);border:1px solid var(--line);background:var(--surface);padding:9px 10px;border-radius:6px}
.kb-auth-error{margin-top:-4px;color:#B42318;font-size:var(--fs-sm)}
.kb-auth-submit{border:1px solid var(--accent);background:var(--accent);color:#fff;font-size:var(--fs-base);font-weight:var(--fw-medium);padding:9px 14px;border-radius:6px;cursor:pointer;transition:.15s}
.kb-auth-submit:hover:not(:disabled){filter:brightness(.96)}
.kb-auth-submit:disabled{cursor:default;opacity:.65}
.kb-auth-subtext{color:var(--text-muted);font-size:var(--fs-sm);line-height:1.5;margin-top:-10px}
.kb-auth-notice{color:#1a7f4b;font-size:var(--fs-sm);line-height:1.5;margin-top:-4px}
.kb-auth-links{display:flex;flex-direction:column;gap:9px;align-items:flex-start;margin-top:-4px}
.kb-auth-link{border:0;background:none;padding:0;color:var(--accent);font:inherit;font-size:var(--fs-sm);font-weight:var(--fw-medium);cursor:pointer;text-align:left}
.kb-auth-link:hover{text-decoration:underline}

.kb-total-badge{display:flex; flex-direction:column; align-items:flex-end; gap:2px; line-height:1.2;
  padding:7px 16px; border-radius:9px; background:var(--accent-soft)}
.kb-total-badge-price{background:var(--accent); }
.kb-total-badge-price .kb-total-label{color:#DCE8FF}
.kb-total-badge-price .kb-total-figure{color:#fff}
.kb-total-label{font-size:var(--fs-2xs); text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); font-weight:var(--fw-semibold)}
.kb-total-figure{font-size:var(--fs-xl); font-weight:var(--fw-semibold); color:var(--text); font-variant-numeric:tabular-nums; letter-spacing:-.02em}

/* тумблер вида «Внутренняя / Внешняя» */
.kb-viewtoggle{display:inline-flex; background:var(--surface-sunken); border:1px solid var(--line); border-radius:8px; padding:2px}
.kb-viewtoggle-btn{border:none; background:transparent; color:var(--text-muted); font-size:var(--fs-sm); font-weight:var(--fw-medium);
  padding:6px 13px; border-radius:6px; cursor:pointer; transition:.12s; font-family:inherit}
.kb-viewtoggle-btn:hover{color:var(--text)}
.kb-viewtoggle-btn-active{background:var(--surface); color:var(--text); box-shadow:0 1px 2px rgba(26,34,48,.08)}

/* поле глобального маркапа */
.kb-markup-field{display:flex; align-items:center; gap:8px}
.kb-markup-label{font-size:var(--fs-2xs); text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted); font-weight:var(--fw-semibold); white-space:nowrap}
.kb-markup-input{max-width:56px; border:1px solid var(--line-strong); background:var(--surface); text-align:right}

/* внешний (клиентский) вид */
.kb-canvas-ext{max-width:1010px; margin:0 auto; width:100%}
.kb-ext-empty{color:var(--text-muted); font-size:var(--fs-base); padding:48px 20px; text-align:center;
  border:1px dashed var(--line-strong); border-radius:8px}
.kb-ext-stage{border:1px solid var(--line); border-radius:8px; background:var(--surface); margin-bottom:14px}
.kb-ext-stage-head{display:flex; align-items:center; gap:12px; padding:12px 16px; border-bottom:1px solid var(--line)}
.kb-ext-stage-name{font-size:var(--fs-md); font-weight:var(--fw-semibold); letter-spacing:-.01em; flex:1; min-width:0}
.kb-ext-stage-body{padding:6px 16px 12px}
.kb-ext-task{display:flex; align-items:center; gap:10px; padding:9px 0; border-top:1px solid var(--line); position:relative}
.kb-ext-task:first-child{border-top:none}
.kb-ext-task-name{flex:1; min-width:0; font-size:var(--fs-base); color:var(--text)}
.kb-ext-dot{width:7px; height:7px; border-radius:50%; background:var(--accent); flex-shrink:0}
.kb-ext-editbtn{display:flex; align-items:center; justify-content:center; background:none; border:none;
  color:var(--text-faint); cursor:pointer; padding:4px; border-radius:5px; transition:.12s; flex-shrink:0}
.kb-ext-editbtn:hover{color:var(--accent); background:var(--accent-soft)}
.kb-ext-price{font-size:var(--fs-base); font-weight:var(--fw-medium); color:var(--text); font-variant-numeric:tabular-nums;
  white-space:nowrap; text-align:right; min-width:120px}
/* поповер настройки маркапа задачи */
.kb-ext-pop{position:absolute; top:calc(100% - 2px); right:0; z-index:40; width:230px;
  background:var(--surface); border:1px solid var(--line-strong); border-radius:8px; box-shadow:0 8px 24px rgba(26,34,48,.12); padding:10px}
.kb-ext-pop-row{display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:7px}
.kb-ext-pop-lbl{font-size:var(--fs-2xs); text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); font-weight:var(--fw-semibold)}
.kb-ext-pop-input{max-width:96px; border:1px solid var(--line-strong); background:var(--surface); text-align:right}
.kb-ext-pop-input:disabled{opacity:.5; cursor:not-allowed}
.kb-ext-pop-foot{display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:9px; padding-top:8px; border-top:1px solid var(--line)}
.kb-ext-pop-hint{font-size:var(--fs-2xs); color:var(--text-muted)}
.kb-ext-reset{border:1px solid var(--line); background:transparent; color:var(--text-muted); font-size:var(--fs-2xs);
  font-weight:var(--fw-medium); padding:4px 9px; border-radius:5px; cursor:pointer; font-family:inherit; transition:.12s}
.kb-ext-reset:hover:not(:disabled){border-color:var(--accent); color:var(--accent)}
.kb-ext-reset:disabled{opacity:.4; cursor:not-allowed}

/* layout */
/* п.2: вся группа (палитра + рабочее поле + правая панель) центрирована и
   ограничена по ширине — палитра и правая панель «приклеены» к рабочему
   полю, а не растянуты по краям широкого экрана */
.kb-layout{position:relative; display:flex; align-items:stretch; justify-content:center; height:calc(100vh - var(--kb-header-h)); overflow:hidden; width:100%; min-width:0}
.kb-template-context{font-size:var(--fs-sm); color:var(--text-muted); white-space:nowrap}
.kb-root-workspace.is-template-edit .kb-panel-shell{display:none}
.kb-panel-shell{position:absolute; top:0; bottom:0; flex:0 0 auto; min-width:0; display:flex; overflow:visible}
.kb-panel-shell-left{min-width:210px; max-width:calc((100vw - var(--workspace-fixed-width)) / 2 - var(--workspace-sidebar-gap))}.kb-panel-shell-right{min-width:250px; max-width:calc((100vw - var(--workspace-fixed-width)) / 2 - var(--workspace-sidebar-gap))}
.kb-panel-shell>.kb-palette,.kb-panel-shell>.kb-rightpanel{width:100%; min-width:0}
.kb-panel-resizer{position:absolute; z-index:20; top:0; bottom:0; width:9px; cursor:col-resize; touch-action:none}
.kb-panel-resizer::after{content:""; position:absolute; top:0; bottom:0; left:4px; width:1px; background:transparent; transition:background .12s}
.kb-panel-resizer:hover::after,.kb-is-panel-resizing .kb-panel-resizer::after{background:var(--line-strong)}
.kb-panel-resizer-left{right:-4px}.kb-panel-resizer-right{left:-4px}
.kb-is-panel-resizing,.kb-is-panel-resizing *{cursor:col-resize!important; user-select:none!important}
.kb-palette{width:298px; flex-shrink:0; background:var(--surface); border-right:1px solid var(--line-strong);
  display:flex; flex-direction:column; overflow:hidden; min-height:0}
.kb-palette-scroll{flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; padding:14px 12px 22px; display:flex; flex-direction:column; gap:2px}
.kb-canvas{flex:0 0 var(--workspace-fixed-width); width:var(--workspace-fixed-width); min-width:var(--workspace-fixed-width); display:flex; flex-direction:column; overflow:hidden}
.kb-canvas-scroll{flex:1 1 auto; min-height:0; overflow-y:auto; padding:20px 28px 120px}
/* рабочее поле центрировано в своей колонке между палитрой и правой панелью */
.kb-canvas-inner{width:100%; min-width:0; margin:0 auto}

/* Fallback: когда панели и фиксированный Workspace физически не помещаются,
   возвращаемся к обычной адаптивной сетке с горизонтальным скроллом контента. */
.kb-generation-knowledge{margin:0 0 10px; color:var(--text-muted); font-size:11px; line-height:1.4}
.kb-ai-hydration-note{margin-right:auto; color:var(--text-muted); font-size:11px}

/* palette accordion */
.kb-palette-section{padding-bottom:4px; margin-bottom:6px}
.kb-palette-title{width:100%; display:flex; align-items:center; justify-content:space-between; background:none; border:none;
  cursor:pointer; padding:8px 6px; font-size:12px; font-weight:var(--fw-semibold); text-transform:none; letter-spacing:normal; color:var(--text)}
.kb-palette-title:hover{color:var(--text)}
.kb-chevron{transition:transform .15s; color:var(--text-faint); flex-shrink:0}
.kb-chevron-open{transform:rotate(180deg)}
.kb-palette-items{display:flex; flex-direction:column; gap:1px; padding:2px 0 4px}
.kb-chip{display:flex; align-items:center; gap:9px; border:none; border-radius:6px; padding:7px 8px;
  font-size:var(--fs-sm); font-weight:var(--fw-medium); color:var(--text); background:transparent; cursor:grab; user-select:none; transition:background .12s}
.kb-chip:hover{background:var(--accent-soft)}
.kb-chip:active{cursor:grabbing}
.kb-chip span{flex:1; min-width:0}
.kb-chip-dragging{opacity:.45}
.kb-chip-tag{padding-right:4px}
.kb-chip-caret{background:none; border:none; color:var(--text-faint); cursor:pointer; padding:2px; border-radius:4px; display:flex; flex-shrink:0}
.kb-chip-caret:hover{color:var(--text); background:var(--surface)}
.kb-tagitem{position:relative}
.kb-palette-note{font-size:var(--fs-xs); color:var(--text-faint); line-height:1.45; margin-top:8px; padding:0 6px}

/* stage */
.kb-stage{border:1px solid var(--line-strong); border-radius:8px; background:#FFFFFF; margin-bottom:14px; transition:.15s}
.kb-stage-depth-empty{background:#FFFFFF}
.kb-stage-depth-tasks{background:#FFFFFF}
.kb-stage-depth-executors{background:#FFFFFF}
.kb-stage-active{border-color:var(--accent); box-shadow:0 0 0 1px var(--accent)}
.kb-stage-over{outline:1.5px dashed var(--accent); outline-offset:-1px; background:var(--accent-soft)}
.kb-stage-dragging{opacity:.45}
.kb-stage-head{display:flex; align-items:center; gap:7px; min-height:38px; padding:6px 11px; border-bottom:1px solid var(--line-strong)}
.kb-grip{display:flex; color:var(--text-faint); cursor:grab; padding:2px; border-radius:3px}
.kb-grip:hover{color:var(--text-muted); background:var(--accent-soft)}
.kb-grip:active{cursor:grabbing}
.kb-stage-icon{color:var(--text-faint); flex-shrink:0}
.kb-stage-name{font-size:16.5px; font-weight:var(--fw-semibold); letter-spacing:-.01em}
.kb-stage-body{padding:5px 10px 5px 12px; margin-left:0}
.kb-stage-task-count{flex-shrink:0; color:var(--text-faint); font-size:var(--fs-xs); white-space:nowrap}
.kb-dropzone-over{background:var(--accent-soft); outline:1.5px dashed var(--accent); outline-offset:-4px; border-radius:5px}

/* иерархия сумм: все выровнены по правому краю, вес/размер = уровень */
.kb-sum{font-variant-numeric:tabular-nums; white-space:nowrap; text-align:right; margin-left:auto; user-select:text; cursor:text}
.kb-sum-stage{font-size:16px; font-weight:var(--fw-semibold); color:var(--text); letter-spacing:-.01em; min-width:104px}
.kb-sum-task{font-size:var(--fs-sm); font-weight:var(--fw-medium); color:var(--text-muted); min-width:104px}
/* быстрый ввод стоимости задачи напрямую, пока нет исполнителей */
.kb-task-directcost{display:inline-flex; align-items:center; justify-content:flex-end; gap:4px}
.kb-task-directcost-input{font-size:var(--fs-sm); font-weight:var(--fw-medium)}
.kb-task-directcost-input,.kb-input-num.kb-amount-input{width:88px; min-width:88px; max-width:88px; flex-shrink:0}
.kb-task-directcost-cur{color:var(--text-faint)}

/* task */
.kb-task{padding:0 0 8px; border:1px solid var(--line-strong); border-radius:9px; background:#F1F4F8; transition:background .12s,border-color .12s,box-shadow .12s; margin-bottom:8px; min-width:0; overflow:visible}
.kb-task-collapsed{padding-bottom:0}
.kb-task-depth-empty,.kb-task-depth-empty.kb-task-active{background:#F1F4F8}
.kb-task-depth-executors,.kb-task-depth-executors.kb-task-active{background:#F1F4F8}
.kb-task-active{background:inherit; border-color:var(--accent); box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 35%,transparent)}
/* вся задача — зона приёма исполнителя: подсвечивается целиком (п.1) */
.kb-task-over{background:var(--accent-soft); outline:1.5px dashed var(--accent); outline-offset:2px; border-radius:9px}
.kb-task-head{display:flex; align-items:center; gap:7px; min-height:32px; min-width:0; padding:3px 10px; border-bottom:1px solid var(--line); border-radius:8px 8px 0 0; background:color-mix(in srgb,var(--surface) 62%,transparent)}
.kb-task-collapsed .kb-task-head{border-bottom:0; border-radius:8px}
.kb-task-name{flex:1}
.kb-task-body{padding:7px 9px 0; margin:0; min-height:3px; min-width:0}
.kb-entity-index{flex:0 0 auto; color:var(--text-muted); font-variant-numeric:tabular-nums; white-space:nowrap}
.kb-stage-index{font-size:var(--fs-sm); font-weight:var(--fw-semibold)}
.kb-task-index{font-size:var(--fs-xs); font-weight:var(--fw-medium)}
.kb-title-edit{display:flex; align-items:center; gap:4px; min-width:0; margin-right:auto}
.kb-stage-title-edit{flex:0 1 420px}.kb-task-title-edit{flex:1 1 auto}
.kb-title-text{overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text)}
.kb-stage-title-text{font-size:16.5px; font-weight:var(--fw-semibold); letter-spacing:-.01em}
.kb-task-title-text{font-size:var(--fs-base); font-weight:var(--fw-medium)}
.kb-title-edit-btn{display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto; padding:3px; border:0; border-radius:4px; background:transparent; color:var(--text-faint); cursor:pointer; opacity:.48; transition:opacity .12s,color .12s,background .12s}
.kb-stage-head:hover .kb-title-edit-btn,.kb-task-head:hover .kb-title-edit-btn,.kb-title-edit-btn:focus-visible{opacity:1;color:var(--text-muted)}
.kb-title-edit-btn:hover{background:var(--surface);color:var(--text)}
/* кнопки «+ Новый …» — единый вид для добавления вложенных элементов */
.kb-add-btn{display:inline-flex; align-items:center; justify-content:center; vertical-align:middle; min-height:35px; gap:6px; background:none; border:1px solid transparent;
  color:var(--text-muted); font-size:var(--fs-sm); font-weight:var(--fw-medium); cursor:pointer;
  margin:0; padding:6px 8px; border-radius:5px; transition:.12s}
.kb-add-btn:hover{color:var(--text); background:var(--surface-sunken)}
.kb-add-task-btn{padding-inline:18px}
.kb-add-task-btn:hover{background:color-mix(in srgb,var(--surface-sunken) 76%,var(--line-strong));}
/* комментарий задачи: иконка в ряду действий и компактный инлайн-редактор */
.kb-task-comment-btn.is-active{color:var(--accent)}
.kb-task-comment{padding:8px 10px 0; border-bottom:1px solid var(--line); background:var(--surface)}
.kb-task-comment-input{width:100%; min-height:52px; resize:vertical; box-sizing:border-box; padding:6px 8px; border:1px solid var(--line); border-radius:6px; background:var(--surface); color:var(--text); font:inherit; font-size:var(--fs-sm); line-height:1.4}
.kb-task-comment-input:focus{border-color:var(--accent)}


/* executor row — заметность через структуру (отступ, размер), не через цвет */
.kb-erow-group{padding:2px 4px 2px 7px; border-radius:5px; background:#FFFFFF; transition:background .12s; cursor:default; border:1px solid var(--line)}
.kb-erow-group + .kb-erow-group{margin-top:3px}
.kb-erow-group:hover{background:#FFFFFF}
/* активная строка — только чуть тёмный фон, без цветной черты и рамки */
.kb-erow-group-active{box-shadow:inset 0 0 0 1px var(--accent); cursor:grab}
.kb-erow-group-active:active{cursor:grabbing}
.kb-erow-dragging{opacity:.45}
/* приём тега/кубика — тончайшая нейтральная рамка, не акцентная */
.kb-erow-group-over{background:var(--surface-sunken); box-shadow:inset 0 0 0 1px var(--line)}
/* новый исполнитель сразу появляется на постоянном белом фоне */
.kb-erow-flash{background:#FFFFFF}
.kb-erow{display:flex; align-items:center; gap:7px}
.kb-erow-tags{flex:1; min-width:0; min-height:27px; display:flex; flex-wrap:wrap; gap:4px; align-items:center; padding:1px 0}
.kb-erow-amount{flex-shrink:0; min-width:104px; display:flex; justify-content:flex-end; align-items:center; gap:6px}
.kb-erow-taxed{white-space:nowrap; user-select:text; cursor:text}
.kb-erow-sum{font-size:var(--fs-xs); font-weight:var(--fw-regular); color:var(--text-muted); font-variant-numeric:tabular-nums; white-space:nowrap; user-select:text; cursor:text}
.kb-erow-sum-muted{color:var(--text-faint)}
.kb-erow-sum-strong{font-size:var(--fs-sm); font-weight:var(--fw-medium); color:var(--text)}
.kb-amount-input{text-align:right; font-size:var(--fs-sm); font-weight:var(--fw-medium)}
.kb-erow-del{flex-shrink:0}

/* tag chip on executor */
.kb-tag{position:relative; display:inline-flex; align-items:center; gap:5px; border:1px solid var(--line-strong);
  border-radius:5px; padding:3px 5px 3px 7px; background:var(--surface); font-size:var(--fs-xs); width:120px; flex:0 0 120px; min-width:120px; max-width:120px;
  transition:border-color .12s, background .12s, color .12s}
.kb-tag-role,.kb-tag-name{width:132px; flex-basis:132px; min-width:132px; max-width:132px}
.kb-tag-payment{width:182px; flex-basis:182px; min-width:182px; max-width:182px}
.kb-tag-tax{width:147px; flex-basis:147px; min-width:147px; max-width:147px}
.kb-tag-grade{width:92px; flex-basis:92px; min-width:92px; max-width:92px}
.kb-tag-spec{width:132px; flex-basis:132px; min-width:132px; max-width:132px}
.kb-tag-soft{width:120px; flex-basis:120px; min-width:120px; max-width:120px}
.kb-tag:hover{border-color:var(--accent); background:var(--accent-soft)}
.kb-tag:hover .kb-tag-ic{color:var(--accent)}
.kb-tag:hover .kb-tag-val{color:var(--accent)}
.kb-tag:hover .kb-tag-placeholder{color:var(--accent)}
.kb-tag-empty{border-style:dashed; background:transparent}
.kb-tag-empty:hover{background:var(--accent-soft)}
.kb-tag-filled{cursor:grab}
.kb-tag-filled:active{cursor:grabbing}
.kb-tag-ic{color:var(--text-faint); flex-shrink:0}
.kb-tag-val{font-weight:var(--fw-medium); color:var(--text); cursor:pointer; white-space:nowrap}
.kb-tag-placeholder{background:none; border:none; color:var(--text-muted); font-size:var(--fs-xs); cursor:pointer; padding:0; font-family:inherit; white-space:nowrap}
.kb-tag-input{border:none; background:transparent; outline:none; font-size:var(--fs-xs); font-weight:var(--fw-medium);
  color:var(--text); font-family:inherit; min-width:70px; width:auto; padding:0}
.kb-tag-input::placeholder{color:var(--text-faint); font-weight:var(--fw-regular)}
.kb-tag-x{background:none; border:none; color:var(--text-faint); cursor:pointer; padding:1px; border-radius:3px; display:flex; flex-shrink:0}
.kb-tag-x:hover{color:var(--text); background:var(--surface-sunken)}
/* пока исполнитель выделен, ширина кубика не меняется между состояниями
   (пусто/редактирование/заполнено) — иначе клик по соседнему кубику
   промахивается: строка успевает перестроиться между mousedown и mouseup */
.kb-tag-input,.kb-tag-val,.kb-tag-placeholder,.kb-tag-taxwrap{min-width:0; flex:1}
.kb-tag-val,.kb-tag-placeholder{overflow:hidden; text-overflow:ellipsis}

/* «+» добавить доп. кубик (роль/специализация/грейд/софт) на строке */
.kb-addcube{position:relative; display:inline-flex}
.kb-addcube-btn{display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px;
  border:1px dashed var(--line-strong); border-radius:5px; background:transparent; color:var(--text-muted);
  cursor:pointer; transition:.12s}
.kb-addcube-btn:hover{border-color:var(--accent); color:var(--accent); background:var(--accent-soft)}
.kb-addcube-menu{min-width:190px; padding:4px}
.kb-addcube-title{font-size:var(--fs-2xs); text-transform:uppercase; letter-spacing:.06em; color:var(--text-muted);
  font-weight:var(--fw-semibold); padding:5px 8px 6px}
.kb-addcube-item{display:flex; align-items:center; gap:9px; color:var(--text)}
.kb-addcube-item svg{color:var(--text-faint); flex-shrink:0}
.kb-addcube-item:hover svg{color:var(--accent)}
.kb-suggest-tagstates{min-width:150px}

/* payment inline (hourly/shift) — справа от тегов, на той же строке (п.4) */
.kb-payinline{display:inline-flex; align-items:center; gap:4px}
.kb-payinline .kb-input-num{max-width:64px}
.kb-payinline-unit{font-size:var(--fs-2xs); color:var(--text-muted); font-weight:var(--fw-medium); white-space:nowrap}
.kb-payinline-x{color:var(--text-faint); font-size:var(--fs-xs); padding:0 1px}

/* inputs */
.kb-input, .kb-select{border:1px solid transparent; background:transparent; border-radius:4px; padding:4px 6px;
  font-size:var(--fs-base); font-weight:var(--fw-regular); color:var(--text); outline:none; width:100%; font-family:inherit; transition:.15s}
.kb-input:hover, .kb-select:hover{border-color:var(--line)}
.kb-input:focus, .kb-select:focus{border-color:var(--accent); background:var(--surface)}
.kb-input::placeholder{color:var(--text-faint)}
.kb-input-medium{font-weight:var(--fw-medium); font-size:var(--fs-md)}
.kb-input-flex{flex:1; min-width:0}
.kb-input-num{font-variant-numeric:tabular-nums; text-align:right; max-width:74px; border:1px solid var(--line); background:var(--surface)}

/* autocomplete / dropdowns */
.kb-autocomplete{position:relative; flex:1; min-width:0}
.kb-suggest{position:absolute; top:calc(100% + 3px); left:0; z-index:40; min-width:100%;
  background:var(--surface); border:1px solid var(--line-strong); border-radius:6px; box-shadow:0 6px 20px rgba(26,34,48,.1);
  max-height:230px; overflow-y:auto; overscroll-behavior:contain; scroll-behavior:smooth; padding:3px}
.kb-suggest-states{left:0; right:auto; min-width:180px}
.kb-suggest-item{padding:7px 9px; font-size:var(--fs-sm); font-weight:var(--fw-regular); border-radius:4px; cursor:pointer; color:var(--text); white-space:nowrap}
.kb-stage-suggest-item{display:flex; align-items:center; gap:9px}
.kb-stage-suggest-item svg{color:var(--text-faint); flex-shrink:0}
.kb-stage-suggest-item:hover svg{color:var(--accent)}
.kb-suggest-item:hover{background:var(--accent-soft); color:var(--accent)}
.kb-state-item{cursor:grab}
.kb-state-item:active{cursor:grabbing}

/* icon button */
.kb-icon-btn{display:flex; align-items:center; justify-content:center; background:none; border:none; color:var(--text-faint);
  cursor:pointer; padding:4px; border-radius:5px; transition:.15s; flex-shrink:0}
.kb-icon-btn:hover{color:var(--text); background:var(--accent-soft)}

/* canvas dropzone */
.kb-dropzone{display:flex; flex-direction:row; align-items:center; justify-content:center; gap:7px; text-align:center;
  color:var(--text-muted); border:1px dashed var(--line-strong); border-radius:8px; padding:12px; font-size:var(--fs-sm);
  transition:.15s; width:100%; font-family:inherit}
.kb-dropzone-btn{cursor:pointer; font-weight:var(--fw-medium); background:#fff}
.kb-dropzone-btn:hover{border-color:var(--line-strong); color:var(--text); background:var(--surface-sunken)}
.kb-dropzone-empty{padding:40px 20px; font-size:var(--fs-base); flex-direction:row; background:#fff}
.kb-dropzone.kb-dropzone-over{background:var(--accent-soft); border-color:var(--accent); color:var(--accent)}

/* dashboard */
.kb-dashboard{width:100%; max-width:1200px; margin:0; padding:32px 24px; min-height:0; overflow-y:auto}
.kb-board{display:grid; grid-template-columns:repeat(auto-fill,minmax(176px,1fr)); gap:12px}
.kb-card{position:relative; aspect-ratio:1/1; background:var(--surface); border:1px solid var(--line); border-radius:8px;
  padding:15px; display:flex; flex-direction:column; gap:5px; cursor:pointer; transition:border-color .15s}
.kb-card:hover{border-color:var(--line-strong)}
.kb-card-icon{color:var(--text-faint)}
.kb-card-name{font-weight:var(--fw-semibold); font-size:var(--fs-base); margin-top:auto; color:var(--text); letter-spacing:-.01em}
.kb-card-name-input{display:block; width:100%; min-width:0; padding:2px 3px; margin-left:-3px; border:1px solid transparent; border-radius:4px; background:transparent; font-family:inherit; line-height:1.35; outline:none}
.kb-card-name-input:hover{border-color:var(--line)}
.kb-card-name-input:focus{border-color:var(--accent); background:var(--surface)}
.kb-card-name-input::placeholder{color:var(--text-muted)}
.kb-card-sum{font-weight:var(--fw-semibold); font-size:var(--fs-lg); color:var(--text); font-variant-numeric:tabular-nums; letter-spacing:-.01em}
.kb-card-meta{font-size:var(--fs-xs); color:var(--text-muted)}
.kb-card-del{position:absolute; top:8px; right:8px; background:none; border:none; color:var(--text-faint);
  padding:2px; cursor:pointer; opacity:0; transition:.15s; display:flex; align-items:center; justify-content:center}
.kb-card:hover .kb-card-del{opacity:1}
.kb-card-del:hover{color:var(--text)}
/* иконка «сохранить как шаблон» на карточке проекта */
.kb-card-tpl-btn{position:absolute; right:8px; bottom:8px; background:none; border:none; color:var(--text-faint);
  padding:4px; cursor:pointer; opacity:0; transition:.15s; display:flex; align-items:center; justify-content:center}
.kb-card:hover .kb-card-tpl-btn{opacity:1}
.kb-card-tpl-btn:hover{color:var(--text); background:var(--accent-soft)}
.kb-card-actions{position:absolute; right:8px; bottom:8px; display:flex; gap:2px; opacity:0; transition:.15s}
.kb-card:hover .kb-card-actions{opacity:1}
.kb-card-actions .kb-card-tpl-btn{position:static; opacity:1}
.kb-card-favorite.is-active{color:#E0A11A; opacity:1}
.kb-card:has(.kb-card-favorite.is-active) .kb-card-actions{opacity:1}
.kb-card-template{cursor:pointer}
.kb-template-badge{position:absolute; left:13px; top:42px; padding:2px 6px; border-radius:10px; background:var(--accent-soft); color:var(--accent); font-size:10px; font-weight:var(--fw-medium)}
.kb-card-menu-btn{position:absolute; top:7px; right:7px; display:flex; border:0; border-radius:5px; padding:4px; background:transparent; color:var(--text-faint); cursor:pointer}
.kb-card-menu-btn:hover{background:var(--surface-sunken); color:var(--text)}
.kb-card-context{position:absolute; z-index:20; top:34px; right:8px; min-width:150px; padding:4px; border:1px solid var(--line); border-radius:8px; background:var(--surface); box-shadow:0 8px 24px rgba(20,30,50,.12)}
.kb-card-context button{display:flex; align-items:center; gap:7px; width:100%; padding:7px 8px; border:0; border-radius:5px; background:transparent; color:var(--text); font:inherit; font-size:12px; cursor:pointer}
.kb-card-context button:hover{background:var(--surface-sunken)}
.kb-card-context button.is-danger{color:#C0392B}
.kb-card-new{align-items:center; justify-content:center; border-style:dashed; color:var(--text-muted); font-weight:var(--fw-medium); font-size:var(--fs-sm); gap:7px}
.kb-card-new:hover{border-color:var(--accent); color:var(--accent)}
.kb-new-project-wrap{position:relative; aspect-ratio:1/1}
.kb-new-project-wrap>.kb-card{width:100%; height:100%}
.kb-project-source-modal{max-width:520px; border-radius:6px; box-shadow:none}
.kb-project-source-modal .kb-modal-head{padding:13px 16px}
.kb-project-source-modal .kb-modal-body{padding:14px 16px}
.kb-project-source-description{width:100%; margin-bottom:10px; resize:vertical; border-radius:4px; background:var(--surface)}
.kb-project-source-description.is-primary{min-height:144px}
.kb-project-source-description.is-secondary{min-height:64px}
.kb-project-source-file{margin-bottom:10px; border-radius:4px; background:var(--surface)}
.kb-project-source-file.is-primary{min-height:72px; padding:12px 14px}
.kb-project-source-file.is-secondary{min-height:44px; padding:8px 10px; border-style:solid}
.kb-project-source-file.is-secondary .kb-import-text strong{font-weight:var(--fw-regular); color:var(--text-muted)}
.kb-project-source-modal .kb-modal-actions{margin-top:10px}

/* ---- новые фичи: импорт / экспорт / брендинг / режим маркапа ---- */
.kb-btn{display:inline-flex; align-items:center; gap:7px; font:inherit; font-size:var(--fs-sm); font-weight:var(--fw-medium); padding:7px 12px; border-radius:6px; border:1px solid transparent; cursor:pointer; white-space:nowrap; transition:background .15s ease, border-color .15s ease}
.kb-btn:disabled{opacity:.55; cursor:default}
.kb-btn-primary{background:var(--accent); color:#fff}
.kb-btn-primary:hover:not(:disabled){background:#4a7fe0}
.kb-btn-ghost{background:var(--bg); color:var(--text); border-color:var(--line)}
.kb-btn-ghost:hover{background:var(--surface-sunken)}
.kb-btn-sub{font-weight:var(--fw-regular); opacity:.8; font-size:11px; margin-left:2px}
.kb-spin{animation:kb-spin 1s linear infinite}
@keyframes kb-spin{to{transform:rotate(360deg)}}

.kb-export{position:relative}
.kb-export-group{display:inline-flex; align-items:center; gap:6px; position:relative}
.kb-export-cog{padding:7px 8px}

.kb-brand-title{font-size:var(--fs-sm); font-weight:var(--fw-semibold); color:var(--text)}
.kb-brand-logo{display:flex; align-items:center; justify-content:center; height:72px; border:1px dashed var(--line-strong); border-radius:6px; cursor:pointer; background:var(--surface-sunken); overflow:hidden}
.kb-brand-logo-img{max-height:60px; max-width:90%; object-fit:contain}
.kb-brand-logo-empty{font-size:12px; color:var(--text-muted)}
.kb-brand-clear{align-self:flex-start; background:none; border:none; padding:0; font-size:11px; color:var(--text-muted); cursor:pointer; text-decoration:underline}
.kb-brand-field{display:flex; flex-direction:column; gap:4px}
.kb-brand-field span{font-size:11px; color:var(--text-muted)}
.kb-brand-field .kb-input{width:100%; padding:6px 8px; border:1px solid var(--line); border-radius:4px; background:var(--surface)}
.kb-brand-actions{display:flex; justify-content:flex-end; gap:8px; margin-top:2px}

.kb-markupmode{display:inline-flex; background:var(--surface-sunken); border:1px solid var(--line); border-radius:8px; padding:2px}
.kb-markupmode-btn{font:inherit; font-size:12px; padding:5px 10px; border:none; background:none; color:var(--text-muted); cursor:pointer; border-radius:6px; transition:background .15s ease, color .15s ease}
.kb-markupmode-btn.is-active{background:var(--surface); color:var(--text); box-shadow:0 1px 2px rgba(20,30,50,.06)}

.kb-import{margin-bottom:16px}
.kb-import-zone{display:flex; align-items:center; gap:12px; padding:14px 16px; border:1px dashed var(--line-strong); border-radius:8px; background:var(--surface-sunken); color:var(--text-muted); cursor:pointer; transition:border-color .15s ease, background .15s ease}
.kb-import-zone.is-over{border-color:var(--accent); background:var(--accent-soft)}
.kb-import-text{display:flex; flex-direction:column; gap:2px; flex:1; min-width:0}
.kb-import-text strong{color:var(--text); font-size:var(--fs-sm); font-weight:var(--fw-semibold)}
.kb-import-text span{font-size:12px}
.kb-import-msg.is-error{color:#C0392B}
.kb-import-msg.is-success{color:#1E874B}
.kb-import-again{background:none; border:1px solid var(--line); border-radius:5px; padding:4px 8px; font-size:11px; color:var(--text-muted); cursor:pointer; white-space:nowrap}
.kb-import-again:hover{color:var(--text); border-color:var(--line-strong)}

.kb-ext-commission .kb-ext-stage-head{border-top:1px dashed var(--line-strong)}
.kb-ext-commission .kb-ext-stage-name{font-style:italic; color:var(--text-muted)}

/* ---- рефактор: минимальная шапка + лого-меню ---- */
.kb-header-min{gap:12px;background:var(--surface);height:var(--kb-header-h)}
.kb-crumbs{display:flex; align-items:center; gap:8px; min-width:0}
.kb-crumb-link{background:none; border:none; padding:0; color:var(--text-muted); font-size:var(--fs-sm); cursor:pointer}
.kb-crumb-link:hover{color:var(--text)}
.kb-crumb-sep{color:var(--text-faint)}
.kb-logomenu{position:relative}
.kb-logomenu-btn{display:inline-flex; align-items:center; gap:5px; background:none; border:1px solid transparent; border-radius:6px; padding:4px 6px; cursor:pointer; color:var(--text-muted)}
.kb-logomenu-btn:hover{background:var(--surface-sunken); border-color:var(--line)}
.kb-logomenu-pop{position:absolute; top:calc(100% + 6px); left:0; z-index:50; min-width:220px; background:var(--surface); border:1px solid var(--line); border-radius:8px; box-shadow:0 8px 28px rgba(20,30,50,.10); padding:6px}
.kb-logomenu-item{display:flex; align-items:center; gap:9px; width:100%; background:none; border:none; padding:9px 10px; border-radius:6px; font:inherit; font-size:var(--fs-sm); color:var(--text); cursor:pointer; text-align:left}
.kb-logomenu-item:hover{background:var(--surface-sunken)}

/* ---- правая панель ---- */
.kb-rightpanel{width:338px; flex-shrink:0; background:var(--surface); border-left:1px solid var(--line-strong); display:flex; flex-direction:column; overflow:hidden; padding:6px 0}
.kb-rp-grow{flex:1; min-height:0; overflow-y:auto}
.kb-rp-sec{padding:16px 18px; border-bottom:1px solid var(--line)}
.kb-rp-sec:last-child{border-bottom:none}
.kb-rp-title{font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--text-muted); font-weight:var(--fw-semibold); margin-bottom:10px}
.kb-viewtoggle-full{width:100%} .kb-viewtoggle-full .kb-viewtoggle-btn{flex:1}
.kb-rp-markup{margin-top:0}
.kb-rp-markup .kb-markup-input{max-width:56px}

/* ---- свойства ---- */
.kb-props{display:flex; flex-direction:column; gap:6px}
.kb-props-kind{font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--text-faint)}
.kb-props-name{font-size:var(--fs-md); font-weight:var(--fw-semibold); color:var(--text); line-height:1.3}
.kb-props-meta{font-size:13px; color:var(--text-muted)}
.kb-props-figure{font-size:20px; font-weight:var(--fw-semibold); color:var(--text); font-variant-numeric:tabular-nums; margin:2px 0 6px}
.kb-props-sub{font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--text-faint); margin-top:8px}
.kb-props-row{display:flex; justify-content:space-between; gap:10px; font-size:14px; color:var(--text); padding:4px 0; border-bottom:1px solid var(--line)}
.kb-props-row:last-child{border-bottom:none}
.kb-props-row span:first-child{color:var(--text-muted); min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.kb-props-row span:last-child{font-variant-numeric:tabular-nums; white-space:nowrap}
.kb-props-empty{font-size:13px; color:var(--text-faint); line-height:1.5}
.kb-props-empty-sm{font-size:12px; color:var(--text-faint)}
.kb-props-counts{display:flex; gap:14px; margin:6px 0 4px}
.kb-props-count{display:flex; flex-direction:column; line-height:1.15}
.kb-props-count b{font-size:16px; font-weight:var(--fw-semibold); color:var(--text); font-variant-numeric:tabular-nums}
.kb-props-count span{font-size:11px; color:var(--text-muted)}
.kb-props-taskblock{padding:6px 0; border-bottom:1px solid var(--line)}
.kb-props-taskblock:last-child{border-bottom:none}
.kb-props-taskrow{border-bottom:none; padding:0}
.kb-props-taskrow span:first-child{color:var(--text); font-weight:var(--fw-medium)}
.kb-props-names{font-size:12px; color:var(--text-muted); margin-top:3px; line-height:1.4}
.kb-person{border-bottom:1px solid var(--line)}
.kb-person:last-child{border-bottom:none}
.kb-person-head{display:flex; justify-content:space-between; align-items:flex-start; gap:10px; padding:6px 0}
.kb-person-head.is-multi{cursor:pointer}
.kb-person-l{display:flex; align-items:center; gap:5px; min-width:0}
.kb-person-chev{color:var(--text-muted); transition:transform .15s ease; flex-shrink:0}
.kb-person-chev.is-open{transform:rotate(180deg)}
.kb-person-name{font-size:13px; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.kb-person-r{display:flex; flex-direction:column; align-items:flex-end; gap:1px; flex-shrink:0}
.kb-person-sum{font-size:13px; color:var(--text); font-variant-numeric:tabular-nums; white-space:nowrap}
.kb-person-cube{font-size:11px; color:var(--text-muted)}
.kb-person-cubes{padding:2px 0 6px 17px}
.kb-person-cube-row{border-bottom:none; padding:3px 0; font-size:12px}
.kb-person-taskcube{color:var(--text-faint)}
.kb-person-cube-row{align-items:center}
.kb-props-row{align-items:center}
.kb-props .kb-props-row span.kb-person-task{display:flex; align-items:baseline; min-width:0; flex:1; overflow:hidden; white-space:nowrap}
.kb-person-taskname{overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0}
.kb-person-taskcube{flex-shrink:0; white-space:nowrap}
.kb-person-cellsum{flex-shrink:0; font-variant-numeric:tabular-nums; white-space:nowrap; margin-left:8px}
.kb-props-sub-toggle{display:flex; align-items:center; justify-content:space-between; width:100%; background:none; border:none; padding:0; margin-top:8px; cursor:pointer; font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--text-faint); font-weight:var(--fw-semibold)}
.kb-props-sub-toggle .kb-person-chev{color:var(--text-muted)}
.kb-props-section-title,.kb-props-sub-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;background:none;border:none;padding:0;margin:2px 0 5px;font-size:12px;font-weight:var(--fw-semibold);text-transform:none;letter-spacing:normal;color:var(--text);text-align:left}.kb-props-section-toggle,.kb-props-sub-toggle{cursor:pointer;margin-top:16px}.kb-props-section-toggle:hover,.kb-props-sub-toggle:hover{color:var(--text)}.kb-props-row-nested span:first-child{padding-left:8px;color:var(--text-faint)}
.kb-task-collapse{flex-shrink:0}
/* п.13: короче поля названий этапа/задачи, свободная зона head кликабельна для выделения */
.kb-stage-head .kb-input-flex{flex:0 1 320px; margin-right:auto}
.kb-task-head > .kb-autocomplete{flex:1 1 auto; min-width:0; margin-right:auto}
.kb-task-name{width:100%; min-width:0; max-width:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
/* п.8: «Новый кубик» */
.kb-newcube{width:100%; justify-content:flex-start; color:var(--text-muted)}
.kb-newcube:hover{color:var(--text)}
/* п.6 налог в правой панели */
.kb-tax-row{display:grid; grid-template-columns:minmax(0,1fr) 70px 56px; align-items:center; gap:8px; margin-top:8px}
.kb-tax-row .kb-markup-label{min-width:0}
.kb-tax-spacer{width:70px}
.kb-tax-type{width:70px; padding:5px 6px; border:1px solid var(--line-strong); border-radius:6px; background:var(--surface); font:inherit; font-size:var(--fs-sm); color:var(--text)}
.kb-tax-input{max-width:56px; border:1px solid var(--line-strong); background:var(--surface); text-align:right}
.kb-task-reorder-over{box-shadow:inset 0 2px 0 var(--accent)}
.kb-task-dragging{opacity:.45}
.kb-tree-collapse{flex-shrink:0}
/* п.7 кубик налога у исполнителя */
.kb-tag-taxwrap{display:inline-flex; align-items:center; gap:5px; flex:1; min-width:0}
.kb-tag-taxlabel{color:var(--text-muted); font-size:var(--fs-xs); white-space:nowrap}
.kb-tag-taxinput{width:44px; min-width:44px; max-width:44px; flex:0 0 44px; text-align:right; cursor:text}
.kb-tag-taxpct{color:var(--text-muted); font-size:12px; flex:0 0 auto}
.kb-tpl-add{display:inline-flex; align-items:center; gap:5px; width:100%; justify-content:flex-start; margin-top:4px; padding:6px 8px; border:1px dashed var(--line-strong); border-radius:6px; background:none; color:var(--text-muted); font:inherit; font-size:11.5px; cursor:pointer}
.kb-tpl-add:hover{color:var(--text); border-color:var(--text-faint)}
.kb-tpl-soon{color:var(--accent); font-weight:var(--fw-medium)}
.kb-palette-foot{flex:0 0 auto; position:relative; margin-top:0; padding:14px; font-size:11px; color:var(--text-faint); line-height:1.45; border-top:1px solid var(--line)}
.kb-feedback-float{position:absolute; z-index:3; left:25px; bottom:calc(100% + 12px); display:grid; place-items:center; width:auto; height:45px; padding:0 16px; border:0; border-radius:12px; background:linear-gradient(145deg,#2ea3ff,#2698ff); color:#fff; font:inherit; font-size:13px; font-weight:600; white-space:nowrap; box-shadow:0 10px 24px rgba(38,152,255,.3); cursor:pointer; transition:box-shadow .18s ease, background .15s ease, filter .15s ease}
.kb-feedback-float:hover{background:linear-gradient(145deg,#1f8cf2,#1877dc); box-shadow:0 13px 30px rgba(38,152,255,.38)}
.kb-brand-logo-sq{width:56px; height:56px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; border:1px dashed var(--line-strong); border-radius:8px; background:var(--surface-sunken); color:var(--text-muted); cursor:pointer; overflow:hidden}
.kb-brand-logo-lbl{font-size:10px}
.kb-brand-input{width:100%; padding:7px 9px; border:1px solid var(--line); border-radius:6px; background:var(--surface); font-size:var(--fs-sm)}
.kb-tag-grip{display:flex; align-items:center; color:var(--text-faint); cursor:grab; margin:0 -1px 0 -3px}
.kb-tag-grip:active{cursor:grabbing}
.kb-tag-filled:hover .kb-tag-grip{color:var(--text-muted)}

.kb-ext-stage-head-sel{cursor:pointer; border-radius:6px; transition:background .12s ease}
.kb-ext-stage-head-sel:hover{background:var(--surface-sunken)}
.kb-ext-stage-active > .kb-ext-stage-head-sel{background:var(--accent-soft)}
.kb-ext-stage-active{outline:1px solid var(--accent); outline-offset:2px; border-radius:8px}

/* ---- экспорт в панели ---- */
.kb-export-row{display:flex; gap:8px}
.kb-export-btn{flex:1; justify-content:center}
.kb-export-brandrow{position:relative; margin-top:8px}
.kb-export-brandbtn{display:inline-flex; align-items:center; gap:6px; background:none; border:none; padding:2px 0; font-size:12px; color:var(--text-muted); cursor:pointer}
.kb-export-brandbtn:hover{color:var(--text)}
.kb-export-hint{font-size:11px; color:var(--text-faint); margin-top:8px}
.kb-export-top{display:flex; gap:6px; align-items:center}
.kb-fmt{position:relative; flex:1}
.kb-fmt-btn{width:100%; display:flex; align-items:center; justify-content:space-between; gap:8px; padding:7px 10px; border:1px solid var(--line); border-radius:7px; background:var(--surface); color:var(--text); font:inherit; font-size:var(--fs-sm); cursor:pointer}
.kb-fmt-btn:hover{border-color:var(--line-strong)}
.kb-fmt-menu{position:absolute; top:calc(100% + 4px); left:0; right:0; z-index:30; background:var(--surface); border:1px solid var(--line); border-radius:7px; box-shadow:0 8px 24px rgba(20,30,50,.10); padding:4px}
.kb-fmt-item{width:100%; text-align:left; padding:7px 9px; border:none; background:none; border-radius:5px; font:inherit; font-size:var(--fs-sm); color:var(--text); cursor:pointer}
.kb-fmt-item:hover{background:var(--surface-sunken)}
.kb-fmt-item.is-active{background:var(--surface-sunken); font-weight:var(--fw-medium)}
.kb-export-dots-wrap{position:relative}
.kb-export-dots{display:flex; align-items:center; justify-content:center; width:34px; height:34px; border:1px solid var(--line); border-radius:7px; background:var(--surface); color:var(--text-muted); cursor:pointer}
.kb-export-dots:hover{border-color:var(--line-strong); color:var(--text)}
.kb-export-go2{width:100%; margin-top:8px; padding:8px 12px; border:1px solid var(--line-strong); border-radius:7px; background:var(--surface); color:var(--text); font:inherit; font-size:var(--fs-sm); font-weight:var(--fw-medium); cursor:pointer; display:flex; align-items:center; justify-content:center; gap:7px}
.kb-export-go2:hover{background:var(--surface-sunken)}
.kb-export-go2:disabled{opacity:.6; cursor:default}

/* брендинг: панель слева от правой панели, компактная */
.kb-brand-pop{position:absolute; top:0; right:calc(100% + 10px); left:auto; z-index:40; width:270px; padding:14px; background:var(--surface); border:1px solid var(--line); border-radius:10px; box-shadow:0 12px 34px rgba(20,30,50,.14); display:flex; flex-direction:column; gap:12px}
.kb-brand-title{font-size:var(--fs-sm); font-weight:var(--fw-semibold); color:var(--text)}
.kb-brand-row{display:flex; gap:10px; align-items:flex-start}
.kb-brand-logo-col{flex-shrink:0; display:flex; flex-direction:column; align-items:center; gap:4px}
.kb-brand-logo-sq{flex-shrink:0; width:52px; height:52px; display:flex; align-items:center; justify-content:center; border:1px dashed var(--line-strong); border-radius:8px; background:var(--surface-sunken); color:var(--text-muted); cursor:pointer; overflow:hidden}
.kb-brand-logo-img{max-width:100%; max-height:100%; object-fit:contain}
.kb-brand-info{flex:1; min-width:0; display:flex; flex-direction:column; gap:5px}
.kb-brand-info-input{width:100%; resize:vertical; padding:7px 8px; border:1px solid var(--line); border-radius:6px; background:var(--surface); font:inherit; font-size:12px; line-height:1.4}
.kb-brand-clear{align-self:flex-start; background:none; border:none; padding:0; font-size:11px; color:var(--text-muted); cursor:pointer; text-decoration:underline}
.kb-brand-actions{display:flex; justify-content:flex-end; gap:8px}
.kb-brand-save{border:1px solid var(--line-strong)}

/* ---- панели импорта/ИИ-описания под большой кнопкой «Новый этап» в пустой зоне ---- */
.kb-import-empty{display:flex; flex-direction:column; align-items:center; gap:10px; padding:14px 0 8px; width:100%}
.kb-import-empty-or{font-size:12px; color:var(--text-faint)}
.kb-import-panels{display:flex; gap:12px; width:100%; max-width:720px}
.kb-import-panel{flex:1; min-width:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; text-align:center;
  padding:18px 16px; border:1.5px dashed var(--line-strong); border-radius:10px; background:var(--surface-sunken); color:var(--text-muted);
  cursor:pointer; transition:border-color .15s ease, background .15s ease}
.kb-import-panel.is-over{border-color:var(--accent); background:var(--accent-soft)}
.kb-import-panel-generate{cursor:default; border-style:solid; border-color:var(--line); background:var(--surface); align-items:stretch; text-align:left; gap:7px}
.kb-import-panel-title{font-size:var(--fs-sm); font-weight:var(--fw-semibold); color:var(--text); display:flex; align-items:center; gap:6px; justify-content:center}
.kb-import-panel-generate .kb-import-panel-title{justify-content:flex-start}
.kb-import-panel-sub{font-size:11px; line-height:1.4; max-width:220px}
.kb-import-panel-btn{align-self:flex-end}
.kb-import-panel-unified{position:relative; width:100%; height:100px; min-height:100px; overflow:hidden; cursor:default; border-style:solid; border-color:var(--line); background:#fff; align-items:stretch; justify-content:stretch; text-align:left; gap:0; padding:12px 16px}
.kb-import-panel-unified.is-over,.kb-import-panel-unified.is-over:hover{border-color:var(--accent); background:var(--accent-soft)}
.kb-import-panel-unified .kb-import-panel-title{justify-content:flex-start}
.kb-unified-input{position:static; display:flex; flex:1; min-height:0}
.kb-unified-input .kb-generate-textarea{height:100%; min-height:0; resize:none; overflow-y:auto; padding:4px 70px 36px 4px; border:none; border-radius:0; background:transparent; box-shadow:none}
.kb-unified-input .kb-generate-textarea:focus{border:none; outline:none; box-shadow:none}
.kb-attach-btn{position:absolute; right:46px; bottom:12px; color:var(--text-muted)}
.kb-send-btn{position:absolute; right:12px; bottom:12px; width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center; padding:0; border:1px solid #1553c6; border-radius:7px; background:linear-gradient(145deg,#2974f0,#1553c6); color:#fff; cursor:pointer}
.kb-send-btn:hover:not(:disabled){border-color:#1553c6; background:linear-gradient(145deg,#347df3,#195bcf); color:#fff}
.kb-send-btn:disabled{border-color:var(--line-strong); background:#fff; color:var(--text-muted); opacity:1; cursor:default}
.kb-import-panel-unified .kb-attached-file{position:absolute; left:12px; bottom:12px; width:28px; height:28px; padding:0; justify-content:center; border-radius:6px; overflow:visible}
.kb-import-panel-unified .kb-attached-file > span{display:none}
.kb-import-panel-unified .kb-attached-file .kb-icon-btn{position:absolute; top:-7px; right:-7px; width:16px; height:16px; min-width:16px; padding:0; border:1px solid var(--line); border-radius:50%; background:#fff}
.kb-import-entry{display:flex; flex-direction:column; gap:8px; width:100%; max-width:720px}
.kb-import-panel-actions{display:flex; align-items:center; justify-content:flex-end; gap:8px}
.kb-import-panel-actions .kb-btn{background:#fff}
.kb-import-panel-minimal{min-height:100px; padding:12px; border-style:solid; border-color:var(--line); background:#fff; color:var(--text-muted)}
.kb-import-file-field{cursor:pointer}
.kb-import-description-field{cursor:default; align-items:stretch; text-align:left}
.kb-import-description-field .kb-generate-textarea{flex:1; min-height:74px; resize:none; border:none; border-radius:0; background:#fff; padding:4px}
.kb-import-description-field .kb-generate-textarea:focus{border-color:transparent}
.kb-attached-file{display:flex; align-items:center; gap:7px; align-self:flex-start; max-width:100%; padding:5px 7px; border:1px solid var(--line); border-radius:6px; background:var(--surface-sunken); color:var(--text-muted); font-size:12px}
.kb-attached-file span{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}

/* ---- модалка импорта: превью и выбор листа ---- */
.kb-modal-overlay{position:fixed; inset:0; z-index:100; background:rgba(20,30,50,.28); display:flex; align-items:center; justify-content:center; padding:24px}
.kb-modal{background:var(--surface); border:1px solid var(--line); border-radius:12px; box-shadow:0 24px 60px rgba(20,30,50,.22); width:100%; max-width:560px; max-height:86vh; display:flex; flex-direction:column; overflow:hidden}
.kb-modal-head{display:flex; align-items:center; justify-content:space-between; padding:16px 18px; border-bottom:1px solid var(--line); flex-shrink:0}
.kb-modal-title{font-size:var(--fs-md); font-weight:var(--fw-semibold); color:var(--text)}
.kb-modal-body{padding:16px 18px; overflow-y:auto; min-height:0; flex:1 1 auto}
.kb-modal-note{font-size:12px; color:var(--text-muted); margin-bottom:12px; line-height:1.5}
.kb-modal-status{display:flex; align-items:center; gap:10px; padding:32px 18px; justify-content:center; color:var(--text-muted); font-size:var(--fs-sm)}
.kb-modal-status.is-error{color:#C0392B}
.kb-modal-actions{display:flex; justify-content:flex-end; gap:8px; margin-top:14px}
.kb-modal-foot{border-top:1px solid var(--line); padding:12px 18px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-shrink:0}
.kb-prev-summary{font-size:12px; color:var(--text-muted); font-variant-numeric:tabular-nums}

.kb-sheet-list{display:flex; flex-direction:column; gap:6px}
.kb-sheet-btn{display:flex; align-items:center; gap:9px; padding:11px 12px; border:1px solid var(--line); border-radius:8px; background:var(--bg); color:var(--text); font:inherit; font-size:var(--fs-sm); cursor:pointer; text-align:left}
.kb-sheet-btn:hover{border-color:var(--accent); background:var(--accent-soft)}

.kb-import-preview{display:flex; flex-direction:column; gap:14px; overflow-y:auto}
.kb-import-preview > *{flex-shrink:0}
.kb-prev-stage{border:1px solid var(--line); border-radius:8px; overflow:hidden; flex:0 0 auto}
.kb-prev-project-name{width:100%; margin-bottom:10px; font-weight:var(--fw-semibold)}
.kb-prev-stage-head{display:flex; align-items:center; gap:6px; padding:6px 8px 6px 10px; background:var(--surface-sunken); border-bottom:1px solid var(--line)}
.kb-prev-stage-name{flex:1; font-weight:var(--fw-semibold); border:none; background:none; padding:4px 2px}
.kb-prev-task{display:grid; grid-template-columns:minmax(120px,1fr) minmax(0,1.65fr) auto; align-items:start; gap:10px; padding:8px 8px 8px 10px; border-bottom:1px solid var(--line); min-width:0}
.kb-prev-task:last-child{border-bottom:none}
.kb-prev-task-name{width:100%; min-width:0; border:1px solid transparent; border-radius:4px; padding:4px 6px; background:none}
.kb-prev-task-name:hover,.kb-prev-task-name:focus{border-color:var(--line); background:var(--surface)}
.kb-prev-executors{display:flex; flex-direction:column; gap:6px; min-width:0}
.kb-prev-executor{display:flex; flex-wrap:wrap; align-items:baseline; gap:4px 10px; min-width:0; padding:5px 7px; border-radius:6px; background:var(--surface-sunken)}
.kb-prev-executor-name{flex:1 1 100%; min-width:0; overflow-wrap:anywhere; font-size:12px; font-weight:var(--fw-medium); color:var(--text)}
.kb-prev-executor-field{display:inline-flex; flex:0 1 auto; min-width:0; max-width:100%; gap:4px; color:var(--text-muted); line-height:1.35; overflow-wrap:anywhere}
.kb-prev-executor-field b{color:var(--text-faint); font-weight:var(--fw-medium)}
@media(max-width:520px){.kb-prev-task{grid-template-columns:minmax(0,1fr) auto}.kb-prev-task-name,.kb-prev-executors{grid-column:1}.kb-prev-task>.kb-icon-btn{grid-column:2;grid-row:1}}
.kb-prev-task-cost{width:96px; text-align:right; border:1px solid var(--line); border-radius:4px; padding:4px 6px; background:var(--surface)}
.kb-prev-cur{color:var(--text-muted); font-size:12px}
.kb-prev-warnings{border:1px dashed var(--line-strong); border-radius:8px; padding:10px 12px; background:var(--surface-sunken)}
.kb-prev-warn-title{display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-muted); margin-bottom:6px}
.kb-prev-warn-item{font-size:12px; color:var(--text-faint); padding:2px 0; line-height:1.4}

.kb-import-kind{border:1px solid var(--line); border-radius:8px; padding:12px; background:var(--surface-sunken); display:flex; flex-direction:column; gap:8px; margin-bottom:14px; flex-shrink:0}
.kb-import-kind-q{font-size:var(--fs-sm); font-weight:var(--fw-medium); color:var(--text)}
.kb-import-kind-opts{display:flex; gap:6px}
.kb-import-kind-opt{padding:6px 14px; border:1px solid var(--line); border-radius:6px; background:var(--surface); color:var(--text); font:inherit; font-size:var(--fs-sm); cursor:pointer}
.kb-import-kind-opt:hover{border-color:var(--line-strong)}
.kb-import-kind-opt.is-active{background:var(--accent); border-color:var(--accent); color:#fff}
.kb-import-kind-markup{display:flex; align-items:center; gap:8px}
.kb-import-kind-marklbl{font-size:12px; color:var(--text-muted)}
.kb-import-kind-markup .kb-input-num{width:80px}
.kb-import-kind-result{font-size:12px; color:var(--text); font-variant-numeric:tabular-nums}
.kb-import-kind-warn{font-size:12px; color:#B36B00; display:flex; flex-direction:column; gap:2px}
.kb-import-kind-hint{font-size:11px; color:var(--text-faint); line-height:1.5}

/* ---- крупная пометка «черновая оценка» и допущения ИИ в превью генерации по описанию ---- */
.kb-draft-notice{display:flex; align-items:center; gap:8px; padding:10px 12px; border-radius:8px; margin-bottom:12px;
  background:#FFF4E0; border:1px solid #F0C57A; color:#7A4E00; font-size:12px; font-weight:var(--fw-medium); line-height:1.4}
.kb-prev-warnings-lg{border:1.5px solid #F0C57A; background:#FFF9EE; padding:12px 14px}
.kb-prev-warnings-lg .kb-prev-warn-title{font-size:13px; font-weight:var(--fw-semibold); color:#7A4E00; margin-bottom:8px}
.kb-prev-warnings-lg .kb-prev-warn-item{font-size:13px; color:#8A5A00; padding:3px 0}

/* ---- поле «опишите проект» в компактной панели ИИ-описания ---- */
.kb-generate-textarea{width:100%; resize:vertical; min-height:40px; padding:8px 9px; border:1px solid var(--line); border-radius:7px; background:var(--surface-sunken); color:var(--text); font:inherit; font-size:12.5px; line-height:1.4}
.kb-generate-textarea:focus{outline:none; border-color:var(--accent)}
.kb-generate-head{display:flex; align-items:center; justify-content:space-between; gap:8px}
.kb-generate-tooltip-wrap{position:relative; display:inline-flex}
.kb-generate-help-icon{display:inline-flex; align-items:center; justify-content:center;
  color:var(--text-muted); cursor:help; transition:color .15s ease}
.kb-generate-help-icon:hover{color:var(--accent)}
.kb-generate-tooltip{position:absolute; top:calc(100% + 8px); right:0; z-index:50;
  width:280px; padding:10px 12px; border-radius:8px; border:1px solid var(--line);
  background:var(--surface); box-shadow:0 8px 28px rgba(20,30,50,.14);
  font-size:11px; line-height:1.55; color:var(--text-muted);
  opacity:0; visibility:hidden; pointer-events:none; transition:opacity .18s ease, visibility .18s ease}
.kb-generate-tooltip::before{content:""; position:absolute; top:-6px; right:8px;
  width:10px; height:10px; background:var(--surface); border:1px solid var(--line);
  border-bottom:none; border-right:none; transform:rotate(45deg)}
.kb-generate-tooltip-wrap:hover .kb-generate-tooltip{opacity:1; visibility:visible}

/* ---- кнопка «Сохранить смету как шаблон» в шапке ---- */
.kb-save-project-btn{display:inline-flex; align-items:center; gap:6px;
  background:var(--accent-soft); border:1px solid var(--line); border-radius:7px;
  color:var(--accent); font:inherit; font-size:var(--fs-sm); font-weight:var(--fw-medium);
  padding:6px 13px; cursor:pointer; transition:all .15s ease}
.kb-save-project-btn:hover{background:var(--accent); color:#fff; border-color:var(--accent)}
.kb-collapse-all-btn{position:sticky; top:8px; z-index:12; display:flex; align-items:center; gap:4px; width:max-content; margin:0 0 14px;
  padding:3px 6px; border:1px solid var(--line); border-radius:5px; background:var(--bg);
  color:var(--text-muted); font:inherit; font-size:11px; line-height:1.2; cursor:pointer;
  transition:transform .18s ease, padding .18s ease, gap .18s ease, background .18s ease, box-shadow .18s ease}
.kb-collapse-all-btn span{max-width:90px; overflow:hidden; white-space:nowrap; opacity:1;
  transition:max-width .18s ease, opacity .12s ease}
.kb-collapse-all-btn.is-compact{transform:translateX(-20px); gap:0; padding:5px; background:var(--surface);
  box-shadow:0 2px 8px rgba(20,30,50,.12)}
.kb-collapse-all-btn.is-compact span{max-width:0; opacity:0}
.kb-collapse-all-btn:hover{background:var(--surface-sunken); color:var(--text)}

/* ---- шаблоны в левой панели ---- */
.kb-pal-templates{margin-top:10px}
.kb-pal-tmp-label{font-size:11px; color:var(--text-faint); text-transform:uppercase;
  letter-spacing:.05em; font-weight:var(--fw-medium); padding:0 2px; margin-bottom:5px}
.kb-template-item{display:flex; align-items:center; gap:6px; padding:5px 7px; border-radius:5px;
  font-size:13px; cursor:grab; transition:background .12s ease;
  user-select:none; color:var(--text-muted)}
.kb-template-item:hover{background:var(--accent-soft)}
.kb-template-item:active{cursor:grabbing}
.kb-template-item-name{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.kb-template-item-sum{flex:none; color:var(--text); font-size:13px; font-variant-numeric:tabular-nums; white-space:nowrap}
.kb-template-item-del{flex-shrink:0; display:inline-flex; align-items:center; justify-content:center;
  width:18px; height:18px; border:none; border-radius:4px; background:transparent;
  color:var(--text-faint); cursor:pointer; transition:all .12s ease}
.kb-template-item-del:hover{background:var(--surface-sunken); color:var(--text-muted)}
.kb-template-empty{padding:7px 2px 3px; color:var(--text-faint); font-size:var(--fs-sm)}

/* ---- модалка сохранения проекта как шаблона ---- */
.kb-tpl-modal-overlay{position:fixed; inset:0; z-index:110;
  display:flex; align-items:center; justify-content:center;
  background:rgba(10,18,28,.35); backdrop-filter:blur(3px)}
.kb-tpl-modal{background:var(--surface); border:1px solid var(--line); border-radius:12px;
  padding:24px; min-width:360px; max-width:460px; box-shadow:0 16px 48px rgba(20,30,50,.16)}
.kb-tpl-modal-title{font-size:var(--fs-md); font-weight:var(--fw-semibold); margin-bottom:14px; color:var(--text)}
.kb-tpl-modal-input{display:block; width:100%; padding:8px 10px; border:1px solid var(--line);
  border-radius:7px; font:inherit; font-size:var(--fs-base); background:var(--surface-sunken);
  color:var(--text); margin-bottom:16px}
.kb-tpl-modal-input:focus{outline:none; border-color:var(--accent)}
.kb-tpl-modal-actions{display:flex; justify-content:flex-end; gap:8px}

/* ---- выпадающее меню «Новый проект» на дашборде ---- */
.kb-create-wrapper{position:relative}
.kb-create-menu{position:absolute; top:calc(100% + 6px); left:0; z-index:30;
  min-width:200px; background:var(--surface); border:1px solid var(--line);
  border-radius:10px; padding:5px; box-shadow:0 12px 36px rgba(20,30,50,.12)}
.kb-create-menu-item{display:flex; align-items:center; gap:8px; width:100%; padding:8px 10px;
  border:none; border-radius:6px; background:transparent; color:var(--text);
  font:inherit; font-size:var(--fs-sm); cursor:pointer; transition:background .1s ease}
.kb-create-menu-item:hover{background:var(--accent-soft)}
.kb-create-menu-divider{height:1px; background:var(--line); margin:3px 6px}
.kb-create-menu-meta{font-size:10px; color:var(--text-faint); margin-left:auto}

/* ---- иконка закладки на исполнителе ---- */
.kb-executor-bookmark{flex-shrink:0; display:inline-flex; align-items:center; justify-content:center;
  width:22px; height:22px; border:none; border-radius:4px; background:transparent;
  color:var(--text-faint); cursor:pointer; transition:all .12s ease}
.kb-executor-bookmark:hover{color:var(--accent); background:var(--accent-soft)}

/* ============================================================
   Dashboard: layout с навигационной боковой панелью
   ============================================================ */
.kb-dashboard-layout{display:flex; align-items:stretch; flex:1; min-height:0; overflow:hidden;
  width:100%; max-width:none; margin:0}
.kb-dash-sidebar{width:var(--dash-sidebar-w); flex-shrink:0; background:var(--surface);
  border-right:1px solid var(--line-strong);
  display:flex; flex-direction:column; gap:0; overflow:hidden; min-height:0}
.kb-dash-sidebar-scroll{flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; padding:14px 12px 22px; display:flex; flex-direction:column; gap:2px}
.kb-dash-sidebar-foot{flex:0 0 auto; position:relative; margin-top:0; padding:14px; border-top:1px solid var(--line)}
.kb-dash-resizer{position:relative; flex:0 0 9px; cursor:col-resize; touch-action:none; background:transparent}
.kb-dash-resizer::after{content:""; position:absolute; top:0; bottom:0; left:4px; width:1px; background:transparent; transition:background .12s}
.kb-dash-resizer:hover::after,.kb-is-panel-resizing .kb-dash-resizer::after{background:var(--line-strong)}

/* метка секции навигации */
.kb-dash-nav-section-label{font-size:12px; font-weight:var(--fw-semibold);
  letter-spacing:normal; color:var(--text);
  padding:8px 6px; user-select:none}

/* пункт навигации */
.kb-dash-nav-item{display:flex; align-items:center; gap:8px; width:100%;
  border:none; border-radius:6px; padding:7px 8px; background:transparent;
  font:inherit; font-size:var(--fs-sm); font-weight:var(--fw-medium);
  color:var(--text-muted); cursor:pointer; transition:background .12s ease; text-align:left}
.kb-dash-nav-item:hover{background:var(--accent-soft)}
.kb-dash-nav-item > span{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.kb-dash-nav-item-active{background:var(--accent-soft); color:var(--text-muted); box-shadow:none}

/* разделитель секций */
.kb-dash-nav-divider{height:1px; background:var(--line); margin:12px 4px 16px}

/* строка папки категории с действиями */
.kb-dash-nav-folder-row{display:flex; align-items:center; gap:2px;
  min-height:30px; border-radius:4px; transition:background .12s ease}
.kb-dash-nav-folder-row:hover{background:var(--accent-soft)}
.kb-dash-nav-folder-row:hover .kb-dash-nav-folder-actions{opacity:1}
.kb-dash-nav-folder-row > .kb-dash-nav-item{flex:1; min-width:0}
.kb-dash-nav-folder-actions{display:flex; align-items:center; gap:1px;
  opacity:0; padding-right:2px; transition:opacity .12s ease}
.kb-dash-nav-folder-row.kb-dash-nav-item-active{background:var(--accent-soft); box-shadow:none}
.kb-tree-toggle{display:flex; align-items:center; justify-content:center; flex:none; width:22px; align-self:stretch; padding:0 0 0 4px; border:0; background:transparent; color:var(--text-faint); cursor:pointer}
.kb-tree-toggle:hover{color:var(--text-muted)}
.kb-tree-folder-btn{padding-left:2px}
.kb-template-tree-files{display:flex; flex-direction:column; margin-left:23px; padding:1px 0 5px 7px; gap:0; border-left:1px solid var(--line)}
.kb-template-tree-file{display:flex; align-items:center; gap:6px; width:100%; min-width:0; padding:5px 6px; border:0; border-radius:5px; background:transparent; color:var(--text-muted); font:inherit; font-size:12px; text-align:left; cursor:grab}
.kb-template-tree-file:hover{background:var(--accent-soft); color:var(--text)}
.kb-template-tree-file span{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.kb-template-tree-file svg{flex:none}
.kb-template-tree-actions{display:flex; flex:none; gap:1px; opacity:0; transition:opacity .12s ease}
.kb-template-tree-file:hover .kb-template-tree-actions,.kb-template-tree-actions:focus-within{opacity:1}
.kb-template-tree-input{flex:1; min-width:0; padding:2px 4px; border:1px solid var(--line-strong); border-radius:4px; background:var(--surface); color:var(--text); font:inherit; font-size:12px; outline:none}
.kb-template-tree-input:focus{border-color:var(--accent)}
.kb-toast{position:fixed; z-index:200; left:50%; top:50%; transform:translate(-50%,-50%); padding:10px 16px; border:1px solid var(--line); border-radius:9px; background:var(--surface); color:var(--text); box-shadow:0 12px 40px rgba(20,30,50,.16); font-size:var(--fs-sm); font-weight:var(--fw-medium); pointer-events:none; animation:kb-toast-in .16s ease-out}
.kb-toast-dismissible{display:flex;align-items:center;gap:12px;pointer-events:auto}.kb-toast-close{display:grid;place-items:center;width:22px;height:22px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--text-muted);font:inherit;font-size:18px;line-height:1;cursor:pointer}.kb-toast-close:hover{background:var(--surface-sunken);color:var(--text)}
@keyframes kb-toast-in{from{opacity:0; transform:translate(-50%,-46%)}to{opacity:1; transform:translate(-50%,-50%)}}

/* поле ввода при редактировании названия */
.kb-dash-nav-input{flex:1; border:1px solid var(--line-strong); border-radius:5px;
  padding:5px 7px; font:inherit; font-size:var(--fs-sm); background:var(--surface);
  color:var(--text); margin:3px 0}
.kb-dash-nav-input:focus{outline:none; border-color:var(--accent)}

/* кнопка «Новая категория» */
.kb-dash-nav-new-row{padding:5px 4px 0 22px}
.kb-dash-nav-new-btn{display:flex; align-items:center; gap:6px; width:100%;
  border:0; border-radius:4px; padding:6px 7px;
  margin-top:0; background:none; color:var(--text-faint);
  font:inherit; font-size:var(--fs-sm); cursor:pointer; transition:all .12s ease}
.kb-dash-nav-new-btn:hover{color:var(--text-muted); background:var(--surface-sunken)}

.kb-dash-empty{grid-column:1 / -1; padding:40px; text-align:center; color:var(--text-muted)}
.kb-create-wrapper{width:100%}

.kb-dash-section-title{font-size:var(--fs-sm); font-weight:var(--fw-semibold);
  color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em;
  padding:6px 0 10px; user-select:none}

/* иконка кнопки «малая» без фона — для действий в строке */
.kb-icon-btn-small{display:inline-flex; align-items:center; justify-content:center;
  border:none; border-radius:4px; background:transparent; color:var(--text-faint);
  cursor:pointer; padding:3px; transition:all .12s ease}
.kb-icon-btn-small:hover{color:var(--text)}

/* Библиотека исполнителей использует существующие токены дизайн-системы. */
.kb-performer-quick .kb-palette-title{cursor:default}.kb-performer-quick .kb-palette-title button{margin-left:auto}.kb-performer-all{border:0;background:transparent;color:var(--accent);font:inherit;font-size:var(--fs-xs);padding:7px 2px;cursor:pointer;text-align:left}
.kb-performer-library{padding:28px 34px;min-height:100%;background:var(--bg)}.kb-library-head,.kb-library-tools{display:flex;align-items:center;justify-content:space-between;gap:18px}.kb-library-head h1{font-size:24px;margin:4px 0 20px}.kb-library-back{border:0;background:none;color:var(--text-muted);padding:0;cursor:pointer}.kb-library-tools label{display:flex;align-items:center;gap:8px;flex:1;max-width:560px;border:1px solid var(--line);border-radius:8px;padding:8px 11px;background:var(--surface)}.kb-library-tools input{border:0;outline:0;background:transparent;flex:1;color:var(--text)}.kb-library-tools>div{display:flex;background:var(--surface-sunken);border-radius:7px;padding:2px}.kb-library-tools>div button{border:0;background:transparent;padding:6px 10px;border-radius:5px;color:var(--text-muted);cursor:pointer}.kb-library-tools>div button.active{background:var(--surface);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.08)}
.kb-performer-list{display:flex;flex-direction:column;gap:7px;margin-top:18px}.kb-performer-card{display:flex;align-items:center;gap:16px;padding:13px 14px;border:1px solid var(--line);border-radius:9px;background:var(--surface);cursor:grab}.kb-performer-card-main{display:flex;flex-direction:column;min-width:0;flex:1}.kb-performer-card-main span,.kb-performer-card-main small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kb-performer-card-main span{font-size:var(--fs-sm);color:var(--text-muted)}.kb-performer-card-main small,.kb-performer-rate small{font-size:var(--fs-xs);color:var(--text-faint)}.kb-performer-rate{display:flex;flex-direction:column;text-align:right}.kb-performer-actions{display:flex}.kb-performer-actions button{border:0;background:transparent;color:var(--text-faint);padding:5px;cursor:pointer}.kb-performer-actions button:hover{color:var(--accent)}.kb-library-empty{padding:42px;text-align:center;color:var(--text-muted)}
.kb-performer-form{overflow-y:auto;padding:17px 18px;flex:1}.kb-performer-form section{margin-bottom:22px}.kb-performer-form h3{font-size:var(--fs-sm);margin:0 0 10px}.kb-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.kb-form-grid .wide{grid-column:1/-1}.kb-performer-form label{display:flex;flex-direction:column;gap:5px;font-size:var(--fs-xs);color:var(--text-muted)}.kb-performer-form input,.kb-performer-form select,.kb-performer-form textarea{box-sizing:border-box;width:100%;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--text);font:inherit;padding:8px}.kb-performer-form textarea{min-height:78px;resize:vertical}.kb-performer-chips{position:relative;display:flex;flex-wrap:wrap;gap:6px;align-items:center;box-sizing:border-box;width:100%;min-height:33px;padding:4px 6px;border:1px solid var(--line);border-radius:6px;background:var(--surface)}.kb-performer-chips:hover{border-color:var(--line-strong)}.kb-performer-chips:focus-within{border-color:var(--accent)}.kb-performer-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 6px 3px 8px;border:1px solid var(--line-strong);border-radius:5px;background:var(--surface-sunken);color:var(--text);font-size:var(--fs-xs)}.kb-performer-chip-del{display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;color:var(--text-faint);cursor:pointer;padding:0}.kb-performer-chip-del:hover{color:var(--text)}.kb-performer-chips .kb-performer-chip-input{box-sizing:border-box;width:auto;flex:1 1 auto;min-width:70px;border:0;border-radius:0;background:transparent;color:var(--text);font:inherit;padding:4px 2px;font-size:var(--fs-xs)}.kb-performer-chips .kb-performer-chip-input:focus{outline:none}.kb-performer-chip-caret{display:inline-flex;align-items:center;justify-content:center;flex:none;border:0;background:transparent;color:var(--text-faint);cursor:pointer;padding:2px;border-radius:4px}.kb-performer-chip-caret:hover{color:var(--text);background:var(--surface-sunken)}.kb-performer-chip-suggest{min-width:100%}.kb-performer-selectfield{position:relative}.kb-performer-select{display:flex;align-items:center;justify-content:space-between;gap:8px;box-sizing:border-box;width:100%;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--text);font:inherit;padding:8px;cursor:pointer}.kb-performer-select:hover{border-color:var(--line-strong)}.kb-performer-select-empty{color:var(--text-faint)}.kb-performer-select-caret{color:var(--text-faint);flex-shrink:0}.kb-performer-select-suggest{min-width:100%}.kb-suggest-item-active{background:var(--accent-soft);color:var(--accent)}.kb-performer-ratefield{display:flex;align-items:center;gap:6px}.kb-performer-ratefield input{width:auto;flex:1;min-width:0}.kb-performer-rateunit{color:var(--text-muted);font-size:var(--fs-xs);white-space:nowrap}.kb-performer-form input[type=number]::-webkit-inner-spin-button,.kb-performer-form input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}.kb-performer-form input[type=number]{-moz-appearance:textfield;appearance:textfield}.kb-task-performer-target{position:relative}.kb-task-performer-over{outline:2px solid var(--accent);outline-offset:-2px;border-radius:6px}.kb-performer-drop-label{position:absolute;z-index:5;inset:0;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--accent-soft) 92%,transparent);color:var(--accent);font-size:var(--fs-sm);font-weight:var(--fw-medium);pointer-events:none;border-radius:6px}
.kb-role-combobox .kb-role-combobox-input{width:100%;padding-right:34px}.kb-role-combobox-caret{position:absolute;right:5px;top:50%;transform:translateY(-50%);z-index:1}

.kb-performer-item{gap:6px;padding:7px 8px;font-size:14px}.kb-performer-item .kb-template-item-sum{margin-left:auto}.kb-performer-item-action{display:flex;align-items:center;justify-content:center;flex:none;width:21px;height:21px;padding:0;border:0;border-radius:4px;background:transparent;color:var(--text-faint);cursor:pointer}.kb-performer-item-action:hover,.kb-performer-item-action.is-active{background:var(--surface-sunken);color:var(--accent)}
.kb-performer-modal-backdrop{position:fixed;z-index:150;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(20,30,50,.28)}.kb-performer-modal{width:min(540px,calc(100vw - 32px));max-height:min(760px,calc(100vh - 48px));display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--line);border-radius:12px;background:var(--surface);box-shadow:0 22px 70px rgba(20,30,50,.24)}.kb-performer-modal>header,.kb-performer-modal>footer{display:flex;align-items:center;gap:8px;flex:none;padding:14px 18px;background:var(--surface);z-index:1}.kb-performer-modal>header{justify-content:space-between;border-bottom:1px solid var(--line)}.kb-performer-modal>header>div{display:flex;flex-direction:column}.kb-performer-modal>header small{margin-top:3px;color:var(--text-muted)}.kb-performer-modal>footer{border-top:1px solid var(--line)}.kb-performer-modal .kb-performer-form{min-height:0;overflow-y:auto}.kb-performer-quick-check{display:flex;align-items:center;gap:7px;color:var(--text-muted);font-size:var(--fs-xs);cursor:pointer}.kb-performer-quick-check input{margin:0}

.kb-knowledge-page{width:min(1120px,calc(100% - 48px));margin:0 auto;padding:30px 0 54px}
.kb-knowledge-eyebrow{font-size:var(--fs-xs);color:var(--text-muted);margin-bottom:3px}.kb-knowledge-page h1{margin:0 0 22px;font-size:24px;letter-spacing:-.02em}
.kb-knowledge-page .kb-library-tools label{max-width:620px}.kb-knowledge-page .kb-library-tools .kb-btn,.kb-library-empty-full .kb-btn{display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
.kb-knowledge-page .kb-performer-card{cursor:pointer}.kb-performer-card:hover{border-color:var(--line-strong)}.kb-performer-card-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px}.kb-performer-card-tag{display:inline-flex;align-items:center;gap:4px;padding:3px 6px;border:1px solid var(--line-strong);border-radius:5px;background:var(--surface-sunken);font-size:var(--fs-xs);color:var(--text)}.kb-performer-card-tag-key{border-color:var(--accent)}.kb-performer-card-tag small{font-size:10px;color:var(--text-muted)}.kb-performer-grade-select{flex:none;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--text);font:inherit;font-size:var(--fs-xs);padding:7px 8px}.kb-performer-grade-select:focus{outline:1px solid var(--accent);border-color:var(--accent)}.kb-add-performer-btn{margin-top:10px}
.kb-performer-chip-key{border-color:var(--accent)}
.kb-performer-contact{display:flex;align-items:center;gap:6px;width:220px;min-width:0;color:var(--text-muted);font-size:var(--fs-xs)}.kb-performer-contact span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kb-quick-status{width:128px;color:var(--text-faint);font-size:var(--fs-xs)}.kb-quick-status.is-active{color:var(--accent)}
.kb-performer-actions button.is-danger:hover{color:#c0392b}
.kb-library-empty-full{display:flex;flex-direction:column;align-items:center;gap:8px;padding:72px 24px}.kb-library-empty-full strong{color:var(--text);font-size:var(--fs-md)}.kb-library-empty-full span{margin-bottom:8px}
@media(max-width:760px){.kb-app-header .kb-header-inner{gap:22px}.kb-app-nav{gap:18px}.kb-knowledge-page{width:calc(100% - 28px);padding-top:22px}.kb-library-tools{align-items:stretch;flex-direction:column}.kb-performer-contact,.kb-quick-status{display:none}.kb-performer-card{gap:8px}.kb-form-grid{grid-template-columns:1fr}.kb-form-grid .wide{grid-column:auto}.kb-performer-modal>footer{flex-wrap:wrap}}

/* кнопка удаления шаблона в левой панели — простой серый крестик без фона */
.kb-tpl-chip .kb-tpl-chip-del{display:inline-flex; align-items:center; justify-content:center;
  border:none; background:transparent; color:var(--text-faint); cursor:pointer;
  padding:1px; transition:all .12s ease}
.kb-tpl-chip .kb-tpl-chip-del:hover{color:var(--text)}

.kb-modal-backdrop{position:fixed;z-index:1600;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(20,30,50,.28)}
.kb-export-modal{width:min(1480px,88vw);height:min(900px,88vh);display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--line);border-radius:12px;background:var(--surface);box-shadow:0 24px 70px rgba(20,30,50,.24)}
.kb-export-modal-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--line)}.kb-export-modal-head>div{display:flex;flex-direction:column;gap:2px}.kb-export-modal-head span{font-size:11px;color:var(--text-muted)}.kb-export-modal-head button{display:flex;border:0;background:transparent;color:var(--text-muted);cursor:pointer}
.kb-export-modal-head>.kb-export-modal-head-actions{flex-direction:row;align-items:center;gap:8px}.kb-export-modal-head-actions button{width:28px;height:28px;align-items:center;justify-content:center;border-radius:6px}.kb-export-modal-head-actions button:hover{background:var(--surface-sunken);color:var(--text)}
.kb-export-modal-body{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(360px,1fr);min-height:0;flex:1}.kb-export-preview-pane{min-width:0;overflow:auto;padding:18px;background:var(--surface-sunken);border-right:1px solid var(--line)}.kb-export-settings-pane{min-width:0;overflow-y:auto;padding:14px}.kb-export-branding{margin:0 0 12px;padding:14px;border:1px solid var(--line);border-radius:9px;background:var(--surface-sunken);display:flex;flex-direction:column;gap:10px}.kb-export-branding .kb-brand-row{align-items:center}.kb-export-branding .kb-brand-input{flex:1;box-sizing:border-box}.kb-export-branding .kb-brand-actions{margin-top:2px}
.kb-export-settings-grid{display:grid;grid-template-columns:1fr;gap:10px;padding:0 0 10px}.kb-export-settings-block{display:flex;flex-direction:column;gap:8px;margin:0;padding:10px 12px;border:1px solid var(--line);border-radius:8px}.kb-export-settings-block legend{padding:0 4px;font-size:12px;font-weight:var(--fw-semibold)}.kb-export-settings-block label{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--text-muted);cursor:pointer}
.kb-export-presentation-controls{padding:0;display:grid;grid-template-columns:1fr;gap:10px}.kb-export-section{border:1px solid var(--line);border-radius:6px;font-size:12px}.kb-export-section summary{padding:8px 10px;font-weight:var(--fw-semibold);cursor:pointer;color:var(--text)}.kb-export-section-body{display:flex;flex-direction:column;gap:8px;padding:10px}.kb-export-field{display:grid;grid-template-columns:minmax(0,1fr) 88px;align-items:center;gap:8px}.kb-export-field>span{font-size:var(--fs-xs);color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kb-export-field .kb-input,.kb-export-field .kb-select{width:100%;min-width:0;box-sizing:border-box;padding:6px 8px;border:1px solid var(--line);border-radius:4px;background:var(--surface)}.kb-export-typography .kb-stepper{display:flex;align-items:stretch;justify-self:end;width:72px;height:28px;box-sizing:border-box;border:1px solid var(--line);border-radius:4px;background:var(--surface);overflow:hidden}.kb-export-typography .kb-stepper-value{flex:0 0 48px;width:48px;min-width:0;padding:0;border:0;background:transparent;text-align:center;font:inherit;color:var(--text);font-variant-numeric:tabular-nums;-moz-appearance:textfield;appearance:textfield}.kb-export-typography .kb-stepper-value::-webkit-outer-spin-button,.kb-export-typography .kb-stepper-value::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}.kb-export-typography .kb-stepper-divider{flex:0 0 1px;width:1px;background:var(--line)}.kb-export-typography .kb-stepper-arrows{display:flex;flex-direction:column;flex:1;min-width:0}.kb-export-typography .kb-stepper-btn{display:flex;align-items:center;justify-content:center;flex:1;padding:0;border:0;background:transparent;color:var(--text-faint);cursor:pointer}.kb-export-typography .kb-stepper-btn:hover{background:var(--surface-sunken);color:var(--text)}.kb-export-typography .kb-stepper-btn:active{background:var(--line);color:var(--text)}.kb-export-field-stacked{display:flex;flex-direction:column;gap:6px}.kb-export-field-stacked>span{font-size:var(--fs-xs);color:var(--text-muted)}.kb-export-field-stacked .kb-input{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid var(--line);border-radius:4px;background:var(--surface)}.kb-export-colors{display:grid;grid-template-columns:auto 34px 74px 34px 74px;align-items:center;gap:6px 8px;margin-top:2px}.kb-export-color-head{font-size:var(--fs-xs);color:var(--text-muted);text-align:center}.kb-export-color-head-bg{grid-column:span 2}.kb-export-color-head-text{grid-column:span 2}.kb-export-color-entity{font-size:var(--fs-xs);color:var(--text-muted)}.kb-export-color-swatch{position:relative;display:block;width:34px;height:26px}.kb-export-color-swatch-btn{display:block;width:100%;height:100%;padding:0;border:1px solid var(--line-strong);border-radius:4px;background:var(--surface);cursor:pointer;box-shadow:inset 0 0 0 1px rgba(20,30,50,.06)}.kb-export-color-swatch-btn:hover{border-color:var(--accent)}.kb-color-pop{position:absolute;left:0;z-index:40;display:flex;flex-direction:column;gap:8px;width:208px;padding:10px;background:var(--surface);border:1px solid var(--line-strong);border-radius:9px;box-shadow:0 12px 32px rgba(20,30,50,.18)}.kb-color-pop.is-bottom{top:calc(100% + 6px)}.kb-color-pop.is-top{bottom:calc(100% + 6px)}.kb-color-pop.is-right{left:auto;right:0}.kb-color-cell{width:100%;aspect-ratio:1;padding:0;border:1px solid var(--line);border-radius:4px;background:var(--surface);cursor:pointer}.kb-color-cell:hover{border-color:var(--accent)}.kb-color-sv{position:relative;width:100%;height:120px;border-radius:6px;cursor:crosshair;touch-action:none;user-select:none}.kb-color-hue{position:relative;width:100%;height:14px;border-radius:7px;cursor:pointer;touch-action:none;user-select:none;background:linear-gradient(to right,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%)}.kb-color-thumb{position:absolute;width:14px;height:14px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgba(20,30,50,.35);transform:translate(-50%,-50%);pointer-events:none}.kb-color-hue .kb-color-thumb{top:50%}.kb-color-hex-field{display:flex;align-items:center;gap:6px}.kb-color-hex-field>span{font-size:var(--fs-xs);font-weight:var(--fw-semibold);color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em}.kb-color-hex-field .kb-input{flex:1;min-width:0;padding:5px 8px;border:1px solid var(--line);border-radius:4px;background:var(--surface);font:inherit;font-size:var(--fs-sm);font-variant-numeric:tabular-nums;text-transform:lowercase;color:var(--text)}.kb-color-quick{display:grid;grid-template-columns:repeat(6,1fr);gap:4px}.kb-color-cell.is-active{outline:2px solid var(--accent);outline-offset:1px}.kb-export-color-hex{width:74px;padding:5px 6px;border:1px solid var(--line);border-radius:4px;background:var(--surface);font:inherit;font-size:var(--fs-xs);font-variant-numeric:tabular-nums;text-transform:lowercase}.kb-export-check{display:flex;align-items:center;gap:8px;min-height:26px;font-size:var(--fs-sm);color:var(--text);cursor:pointer}.kb-export-check input[type=checkbox]{margin:0;flex:none;accent-color:var(--accent)}.kb-export-check>span:not(.kb-datecube){flex:1;min-width:0}.kb-datecube{position:relative;flex:none}.kb-datecube-trigger{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--text);font:inherit;font-size:var(--fs-sm);font-variant-numeric:tabular-nums;line-height:1;min-height:26px;cursor:pointer}.kb-datecube-trigger svg{color:var(--text-faint)}.kb-datecube-trigger:hover:not(:disabled){border-color:var(--line-strong);background:var(--surface-sunken)}.kb-datecube-trigger:disabled{opacity:.55;cursor:not-allowed;background:var(--surface-sunken);color:var(--text-muted)}.kb-datecube-ph{color:var(--text-faint)}.kb-datecube-pop{position:absolute;right:0;bottom:100%;margin-bottom:6px;width:248px;padding:10px;background:var(--surface);border:1px solid var(--line-strong);border-radius:9px;box-shadow:0 12px 32px rgba(20,30,50,.18);z-index:40}.kb-datecube-head{display:flex;align-items:center;justify-content:space-between;gap:4px;margin-bottom:8px}.kb-datecube-title{font-size:var(--fs-sm);font-weight:var(--fw-semibold);color:var(--text)}.kb-datecube-nav{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--text-muted);cursor:pointer;padding:0}.kb-datecube-nav:hover{background:var(--accent-soft);color:var(--text);border-color:var(--accent)}.kb-datecube-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}.kb-datecube-dow{display:flex;align-items:center;justify-content:center;height:22px;font-size:10px;font-weight:var(--fw-semibold);color:var(--text-faint);text-transform:uppercase}.kb-datecube-day{display:flex;align-items:center;justify-content:center;height:28px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--text);font:inherit;font-size:var(--fs-sm);font-variant-numeric:tabular-nums;cursor:pointer;padding:0}.kb-datecube-day:hover{background:var(--accent-soft);border-color:var(--accent)}.kb-datecube-day.is-today{border-color:var(--line-strong)}.kb-datecube-day.is-selected{background:var(--accent);border-color:var(--accent);color:#fff}.kb-datecube-day.is-empty{pointer-events:none}.kb-export-textarea-field{display:flex;flex-direction:column;gap:6px;margin-top:2px}.kb-export-textarea{width:100%;min-height:80px;resize:vertical;box-sizing:border-box;padding:6px 8px;border:1px solid var(--line);border-radius:4px;background:var(--surface);color:var(--text);font:inherit;font-size:var(--fs-sm);line-height:1.45}.kb-export-preview h2{padding:8px 10px;margin:0}.kb-export-preview em,.kb-export-preview small{display:block;min-width:0;padding:4px 10px;color:var(--text-muted);font-size:10px;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}
.kb-export-presets{display:flex;flex-direction:column;gap:8px;padding:0 0 12px;margin-bottom:12px;border-bottom:1px solid var(--line)}.kb-export-presets .kb-select,.kb-export-presets .kb-input{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid var(--line);border-radius:4px;background:var(--surface);min-height:31px}.kb-export-preset-actions{display:flex;gap:8px}.kb-export-preset-error{color:#9f2e25;font-size:var(--fs-xs)}
.kb-export-preview{margin:0;min-height:100%;overflow:hidden;border:1px solid var(--line);border-radius:8px;background:var(--surface)}.kb-export-preview-stage{display:flex;flex-direction:column}.kb-export-preview-task{display:flex;flex-direction:column}.kb-export-preview-task+.kb-export-preview-task{border-top:1px solid var(--line)}.kb-export-preview-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:7px 10px}.kb-export-preview-row:has(.kb-export-preview-comment){grid-template-columns:auto minmax(0,1fr) minmax(120px,.6fr) auto}.kb-export-preview-head{color:var(--text-muted);font-weight:var(--fw-semibold);background:var(--surface-sunken);font-size:11px}.kb-export-preview-separate{display:flex;justify-content:space-between;gap:16px;padding:7px 10px;color:var(--text-muted);font-size:12px}.kb-export-preview-total{display:flex;justify-content:space-between;gap:16px;padding:7px 10px;font-size:13px;border-top:1px solid var(--line)}.kb-export-warning,.kb-export-error{margin:10px;padding:8px 10px;border-radius:7px;background:#fff7df;color:#735b18;font-size:11px}.kb-export-error{margin:10px 0 0;background:#fff0ef;color:#9f2e25}
.kb-export-preview-brand{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 10px 0}.kb-export-preview-brand img{display:block;max-width:120px;max-height:54px;object-fit:contain}.kb-export-preview-performer{padding-left:34px;color:var(--text-muted);background:var(--surface)}.kb-export-preview-comment{padding:0;overflow-wrap:anywhere}.kb-export-control-error{display:block;color:#9f2e25;margin-top:6px}
.kb-export-logo-row{display:flex;align-items:center;gap:10px}.kb-export-logo{flex:none;width:80px;height:80px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:1px dashed var(--line-strong);border-radius:6px;background:var(--surface-sunken);color:var(--text-muted);cursor:pointer;overflow:hidden;font-size:11px}.kb-export-logo:hover{border-color:var(--accent);color:var(--accent)}
.kb-export-modal-actions{display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:14px 18px}.kb-export-modal-actions .kb-export-go2{width:auto;margin:0}
@media(max-width:820px){.kb-export-modal{height:calc(100vh - 24px)}.kb-export-modal-body{grid-template-columns:1fr;overflow-y:auto}.kb-export-preview-pane{min-height:320px;overflow:visible;border-right:0;border-bottom:1px solid var(--line)}.kb-export-settings-pane{overflow:visible}.kb-export-preview{min-height:300px}}
@media (min-width: 1600px) and (max-width: 1999px) {
  /* Компактная плотность для FullHD (1920px) и чуть меньше: шрифты, паддинги и
     высоты строк сущностей (Stage/Task/Executor) уменьшаются примерно на 8–10%,
     внешние отступы между блоками и ширина рабочего поля — сильнее (~15%),
     чтобы смета не выглядела растянутой. Экраны ≥2000px не трогаем — там свой
     «читабельный» ритм (блок ниже). */
  :root {
    --fs-2xs: 12.5px; --fs-xs: 13.5px; --fs-sm: 14px; --fs-base: 15px;
    --fs-md: 16.5px; --fs-lg: 18px; --fs-xl: 21px; --kb-header-h: 76px;
  }
  .kb-header{padding:12px 22px}
  .kb-palette-scroll{padding:13px 11px 20px}
  .kb-chip{padding:6.5px 7.5px}
  .kb-suggest-item{padding:6.5px 8.5px}
  .kb-canvas-scroll{padding:18px 24px 108px}
  .kb-canvas-inner{max-width:none}
  .kb-dropzone{padding:11px}
  .kb-dropzone-empty{padding:36px 18px}
  .kb-stage{margin-bottom:12px}
  .kb-stage-head{min-height:35px; padding:5.5px 10px}
  .kb-stage-name,.kb-stage-title-text{font-size:15px}
  .kb-sum-stage{font-size:14.5px}
  .kb-stage-body{padding:4.5px 9px 4.5px 11px}
  .kb-task{padding:0 0 7.5px; margin-bottom:7px}
  .kb-task-head{min-height:29px; padding:3px 9px}
  .kb-task-body{padding:6.5px 8.5px 0}
  .kb-add-btn{min-height:32px; padding:5.5px 7.5px}
  .kb-add-task-btn{padding-inline:17.5px}
  .kb-task-comment-input{min-height:47px}
  .kb-erow-tags{min-height:24.5px}
  .kb-erow-amount{min-width:96px}
  .kb-erow-group + .kb-erow-group{margin-top:2.5px}
  .kb-tag{width:110px; flex:0 0 110px; min-width:110px; max-width:110px; padding:3px 4.5px 3px 6.5px}
  .kb-tag-role,.kb-tag-name,.kb-tag-spec{width:120px; flex:0 0 120px; min-width:120px; max-width:120px}
  .kb-tag-payment{width:170px; flex:0 0 170px; min-width:170px; max-width:170px}
  .kb-tag-tax{width:135px; flex:0 0 135px; min-width:135px; max-width:135px}
  .kb-tag-grade{width:84px; flex:0 0 84px; min-width:84px; max-width:84px}
  .kb-tag-soft{width:110px; flex:0 0 110px; min-width:110px; max-width:110px}
  .kb-input-num{max-width:68px}
  .kb-task-directcost-input,.kb-input-num.kb-amount-input{width:80px; min-width:80px; max-width:80px}
  .kb-payinline .kb-input-num{max-width:58px}
}
@media (min-width: 2000px) {
  :root {
    --fs-2xs: 11.5px; --fs-xs: 13px; --fs-sm: 14.5px;
    --fs-base: 15px; --fs-md: 16.5px;
  }
  .kb-stage-name, .kb-stage-title-text { font-size: 17.5px; }
  .kb-sum-stage { font-size: 17px; }
  .kb-dashboard { max-width: 1360px; }
  .kb-board { grid-template-columns: repeat(auto-fill, minmax(186px, 1fr)); }
  .kb-knowledge-page { width: min(1180px, calc(100% - 48px)); } .kb-export-modal{width:min(1600px,92vw);height:min(940px,90vh)}
}

/* ===== Beta readiness ===== */
.kb-beta-badge{display:inline-flex;align-items:center;margin-left:7px;padding:1px 7px;border-radius:999px;background:var(--accent);color:#fff;font-size:10px;font-weight:var(--fw-semibold);letter-spacing:.03em;line-height:1.6}
.kb-welcome-overlay{z-index:2000}
.kb-welcome-modal{width:min(640px,92vw);max-width:min(640px,92vw);padding:0;overflow-y:auto}
.kb-welcome-brand{display:flex;justify-content:center;padding:26px 24px 0}
.kb-welcome-title{margin:14px 24px 0;font-size:24px;font-weight:700;letter-spacing:-.02em}
.kb-welcome-text{margin:9px 24px 0;color:var(--text-muted);font-size:16px;line-height:1.55}.kb-welcome-feedback{font-weight:700}
.kb-welcome-list{margin:16px 24px 0;display:flex;flex-direction:column;gap:6px}.kb-welcome-list-label{font-size:16px;font-weight:600;color:var(--text)}.kb-welcome-list ul{margin:0;padding:0 0 0 20px;display:flex;flex-direction:column;gap:4px;color:var(--text-muted);font-size:16px;line-height:1.5}.kb-welcome-list li::marker{color:var(--accent)}
.kb-welcome-modal .kb-modal-actions{padding:20px 24px 24px}
.kb-feedback-modal{width:min(520px,92vw);max-width:min(520px,92vw)}
.kb-feedback-hint{margin:0 0 12px;color:var(--text-muted);font-size:var(--fs-sm);line-height:1.5}
.kb-feedback-textarea{width:100%;min-height:160px;resize:vertical;box-sizing:border-box;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--text);font:inherit;font-size:var(--fs-sm);line-height:1.5}.kb-feedback-textarea:focus{outline:none;border-color:var(--accent)}
.kb-feedback-success{padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--accent-soft);color:var(--text);font-size:var(--fs-sm);line-height:1.5}
.kb-usage-modal{width:min(440px,92vw)}
.kb-usage-bar{height:10px;border-radius:999px;background:var(--surface-sunken);border:1px solid var(--line);overflow:hidden}
.kb-usage-bar-fill{height:100%;background:var(--accent);border-radius:999px;transition:width .3s ease}
.kb-usage-figures{display:flex;align-items:baseline;gap:8px;margin-top:10px}.kb-usage-figures strong{font-size:20px;letter-spacing:-.02em}.kb-usage-figures span{color:var(--text-muted);font-size:var(--fs-sm)}
.kb-usage-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}.kb-usage-stats div{display:flex;flex-direction:column;gap:3px;padding:10px 12px;border:1px solid var(--line);border-radius:8px}.kb-usage-stats span{color:var(--text-muted);font-size:var(--fs-xs)}.kb-usage-stats strong{font-size:var(--fs-md)}
.kb-usage-limit-note{margin-top:12px;padding:8px 10px;border-radius:7px;background:#fff0ef;color:#9f2e25;font-size:var(--fs-xs)}
.kb-ai-edit-error{margin-top:10px;color:#2563eb;font-size:13px}
.kb-export-brand-row{display:grid;grid-template-columns:112px minmax(0,1fr) 244px;align-items:center;gap:10px}.kb-export-brand-label{font-size:var(--fs-xs);font-weight:var(--fw-semibold);color:var(--text-muted);white-space:nowrap}.kb-export-brand-row .kb-export-logo-row,.kb-export-company-input{grid-column:2;min-width:0}.kb-export-company-input{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid var(--line);border-radius:4px;background:var(--surface)}.kb-brand-remove{display:grid;place-items:center;width:24px;height:24px;padding:0;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--text-muted);font-size:17px;line-height:1;cursor:pointer}.kb-brand-remove:hover:not(:disabled){border-color:#c53b32;background:#fff5f4;color:#b42318}.kb-brand-remove:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.kb-brand-remove:disabled{opacity:.55;cursor:not-allowed}.kb-position-segmented{grid-column:3;display:flex;align-items:center;gap:5px;height:30px;min-width:0}.kb-position-segmented button{flex:1;min-width:0;height:30px;padding:0 7px;border:1px solid var(--line);border-radius:5px;background:var(--surface);color:var(--text-muted);font:inherit;font-size:var(--fs-xs);white-space:nowrap;cursor:pointer}.kb-position-segmented button:hover{background:var(--accent-soft);color:var(--text)}.kb-position-segmented button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}.kb-position-segmented button.is-active{border-color:var(--accent);background:var(--accent-soft);color:var(--text);font-weight:var(--fw-semibold)}
.kb-template-tree-file{cursor:pointer}.kb-template-tree-file span{user-select:text;cursor:text}.kb-template-drag-handle{flex:none;border:0;background:transparent;color:var(--text-faint);cursor:grab;padding:0 2px;font-size:14px}.kb-dropdown{position:relative}.kb-dropdown-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-height:29px;padding:6px 8px;border:1px solid var(--line);border-radius:4px;background:var(--surface);color:var(--text);font:inherit;cursor:pointer}.kb-dropdown-menu{position:absolute;z-index:30;top:calc(100% + 4px);left:0;right:0;padding:4px;background:var(--surface);border:1px solid var(--line-strong);border-radius:6px;box-shadow:0 8px 24px rgba(20,30,50,.14)}.kb-dropdown-menu button{display:block;width:100%;padding:6px 8px;border:0;border-radius:4px;background:transparent;text-align:left;color:var(--text);font:inherit;cursor:pointer}.kb-dropdown-menu button:hover,.kb-dropdown-menu button.is-active{background:var(--accent-soft)}.kb-export-preview-brand{display:grid;grid-template-columns:1fr 1fr 1fr;align-items:center;gap:16px}.kb-export-preview-brand>span{display:flex;align-items:center;gap:10px}.kb-export-preview-brand>span:nth-child(2){justify-content:center}.kb-export-preview-brand>span:nth-child(3){justify-content:flex-end}

`;
