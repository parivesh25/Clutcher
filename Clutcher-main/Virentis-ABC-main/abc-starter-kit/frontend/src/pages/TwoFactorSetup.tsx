import { FormEvent, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import ErrorNote from '../components/ErrorNote'
import { supabase } from '../lib/supabase'

type Enrollment = { factorId: string; qr: string; secret: string }

/** Connect an authenticator app (Google Authenticator, Authy, 1Password...) to this account. */
export default function TwoFactorSetup() {
  const { session, loading, refresh, hasFactor } = useAuth()
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const started = useRef(false) // stops React StrictMode from enrolling twice in development
  const navigate = useNavigate()

  useEffect(() => {
    if (!session || started.current) return
    started.current = true
    ;(async () => {
      // Remove half-finished setups from earlier attempts, or Supabase refuses to start a new one.
      const existing = await supabase.auth.mfa.listFactors()
      for (const f of existing.data?.all ?? []) {
        if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `authenticator-${Date.now()}`,
      })
      if (error || !data) setError(error?.message ?? 'Could not start 2FA setup.')
      else setEnrollment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
    })()
  }, [session])

  async function verify(e: FormEvent) {
    e.preventDefault()
    if (!enrollment) return
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollment.factorId, code: code.trim() })
    if (error) setError(error.message)
    else {
      await refresh()
      navigate('/', { replace: true })
    }
    setBusy(false)
  }

  if (loading) return <p className="center muted">Loading…</p>
  if (!session) return <Navigate to="/login" replace />
  if (hasFactor && !enrollment) return <Navigate to="/" replace />

  return (
    <main className="narrow">
      <h1>Set up two-factor sign-in</h1>
      <p>Scan this code with an authenticator app, then type the 6-digit number it shows.</p>
      {enrollment ? (
        <>
          <img className="qr" src={enrollment.qr} alt="QR code for your authenticator app" />
          <p className="hint">
            Can't scan? Enter this key by hand: <code>{enrollment.secret}</code>
          </p>
          <form onSubmit={verify} className="stack">
            <label>
              6-digit code
              <input
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
                required
              />
            </label>
            <ErrorNote message={error} />
            <button className="primary" disabled={busy}>
              {busy ? 'Checking…' : 'Turn on 2FA'}
            </button>
          </form>
        </>
      ) : (
        <>
          <ErrorNote message={error} />
          {!error && <p className="muted">Preparing your code…</p>}
        </>
      )}
    </main>
  )
}
