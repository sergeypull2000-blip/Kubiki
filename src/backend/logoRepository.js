export function createHttpLogoRepository(request) {
  if (typeof request !== "function") throw new TypeError("request is required");
  return {
    async uploadLogo(_userId, file) {
      const form = new FormData();
      form.set("file", file);
      return (await request("/api/export-profile/logo", { method: "POST", body: form })).path;
    },
    async createLogoUrl(path) {
      return (await request(`/api/export-profile/logo-url?path=${encodeURIComponent(path)}`)).signedUrl;
    },
    async removeLogo() {
      return (await request("/api/export-profile/logo", { method: "DELETE" })).ok !== false;
    },
  };
}
