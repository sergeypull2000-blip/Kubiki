/* ============================================================
   Vercel serverless: POST /api/parse-excel
   Принимает { sheet, filename } → вызывает DeepSeek API →
   возвращает JSON-структуру сметы.
   Ключ: process.env.DEEPSEEK_API_KEY (задаётся в Vercel Dashboard →
   Settings → Environment Variables)
   ============================================================ */

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-v4-flash";

const SYSTEM_PROMPT = `Ты разбираешь смету видеопродакшна из таблицы (источник — Excel или текстовый слой PDF). Верни ТОЛЬКО JSON по схеме, без пояснений и markdown.

Схема:
{"projectName": "строка или null", "stages": [{"name": "название этапа", "tasks": [{"name": "название задачи", "cost": 165000}]}], "warnings": ["строки, которые не удалось однозначно классифицировать"]}

Правила:
- Сначала найди строку заголовков. Определи, какая колонка = ИТОГОВАЯ СТОИМОСТЬ задачи (маркеры: «стоимость итого», «сумма», «итого», «цена»). Из неё бери cost. Если есть и «за единицу», и «итого» — бери «итого».
- НЕ используй как стоимость колонки количества, хронометража, смен, номера позиции, ставки за единицу.
- Этапы и задачи определяй по СМЫСЛУ, не по формату. Задача — строка с названием работы и итоговой стоимостью. Этап — группирующий заголовок (название раздела без собственной стоимости или над группой задач). Признаки вложенности разные и необязательные: нумерация (1., 1.1), КАПС, отступ, пустая цена у заголовка. Опирайся на совокупность.
- Если группировки нет и это плоский список задач с ценами — не выдумывай этапы: верни все задачи одним этапом «Смета». Никогда не создавай иерархию, которой нет.
- Игнорируй строки итогов и налогов («ИТОГО», «ИТОГО с НДС», общая сумма без названия задачи).
- cost — число без пробелов и валюты. Прочерк «-» = отсутствие значения.
- Не предполагай конкретный формат колонок/нумерации. Определяй роль строки и колонки по содержимому.
- Если текст пришёл из PDF, колонки восстановлены по координатам и могут быть не идеально выровнены (фрагменты одной ячейки иногда распадаются на несколько «|»-сегментов) — ориентируйся на смысл содержимого строки, а не на номер сегмента.`;

export default async function handler(req, res) {
  // CORS — разрешаем запросы с любого origin (для preview на Vercel)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return res.status(500).json({ error: "DEEPSEEK_API_KEY не задан в переменных окружения Vercel" });

  const { sheet, filename } = req.body || {};
  if (!sheet) return res.status(400).json({ error: "Нет sheet в теле запроса" });

  const userContent = `Файл: ${filename || "file"}\nСодержимое (геометрия таблицы):\n\n${sheet}`;

  try {
    const r = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: 0,
        max_tokens: 16000,
      }),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => "");
      console.error("DeepSeek API error:", r.status, errText);
      return res.status(502).json({ error: `DeepSeek API ответил ${r.status}. Попробуйте позже.` });
    }

    const data = await r.json();
    const choice = data.choices?.[0];
    const raw = choice?.message?.content;
    if (!raw) return res.status(502).json({ error: "DeepSeek вернул пустой ответ" });

    if (choice.finish_reason === "length") {
      console.error(
        `parse-excel: ответ обрезан по длине (finish_reason=length), длина ответа ${raw.length} символов`
      );
      return res.status(502).json({
        error:
          "Смета слишком большая — не удалось разобрать целиком. Попробуйте импортировать по частям или обратитесь к разработчику.",
      });
    }

    // Очистка от markdown-обёрток
    const clean = raw.replace(/```json/gi, "").replace(/```/g, "").trim();

    // Быстрая проверка, что ответ похож на завершённый JSON-объект,
    // прежде чем пытаться его парсить
    if (!clean.startsWith("{") || !clean.endsWith("}")) {
      console.error(
        `parse-excel: ответ не похож на завершённый JSON (длина ${clean.length} символов), начало: "${clean.slice(0, 50)}", конец: "${clean.slice(-50)}"`
      );
      return res.status(502).json({
        error:
          "Смета слишком большая — не удалось разобрать целиком. Попробуйте импортировать по частям или обратитесь к разработчику.",
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      console.error(
        `parse-excel: JSON.parse упал (${parseErr.message}), длина ответа ${clean.length} символов`
      );
      return res.status(502).json({
        error:
          "Смета слишком большая — не удалось разобрать целиком. Попробуйте импортировать по частям или обратитесь к разработчику.",
      });
    }

    return res.status(200).json(parsed);
  } catch (e) {
    console.error("parse-excel error:", e);
    return res.status(500).json({ error: e.message || "Внутренняя ошибка сервера" });
  }
}