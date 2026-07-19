/* ============================================================
   CSS — Raw Minimal / B2B SaaS, Geist
   ============================================================ */
export const CSS = `
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

  --fs-2xs:10px; --fs-xs:11px; --fs-sm:12.5px; --fs-base:13px;
  --fs-md:14.5px; --fs-lg:17px; --fs-xl:23px;
  --fw-regular:400; --fw-medium:500; --fw-semibold:600;

  /* п.2: общая ширина группы «палитра + рабочее поле + правая панель» —
     держит шапку (лого / «ИТОГО») и layout в одной сетке, чтобы панели
     были прижаты к рабочему поле, а не растянуты по краям экрана */
  --layout-max: 1602px;

  /* dashboard sidebar */
  --dash-sidebar-w: 240px;
}
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

/* header */
.kb-header{display:flex; align-items:center; gap:16px; padding:13px 24px;
  border-bottom:1px solid var(--line); position:sticky; top:0; background:var(--bg); z-index:20}
.kb-header-dash{padding:17px 24px}
/* п.2: содержимое шапки рабочей зоны выровнено по той же ширине/центру,
   что и .kb-layout ниже — лого и «ИТОГО» оказываются точно над панелями */
.kb-header-inner{display:flex; align-items:center; gap:12px; width:100%; max-width:var(--layout-max); margin:0 auto}
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
.kb-layout{display:flex; align-items:stretch; height:calc(100vh - 60px); overflow:hidden;
  width:100%; max-width:var(--layout-max); margin:0 auto}
.kb-palette{width:248px; flex-shrink:0; background:var(--surface); border-right:1px solid var(--line-strong);
  padding:14px 12px 22px; display:flex; flex-direction:column; gap:2px; overflow-y:auto; overflow-x:hidden}
.kb-canvas{flex:1; min-width:0; padding:20px 28px 120px; overflow-y:auto}
/* рабочее поле центрировано в своей колонке между палитрой и правой панелью */
.kb-canvas-inner{max-width:1010px; margin:0 auto}

/* palette accordion */
.kb-palette-section{padding-bottom:4px; margin-bottom:6px}
.kb-palette-title{width:100%; display:flex; align-items:center; justify-content:space-between; background:none; border:none;
  cursor:pointer; padding:8px 6px; font-size:var(--fs-2xs); font-weight:var(--fw-semibold); text-transform:uppercase; letter-spacing:.07em; color:var(--text-muted)}
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
.kb-stage{border:1px solid var(--line); border-radius:8px; background:var(--surface); margin-bottom:14px; transition:.15s}
.kb-stage-active{border-color:var(--accent); box-shadow:0 0 0 1px var(--accent)}
.kb-stage-over{outline:1.5px dashed var(--accent); outline-offset:-1px; background:var(--accent-soft)}
.kb-stage-dragging{opacity:.45}
.kb-stage-head{display:flex; align-items:center; gap:9px; padding:9px 13px; border-bottom:1px solid var(--line)}
.kb-grip{display:flex; color:var(--text-faint); cursor:grab; padding:2px; border-radius:3px}
.kb-grip:hover{color:var(--text-muted); background:var(--accent-soft)}
.kb-grip:active{cursor:grabbing}
.kb-stage-icon{color:var(--text-faint); flex-shrink:0}
.kb-stage-name{font-size:var(--fs-md); font-weight:var(--fw-semibold); letter-spacing:-.01em}
.kb-stage-body{padding:2px 13px 8px}
.kb-dropzone-over{background:var(--accent-soft); outline:1.5px dashed var(--accent); outline-offset:-4px; border-radius:5px}

/* иерархия сумм: все выровнены по правому краю, вес/размер = уровень */
.kb-sum{font-variant-numeric:tabular-nums; white-space:nowrap; text-align:right; margin-left:auto}
.kb-sum-stage{font-size:var(--fs-md); font-weight:var(--fw-semibold); color:var(--text); letter-spacing:-.01em; min-width:120px}
.kb-sum-task{font-size:var(--fs-sm); font-weight:var(--fw-medium); color:var(--text-muted); min-width:120px}
/* быстрый ввод стоимости задачи напрямую, пока нет исполнителей */
.kb-task-directcost{display:inline-flex; align-items:center; justify-content:flex-end; gap:4px}
.kb-task-directcost-input{max-width:88px; font-size:var(--fs-sm); font-weight:var(--fw-medium)}
.kb-task-directcost-cur{color:var(--text-faint)}

/* task */
.kb-task{padding:9px 0; border-radius:6px; transition:background .12s}
.kb-task-active{background:var(--surface-sunken)}
.kb-task-active > .kb-task-body{border-left-color:var(--accent)}
/* вся задача — зона приёма исполнителя: подсвечивается целиком (п.1) */
.kb-task-over{background:var(--accent-soft); outline:1.5px dashed var(--accent); outline-offset:2px; border-radius:6px}
.kb-task-over > .kb-task-body{border-left-color:var(--accent)}
.kb-task-head{display:flex; align-items:center; gap:10px; margin-bottom:1px}
.kb-task-name{flex:1}
.kb-task-body{padding-left:20px; border-left:1px solid var(--line-strong); margin-top:3px; min-height:4px}
/* кнопки «+ Новый …» — единый вид для добавления вложенных элементов */
.kb-add-btn{display:inline-flex; align-items:center; gap:6px; background:none; border:none;
  color:var(--text-muted); font-size:var(--fs-sm); font-weight:var(--fw-medium); cursor:pointer;
  padding:6px 6px; border-radius:5px; transition:.12s}
.kb-add-btn:hover{color:var(--text); background:var(--surface-sunken)}


/* executor row — заметность через структуру (отступ, размер), не через цвет */
.kb-erow-group{padding:3px 6px 3px 10px; border-radius:6px; transition:background .12s; cursor:default; border:1px solid transparent}
.kb-erow-group:hover{background:var(--surface-sunken)}
/* активная строка — только чуть тёмный фон, без цветной черты и рамки */
.kb-erow-group-active{border-color:var(--accent); box-shadow:0 0 0 1px var(--accent); cursor:grab}
.kb-erow-group-active:active{cursor:grabbing}
.kb-erow-dragging{opacity:.45}
/* приём тега/кубика — тончайшая нейтральная рамка, не акцентная */
.kb-erow-group-over{background:var(--surface-sunken); border-color:var(--line)}
/* появление нового исполнителя — короткая мягкая вспышка и угасание */
.kb-erow-flash{animation:kbFlash .3s ease-out}
@keyframes kbFlash{
  0%{background:var(--accent-soft)}
  100%{background:transparent}
}
.kb-erow{display:flex; align-items:flex-start; gap:10px}
.kb-erow-tags{flex:1; min-width:0; display:flex; flex-wrap:wrap; gap:5px; align-items:center; padding:2px 0}
.kb-erow-amount{flex-shrink:0; min-width:120px; display:flex; justify-content:flex-end; align-items:center; gap:7px; padding-top:2px}
.kb-erow-taxed{white-space:nowrap}
.kb-erow-sum{font-size:var(--fs-xs); font-weight:var(--fw-regular); color:var(--text-muted); font-variant-numeric:tabular-nums; white-space:nowrap}
.kb-erow-sum-muted{color:var(--text-faint)}
.kb-erow-sum-strong{font-size:var(--fs-sm); font-weight:var(--fw-medium); color:var(--text)}
.kb-amount-input{text-align:right; font-size:var(--fs-sm); font-weight:var(--fw-medium)}
.kb-input-num.kb-amount-input{max-width:92px}
.kb-erow-del{flex-shrink:0; margin-top:2px}

/* tag chip on executor */
.kb-tag{position:relative; display:inline-flex; align-items:center; gap:5px; border:1px solid var(--line-strong);
  border-radius:5px; padding:3px 5px 3px 7px; background:var(--surface); font-size:var(--fs-xs); width:156px; flex:0 0 156px; min-width:156px; max-width:156px;
  transition:border-color .12s, background .12s, color .12s}
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
  max-height:230px; overflow-y:auto; padding:3px}
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
.kb-dropzone-btn{cursor:pointer; font-weight:var(--fw-medium)}
.kb-dropzone-btn:hover{border-color:var(--line-strong); color:var(--text); background:var(--surface-sunken)}
.kb-dropzone-empty{padding:40px 20px; font-size:var(--fs-base); flex-direction:row}
.kb-dropzone.kb-dropzone-over{background:var(--accent-soft); border-color:var(--accent); color:var(--accent)}

/* dashboard */
.kb-dashboard{width:100%; max-width:1200px; margin:0 auto; padding:32px 24px}
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
.kb-header-min{gap:12px}
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
.kb-rightpanel{width:288px; flex-shrink:0; background:var(--surface); border-left:1px solid var(--line-strong); display:flex; flex-direction:column; overflow:hidden; padding:6px 0}
.kb-rp-grow{flex:1; min-height:0; overflow-y:auto}
.kb-rp-sec{padding:16px 18px; border-bottom:1px solid var(--line)}
.kb-rp-sec:last-child{border-bottom:none}
.kb-rp-title{font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--text-muted); font-weight:var(--fw-semibold); margin-bottom:10px}
.kb-viewtoggle-full{width:100%} .kb-viewtoggle-full .kb-viewtoggle-btn{flex:1}
.kb-rp-markup{margin-top:0}
.kb-rp-markup .kb-markup-input{max-width:56px}

/* ---- свойства ---- */
.kb-props{display:flex; flex-direction:column; gap:6px}
.kb-props-kind{font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--text-faint)}
.kb-props-name{font-size:var(--fs-md); font-weight:var(--fw-semibold); color:var(--text); line-height:1.3}
.kb-props-meta{font-size:12px; color:var(--text-muted)}
.kb-props-figure{font-size:20px; font-weight:var(--fw-semibold); color:var(--text); font-variant-numeric:tabular-nums; margin:2px 0 6px}
.kb-props-sub{font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--text-faint); margin-top:8px}
.kb-props-row{display:flex; justify-content:space-between; gap:10px; font-size:13px; color:var(--text); padding:4px 0; border-bottom:1px solid var(--line)}
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
.kb-props-sub-toggle{display:flex; align-items:center; justify-content:space-between; width:100%; background:none; border:none; padding:0; margin-top:8px; cursor:pointer; font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--text-faint); font-weight:var(--fw-semibold)}
.kb-props-sub-toggle .kb-person-chev{color:var(--text-muted)}
.kb-task-collapse{flex-shrink:0}
/* п.13: короче поля названий этапа/задачи, свободная зона head кликабельна для выделения */
.kb-stage-head .kb-input-flex{flex:0 1 320px; margin-right:auto}
.kb-task-name{flex:0 1 300px !important; max-width:300px; margin-right:auto}
/* п.8: «Новый кубик» */
.kb-newcube{width:100%; justify-content:flex-start; color:var(--text-muted)}
.kb-newcube:hover{color:var(--text)}
/* п.6 налог в правой панели */
.kb-tax-row{display:grid; grid-template-columns:minmax(0,1fr) 70px 56px 28px; align-items:center; gap:8px; margin-top:8px}
.kb-tax-row .kb-markup-label{min-width:0}
.kb-tax-spacer{width:70px}
.kb-switch-spacer{width:28px}
.kb-tax-type{width:70px; padding:5px 6px; border:1px solid var(--line-strong); border-radius:6px; background:var(--surface); font:inherit; font-size:var(--fs-sm); color:var(--text)}
.kb-tax-input{max-width:56px; border:1px solid var(--line-strong); background:var(--surface); text-align:right}
.kb-mini-switch{width:28px; height:16px; padding:2px; border:0; border-radius:999px; background:var(--line-strong); cursor:pointer; flex:0 0 auto; transition:.15s}
.kb-mini-switch span{display:block; width:12px; height:12px; border-radius:50%; background:#fff; box-shadow:0 1px 2px rgba(26,34,48,.25); transition:transform .15s}
.kb-mini-switch.is-on{background:var(--accent)}
.kb-mini-switch.is-on span{transform:translateX(12px)}
.kb-task-reorder-over{box-shadow:inset 0 2px 0 var(--accent)}
.kb-task-dragging{opacity:.45}
.kb-tree-collapse{flex-shrink:0}
/* п.7 кубик налога у исполнителя */
.kb-tag-taxwrap{display:inline-flex; align-items:center; gap:4px}
.kb-tag-taxlabel{color:var(--text-muted); font-size:var(--fs-xs); white-space:nowrap}
.kb-tag-taxinput{max-width:32px; text-align:right}
.kb-tag-taxpct{color:var(--text-muted); font-size:12px; margin-left:1px}
.kb-tpl-add{display:inline-flex; align-items:center; gap:5px; width:100%; justify-content:flex-start; margin-top:4px; padding:6px 8px; border:1px dashed var(--line-strong); border-radius:6px; background:none; color:var(--text-muted); font:inherit; font-size:11.5px; cursor:pointer}
.kb-tpl-add:hover{color:var(--text); border-color:var(--text-faint)}
.kb-tpl-soon{color:var(--accent); font-weight:var(--fw-medium)}
.kb-palette-foot{margin-top:auto; padding:14px 14px 4px; font-size:11px; color:var(--text-faint); line-height:1.45; border-top:1px solid var(--line)}
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

/* ---- модалка импорта: превью и выбор листа ---- */
.kb-modal-overlay{position:fixed; inset:0; z-index:100; background:rgba(20,30,50,.28); display:flex; align-items:center; justify-content:center; padding:24px}
.kb-modal{background:var(--surface); border:1px solid var(--line); border-radius:12px; box-shadow:0 24px 60px rgba(20,30,50,.22); width:100%; max-width:560px; max-height:86vh; display:flex; flex-direction:column; overflow:hidden}
.kb-modal-head{display:flex; align-items:center; justify-content:space-between; padding:16px 18px; border-bottom:1px solid var(--line)}
.kb-modal-title{font-size:var(--fs-md); font-weight:var(--fw-semibold); color:var(--text)}
.kb-modal-body{padding:16px 18px; overflow-y:auto; min-height:0; flex:1 1 auto}
.kb-modal-note{font-size:12px; color:var(--text-muted); margin-bottom:12px; line-height:1.5}
.kb-modal-status{display:flex; align-items:center; gap:10px; padding:32px 18px; justify-content:center; color:var(--text-muted); font-size:var(--fs-sm)}
.kb-modal-status.is-error{color:#C0392B}
.kb-modal-actions{display:flex; justify-content:flex-end; gap:8px; margin-top:14px}
.kb-modal-foot{border-top:1px solid var(--line); padding:12px 18px; display:flex; align-items:center; justify-content:space-between; gap:12px}
.kb-prev-summary{font-size:12px; color:var(--text-muted); font-variant-numeric:tabular-nums}

.kb-sheet-list{display:flex; flex-direction:column; gap:6px}
.kb-sheet-btn{display:flex; align-items:center; gap:9px; padding:11px 12px; border:1px solid var(--line); border-radius:8px; background:var(--bg); color:var(--text); font:inherit; font-size:var(--fs-sm); cursor:pointer; text-align:left}
.kb-sheet-btn:hover{border-color:var(--accent); background:var(--accent-soft)}

.kb-import-preview{display:flex; flex-direction:column; gap:14px}
.kb-prev-stage{border:1px solid var(--line); border-radius:8px; overflow:hidden}
.kb-prev-stage-head{display:flex; align-items:center; gap:6px; padding:6px 8px 6px 10px; background:var(--surface-sunken); border-bottom:1px solid var(--line)}
.kb-prev-stage-name{flex:1; font-weight:var(--fw-semibold); border:none; background:none; padding:4px 2px}
.kb-prev-task{display:flex; align-items:center; gap:6px; padding:5px 8px 5px 10px; border-bottom:1px solid var(--line)}
.kb-prev-task:last-child{border-bottom:none}
.kb-prev-task-name{flex:1; border:1px solid transparent; border-radius:4px; padding:4px 6px; background:none}
.kb-prev-task-name:hover,.kb-prev-task-name:focus{border-color:var(--line); background:var(--surface)}
.kb-prev-task-cost{width:96px; text-align:right; border:1px solid var(--line); border-radius:4px; padding:4px 6px; background:var(--surface)}
.kb-prev-cur{color:var(--text-muted); font-size:12px}
.kb-prev-warnings{border:1px dashed var(--line-strong); border-radius:8px; padding:10px 12px; background:var(--surface-sunken)}
.kb-prev-warn-title{display:flex; align-items:center; gap:6px; font-size:12px; color:var(--text-muted); margin-bottom:6px}
.kb-prev-warn-item{font-size:12px; color:var(--text-faint); padding:2px 0; line-height:1.4}

.kb-import-kind{border:1px solid var(--line); border-radius:8px; padding:12px; background:var(--surface-sunken); display:flex; flex-direction:column; gap:8px; margin-bottom:14px}
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
.kb-collapse-all-btn{display:flex; align-items:center; gap:4px; width:max-content; margin:0 0 7px;
  padding:3px 6px; border:1px solid var(--line); border-radius:5px; background:transparent;
  color:var(--text-muted); font:inherit; font-size:11px; line-height:1.2; cursor:pointer}
.kb-collapse-all-btn:hover{background:var(--surface-sunken); color:var(--text)}

/* ---- шаблоны в левой панели ---- */
.kb-pal-templates{margin-top:10px}
.kb-pal-tmp-label{font-size:11px; color:var(--text-faint); text-transform:uppercase;
  letter-spacing:.05em; font-weight:var(--fw-medium); padding:0 2px; margin-bottom:5px}
.kb-template-item{display:flex; align-items:center; gap:6px; padding:5px 7px; border-radius:5px;
  font-size:var(--fs-sm); cursor:grab; transition:background .12s ease;
  user-select:none; color:var(--text)}
.kb-template-item:hover{background:var(--accent-soft)}
.kb-template-item:active{cursor:grabbing}
.kb-template-item-name{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.kb-template-item-sum{flex:none; color:var(--text-muted); font-size:11px; font-variant-numeric:tabular-nums; white-space:nowrap}
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
.kb-dashboard-layout{display:flex; align-items:stretch; min-height:calc(100vh - 77px)}
.kb-dash-sidebar{width:var(--dash-sidebar-w); flex-shrink:0; background:var(--surface);
  border-right:1px solid var(--line-strong); padding:14px 12px 22px;
  display:flex; flex-direction:column; gap:2px; overflow-y:auto; overflow-x:hidden}

/* метка секции навигации */
.kb-dash-nav-section-label{font-size:var(--fs-xs); font-weight:var(--fw-regular);
  letter-spacing:.03em; color:var(--text-muted);
  padding:8px 6px 6px; user-select:none}

/* пункт навигации */
.kb-dash-nav-item{display:flex; align-items:center; gap:8px; width:100%;
  border:none; border-radius:6px; padding:7px 8px; background:transparent;
  font:inherit; font-size:var(--fs-sm); font-weight:var(--fw-medium);
  color:var(--text); cursor:pointer; transition:background .12s ease; text-align:left}
.kb-dash-nav-item:hover{background:var(--accent-soft)}
.kb-dash-nav-item > span{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.kb-dash-nav-item-active{background:var(--surface-sunken); color:var(--text); box-shadow:inset 2px 0 0 var(--line-strong)}

/* разделитель секций */
.kb-dash-nav-divider{height:1px; background:var(--line); margin:6px 4px 8px}

/* строка папки категории с действиями */
.kb-dash-nav-folder-row{display:flex; align-items:center; gap:2px;
  border-radius:6px; transition:background .12s ease}
.kb-dash-nav-folder-row:hover{background:var(--surface-sunken)}
.kb-dash-nav-folder-row:hover .kb-dash-nav-folder-actions{opacity:1}
.kb-dash-nav-folder-row > .kb-dash-nav-item{flex:1; min-width:0}
.kb-dash-nav-folder-actions{display:flex; align-items:center; gap:1px;
  opacity:0; padding-right:2px; transition:opacity .12s ease}
.kb-dash-nav-folder-row.kb-dash-nav-item-active{background:var(--surface-sunken); box-shadow:inset 2px 0 0 var(--line-strong)}
.kb-tree-toggle{display:flex; align-items:center; justify-content:center; flex:none; padding:4px 0 4px 4px; border:0; background:transparent; color:var(--text-faint); cursor:pointer}
.kb-tree-folder-btn{padding-left:3px}
.kb-tree-folder-btn svg{color:var(--text-faint); flex:none}
.kb-template-tree-files{display:flex; flex-direction:column; margin-left:25px; padding:2px 0 4px; gap:1px}
.kb-template-tree-file{display:flex; align-items:center; gap:6px; width:100%; min-width:0; padding:5px 6px; border:0; border-radius:5px; background:transparent; color:var(--text-muted); font:inherit; font-size:12px; text-align:left; cursor:grab}
.kb-template-tree-file:hover{background:var(--accent-soft); color:var(--text)}
.kb-template-tree-file span{flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.kb-template-tree-file svg{flex:none}
.kb-template-tree-actions{display:flex; flex:none; gap:1px; opacity:0; transition:opacity .12s ease}
.kb-template-tree-file:hover .kb-template-tree-actions,.kb-template-tree-actions:focus-within{opacity:1}
.kb-template-tree-input{flex:1; min-width:0; padding:2px 4px; border:1px solid var(--line-strong); border-radius:4px; background:var(--surface); color:var(--text); font:inherit; font-size:12px; outline:none}
.kb-template-tree-input:focus{border-color:var(--accent)}
.kb-toast{position:fixed; z-index:200; left:50%; top:50%; transform:translate(-50%,-50%); padding:10px 16px; border:1px solid var(--line); border-radius:9px; background:var(--surface); color:var(--text); box-shadow:0 12px 40px rgba(20,30,50,.16); font-size:var(--fs-sm); font-weight:var(--fw-medium); pointer-events:none; animation:kb-toast-in .16s ease-out}
@keyframes kb-toast-in{from{opacity:0; transform:translate(-50%,-46%)}to{opacity:1; transform:translate(-50%,-50%)}}

/* поле ввода при редактировании названия */
.kb-dash-nav-input{flex:1; border:1px solid var(--line-strong); border-radius:5px;
  padding:5px 7px; font:inherit; font-size:var(--fs-sm); background:var(--surface);
  color:var(--text); margin:3px 0}
.kb-dash-nav-input:focus{outline:none; border-color:var(--accent)}

/* кнопка «Новая категория» */
.kb-dash-nav-new-row{padding:0 4px}
.kb-dash-nav-new-btn{display:flex; align-items:center; gap:6px; width:100%;
  border:1px dashed var(--line-strong); border-radius:6px; padding:7px 8px;
  margin-top:4px; background:none; color:var(--text-muted);
  font:inherit; font-size:var(--fs-sm); cursor:pointer; transition:all .12s ease}
.kb-dash-nav-new-btn:hover{color:var(--text); border-color:var(--text-faint)}

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

/* кнопка удаления шаблона в левой панели — простой серый крестик без фона */
.kb-tpl-chip .kb-tpl-chip-del{display:inline-flex; align-items:center; justify-content:center;
  border:none; background:transparent; color:var(--text-faint); cursor:pointer;
  padding:1px; transition:all .12s ease}
.kb-tpl-chip .kb-tpl-chip-del:hover{color:var(--text)}
`;
