import { useEffect, useState } from 'react'
import type { FeedType } from './feed'

export type StudyLevel = '' | 'school' | 'undergraduate' | 'postgraduate' | 'graduate'

export type Profile = {
  name: string
  city: string
  studyLevel: StudyLevel
  institution: string
  degree: string
  graduationYear: string
  skills: string
  interests: FeedType[]
  goal: string
}

export const STUDY_LEVELS: Array<{ value: Exclude<StudyLevel, ''>; label: string }> = [
  { value: 'school', label: 'School student' },
  { value: 'undergraduate', label: 'Undergraduate' },
  { value: 'postgraduate', label: 'Postgraduate' },
  { value: 'graduate', label: 'Graduate' },
]

const EMPTY_PROFILE: Profile = {
  name: '',
  city: '',
  studyLevel: '',
  institution: '',
  degree: '',
  graduationYear: '',
  skills: '',
  interests: ['internship', 'hackathon'],
  goal: '',
}

export function missingFields(profile: Profile): string[] {
  const missing: string[] = []
  if (!profile.name.trim()) missing.push('name')
  if (!profile.studyLevel) missing.push('education level')
  if (!profile.institution.trim()) missing.push(profile.studyLevel === 'school' ? 'school' : 'college or university')
  if (!profile.skills.trim()) missing.push('skills')
  return missing
}

function normalizeProfile(value: unknown): Profile {
  if (!value || typeof value !== 'object') return EMPTY_PROFILE
  const candidate = value as Partial<Profile>
  return {
    ...EMPTY_PROFILE,
    ...candidate,
    interests: Array.isArray(candidate.interests) ? candidate.interests : EMPTY_PROFILE.interests,
  }
}

export function useProfile(userId: string) {
  const key = `clutcher.profile.${userId}`
  const [profile, setProfile] = useState<Profile>(() => {
    try {
      return normalizeProfile(JSON.parse(localStorage.getItem(key) ?? 'null'))
    } catch {
      return EMPTY_PROFILE
    }
  })

  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(profile)) } catch { /* storage can be disabled */ }
  }, [key, profile])

  return [profile, setProfile] as const
}
