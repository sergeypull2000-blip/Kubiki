export function describeAuthError(error) {
  const code = String(error?.code || '').toLowerCase()
  const msg = String(error?.message || '')
  if (code === 'user_already_exists' || /already registered|already been registered|user already exists/i.test(msg)) return 'Пользователь с таким email уже зарегистрирован'
  if (code === 'invalid_credentials' || /invalid (email|login) credentials|invalid email or password/i.test(msg)) return 'Неверный email или пароль'
  if (code === 'weak_password' || /password should be at least|password.*(too short|invalid)|invalid password/i.test(msg)) return 'Пароль не соответствует требованиям'
  if (code === 'email_not_confirmed' || code === 'email_not_verified' || code === 'email_not_verified' || /email (not confirmed|not verified)/i.test(msg)) return 'EMAIL_NOT_VERIFIED'
  if (/rate limit|too many requests/i.test(msg) || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'Слишком много попыток. Попробуйте немного позже.'
  if (error?.name === 'TypeError' || /network|fetch failed|server error|internal server/i.test(msg)) return 'Не удалось выполнить запрос. Попробуйте ещё раз.'
  return 'Что-то пошло не так. Попробуйте ещё раз.'
}
