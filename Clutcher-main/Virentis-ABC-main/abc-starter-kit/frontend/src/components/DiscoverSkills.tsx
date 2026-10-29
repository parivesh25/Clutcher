import { FormEvent, useMemo, useState } from 'react'
import type { Skill, StudentProfile } from '../lib/types'
import ErrorNote from './ErrorNote'
import Icon from './Icon'

type Props = {
  skills: Skill[] | null
  profile: StudentProfile
  matching: boolean
  onChange: (profile: StudentProfile) => void
  onAnalyze: (profile: StudentProfile) => void
}

/** Quick skill entry for Discover. Every tag is resolved against the API catalogue. */
export default function DiscoverSkills({ skills, profile, matching, onChange, onAnalyze }: Props) {
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const selected = useMemo(() => new Set(profile.skill_ids), [profile.skill_ids])
  const names = useMemo(() => new Map((skills ?? []).map((skill) => [skill.id, skill.name])), [skills])
  const text = query.trim().toLowerCase()
  const suggestions = text && !text.includes(',')
    ? (skills ?? []).filter((skill) => !selected.has(skill.id) &&
      [skill.id, skill.name, ...skill.aliases].some((name) => name.toLowerCase().includes(text))).slice(0, 8)
    : []

  function parseInput(): StudentProfile | null {
    const entries = query.split(',').map((entry) => entry.trim()).filter(Boolean)
    if (entries.length === 0) return profile
    if (!skills) {
      setError('The skill catalogue is still loading. Try again in a moment.')
      return null
    }
    const ids = new Set(profile.skill_ids)
    const unknown: string[] = []
    for (const entry of entries) {
      const needle = entry.toLowerCase()
      const found = skills.find((skill) =>
        [skill.id, skill.name, ...skill.aliases].some((name) => name.toLowerCase() === needle))
      if (found) ids.add(found.id)
      else unknown.push(entry)
    }
    if (unknown.length) {
      setError(`Choose a skill from the catalogue for: ${unknown.join(', ')}.`)
      return null
    }
    setError('')
    setQuery('')
    const next = { ...profile, skill_ids: [...ids] }
    onChange(next)
    return next
  }

  function add(e: FormEvent) {
    e.preventDefault()
    parseInput()
  }

  function choose(skill: Skill) {
    onChange({ ...profile, skill_ids: [...selected, skill.id] })
    setQuery('')
    setError('')
  }

  function remove(id: string) {
    onChange({ ...profile, skill_ids: profile.skill_ids.filter((skillId) => skillId !== id) })
    setError('')
  }

  function analyze() {
    const next = parseInput()
    if (next) onAnalyze(next)
  }

  return (
    <section className="glass discover-skills" aria-labelledby="discover-skills-heading">
      <div className="discover-skills-head">
        <div>
          <p className="label-mono">Quick skill match</p>
          <h2 id="discover-skills-heading">Find opportunities for your skills</h2>
          <p className="muted">Add skills from the catalogue, then analyze your fit with live listings.</p>
        </div>
        <button className="primary" type="button" onClick={analyze} disabled={matching || skills === null}>
          <Icon name="spark" size={17} /> {matching ? 'Analyzing…' : 'Analyze profile'}
        </button>
      </div>
      <form className="discover-entry" onSubmit={add}>
        <label className="sr-only" htmlFor="discover-skill-input">Add skills</label>
        <input
          id="discover-skill-input"
          type="text"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setError('') }}
          placeholder="Add skills, e.g. Python, JavaScript"
          disabled={skills === null}
          autoComplete="off"
        />
        <button type="submit" disabled={!query.trim() || skills === null}>Add skills</button>
      </form>
      {suggestions.length > 0 && (
        <div className="discover-suggestions" aria-label="Matching skills">
          {suggestions.map((skill) => <button type="button" key={skill.id} onClick={() => choose(skill)}>{skill.name}</button>)}
        </div>
      )}
      <ErrorNote message={error} />
      <div className="discover-selected">
        <span className="label-mono">Your skills</span>
        {profile.skill_ids.length === 0 ? <span className="hint">No skills selected yet.</span> : (
          <div className="discover-tags">
            {profile.skill_ids.map((id) => (
              <button type="button" key={id} onClick={() => remove(id)} aria-label={`Remove ${names.get(id) ?? id}`} title="Remove skill">
                {names.get(id) ?? id} <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="hint discover-save-note">To keep these skills for next time, use Save profile on the Profile page.</p>
    </section>
  )
}
