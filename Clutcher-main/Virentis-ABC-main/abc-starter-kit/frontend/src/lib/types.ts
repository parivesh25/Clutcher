export type RecordItem = {
  id: string
  owner: string
  title: string
  body: string
  category: string
  status: 'open' | 'in_progress' | 'done'
  ai_summary: string | null
  created_at: string
}
export type Me = { id: string; email: string | null; role: 'user' | 'admin'; aal: string }
export type Stats = {
  total: number
  by_status: Record<string, number>
  by_category: Record<string, number>
  by_day: { day: string; count: number }[]
}
export type AuditEntry = { id: number; actor: string; action: string; entity: string; entity_id: string; hash: string; ts: string }
export type VerifyResult = { ok: boolean; checked: number; broken_at: number | null }

// ---------- PS-61 matcher: shared API contract (snake_case, identical to the Flask JSON) ----------

export type StudyLevel = 'school' | 'undergraduate' | 'postgraduate' | 'other'
export type OpportunityType = 'internship' | 'hackathon'
export type EligibilityStatus = 'eligible' | 'ineligible' | 'needs_verification'

export type StudentProfile = {
  skill_ids: string[]
  country_code: string | null // ISO 3166-1 alpha-2, e.g. "IN"
  study_level: StudyLevel | null
  graduation_year: number | null
}

export type Skill = { id: string; name: string; aliases: string[] }

export type EligibilityRules = {
  unrestricted: boolean
  allowed_country_codes: string[] | null
  allowed_study_levels: StudyLevel[] | null
  graduation_year_min: number | null
  graduation_year_max: number | null
  unparsed_requirements: string[]
  original_text: string | null
}

export type Opportunity = {
  id: string
  title: string
  organization: string | null
  opportunity_type: OpportunityType
  description: string
  source_name: string
  source_url: string
  source_external_id: string | null
  application_deadline_at: string | null // exact ISO 8601 timestamp
  application_deadline_date: string | null // YYYY-MM-DD when only the date is known
  deadline_timezone: string | null // IANA zone
  deadline_text: string | null // original wording from the source
  required_skill_ids: string[]
  preferred_skill_ids: string[]
  theme_tags: string[]
  eligibility: EligibilityRules
  source_status: 'open' | 'closed' | 'unknown'
  review_status: 'approved' | 'needs_review'
  last_checked_at: string
  content_hash: string
}

export type MatchResult = {
  opportunity: Opportunity
  skill_fit: number | null // 0-100, one decimal; null when the listing names no skills
  eligibility_status: EligibilityStatus
  matched_skills: string[]
  missing_required_skills: string[]
  missing_preferred_skills: string[]
  eligibility_reasons: string[]
  warnings: string[]
}

export type MatchRequest = {
  profile: StudentProfile
  opportunity_type: OpportunityType | null
  include_ineligible: boolean
}

export type SkillsResponse = { items: Skill[] }
export type StudentProfileResponse = { profile: StudentProfile }
export type OpportunitiesResponse = { items: Opportunity[] }
export type MatchResponse = { items: MatchResult[]; evaluated_at: string }
export type RoadmapStep = { skill_id: string; skill_name: string; action: string }
export type RoadmapResponse = { steps: RoadmapStep[]; plan_source: 'gemini' | 'basic' | 'no_gaps' }
