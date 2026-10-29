import matchFixture from '../fixtures/match-response.json'
import profileFixture from '../fixtures/student-profile.json'
import skillsFixture from '../fixtures/skills.json'
import { api, ApiError } from './api'
import { expectMatches, expectProfile, expectRoadmap, expectSkills } from './contract'
import type { MatchRequest, MatchResponse, RoadmapResponse, SkillsResponse, StudentProfile, StudentProfileResponse } from './types'

// Fixtures are used only when explicitly switched on in a dev build (VITE_USE_FIXTURES=true).
// They never stand in for a failed live call. Add ?fixture=empty or ?fixture=error to the URL
// to see the empty and failure states.
export const USE_FIXTURES: boolean = import.meta.env.DEV && import.meta.env.VITE_USE_FIXTURES === 'true'

function fixtureScenario(): string {
  return new URLSearchParams(window.location.search).get('fixture') ?? ''
}

async function fixture<T>(data: T): Promise<T> {
  await new Promise((r) => setTimeout(r, 400)) // let loading states show
  if (fixtureScenario() === 'error') throw new ApiError('Fixture mode: simulated backend failure.', 500)
  return structuredClone(data)
}

export const emptyProfile = (): StudentProfile => ({ skill_ids: [], country_code: null, study_level: null, graduation_year: null })

/**
 * Keeps only the four contract fields, with skill ids sorted the way the backend stores them.
 * The backend's profile rows also carry user_id and updated_at; dropping them here keeps those
 * out of PUT and match bodies and lets the form compare a draft with the saved profile.
 */
export function toProfile(p: StudentProfile): StudentProfile {
  return {
    skill_ids: [...p.skill_ids].sort(),
    country_code: p.country_code,
    study_level: p.study_level,
    graduation_year: p.graduation_year,
  }
}

const normalizeProfileResponse = (r: StudentProfileResponse): StudentProfileResponse => ({ profile: toProfile(r.profile) })

// Every response, live or fixture, passes the same contract check before the UI reads it.
export async function getSkills(): Promise<SkillsResponse> {
  return expectSkills(USE_FIXTURES ? await fixture(skillsFixture) : await api<unknown>('/skills'))
}

export async function getStudentProfile(): Promise<StudentProfileResponse> {
  const response = expectProfile(
    USE_FIXTURES ? await fixture(profileFixture) : await api<unknown>('/student-profile'),
    'GET',
  )
  return normalizeProfileResponse(response)
}

export async function saveStudentProfile(profile: StudentProfile): Promise<StudentProfileResponse> {
  const body = toProfile(profile)
  const response = expectProfile(
    USE_FIXTURES ? await fixture({ profile: body }) : await api<unknown>('/student-profile', { method: 'PUT', body }),
    'PUT',
  )
  return normalizeProfileResponse(response)
}

/** Evaluates a draft profile. Does not save it. */
export async function findMatches(request: MatchRequest): Promise<MatchResponse> {
  const normalizedRequest = { ...request, profile: toProfile(request.profile) }
  if (!USE_FIXTURES) return expectMatches(await api<unknown>('/matches', { method: 'POST', body: normalizedRequest }))
  // The fixture is a fixed backend answer. Only the request's own filters are applied here;
  // scores and eligibility always come from the backend.
  const res = expectMatches(await fixture(matchFixture))
  if (fixtureScenario() === 'empty') return { ...res, items: [] }
  return {
    ...res,
    items: res.items.filter(
      (m) =>
        (request.opportunity_type === null || m.opportunity.opportunity_type === request.opportunity_type) &&
        (request.include_ineligible || m.eligibility_status !== 'ineligible'),
    ),
  }
}

export async function getLearningRoadmap(opportunityId: string, profile: StudentProfile): Promise<RoadmapResponse> {
  return expectRoadmap(await api<unknown>(`/opportunities/${encodeURIComponent(opportunityId)}/roadmap`, {
    method: 'POST', body: { profile: toProfile(profile) },
  }))
}
