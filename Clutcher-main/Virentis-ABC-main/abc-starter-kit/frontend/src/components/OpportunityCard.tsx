import type { CSSProperties } from 'react'
import { daysLeft, daysLeftLabel, formatDate, formatInstant } from '../lib/format'
import type { EligibilityStatus, MatchResult, Opportunity, StudentProfile } from '../lib/types'
import Icon from './Icon'
import OpportunityCopilot from './OpportunityCopilot'

export const ELIGIBILITY: Record<EligibilityStatus, { label: string; className: string }> = {
  eligible: { label: 'Eligible', className: 'badge ok' },
  needs_verification: { label: 'Needs verification', className: 'badge warn' },
  ineligible: { label: 'Not eligible', className: 'badge bad' },
}

export const TYPE_LABEL = { internship: 'Internship', hackathon: 'Hackathon' } as const
export const TYPE_ICON = { internship: 'briefcase', hackathon: 'trophy' } as const

function Deadline({ o }: { o: Opportunity }) {
  let main: string
  if (o.application_deadline_at) main = formatInstant(o.application_deadline_at, o.deadline_timezone)
  else if (o.application_deadline_date)
    main = `${formatDate(o.application_deadline_date)} (no closing time given${o.deadline_timezone ? `, ${o.deadline_timezone}` : ', timezone unknown'})`
  else main = 'Unknown'
  const exact = o.application_deadline_at ?? o.application_deadline_date
  const days = daysLeft(o)
  return (
    <>
      {exact ? <time dateTime={exact}>{main}</time> : <strong className="unknown">{main}</strong>}
      {days !== null && days >= 0 && <span className={days <= 14 ? 'days soon' : 'days'}> {daysLeftLabel(days)}</span>}
      {o.deadline_text && <span className="hint"> · Source says: “{o.deadline_text}”</span>}
    </>
  )
}

function SkillList({ label, ids, names, tone }: { label: string; ids: string[]; names: Map<string, string>; tone: string }) {
  if (ids.length === 0) return null
  return (
    <div className="skill-row">
      <span className="skill-row-label">{label}</span>
      <ul className="chips">
        {ids.map((id) => <li key={id} className={`chip ${tone}`}>{names.get(id) ?? id}</li>)}
      </ul>
    </div>
  )
}

function FitRing({ fit }: { fit: number | null }) {
  if (fit === null)
    return (
      <div className="ring none" role="img" aria-label="Skill fit: insufficient skill data">
        <span><strong>Insufficient skill data</strong></span>
      </div>
    )
  return (
    <div className="ring" style={{ '--p': Math.max(0, Math.min(100, fit)) } as CSSProperties} role="img" aria-label={`Skill fit ${fit.toFixed(1)} percent`}>
      <span aria-hidden="true">
        <strong>{fit.toFixed(1)}%</strong>
        <small>Skill fit</small>
      </span>
    </div>
  )
}

export function safeHref(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

/** One ranked result. Every value shown here comes from the backend; nothing is scored in the browser. */
export default function OpportunityCard({ match, rank, skillNames, profile }: { match: MatchResult; rank: number; skillNames: Map<string, string>; profile: StudentProfile }) {
  const o = match.opportunity
  const elig = ELIGIBILITY[match.eligibility_status]
  const href = safeHref(o.source_url)
  const headingId = `opp-${o.id}`

  return (
    <article className={`glass card card-${match.eligibility_status}`} aria-labelledby={headingId}>
      <header className="card-head">
        <div>
          <p className="card-meta">
            <span>#{rank}</span>
            <span className="type-pill"><Icon name={TYPE_ICON[o.opportunity_type]} size={13} />{TYPE_LABEL[o.opportunity_type]}</span>
            <span className={elig.className}>{elig.label}</span>
          </p>
          <h3 id={headingId}>{o.title}</h3>
          <p className="org">{o.organization ?? 'Organization not stated'}</p>
        </div>
        <FitRing fit={match.skill_fit} />
      </header>

      <p className="description">{o.description}</p>

      <div className="skills">
        <SkillList label="Matched" ids={match.matched_skills} names={skillNames} tone="have" />
        <SkillList label="Required, not selected" ids={match.missing_required_skills} names={skillNames} tone="need" />
        <SkillList label="Preferred, not selected" ids={match.missing_preferred_skills} names={skillNames} tone="nice" />
      </div>

      {match.eligibility_reasons.length > 0 && (
        <div>
          <h4>Eligibility</h4>
          <ul className="reasons">{match.eligibility_reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}
      {match.warnings.length > 0 && (
        <div className="warnings">
          <h4>Warnings</h4>
          <ul className="reasons">{match.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}

      <dl className="facts">
        <div><dt>Deadline</dt><dd><Deadline o={o} /></dd></div>
        <div><dt>Last checked</dt><dd><time dateTime={o.last_checked_at}>{formatInstant(o.last_checked_at)}</time></dd></div>
        <div>
          <dt>Source</dt>
          <dd>
            {href ? (
              <a className="source-link" href={href} target="_blank" rel="noopener noreferrer">
                View on {o.source_name} <Icon name="external" size={15} /><span className="sr-only"> (opens in a new tab)</span>
              </a>
            ) : (
              <span className="unknown">Link unavailable</span>
            )}
          </dd>
        </div>
      </dl>
      <OpportunityCopilot match={match} profile={profile} skillNames={skillNames} />
    </article>
  )
}
