import { presentationSettingsForPreset } from "../exportSettings.js";

const encoded = (value) => encodeURIComponent(String(value));
const ok = (result) => result?.ok !== false;
const first = (result) => Array.isArray(result) ? result[0] : result?.items?.[0];

export function createHttpRepositories(request) {
  if (typeof request !== "function") throw new TypeError("request is required");

  const projects = {
    listProjects: () => request("/api/projects"),
    createProject: (_userId, project) => request("/api/projects", { method: "POST", json: { item: project } }),
    updateProject: (_userId, project) => request(`/api/projects/${encoded(project.id)}`, { method: "PUT", json: { item: project } }),
    upsertProject: async (_userId, project) => first(await request("/api/projects/batch", { method: "POST", json: { items: [project] } })),
    upsertProjects: (_userId, items) => items?.length ? request("/api/projects/batch", { method: "POST", json: { items } }) : Promise.resolve([]),
    deleteProject: async (_userId, id) => ok(await request(`/api/projects/${encoded(id)}`, { method: "DELETE" })),
  };

  const performers = {
    listPerformers: () => request("/api/performers"),
    createPerformer: (_userId, item) => request("/api/performers", { method: "POST", json: { item } }),
    updatePerformer: (_userId, item) => request(`/api/performers/${encoded(item.id)}`, { method: "PUT", json: { item } }),
    upsertPerformer: async (_userId, item) => first(await request("/api/performers/batch", { method: "POST", json: { items: [item] } })),
    upsertPerformers: (_userId, items) => items?.length ? request("/api/performers/batch", { method: "POST", json: { items } }) : Promise.resolve([]),
    deletePerformer: async (_userId, id) => ok(await request(`/api/performers/${encoded(id)}`, { method: "DELETE" })),
  };

  const quickAccess = {
    listQuickAccessItems: () => request("/api/quick-access-items"),
    createQuickAccessItem: (_userId, item) => request("/api/quick-access-items", { method: "POST", json: { item } }),
    updateQuickAccessItem: (_userId, item) => request(`/api/quick-access-items/${encoded(item.id)}`, { method: "PUT", json: { item } }),
    upsertQuickAccessItem: async (_userId, item) => first(await request("/api/quick-access-items/batch", { method: "POST", json: { items: [item] } })),
    upsertQuickAccessItems: (_userId, items) => items?.length ? request("/api/quick-access-items/batch", { method: "POST", json: { items } }) : Promise.resolve({ items: [] }),
    deleteQuickAccessItem: async (_userId, id) => ok(await request(`/api/quick-access-items/${encoded(id)}`, { method: "DELETE" })),
    deleteQuickAccessItemByPerformerId: async (_userId, id) => ok(await request(`/api/quick-access-items/by-performer/${encoded(id)}`, { method: "DELETE" })),
  };

  const templateLibrary = {
    loadTemplateLibrary: () => request("/api/template-library"),
    createTemplateLibrary: (_userId, library) => request("/api/template-library", { method: "PUT", json: { library } }),
    updateTemplateLibrary: (_userId, library) => request("/api/template-library", { method: "PUT", json: { library } }),
    upsertTemplateLibrary: (_userId, library) => request("/api/template-library", { method: "PUT", json: { library } }),
    deleteTemplateLibrary: async () => ok(await request("/api/template-library", { method: "DELETE" })),
  };

  const aiSettings = {
    loadAiSettings: () => request("/api/ai-settings"),
    upsertAiSettings: (_userId, settings) => request("/api/ai-settings", { method: "PUT", json: settings }),
  };

  const exportProfile = {
    loadProfile: () => request("/api/export-profile"),
    upsertProfile: (_userId, profile) => request("/api/export-profile", { method: "PUT", json: { profile } }),
  };

  const exportPresets = {
    list: () => request("/api/export-presets"),
    create: (_userId, name, settings) => request("/api/export-presets", { method: "POST", json: { name, settings: presentationSettingsForPreset(settings) } }),
    update: (_userId, id, name, settings) => request(`/api/export-presets/${encoded(id)}`, { method: "PUT", json: { name, settings: presentationSettingsForPreset(settings) } }),
    remove: async (_userId, id) => ok(await request(`/api/export-presets/${encoded(id)}`, { method: "DELETE" })),
    duplicate: (_userId, preset) => request("/api/export-presets", { method: "POST", json: { name: `${preset.name} (копия)`, settings: presentationSettingsForPreset(preset.settings) } }),
  };

  const productEvents = {
    track: (_userId, eventType, meta = {}, metadata = {}) => request("/api/product-events", { method: "POST", json: { eventType, meta, metadata } }),
    async trackSessionActive(userId) {
      const key = `kubiki:session_active:${userId}`;
      try {
        if (sessionStorage.getItem(key)) return null;
        sessionStorage.setItem(key, "1");
      } catch {}
      return this.track(userId, "session_active");
    },
  };

  const userFlags = {
    getFlags: () => request("/api/user-flags"),
    ensureFlags: () => request("/api/user-flags", { method: "PUT", json: {} }),
    markBetaWelcomeSeen: () => request("/api/user-flags/beta-welcome-seen", { method: "PUT", json: {} }),
  };

  const betaFeedback = {
    insert: ({ userId: _userId, user_id: _user_id, ...feedback }) => request("/api/beta-feedback", { method: "POST", json: feedback }),
  };

  const usage = { load: () => request("/api/usage") };
  const legalAcceptances = {
    list: () => request("/api/legal-acceptances"),
    accept: (_userId, documentKey, version) => request("/api/legal-acceptances", { method: "POST", json: { documentKey, version } }),
    revoke: (_userId, documentKey, version) => request("/api/legal-acceptances", { method: "DELETE", json: { documentKey, version } }),
  };

  const aiFeedback = {
    apply: (_userId, value) => request("/api/ai-feedback/apply", { method: "POST", json: value }),
    update: (_userId, projectId, project) => request("/api/ai-feedback/active", { method: "PUT", json: { projectId, project } }),
    finalize: (_userId, projectId, project) => request("/api/ai-feedback/finalize", { method: "POST", json: { projectId, project } }),
  };

  return { projects, performers, quickAccess, templateLibrary, aiSettings, exportProfile, exportPresets, productEvents, userFlags, betaFeedback, usage, legalAcceptances, aiFeedback };
}
