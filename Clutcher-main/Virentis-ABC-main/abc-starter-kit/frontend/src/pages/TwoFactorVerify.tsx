import { FormEvent, useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import ErrorNote from '../components/ErrorNote'
import { supabase } from '../lib/supabase'

/** Second step of signing in: type the code from the authenticator app. */
export default function TwoFactorVerify() {
  const { session, loading, refresh, signOut } = useAuth()
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!session) return
    supabase.auth.mfa.listFactors().then(({ data }) => setFactorId(data?.totp[0]?.id ?? ''))
  }, [session])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() })
    if (error) setError(error.message)
    else {
      await refresh()
      navigate('/', { replace: true })
    }
    setBusy(false)
  }

  if (loading) return <p className="center muted">Loading…</p>
  if (!session) return <Navigate to="/login" replace />

  return (
    <main className="narrow">
      <h1>Enter your 6-digit code</h1>
      <p>Open your authenticator app and type the current code for this account.</p>
      <form onSubmit={submit} className="stack">
        <label>
          6-digit code
          <input
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="one-time-code"
            autoFocus
            required
          />
        </label>
        <ErrorNote message={error} />
        <button className="primary" disabled={busy || !factorId}>
          {busy ? 'Checking…' : 'Verify'}
        </button>
      </form>
      <p className="muted">
        <button className="link" onClick={() => void signOut()}>Sign out</button>
      </p>
    </main>
  )
}
