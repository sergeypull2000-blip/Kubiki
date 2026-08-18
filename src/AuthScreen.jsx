import { useState } from 'react'
import { supabase } from './supabaseClient.js'
import { userFlagsRepository } from './repositories/userFlagsRepository.js'
import { productEventsRepository } from './repositories/productEventsRepository.js'

/* Минимальная длина пароля (совпадает с требованием Supabase). */
const MIN_PASSWORD_LENGTH = 6

/* Превращаем англоязычные ошибки Supabase Auth в понятные пользователю. */
function describeAuthError(error) {
  const code = error?.code
  const msg = error?.message || ''
  if (code === 'user_already_exists' || /already registered|already been registered/i.test(msg))
    return 'Пользователь с таким email уже существует.'
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg))
    return 'Неверный email или пароль.'
  if (code === 'weak_password' || /password should be at least/i.test(msg))
    return `Пароль должен содержать минимум ${MIN_PASSWORD_LENGTH} символов.`
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg))
    return 'Email не подтверждён. Проверьте почту.'
  if (code === 'same_password' || /new password.*same.*old|same password/i.test(msg))
    return 'Новый пароль не должен совпадать со старым.'
  if (/rate limit/i.test(msg) || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit')
    return 'Слишком много попыток. Попробуйте позже.'
  return msg || 'Не удалось выполнить действие. Попробуйте ещё раз.'
}

/*
   Экран аутентификации: вход / регистрация / сброс пароля / установка нового
   пароля после перехода по recovery-ссылке. Управляет собственным loading/
   error/notice состоянием; факт успешного входа/регистрации обрабатывает
   родитель через onAuthStateChange (session становится непустой).
*/
export function AuthScreen({ mode = 'signin', onPasswordUpdated }) {
  const [view, setView] = useState(mode === 'reset' ? 'reset' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const switchView = (next) => {
    setError('')
    setNotice('')
    setView(next)
  }

  const handleSignIn = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(describeAuthError(error))
      // успех → onAuthStateChange выставит session, App отрисует Kubiki
    } finally {
      setSubmitting(false)
    }
  }

  const handleSignUp = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
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
      // emailRedirectTo важен на случай, если позже включим email confirmation:
      // сейчас (confirmation off) signUp сразу возвращает сессию.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) { setError(describeAuthError(error)); return }
      if (data?.session) {
        // confirmation выключен → сессия уже есть, App сам переключит на Kubiki.
        // Свежая регистрация: создаём строку user_flags (beta_welcome_seen=false),
        // чтобы при первом входе показать одноразовое приветствие Beta.
        userFlagsRepository.ensureFlags(data.session.user.id).catch(() => {})
        productEventsRepository.track(data.session.user.id, 'signup').catch(() => {})
      } else {
        setNotice('Аккаунт создан. Проверьте почту и подтвердите email, затем войдите.')
        setView('signin')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleForgot = async (event) => {
    event.preventDefault()
    setError('')
    setNotice('')
    setSubmitting(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      })
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
      const { error } = await supabase.auth.updateUser({ password })
      if (error) setError(describeAuthError(error))
      else if (onPasswordUpdated) onPasswordUpdated()
    } finally {
      setSubmitting(false)
    }
  }

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
              <label className="kb-auth-field">
                <span>Повторите пароль</span>
                <input className="kb-input" type="password" value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password" required />
              </label>
            )}
          </>
        )}

        <button className="kb-auth-submit" type="submit" disabled={submitting}>
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
