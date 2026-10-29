import type { Opportunity } from './types'

// Display helpers only. Matching, eligibility and closed-deadline filtering stay in the backend.

export function formatInstant(iso: string, timeZone?: string | null): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  // dateStyle/timeStyle cannot be combined with timeZoneName, so the fields are spelled out.
  const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }
  try {
    return d.toLocaleString(undefined, { ...opts, timeZone: timeZone ?? undefined })
  } catch {
    return d.toLocaleString(undefined, opts) // unknown IANA zone from the source: fall back to the viewer's zone
  }
}

// A YYYY-MM-DD date is shown as that calendar date, without inventing a time or shifting it by zone.
export function formatDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString(undefined, { dateStyle: 'medium', timeZone: 'UTC' })
}

/** Whole calendar days from today until the deadline, or null when the deadline is unknown. */
export function daysLeft(o: Opportunity, now = new Date()): number | null {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  let target: number
  if (o.application_deadline_at) {
    const d = new Date(o.application_deadline_at)
    if (Number.isNaN(d.getTime())) return null
    target = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  } else if (o.application_deadline_date) {
    target = Date.parse(`${o.application_deadline_date}T00:00:00Z`)
    if (Number.isNaN(target)) return null
  } else return null
  return Math.round((target - today) / 86_400_000)
}

export function daysLeftLabel(days: number | null): string {
  if (days === null) return 'Deadline unknown'
  if (days < 0) return 'Deadline passed'
  if (days === 0) return 'Closes today'
  return days === 1 ? '1 day left' : `${days} days left`
}
