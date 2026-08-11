import { useEffect, useState } from 'react'
import KubikiApp from './kubiki.jsx'
import { useGeistFont } from './hooks.js'
import { supabase } from './supabaseClient.js'
import { CSS } from './styles.js'

function App() {
  useGeistFont()
  const [session, setSession] = useState(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let isMounted = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return
      setSession(nextSession)
      setIsCheckingSession(false)
      if (nextSession) setAuthError('')
    })

    supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return
      setSession(data.session)
      if (error) setAuthError('Не удалось проверить сессию. Попробуйте войти снова.')
      setIsCheckingSession(false)
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  const handleSignIn = async (event) => {
    event.preventDefault()
    setAuthError('')
    setIsSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError('Не удалось войти. Проверьте email и пароль.')
    setIsSubmitting(false)
  }

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) setAuthError('Не удалось выйти. Попробуйте ещё раз.')
  }

  let content
  if (isCheckingSession) {
    content = <div className="kb-auth-screen"><div className="kb-auth-loading">Проверяем сессию…</div></div>
  } else if (!session) {
    content = <div className="kb-auth-screen">
      <form className="kb-auth-card" onSubmit={handleSignIn}>
        <div className="kb-auth-heading">Вход в Kubiki</div>
        <label className="kb-auth-field">
          <span>Email</span>
          <input className="kb-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)}
            autoComplete="email" required autoFocus />
        </label>
        <label className="kb-auth-field">
          <span>Пароль</span>
          <input className="kb-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password" required />
        </label>
        {authError && <div className="kb-auth-error" role="alert">{authError}</div>}
        <button className="kb-auth-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </div>
  } else {
    content = <KubikiApp key={session.user.id} userId={session.user.id} user={session.user} onSignOut={handleSignOut} />
  }

  return <><style>{CSS}</style>{content}</>
}

export default App
