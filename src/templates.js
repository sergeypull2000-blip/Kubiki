import { uid } from "./utils.js";

/* ============================================================
   Шаблоны — localStorage-хранилище для 4 уровней:
     - performers  (исполнители)
     - tasks       (задачи со вложенными исполнителями)
     - stages      (этапы со всей вложенной структурой)
     - projects    (проекты целиком)

   Глубокое копирование гарантирует, что изменения в созданных
   из шаблона элементах не затрагивают сам шаблон в localStorage.
   ============================================================ */

export const TEMPLATE_KEYS = {
  performers: "kubiki_templates_performers",
  tasks: "kubiki_templates_tasks",
  stages: "kubiki_templates_stages",
  projects: "kubiki_templates_projects",
};

function templateSignature(template) {
  return JSON.stringify(template, (property, value) =>
    property === "id" || property === "sourceEntityId" ? undefined : value
  );
}

/* ---------- чтение/запись localStorage ---------- */

export function loadTemplates(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    if (key === TEMPLATE_KEYS.projects) return parsed;

    // Старые версии могли записать один и тот же снимок много раз. Убираем
    // только точные дубли; одинаковые названия у разных элементов допустимы.
    const seenSnapshots = new Set();
    const seenSources = new Set();
    const unique = parsed.filter((template) => {
      // Для исполнителей каждый отличающийся набор кубиков — отдельный
      // шаблон, даже если это один исходный исполнитель.
      if (key !== TEMPLATE_KEYS.performers && template.sourceEntityId) {
        if (seenSources.has(template.sourceEntityId)) return false;
        seenSources.add(template.sourceEntityId);
        return true;
      }
      const signature = templateSignature(template);
      if (seenSnapshots.has(signature)) return false;
      seenSnapshots.add(signature);
      return true;
    });
    if (unique.length !== parsed.length) localStorage.setItem(key, JSON.stringify(unique));
    return unique;
  } catch (_) {
    return [];
  }
}

export function saveTemplates(key, list) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch (_) {
    /* переполнение / приватный режим — тихо пропускаем */
  }
}

export function addTemplate(key, item) {
  const list = loadTemplates(key);
  if (key === TEMPLATE_KEYS.performers) {
    const signature = templateSignature(item);
    if (list.some((template) => templateSignature(template) === signature)) return false;
  } else if (item.sourceEntityId && list.some((template) => template.sourceEntityId === item.sourceEntityId)) {
    return false;
  }
  list.push(item);
  saveTemplates(key, list);
  return true;
}

export function removeTemplate(key, id) {
  const list = loadTemplates(key);
  saveTemplates(key, list.filter((x) => x.id !== id));
}

/* ---------- глубокое клонирование ---------- */

/** Глубокая копия исполнителя с новыми id для всех тегов. */
export function cloneExecutorTemplate(executor) {
  return {
    ...executor,
    id: uid(),
    tags: (executor.tags || []).map((tg) => ({
      ...tg,
      id: uid(),
      ...(tg.payment ? { payment: { ...tg.payment } } : {}),
    })),
  };
}

/** Глубокая копия задачи с новыми id для неё и всех вложенных исполнителей. */
export function cloneTaskTemplate(task) {
  return {
    ...task,
    id: uid(),
    executors: (task.executors || []).map((e) => cloneExecutorTemplate(e)),
  };
}

/** Глубокая копия этапа с новыми id для него, всех задач и исполнителей внутри. */
export function cloneStageTemplate(stage) {
  return {
    ...stage,
    id: uid(),
    tasks: (stage.tasks || []).map((t) => cloneTaskTemplate(t)),
  };
}

/** Глубокая копия проекта с новыми id для всего дерева. */
export function cloneProjectTemplate(project) {
  const { templateName, folderId: _folderId, sourceProjectId: _sourceProjectId, ...projectData } = project;
  return {
    ...projectData,
    name: templateName || project.name || "Новый проект",
    id: uid(),
    stages: (project.stages || []).map((s) => cloneStageTemplate(s)),
  };
}

/* ---------- сериализация для сохранения (со старыми id) ----------
   Сохраняем «как есть» — id нужны только для уникальности в списке шаблонов.
   При применении шаблона clone*Template заменит все id на новые. */

/** Сохранить исполнителя как шаблон. */
export function savePerformerTemplate(executor) {
  // сохраняем глубокую копию, чтобы изменения в исходном исполнителе
  // не затрагивали шаблон в localStorage (tags, payment и т.д.)
  const snapshot = JSON.parse(JSON.stringify(executor));
  snapshot.sourceEntityId = executor.sourceEntityId || executor.id;
  snapshot.id = uid();
  return addTemplate(TEMPLATE_KEYS.performers, snapshot);
}

/** Сохранить задачу как шаблон (со всеми вложенными исполнителями). */
export function saveTaskTemplate(task) {
  const snapshot = JSON.parse(JSON.stringify(task));
  snapshot.sourceEntityId = task.sourceEntityId || task.id;
  snapshot.id = uid();
  return addTemplate(TEMPLATE_KEYS.tasks, snapshot);
}

/** Сохранить этап как шаблон (со всеми задачами и исполнителями). */
export function saveStageTemplate(stage) {
  const snapshot = JSON.parse(JSON.stringify(stage));
  snapshot.sourceEntityId = stage.sourceEntityId || stage.id;
  snapshot.id = uid();
  return addTemplate(TEMPLATE_KEYS.stages, snapshot);
}

/** Сохранить проект как шаблон. */
export function saveProjectTemplate(project, name) {
  const list = loadTemplates(TEMPLATE_KEYS.projects);
  const sourceProjectId = project.sourceProjectId || project.id;
  const existing = list.find((template) => template.sourceProjectId === sourceProjectId || (!template.sourceProjectId && template.id === sourceProjectId));
  if (existing) return { created: false, template: existing };
  const snapshot = JSON.parse(JSON.stringify(project));
  snapshot.id = uid();
  snapshot.sourceProjectId = sourceProjectId;
  snapshot.templateName = name || snapshot.name || "Шаблон сметы";
  snapshot.folderId = "new";
  list.push(snapshot);
  saveTemplates(TEMPLATE_KEYS.projects, list);
  return { created: true, template: snapshot };
}

/** Миграция: добавляет folderId: null всем шаблонам, у которых его ещё нет,
    и сохраняет обратно в localStorage. Возвращает мигрированный массив. */
export function migrateProjectTemplates() {
  const list = loadTemplates(TEMPLATE_KEYS.projects);
  let changed = false;
  const migrated = list.map((t) => {
    if (!("folderId" in t) || t.folderId == null || !t.sourceProjectId) {
      changed = true;
      return { ...t, folderId: t.folderId || "new", sourceProjectId: t.sourceProjectId || t.id };
    }
    return t;
  });
  if (changed) saveTemplates(TEMPLATE_KEYS.projects, migrated);
  return migrated;
}
