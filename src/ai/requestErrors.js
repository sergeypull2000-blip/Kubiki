const STATUS_MESSAGES = {
  400: "Проверьте текст брифа и дополнительную инструкцию.",
  401: "Сессия недействительна. Войдите снова.",
  404: "Смета не найдена или недоступна.",
  409: "Смета изменилась. Повторите AI-запрос.",
  413: "Бриф или файл слишком большой.",
  429: "Сервис генерации временно перегружен. Попробуйте немного позже.",
  502: "Модель не смогла вернуть корректную смету. Попробуйте ещё раз.",
  503: "Сервис генерации временно недоступен. Попробуйте позже.",
  504: "Генерация заняла слишком много времени. Попробуйте ещё раз.",
};

export function safeServerMessage(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 240);
}

export function requestErrorMessage(status, serverMessage, fallback = "Не удалось выполнить запрос. Попробуйте ещё раз.") {
  return safeServerMessage(serverMessage) || STATUS_MESSAGES[status] || fallback;
}
