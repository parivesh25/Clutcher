import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../lib/api'
import { ACCENT } from '../lib/config'
import type { Stats } from '../lib/types'
import ErrorNote from './ErrorNote'

const STATUS_LABELS: Record<string, string> = { open: 'Open', in_progress: 'In progress', done: 'Done' }

export default function StatsCharts({ version }: { version: number }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<Stats>('/stats').then((s) => { setStats(s); setError('') }).catch((e: Error) => setError(e.message))
  }, [version])

  if (error) return <ErrorNote message={error} />
  if (!stats) return <p className="muted">Loading numbers…</p>

  const categories = Object.entries(stats.by_category).map(([name, count]) => ({ name, count }))

  return (
    <section aria-label="Summary">
      <dl className="stats">
        <div><dt>Total</dt><dd>{stats.total}</dd></div>
        {Object.keys(STATUS_LABELS).map((k) => (
          <div key={k}><dt>{STATUS_LABELS[k]}</dt><dd>{stats.by_status[k] ?? 0}</dd></div>
        ))}
      </dl>
      {stats.total === 0 ? (
        <p className="muted">Charts appear once you add your first record.</p>
      ) : (
        <div className="charts">
          <div>
            <h3>By category</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={categories}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill={ACCENT} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <h3>Added per day</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={stats.by_day}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke={ACCENT} strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  )
}
