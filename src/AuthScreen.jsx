import { useState } from 'react'
import { createSessionGateway } from './backend/betterAuthClient.js'
import { describeAuthError } from './authErrors.js'
import { EXPIRED_VERIFICATION_MESSAGE } from './verificationCallback.js'

const auth = createSessionGateway()

/* Минимальная длина пароля Better Auth. */
const MIN_PASSWORD_LENGTH = 8

/*
   Экран аутентификации: вход / регистрация / сброс пароля / установка нового
   пароля после перехода по recovery-ссылке. Управляет собственным loading/
   error/notice состоянием; факт успешного входа/регистрации обрабатывает
   родитель через обновление Better Auth session.
*/
export function AuthScreen({ mode = 'signin', resetToken, verificationError, onPasswordUpdated, onAuthenticated }) {
  const [view, setView] = useState(verificationError ? 'verification-error' : mode === 'reset' ? 'reset' : mode === 'signup' ? 'signup' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [verificationEmail, setVerificationEmail] = useState('')
  const [resetSuccess, setResetSuccess] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [personalDataAccepted, setPersonalDataAccepted] = useState(false)

  const switchView = (next) => {
    setError('')
    setNotice('')
    setView(next)
    if (next === 'signin' || next === 'forgot') globalThis.history?.replaceState({}, '', '/login')
    if (next === 'signup') globalThis.history?.replaceState({}, '', '/signup')
    if (next === 'signup') { setTermsAccepted(false); setPersonalDataAccepted(false) }
  }

  const handleSignIn = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const { error } = await auth.signIn(email, password)
      if (error) {
        const message = describeAuthError(error)
        if (message === 'EMAIL_NOT_VERIFIED') {
          setVerificationEmail(email)
          setView('verify-email')
        }
        else setError(message)
      }
      else await onAuthenticated?.()
    } finally {
      setSubmitting(false)
    }
  }

  const handleSignUp = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!termsAccepted || !personalDataAccepted) {
      setError('Для регистрации необходимо принять условия и дать согласие на обработку персональных данных.')
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Пароль должен содержать минимум ${MIN_PASSWORD_LENGTH} символов.`)
      return
    }
    if (password !== confirmPassword) {
      setError('Пароли не совпадают.')
      return
    }
    setSubmitting(true)
    try {
      const { data, error } = await auth.signUp(email, password, email)
      if (error) {
        const code = String(error?.code || '').toLowerCase()
        if (code === 'account_exists_verified') {
          setError('Аккаунт с таким email уже существует. Войдите или восстановите пароль.')
          setView('signin')
        } else if (code === 'account_exists_unverified') {
          setVerificationEmail(email)
          setNotice('Для этого email уже создан аккаунт, но email ещё не подтверждён.')
          setView('verify-email')
        } else if (code.includes('already') || /already exists|already registered/i.test(String(error?.message || ''))) {
          setVerificationEmail(email)
          if (code.includes('verified') || /verified|confirmed/i.test(String(error?.message || ''))) {
            setError('Аккаунт с таким email уже существует. Войдите или восстановите пароль.')
            setView('signin')
          } else {
            setNotice('Для этого email уже создан аккаунт, но email ещё не подтверждён.')
            setView('verify-email')
          }
        } else setError(describeAuthError(error))
        return
      }
      setVerificationEmail(email)
      if (data?.verificationEmailSent === false) {
        setNotice('Не удалось отправить письмо. Отправьте его повторно кнопкой ниже.')
      }
      setView('verify-email')
    } catch (error) {
      setError(describeAuthError(error))
    } finally {
      setSubmitting(false)
    }
  }

  const resendVerification = async () => {
    setError('')
    setSubmitting(true)
    try {
      const { error } = await auth.sendVerificationEmail(verificationEmail)
      if (error) setError(describeAuthError(error))
      else setNotice('Письмо отправлено повторно.')
    } finally { setSubmitting(false) }
  }

  if (view === 'verification-error') return (
    <div className="kb-auth-screen"><div className="kb-auth-card">
      <div className="kb-auth-heading">Подтвердите email</div>
      <div className="kb-auth-error" role="alert">{EXPIRED_VERIFICATION_MESSAGE}</div>
      <label className="kb-auth-field">
        <span>Email</span>
        <input className="kb-input" type="email" value={verificationEmail}
          onChange={(event) => setVerificationEmail(event.target.value)}
          autoComplete="email" required autoFocus />
      </label>
      {notice && <div className="kb-auth-notice" role="status">{notice}</div>}
      {error && <div className="kb-auth-error" role="alert">{error}</div>}
      <button className="kb-auth-submit" type="button" onClick={resendVerification} disabled={submitting || !verificationEmail}>Отправить новое письмо</button>
      <button type="button" className="kb-auth-link" onClick={() => switchView('signin')}>Вернуться ко входу</button>
    </div></div>
  )

  const handleForgot = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    setSubmitting(true)
    try {
      const { error } = await auth.requestPasswordReset(email, `${window.location.origin}/reset-password`)
      if (error) setError(describeAuthError(error))
      else setNotice('Ссылка для сброса пароля отправлена на почту.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleResetPassword = async (event) => {
    event.preventDefault()
    setError('')
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Пароль должен содержать минимум ${MIN_PASSWORD_LENGTH} символов.`)
      return
    }
    if (password !== confirmPassword) {
      setError('Пароли не совпадают.')
      return
    }
    setSubmitting(true)
    try {
      const { error } = await auth.resetPassword(password, resetToken)
      if (error) setError(describeAuthError(error))
      else setResetSuccess(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (view === 'verify-email' && verificationEmail) return (
    <div className="kb-auth-screen"><div className="kb-auth-card">
      <div className="kb-auth-heading">Подтвердите email</div>
      <div className="kb-auth-subtext">Мы отправили письмо на {verificationEmail}. Перейдите по ссылке из письма, чтобы активировать аккаунт.</div>
      {notice && <div className="kb-auth-notice" role="status">{notice}</div>}
      {error && <div className="kb-auth-error" role="alert">{error}</div>}
      <button className="kb-auth-submit" type="button" onClick={resendVerification} disabled={submitting}>Отправить письмо повторно</button>
      <button type="button" className="kb-auth-link" onClick={() => { switchView('signin') }}>Вернуться ко входу</button>
    </div></div>
  )

  if (resetSuccess) return (
    <div className="kb-auth-screen"><div className="kb-auth-card">
      <div className="kb-auth-heading">Пароль изменён</div>
      <div className="kb-auth-subtext">Новый пароль сохранён. Теперь вы можете войти в Kubiki с новым паролем.</div>
      <button className="kb-auth-submit" type="button" onClick={() => onPasswordUpdated?.()}>Перейти ко входу</button>
    </div></div>
  )

  const heading =
    view === 'signin' ? 'Вход в Kubiki'
      : view === 'signup' ? 'Создать аккаунт'
      : view === 'forgot' ? 'Сброс пароля'
      : 'Новый пароль'

  const subtext =
    view === 'forgot'
      ? 'Укажите email — пришлём ссылку для сброса пароля.'
      : view === 'reset'
        ? 'Задайте новый пароль для входа.'
        : null

  const submitLabel =
    view === 'signin' ? 'Войти'
      : view === 'signup' ? 'Создать аккаунт'
      : view === 'forgot' ? 'Отправить ссылку'
      : 'Сохранить пароль'

  const submitLoadingLabel =
    view === 'signin' ? 'Входим…'
      : view === 'signup' ? 'Создаём…'
      : view === 'forgot' ? 'Отправляем…'
      : 'Сохраняем…'

  const onSubmit =
    view === 'signin' ? handleSignIn
      : view === 'signup' ? handleSignUp
      : view === 'forgot' ? handleForgot
      : handleResetPassword

  return (
    <div className="kb-auth-screen">
      <form className="kb-auth-card" onSubmit={onSubmit}>
        <div className="kb-auth-heading">{heading}</div>
        {subtext && <div className="kb-auth-subtext">{subtext}</div>}
        {notice && <div className="kb-auth-notice" role="status">{notice}</div>}
        {error && <div className="kb-auth-error" role="alert">{error}</div>}

        {view === 'reset' ? (
          <>
            <label className="kb-auth-field">
              <span>Новый пароль</span>
              <input className="kb-input" type="password" value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password" required autoFocus />
            </label>
            <label className="kb-auth-field">
              <span>Повторите пароль</span>
              <input className="kb-input" type="password" value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password" required />
            </label>
          </>
        ) : (
          <>
            <label className="kb-auth-field">
              <span>Email</span>
              <input className="kb-input" type="email" value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email" required autoFocus />
            </label>
            {view !== 'forgot' && (
              <label className="kb-auth-field">
                <span>Пароль</span>
                <input className="kb-input" type="password" value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={view === 'signup' ? 'new-password' : 'current-password'} required />
              </label>
            )}
            {view === 'signup' && (
              <>
                <label className="kb-auth-field">
                  <span>Повторите пароль</span>
                  <input className="kb-input" type="password" value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password" required />
                </label>
                <label className="kb-auth-consent"><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
                  <span>Я принимаю <a href="/terms" target="_blank" rel="noreferrer">Условия использования Kubiki Beta</a></span>
                </label>
                <label className="kb-auth-consent"><input type="checkbox" checked={personalDataAccepted} onChange={(event) => setPersonalDataAccepted(event.target.checked)} />
                  <span>Я даю согласие на обработку моих <a href="/personal-data-consent" target="_blank" rel="noreferrer">персональных данных</a></span>
                </label>
                <a className="kb-auth-privacy" href="/privacy" target="_blank" rel="noreferrer">Политика обработки персональных данных</a>
              </>
            )}
          </>
        )}

        <button className="kb-auth-submit" type="submit" disabled={submitting || (view === 'signup' && (!termsAccepted || !personalDataAccepted))}>
          {submitting ? submitLoadingLabel : submitLabel}
        </button>

        {view === 'signin' && (
          <div className="kb-auth-links">
            <button type="button" className="kb-auth-link" onClick={() => switchView('forgot')}>Забыли пароль?</button>
            <button type="button" className="kb-auth-link" onClick={() => switchView('signup')}>Создать аккаунт</button>
          </div>
        )}
        {view === 'signup' && (
          <div className="kb-auth-links">
            <button type="button" className="kb-auth-link" onClick={() => switchView('signin')}>Уже есть аккаунт? Войти</button>
          </div>
        )}
        {view === 'forgot' && (
          <div className="kb-auth-links">
            <button type="button" className="kb-auth-link" onClick={() => switchView('signin')}>Назад ко входу</button>
          </div>
        )}
      </form>
    </div>
  )
}
