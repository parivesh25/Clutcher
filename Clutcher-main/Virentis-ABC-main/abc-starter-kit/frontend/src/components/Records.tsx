import { FormEvent, useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { RecordItem } from '../lib/types'
import ErrorNote from './ErrorNote'

const STATUSES = [
  ['open', 'Open'],
  ['in_progress', 'In progress'],
  ['done', 'Done'],
] as const

/** The main table. Rename "record" to your problem's word (case, complaint, expense...). */
export default function Records({ version, onChange }: { version: number; onChange: () => void }) {
  const [items, setItems] = useState<RecordItem[] | null>(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('general')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setItems(await api<RecordItem[]>('/records'))
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => { void load() }, [load, version])

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id)
    setError('')
    try {
      await action()
      onChange()
    } catch (e) {
      setError((e as Error).message)
    }
    setBusyId('')
  }

  async function add(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api('/records', { method: 'POST', body: { title, category, body } })
      setTitle('')
      setBody('')
      onChange()
    } catch (err) {
      setError((err as Error).message)
    }
    setSaving(false)
  }

  return (
    <section aria-label="Records">
      <h2>Records</h2>
      <form onSubmit={add} className="add-form">
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
        </label>
        <label>
          Category
          <input value={category} onChange={(e) => setCategory(e.target.value)} maxLength={50} />
        </label>
        <label className="wide">
          Details
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
        </label>
        <button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Add record'}</button>
      </form>

      <ErrorNote message={error} />

      {items === null ? (
        <p className="muted">Loading records…</p>
      ) : items.length === 0 ? (
        <p className="muted">No records yet. Add one above to see the charts and audit log fill in.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Title</th><th>Category</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.title}</strong>
                    {r.ai_summary && <pre className="summary">{r.ai_summary}</pre>}
                  </td>
                  <td>{r.category}</td>
                  <td>
                    <select
                      aria-label={`Status of ${r.title}`}
                      value={r.status}
                      disabled={busyId === r.id}
                      onChange={(e) => run(r.id, () => api(`/records/${r.id}`, { method: 'PUT', body: { status: e.target.value } }))}
                    >
                      {STATUSES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                    </select>
                  </td>
                  <td className="actions">
                    <button disabled={busyId === r.id} onClick={() => run(r.id, () => api(`/records/${r.id}/summarize`, { method: 'POST' }))}>
                      {busyId === r.id ? 'Working…' : 'Summarise with AI'}
                    </button>
                    <button
                      className="danger"
                      disabled={busyId === r.id}
                      onClick={() => window.confirm(`Delete "${r.title}"?`) && run(r.id, () => api(`/records/${r.id}`, { method: 'DELETE' }))}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
