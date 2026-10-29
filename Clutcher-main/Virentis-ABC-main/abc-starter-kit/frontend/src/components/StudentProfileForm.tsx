import { FormEvent, useId, useState } from 'react'
import type { Skill, StudentProfile, StudyLevel } from '../lib/types'
import ErrorNote from './ErrorNote'

const STUDY_LEVELS: [StudyLevel, string][] = [
  ['school', 'School'],
  ['undergraduate', 'Undergraduate'],
  ['postgraduate', 'Postgraduate'],
  ['other', 'Other'],
]

type Props = {
  skills: Skill[] | null
  skillsError: string
  profile: StudentProfile
  onChange: (p: StudentProfile) => void
  onMatch: () => void
  onSave: () => void
  matching: boolean
  saving: boolean
  saveMessage: string
  unsaved: boolean
  title?: string
}

/** Returns a readable problem with the draft profile, or '' when it can be sent. */
export function profileProblem(p: StudentProfile): string {
  if (p.country_code !== null && !/^[A-Z]{2}$/.test(p.country_code)) return 'Country must be a two-letter ISO code, such as IN or US.'
  if (p.graduation_year !== null && (!Number.isInteger(p.graduation_year) || p.graduation_year < 1950 || p.graduation_year > 2100))
    return 'Graduation year must be a whole year, such as 2027.'
  return ''
}

/** Skills and eligibility details. Matching uses the draft; saving is a separate action. */
export default function StudentProfileForm({ skills, skillsError, profile, onChange, onMatch, onSave, matching, saving, saveMessage, unsaved, title = 'Your profile' }: Props) {
  const [query, setQuery] = useState('')
  const [yearText, setYearText] = useState(profile.graduation_year?.toString() ?? '')
  const ids = useId()
  const problem = profileProblem(profile)
  const selected = new Set(profile.skill_ids)
  const byId = new Map((skills ?? []).map((s) => [s.id, s]))

  const q = query.trim().toLowerCase()
  const visible = (skills ?? []).filter(
    (s) => !q || s.name.toLowerCase().includes(q) || s.id.includes(q) || s.aliases.some((a) => a.toLowerCase().includes(q)),
  )

  function toggle(id: string) {
    const next = selected.has(id) ? profile.skill_ids.filter((s) => s !== id) : [...profile.skill_ids, id]
    onChange({ ...profile, skill_ids: next })
  }

  function setYear(text: string) {
    setYearText(text)
    const t = text.trim()
    onChange({ ...profile, graduation_year: t === '' ? null : Number(t) })
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!problem) onMatch()
  }

  return (
    <section aria-labelledby={`${ids}-h`} className="glass panel">
      <h2 id={`${ids}-h`}>{title}</h2>
      <form onSubmit={submit} className="stack" noValidate>
        <fieldset className="skills-field">
          <legend>Skills</legend>
          {skills === null && !skillsError && <p className="muted">Loading skills…</p>}
          <ErrorNote message={skillsError && `Could not load skills: ${skillsError}`} />
          {skills !== null && (
            <>
              <label>
                <span className="sr-only">Search skills</span>
                <input type="search" placeholder="Search skills, e.g. ReactJS" value={query} onChange={(e) => setQuery(e.target.value)} />
              </label>
              <p className="hint" aria-live="polite">
                {profile.skill_ids.length === 0
                  ? 'No skills selected. You can still match, but skill fit will be low wherever skills are listed.'
                  : `${profile.skill_ids.length} selected: ${profile.skill_ids.map((id) => byId.get(id)?.name ?? id).join(', ')}`}
              </p>
              <div className="skill-list" role="group" aria-label="Available skills">
                {visible.length === 0 && <p className="muted">No skills match “{query}”.</p>}
                {visible.map((s) => (
                  <button key={s.id} type="button" className="skill-toggle" aria-pressed={selected.has(s.id)} onClick={() => toggle(s.id)}>
                    {s.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </fieldset>

        <div className="profile-grid">
          <label>
            Country <span className="hint">(optional, ISO code)</span>
            <input
              value={profile.country_code ?? ''}
              onChange={(e) => onChange({ ...profile, country_code: e.target.value.trim() === '' ? null : e.target.value.trim().toUpperCase() })}
              maxLength={2}
              placeholder="IN"
              autoComplete="country"
              aria-invalid={problem.startsWith('Country') || undefined}
            />
          </label>
          <label>
            Study level <span className="hint">(optional)</span>
            <select value={profile.study_level ?? ''} onChange={(e) => onChange({ ...profile, study_level: (e.target.value || null) as StudyLevel | null })}>
              <option value="">Not specified</option>
              {STUDY_LEVELS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </label>
          <label>
            Graduation year <span className="hint">(optional)</span>
            <input
              inputMode="numeric"
              value={yearText}
              onChange={(e) => setYear(e.target.value)}
              placeholder="2027"
              maxLength={4}
              aria-invalid={problem.startsWith('Graduation') || undefined}
            />
          </label>
        </div>
        <p className="hint">Missing details are not guessed. Opportunities that depend on them are marked “Needs verification”.</p>

        <ErrorNote message={problem} />

        <div className="form-actions">
          <button className="primary" disabled={matching || !!problem}>{matching ? 'Matching…' : 'Find matches'}</button>
          <button type="button" onClick={onSave} disabled={saving || !!problem}>{saving ? 'Saving…' : 'Save profile'}</button>
          <span role="status" className="hint">{saveMessage || (unsaved ? 'Unsaved changes' : '')}</span>
        </div>
      </form>
    </section>
  )
}
