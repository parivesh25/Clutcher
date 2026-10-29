import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { AuditEntry, VerifyResult } from '../lib/types'
import ErrorNote from './ErrorNote'

/** Shows recent actions and lets anyone re-check that the log was not edited. */
export default function AuditPanel({ version }: { version: number }) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [result, setResult] = useState<VerifyResult | null>(null)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    api<AuditEntry[]>('/audit').then((e) => { setEntries(e.slice(0, 8)); setError('') }).catch((e: Error) => setError(e.message))
    setResult(null)
  }, [version])

  async function verify() {
    setChecking(true)
    setError('')
    try {
      setResult(await api<VerifyResult>('/audit/verify'))
    } catch (e) {
      setError((e as Error).message)
    }
    setChecking(false)
  }

  return (
    <section aria-label="Activity log">
      <h2>Activity log</h2>
      <p className="muted">Every change is chained to the one before it with a SHA-256 hash. Editing history breaks the chain.</p>
      <button onClick={verify} disabled={checking}>{checking ? 'Checking…' : 'Verify integrity'}</button>
      <div role="status">
        {result?.ok && <p className="ok">Chain intact. {result.checked} entries checked.</p>}
        {result && !result.ok && <p className="error">Chain broken at entry #{result.broken_at}. Something was changed after it was written.</p>}
      </div>
      <ErrorNote message={error} />
      {entries.length === 0 ? (
        <p className="muted">Nothing logged yet.</p>
      ) : (
        <ol className="log">
          {entries.map((e) => (
            <li key={e.id}>
              <span>{e.action}</span>
              <code title={e.hash}>{e.hash.slice(0, 10)}</code>
              <time dateTime={e.ts}>{new Date(e.ts).toLocaleTimeString()}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
