import { api } from './api'

export type FeedType = 'job' | 'internship' | 'hackathon' | 'competition'

export const TYPE_LABEL: Record<FeedType, string> = {
  job: 'Job',
  internship: 'Internship',
  hackathon: 'Hackathon',
  competition: 'Competition',
}

export type FeedItem = {
  id: string
  source: string
  type: FeedType
  title: string
  organization: string
  logo: string | null
  url: string
  org_url?: string | null
  location: string
  mode: string | null
  deadline: string | null
  posted: string | null
  compensation: string | null
  skills: string[]
  requirements: string[]
  registrations: number | null
  views: number | null
  description: string
  tags: string[]
}

export type FeedResponse = {
  updated_at: string | null
  sources: Record<string, unknown>
  counts: Partial<Record<FeedType, number>>
  total: number
  items: FeedItem[]
}

export type Recommendation = {
  item: FeedItem
  score: number
  fit: number
  rank: number
  reasons: string[]
  action: string
  missing: string[]
}

export type TrendingRow = {
  item: FeedItem
  registrations: number
  per_day: number | null
  views: number | null
  momentum: number
  rank: number
}

export type Analysis = {
  opportunity_id: string
  readiness: number
  verdict: string
  verdict_key: 'ready' | 'almost' | 'stretch' | 'urgent'
  summary: string
  have: string[]
  transferable: Array<{ skill: string; via: string }>
  missing: Array<{ skill: string; days: number; project: string; resource: string }>
  prep_days: number
  days_left: number | null
  steps: Array<{ title: string; detail: string; resource?: string }>
  requirements: string[]
}

export type InterviewPrep = {
  opportunity_id: string
  role: string
  focus: string[]
  past_questions: Array<{ question: string; topic: string; difficulty: string }>
  predicted_questions: Array<{ question: string; why: string; likelihood: number }>
  sources: Array<{ label: string; url: string }>
}

export function parseSkills(value: string): string[] {
  const seen = new Set<string>()
  return value
    .split(/[,\n]/)
    .map((skill) => skill.trim())
    .filter((skill) => {
      const key = skill.toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function daysLeft(deadline: string | null): number | null {
  if (!deadline) return null
  const end = new Date(`${deadline}T00:00:00`)
  if (Number.isNaN(end.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((end.getTime() - today.getTime()) / 86_400_000)
}

export function fmtCount(value: number): string {
  return new Intl.NumberFormat('en-IN', { notation: value >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)
}

export function timeAgo(value: string | null): string {
  if (!value) return 'recently'
  const time = new Date(value).getTime()
  if (Number.isNaN(time)) return 'recently'
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function getFeed(filters: { type?: FeedType | string; q?: string; sort?: string } = {}): Promise<FeedResponse> {
  const query = new URLSearchParams()
  if (filters.type) query.set('type', filters.type)
  if (filters.q) query.set('q', filters.q)
  if (filters.sort) query.set('sort', filters.sort)
  const suffix = query.size ? `?${query.toString()}` : ''
  return api<FeedResponse>(`/feed${suffix}`)
}

export function refreshFeed(): Promise<Pick<FeedResponse, 'updated_at' | 'sources' | 'total'>> {
  return api('/feed/refresh', { method: 'POST' })
}

export function getTrending(type?: FeedType, limit = 10): Promise<{ items: TrendingRow[] }> {
  const query = new URLSearchParams({ limit: String(limit) })
  if (type) query.set('type', type)
  return api(`/trending?${query.toString()}`)
}

export function getRecommendations(skills: string[], types: FeedType[] = [], limit = 15): Promise<{ skills: string[]; items: Recommendation[] }> {
  return api('/recommendations', { method: 'POST', body: { skills, types, limit } })
}

export function getAnalysis(opportunityId: string, skills: string[]): Promise<Analysis> {
  return api('/analysis', { method: 'POST', body: { opportunity_id: opportunityId, skills } })
}

export function getInterviewPrep(opportunityId: string, skills: string[]): Promise<InterviewPrep> {
  return api('/interview-prep', { method: 'POST', body: { opportunity_id: opportunityId, skills } })
}
