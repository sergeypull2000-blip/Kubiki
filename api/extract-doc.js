import { authenticateRequest } from "./_lib/auth.js";
import { decodeLegacyDocPayload, extractLegacyDoc } from "./_lib/legacyDoc.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await authenticateRequest(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const decoded = decodeLegacyDocPayload(req.body);
  if (!decoded.ok) return res.status(decoded.status).json({ error: decoded.error });
  const extracted = await extractLegacyDoc(decoded.buffer);
  if (!extracted.ok) return res.status(extracted.status).json({ error: extracted.error });
  return res.status(200).json({ text: extracted.text });
}
