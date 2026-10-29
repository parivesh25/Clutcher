import { daysLeft, daysLeftLabel } from '../lib/format'
import type { MatchResponse, StudentProfile } from '../lib/types'
import type { View } from './AppShell'
import MatchGraph from './MatchGraph'
import { ELIGIBILITY, TYPE_LABEL } from './OpportunityCard'

const LEVEL = { school: 'School', undergraduate: 'Undergraduate', postgraduate: 'Postgraduate', other: 'Other' } as const

type Props = {
  name: string
  profile: StudentProfile | null
  skillNames: Map<string, string>
  result: MatchResponse | null
  matching: boolean
  onMatch: () => void
  go: (v: View) => void
}

/** Landing page tiles. Counts and lists are read straight from the backend's latest results. */
export default function HomeOverview({ name, profile, skillNames, result, matching, onMatch, go }: Props) {
  const items = result?.items ?? []
  const count = (s: string) => items.filter((m) => m.eligibility_status === s).length
  const withDays = items.map((m) => ({ m, days: daysLeft(m.opportunity) }))
  const closing = withDays.filter((x) => x.days !== null && x.days >= 0).sort((a, b) => a.days! - b.days!)
  const n = (v: number) => (result ? v : '–')

  return (
    <div className="bento">
      <section className="tile-card intro" aria-labelledby="intro-h">
        <p className="label-mono">{name ? `Signed in as ${name}` : 'Student matcher'}</p>
        <h2 id="intro-h">Internships and hackathons that fit what you can already do.</h2>
        <p className="muted">Each result shows which skills match, what is missing, whether you can apply, and when it closes.</p>
        {profile && (
          <ul className="chips" aria-label="Your profile">
            {profile.skill_ids.length === 0 && <li className="chip ghost">No skills yet</li>}
            {profile.skill_ids.slice(0, 5).map((id) => <li key={id} className="chip">{skillNames.get(id) ?? id}</li>)}
            {profile.skill_ids.length > 5 && <li className="chip">+{profile.skill_ids.length - 5}</li>}
            <li className={profile.country_code ? 'chip' : 'chip ghost'}>{profile.country_code ?? 'No country'}</li>
            <li className={profile.study_level ? 'chip' : 'chip ghost'}>{profile.study_level ? LEVEL[profile.study_level] : 'No study level'}</li>
            <li className={profile.graduation_year ? 'chip' : 'chip ghost'}>{profile.graduation_year ? `Class of ${profile.graduation_year}` : 'No grad year'}</li>
          </ul>
        )}
        <div className="form-actions">
          <button className="primary" type="button" onClick={onMatch} disabled={matching || !profile}>{matching ? 'Matching…' : 'Find matches'}</button>
          <button type="button" onClick={() => go('profile')}>Edit profile</button>
        </div>
      </section>

      <section className="tile-card graph-tile" aria-labelledby="graph-h">
        <div className="tile-head">
          <div>
            <h2 id="graph-h">Match map</h2>
            <p className="label-mono">{result ? `${items.length} open · evaluated ${new Date(result.evaluated_at).toLocaleDateString()}` : 'Your skills, before matching'}</p>
          </div>
          <button type="button" className="ghost-btn" onClick={() => go('discover')}>Open list</button>
        </div>
        {profile ? <MatchGraph profile={profile} skillNames={skillNames} result={result} onOpen={() => go('discover')} /> : <p className="muted">Loading your profile…</p>}
      </section>

      <section className="tile-card" aria-labelledby="counts-h">
        <h2 id="counts-h" className="label-mono">Latest match</h2>
        <dl className="count-list">
          <div><dt><i className="sq s-all" />Open matches</dt><dd>{n(items.length)}</dd></div>
          <div><dt><i className="sq s-eligible" />Eligible</dt><dd>{n(count('eligible'))}</dd></div>
          <div><dt><i className="sq s-needs_verification" />Needs verification</dt><dd>{n(count('needs_verification'))}</dd></div>
          <div><dt><i className="sq s-ineligible" />Not eligible (shown)</dt><dd>{n(count('ineligible'))}</dd></div>
          <div><dt><i className="sq s-soon" />Closing in 14 days</dt><dd>{n(closing.filter((x) => x.days! <= 14).length)}</dd></div>
          <div><dt><i className="sq s-unknown" />Unknown deadline</dt><dd>{n(withDays.filter((x) => x.days === null).length)}</dd></div>
        </dl>
      </section>

      <section className="tile-card legend" aria-labelledby="legend-h">
        <h2 id="legend-h" className="label-mono">Reading the map</h2>
        <ul>
          <li><svg viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="14" rx="3" className="lg-you" /></svg>You</li>
          <li><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="5" className="lg-mine" /></svg>A skill you selected</li>
          <li><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="4.5" className="lg-gap" /></svg>A skill a listing asks for that you haven't selected</li>
          <li><svg viewBox="0 0 20 20"><rect x="4" y="4" width="12" height="12" rx="2" className="lg-opp" /></svg>An opportunity; bigger square means higher skill fit</li>
          <li><svg viewBox="0 0 28 20"><line x1="2" y1="10" x2="26" y2="10" className="lg-has" /></svg>Skill you share with the listing</li>
          <li><svg viewBox="0 0 28 20"><line x1="2" y1="10" x2="26" y2="10" className="lg-need" /></svg>Required skill you're missing</li>
          <li><svg viewBox="0 0 28 20"><line x1="2" y1="10" x2="26" y2="10" className="lg-nice" /></svg>Preferred skill you're missing</li>
        </ul>
      </section>

      <section className="tile-card" aria-labelledby="top-h">
        <div className="tile-head"><h2 id="top-h" className="label-mono">Top matches</h2><button type="button" className="link" onClick={() => go('discover')}>See all</button></div>
        {items.length === 0 ? (
          <p className="placeholder">{result ? 'No open results yet. Check back after opportunities are added or try other filters.' : 'Your best matches show here after you press “Find matches”.'}</p>
        ) : (
          <ol className="rank-list">
            {items.slice(0, 4).map((m, i) => (
              <li key={m.opportunity.id}>
                <span className="rank-no">{String(i + 1).padStart(2, '0')}</span>
                <div className="rank-body">
                  <span className="mini-title">{m.opportunity.title}</span>
                  <span className="mini-sub">{TYPE_LABEL[m.opportunity.opportunity_type]} · {m.opportunity.organization ?? 'Organization not stated'}</span>
                </div>
                <div className="rank-side">
                  <span className="num">{m.skill_fit === null ? 'n/a' : `${m.skill_fit.toFixed(1)}%`}</span>
                  <span className={ELIGIBILITY[m.eligibility_status].className}>{ELIGIBILITY[m.eligibility_status].label}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="tile-card" aria-labelledby="soon-h">
        <h2 id="soon-h" className="label-mono">Closing soon</h2>
        {closing.length === 0 ? (
          <p className="placeholder">{result ? 'None of these results states a deadline.' : 'Deadlines from your matches show here.'}</p>
        ) : (
          <ol className="rank-list">
            {closing.slice(0, 4).map(({ m, days }) => (
              <li key={m.opportunity.id}>
                <span className={days! <= 14 ? 'day-box soon' : 'day-box'}><b>{days}</b>d</span>
                <div className="rank-body">
                  <span className="mini-title">{m.opportunity.title}</span>
                  <span className="mini-sub">{m.opportunity.deadline_text ?? daysLeftLabel(days)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
