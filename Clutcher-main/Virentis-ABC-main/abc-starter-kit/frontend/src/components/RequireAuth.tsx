import { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { REQUIRE_2FA } from '../lib/config'

/** Wrap any page that needs a signed-in (and, if enabled, 2FA-verified) user. */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, aal, hasFactor } = useAuth()
  const location = useLocation()

  if (loading) return <p className="center muted">Loading…</p>
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (REQUIRE_2FA && !hasFactor) return <Navigate to="/2fa/setup" replace />
  // Signed in with a password, but this account has 2FA and the code was not entered yet.
  if (aal.current === 'aal1' && aal.next === 'aal2') return <Navigate to="/2fa/verify" replace />
  return <>{children}</>
}
