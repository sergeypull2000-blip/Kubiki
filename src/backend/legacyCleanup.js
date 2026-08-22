const CLEANUP_KEY = "kubiki:better_auth_owner_markers_cleaned:v1";
const LEGACY_OWNER_KEYS = [
  "kubiki_projects_server_user_v1",
  "kubiki_performers_server_user_v1",
  "kubiki_quick_access_server_user_v1",
  "kubiki_templates_server_user_v1",
  "kubiki_ai_settings_server_user_v1",
];

export function cleanupLegacySupabaseOwnerMarkers(storage = globalThis.localStorage) {
  if (!storage || storage.getItem(CLEANUP_KEY) === "1") return false;
  for (const key of LEGACY_OWNER_KEYS) storage.removeItem(key);
  storage.setItem(CLEANUP_KEY, "1");
  return true;
}

export { CLEANUP_KEY, LEGACY_OWNER_KEYS };
