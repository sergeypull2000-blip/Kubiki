import { useCallback, useEffect, useRef, useState } from "react";
import { legalAcceptancesRepository } from "../backend/runtimeRepositories.js";
import { LEGAL_DOCUMENT_VERSIONS } from "../legalConfig.js";
import { installAiDisclosureGate } from "../ai/disclosureGate.js";
import { AiDisclosureModal } from "./AiDisclosureModal.jsx";

const KEY = "ai_disclosure";

export function AiDisclosureProvider({ userId, children }) {
  const [accepted, setAccepted] = useState(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [improve, setImprove] = useState(false);
  const pending = useRef([]);

  useEffect(() => {
    let cancelled = false;
    setAccepted(null);
    legalAcceptancesRepository.list().then(({ acceptances = [] }) => {
      if (!cancelled) setAccepted(acceptances.some((item) => item.document_key === KEY && item.version === LEGAL_DOCUMENT_VERSIONS[KEY] && !item.revoked_at));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  const requireAcceptance = useCallback(async () => {
    if (accepted) return Promise.resolve(true);
    if (accepted === null) {
      try {
        const { acceptances = [] } = await legalAcceptancesRepository.list();
        if (acceptances.some((item) => item.document_key === KEY && item.version === LEGAL_DOCUMENT_VERSIONS[KEY] && !item.revoked_at)) {
          setAccepted(true);
          return true;
        }
      } catch {}
      setAccepted(false);
    }
    setOpen(true); setError(""); setImprove(false);
    return new Promise((resolve, reject) => pending.current.push({ resolve, reject }));
  }, [accepted]);

  useEffect(() => installAiDisclosureGate(requireAcceptance), [requireAcceptance]);

  const cancel = () => {
    setOpen(false);
    const requests = pending.current.splice(0);
    requests.forEach(({ reject }) => reject(Object.assign(new Error("AI-действие отменено"), { code: "ai_disclosure_cancelled" })));
  };
  const proceed = async () => {
    setSaving(true); setError("");
    try {
      await legalAcceptancesRepository.accept(userId, KEY, LEGAL_DOCUMENT_VERSIONS[KEY]);
      if (improve) await legalAcceptancesRepository.accept(userId, "ai_improvement_consent", LEGAL_DOCUMENT_VERSIONS.ai_improvement_consent);
      setAccepted(true); setOpen(false);
      pending.current.splice(0).forEach(({ resolve }) => resolve(true));
    } catch {
      setError("Не удалось сохранить согласие. Попробуйте ещё раз.");
    } finally { setSaving(false); }
  };

  return <>{children}{open && <AiDisclosureModal saving={saving} error={error} improve={improve} onImproveChange={setImprove} onCancel={cancel} onContinue={proceed} />}</>;
}
