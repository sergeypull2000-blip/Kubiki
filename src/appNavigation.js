export const APP_SECTIONS = Object.freeze({ PROJECTS: "projects", KNOWLEDGE_BASE: "knowledgeBase" });

export function normalizeAppSection(section) {
  return section === APP_SECTIONS.KNOWLEDGE_BASE ? section : APP_SECTIONS.PROJECTS;
}

export const isAppSectionActive = (current, section) => normalizeAppSection(current) === section;

export function changeAppSection(state, section) {
  return { ...state, activeSection: normalizeAppSection(section) };
}
