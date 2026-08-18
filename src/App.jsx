import { useEffect, useState } from 'react'
import KubikiApp from './kubiki.jsx'
import { AuthScreen } from './AuthScreen.jsx'
import { useGeistFont } from './hooks.js'
import { supabase } from './supabaseClient.js'
import { CSS } from './styles.js'

// Флаг «нужно задать новый пароль». Храним в sessionStorage, чтобы пережил
// reload вкладки (PASSWORD_RECOVERY при reload не повторяется), но не утекал
// между вкладками.
const PASSWORD_RECOVERY_FLAG = 'kubiki:passwordRecovery'

function App() {
  useGeistFont()
  const [session, setSession] = useState(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  // true → пользователь перешёл по recovery-ссылке и должен задать новый пароль.
  const [recoveryMode, setRecoveryMode] = useState(false)

  useEffect(() => {
    let isMounted = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return
      setSession(nextSession)
      setIsCheckingSession(false)
      if (event === 'PASSWORD_RECOVERY') {
        sessionStorage.setItem(PASSWORD_RECOVERY_FLAG, '1')
        setRecoveryMode(true)
      } else if (event === 'SIGNED_OUT') {
        sessionStorage.removeItem(PASSWORD_RECOVERY_FLAG)
        setRecoveryMode(false)
      }
    })

    // Страховка: если проверка сессии зависнет (проблемы со storage/сетью),
    // не показываем бесконечный белый экран — через 5с всё равно показываем
    // экран входа.
    const failSafe = setTimeout(() => {
      if (!isMounted) return
      setIsCheckingSession(false)
    }, 5000)

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return
      clearTimeout(failSafe)
      setSession(data.session)
      // после reload recovery-сессии событие PASSWORD_RECOVERY не повторяется —
      // восстанавливаем «нужно задать пароль» по флагу
      if (data.session && sessionStorage.getItem(PASSWORD_RECOVERY_FLAG) === '1') setRecoveryMode(true)
      setIsCheckingSession(false)
    }).catch(() => {
      if (!isMounted) return
      clearTimeout(failSafe)
      setIsCheckingSession(false)
    })

    return () => {
      isMounted = false
      clearTimeout(failSafe)
      subscription.unsubscribe()
    }
  }, [])

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) console.error('Sign out failed', error)
    // успех → onAuthStateChange получит SIGNED_OUT и вернёт экран входа
  }

  const handlePasswordUpdated = () => {
    sessionStorage.removeItem(PASSWORD_RECOVERY_FLAG)
    setRecoveryMode(false)
  }

  let content
  if (isCheckingSession) {
    content = <div className="kb-auth-screen"><div className="kb-auth-loading">Проверяем сессию…</div></div>
  } else if (recoveryMode) {
    // recovery-сессия уже есть, но пользователь ещё не задал новый пароль
    content = <AuthScreen mode="reset" onPasswordUpdated={handlePasswordUpdated} />
  } else if (!session) {
    content = <AuthScreen mode="signin" />
  } else {
    content = <KubikiApp key={session.user.id} userId={session.user.id} user={session.user} onSignOut={handleSignOut} />
  }

  return <><style>{CSS}</style>{content}</>
}

export default App
