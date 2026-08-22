export class ExportLogoError extends Error {
  constructor(code, message, options = {}) { super(message, options); this.name = "ExportLogoError"; this.code = code; }
}

async function blobToDataUrl(blob) {
  if (blob.type === "image/webp") {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0); bitmap.close();
    return canvas.toDataURL("image/png");
  }
  return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
}

export async function fetchFreshLogoDataUrl(path, { logoRepository, fetchImpl = fetch } = {}) {
  if (!path) return "";
  if (!logoRepository || typeof logoRepository.createLogoUrl !== "function") throw new ExportLogoError("logo_url_endpoint_failed", "Не удалось получить адрес логотипа для экспорта.");
  let signedUrl;
  try { signedUrl = await logoRepository.createLogoUrl(path); }
  catch {
    try { signedUrl = await logoRepository.createLogoUrl(path); }
    catch (retryError) { throw new ExportLogoError("logo_url_endpoint_failed", "Не удалось получить адрес логотипа для экспорта.", { cause: retryError }); }
  }
  try {
    const response = await fetchImpl(signedUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await blobToDataUrl(await response.blob());
  } catch {
    try { signedUrl = await logoRepository.createLogoUrl(path); }
    catch (refreshError) { throw new ExportLogoError("logo_url_endpoint_failed", "Не удалось обновить адрес логотипа для экспорта.", { cause: refreshError }); }
    try {
      const response = await fetchImpl(signedUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await blobToDataUrl(await response.blob());
    } catch (retryError) { throw new ExportLogoError("logo_fetch_failed", "Не удалось загрузить логотип для PDF.", { cause: retryError }); }
  }
}
