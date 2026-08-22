export function AiDisclosureModal({ saving = false, error = "", onCancel, onContinue }) {
  return <div className="kb-modal-overlay" role="presentation">
    <div className="kb-modal kb-ai-disclosure" role="dialog" aria-modal="true" aria-labelledby="ai-disclosure-title">
      <div className="kb-modal-head"><span className="kb-modal-title" id="ai-disclosure-title">ИИ-функции Kubiki</span></div>
      <div className="kb-modal-body">
        <p>Для выполнения ИИ-запроса Kubiki передаёт содержимое запроса и необходимые для него данные проекта внешнему AI-провайдеру DeepSeek (КНР).</p>
        <p>Не добавляйте персональные, конфиденциальные или иные чувствительные данные, если у вас нет права на их обработку и передачу.</p>
        <p>Результат создаётся искусственным интеллектом и может содержать ошибки. Проверяйте его перед использованием.</p>
        <a className="kb-legal-link" href="/privacy" target="_blank" rel="noreferrer">Подробнее об обработке данных</a>
        {error && <div className="kb-auth-error" role="alert">{error}</div>}
        <div className="kb-modal-actions">
          <button type="button" className="kb-btn kb-btn-ghost" onClick={onCancel} disabled={saving}>Отмена</button>
          <button type="button" className="kb-btn kb-btn-primary" onClick={onContinue} disabled={saving}>{saving ? "Сохраняем…" : "Продолжить"}</button>
        </div>
      </div>
    </div>
  </div>;
}
