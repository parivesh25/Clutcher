import { ApiError } from './api'
import type { MatchResponse, RoadmapResponse, SkillsResponse, StudentProfileResponse } from './types'

// Light runtime checks on backend responses. They don't recompute anything; they only make sure
// the JSON has the shape the UI reads, and name the first field that doesn't, so a mismatch
// during integration shows up as a clear message instead of a blank or broken card.

type Check = (v: unknown, path: string) => string | null

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str: Check = (v, p) => (typeof v === 'string' ? null : `${p} should be a string`)
const num: Check = (v, p) => (typeof v === 'number' && Number.isFinite(v) ? null : `${p} should be a number`)
const bool: Check = (v, p) => (typeof v === 'boolean' ? null : `${p} should be true or false`)
const nullable = (c: Check): Check => (v, p) => (v === null ? null : c(v, p))
const oneOf = (...vals: string[]): Check => (v, p) => (typeof v === 'string' && vals.includes(v) ? null : `${p} should be one of ${vals.join(', ')}`)
const arr = (c: Check): Check => (v, p) => {
  if (!Array.isArray(v)) return `${p} should be a list`
  for (let i = 0; i < v.length; i++) { const e = c(v[i], `${p}[${i}]`); if (e) return e }
  return null
}
const obj = (shape: Record<string, Check>, { partial = false } = {}): Check => (v, p) => {
  if (!isObj(v)) return `${p} should be an object`
  for (const [k, c] of Object.entries(shape)) {
    if (!(k in v)) {
      if (partial) continue
      return `${p}.${k} is missing`
    }
    const e = c(v[k], `${p}.${k}`)
    if (e) return e
  }
  return null
}

const STUDY = ['school', 'undergraduate', 'postgraduate', 'other']

const profile = obj({
  skill_ids: arr(str),
  country_code: nullable(str),
  study_level: nullable(oneOf(...STUDY)),
  graduation_year: nullable(num),
})

// The cards never read the raw rules (they show the backend's eligibility_reasons instead),
// so a catalogue row with partial rules such as {} must not block every result.
const eligibility = obj({
  unrestricted: bool,
  allowed_country_codes: nullable(arr(str)),
  allowed_study_levels: nullable(arr(oneOf(...STUDY))),
  graduation_year_min: nullable(num),
  graduation_year_max: nullable(num),
  unparsed_requirements: arr(str),
  original_text: nullable(str),
}, { partial: true })

const opportunity = obj({
  id: str,
  title: str,
  organization: nullable(str),
  opportunity_type: oneOf('internship', 'hackathon'),
  description: str,
  source_name: str,
  source_url: str,
  source_external_id: nullable(str),
  application_deadline_at: nullable(str),
  application_deadline_date: nullable(str),
  deadline_timezone: nullable(str),
  deadline_text: nullable(str),
  required_skill_ids: arr(str),
  preferred_skill_ids: arr(str),
  theme_tags: arr(str),
  eligibility,
  source_status: oneOf('open', 'closed', 'unknown'),
  review_status: oneOf('approved', 'needs_review'),
  last_checked_at: str,
  content_hash: nullable(str), // not shown in the UI; manual entries may not have one yet
})

const matchResult = obj({
  opportunity,
  skill_fit: nullable(num),
  eligibility_status: oneOf('eligible', 'ineligible', 'needs_verification'),
  matched_skills: arr(str),
  missing_required_skills: arr(str),
  missing_preferred_skills: arr(str),
  eligibility_reasons: arr(str),
  warnings: arr(str),
})

export const checks = {
  skills: obj({ items: arr(obj({ id: str, name: str, aliases: arr(str) })) }),
  profile: obj({ profile }),
  matches: obj({ items: arr(matchResult), evaluated_at: str }),
  roadmap: obj({ steps: arr(obj({ skill_id: str, skill_name: str, action: str })), plan_source: oneOf('gemini', 'basic', 'no_gaps') }),
}

function expect<T>(check: Check, endpoint: string, data: unknown): T {
  const problem = check(data, 'response')
  if (problem) {
    if (import.meta.env.DEV) console.error(`[contract] ${endpoint}: ${problem}`, data)
    throw new ApiError(`The backend sent an unexpected response from ${endpoint} (${problem}).`, 200)
  }
  return data as T
}

export const expectSkills = (d: unknown) => expect<SkillsResponse>(checks.skills, 'GET /api/skills', d)
export const expectProfile = (d: unknown, method: 'GET' | 'PUT') => expect<StudentProfileResponse>(checks.profile, `${method} /api/student-profile`, d)
export const expectMatches = (d: unknown) => expect<MatchResponse>(checks.matches, 'POST /api/matches', d)
export const expectRoadmap = (d: unknown) => expect<RoadmapResponse>(checks.roadmap, 'POST /api/opportunities/:id/roadmap', d)
