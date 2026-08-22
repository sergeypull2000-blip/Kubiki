import { normalizePresentationSettings } from "../exportSettings.js";

const resultData = (result, message) => { if (result.error) throw new Error(`${message}: ${result.error.message}`, { cause: result.error }); return result.data; };
const owned = (row, userId) => { if (!row || row.user_id !== userId) throw new Error("Профиль экспорта недоступен"); return row; };

export function createExportProfileRepository(client) {
  if (!client) throw new Error("Supabase client is required");
  return {
    async loadProfile(userId) {
      const value = resultData(await client.from("studio_export_profiles").select("*").eq("user_id", userId).maybeSingle(), "Не удалось загрузить профиль экспорта");
      return value ? { exists: true, profile: owned(value, userId) } : { exists: false, profile: null };
    },
    async upsertProfile(userId, profile) {
      const settings = normalizePresentationSettings({ branding: profile });
      const row = { user_id: userId, company_name: settings.branding.companyName, logo_asset_path: settings.branding.logoAssetPath || null, logo_position: settings.branding.logoPosition, company_position: settings.branding.companyPosition, phone: settings.branding.phone, email: settings.branding.email, website: settings.branding.website, default_colors: settings.branding.colors, default_font: settings.branding.fontFamily, default_legal_text: profile.defaultLegalText || {} };
      return owned(resultData(await client.from("studio_export_profiles").upsert(row, { onConflict: "user_id" }).select().single(), "Не удалось сохранить профиль экспорта"), userId);
    },
    async uploadLogo(userId, file) {
      if (!file || file.size > 2 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Логотип должен быть PNG, JPEG или WebP размером до 2 МБ");
      const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" })[file.type];
      const path = `${userId}/logo-${Date.now()}.${extension}`;
      resultData(await client.storage.from("export-logos").upload(path, file, { upsert: false, contentType: file.type }), "Не удалось загрузить логотип");
      return path;
    },
    async removeLogo(path) { if (!path) return true; resultData(await client.storage.from("export-logos").remove([path]), "Не удалось удалить логотип"); return true; },
    async createLogoUrl(path, expiresIn = 3600) { return resultData(await client.storage.from("export-logos").createSignedUrl(path, expiresIn), "Не удалось открыть логотип").signedUrl; },
  };
}
