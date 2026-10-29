import type { MatchResponse, OpportunityType, StudentProfile } from '../lib/types'
import ErrorNote from './ErrorNote'
import Icon from './Icon'
import OpportunityCard from './OpportunityCard'

const TYPES: [OpportunityType | null, string][] = [
  [null, 'All'],
  ['internship', 'Internships'],
  ['hackathon', 'Hackathons'],
]

type Props = {
  result: MatchResponse | null
  loading: boolean
  error: string
  stale: boolean
  type: OpportunityType | null
  includeIneligible: boolean
  onType: (t: OpportunityType | null) => void
  onIncludeIneligible: (v: boolean) => void
  onRetry: () => void
  skillNames: Map<string, string>
  profile: StudentProfile | null
}

/** Ranked results, in the order the backend returned them. */
export default function MatchResults({ result, loading, error, stale, type, includeIneligible, onType, onIncludeIneligible, onRetry, skillNames, profile }: Props) {
  return (
    <section aria-label="Matches" className="results" aria-busy={loading}>
      <div className="toolbar">
        <div role="radiogroup" aria-label="Opportunity type" className="segmented">
          {TYPES.map(([v, label]) => (
            <button key={label} type="button" role="radio" aria-checked={type === v} className={type === v ? 'on' : ''} onClick={() => onType(v)} disabled={loading}>
              {label}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={includeIneligible} onChange={(e) => onIncludeIneligible(e.target.checked)} disabled={loading} />
          Show ones I'm not eligible for
        </label>
        {result && <span className="result-count" role="status">Showing <strong>{result.items.length}</strong> match{result.items.length === 1 ? '' : 'es'}</span>}
      </div>
      <p className="hint">Skill fit compares your selected skills with the listing. It is not a chance of acceptance.</p>

      <div role="status" aria-live="polite">
        {loading && <p className="sr-only">Finding matches…</p>}
        {!loading && stale && result && <p className="notice">Your profile changed since these results. Press “Find matches” to update them.</p>}
      </div>
      {error && (
        <div className="glass empty">
          <ErrorNote message={`Matching failed: ${error}`} />
          <button type="button" onClick={onRetry}>Try again</button>
        </div>
      )}

      {loading && (
        <ul className="cards" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => <li key={i} className="skeleton" />)}
        </ul>
      )}
      {!loading && !error && result === null && (
        <div className="glass empty">
          <span className="mini-icon"><Icon name="search" size={22} /></span>
          <p><strong>No results yet</strong></p>
          <p className="muted">Choose your skills and press “Find matches”.</p>
        </div>
      )}
      {!loading && !error && result?.items.length === 0 && (
        <div className="glass empty">
          <span className="mini-icon"><Icon name="compass" size={22} /></span>
          <p><strong>No open opportunities are available for these filters.</strong></p>
          <p className="muted">The catalogue may still be empty. Try another type or check back after opportunities are added.</p>
        </div>
      )}
      {!loading && !error && result && profile && result.items.length > 0 && (
        <>
          <p className="hint">
            {result.items.length} result{result.items.length === 1 ? '' : 's'} · evaluated <time dateTime={result.evaluated_at}>{new Date(result.evaluated_at).toLocaleString()}</time>
          </p>
          <ol className="cards">
            {result.items.map((m, i) => (
              <li key={m.opportunity.id}>
                <OpportunityCard match={m} rank={i + 1} skillNames={skillNames} profile={profile} />
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}
