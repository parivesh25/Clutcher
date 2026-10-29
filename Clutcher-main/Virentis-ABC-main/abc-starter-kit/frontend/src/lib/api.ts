import { BACKEND_URL } from './config'
import { supabase } from './supabase'

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

type Options = { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown }

let expiredLoginRedirect: Promise<void> | null = null

/** Call the Flask API with the signed-in user's token attached. */
export async function api<T>(path: string, { method = 'GET', body }: Options = {}): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  let res: Response
  try {
    res = await fetch(`${BACKEND_URL}/api${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(`Cannot reach the backend at ${BACKEND_URL}. Is Flask running?`, 0)
  }

  const json = await res.json().catch(() => ({}))
  if (res.status === 401 && token) {
    // A rejected token cannot use any protected button. Clear just this browser's
    // session and take the student back to sign-in instead of leaving a broken form.
    expiredLoginRedirect ??= supabase.auth.signOut({ scope: 'local' })
      .then(() => { window.location.replace('/login') })
    await expiredLoginRedirect
  }
  // When not logged in, return an empty object or allow caller to handle gracefully without hard throwing
  if (!res.ok) {
    if (res.status === 401 && !token) {
      // Return empty/null data gracefully for unauthenticated guest browsing
      return (json || {}) as T
    }
    throw new ApiError(json.error ?? `Request failed (${res.status})`, res.status)
  }
  return json as T
}
