import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import AppShell, { View } from '../components/AppShell'
import DotField from '../components/DotField'
import DiscoverSkills from '../components/DiscoverSkills'
import ErrorNote from '../components/ErrorNote'
import HomeOverview from '../components/HomeOverview'
import MatchResults from '../components/MatchResults'
import StudentProfileForm, { profileProblem } from '../components/StudentProfileForm'
import { api } from '../lib/api'
import { emptyProfile, findMatches, getSkills, getStudentProfile, saveStudentProfile, toProfile, USE_FIXTURES } from '../lib/matcher'
import type { MatchResponse, Me, OpportunityType, Skill, StudentProfile } from '../lib/types'

// Skill order is not meaningful (the backend sorts it), so compare normalized profiles.
const same = (a: StudentProfile, b: StudentProfile) => JSON.stringify(toProfile(a)) === JSON.stringify(toProfile(b))
const VIEWS: View[] = ['home', 'discover', 'profile']
const viewFromHash = (): View => {
  const h = window.location.hash.slice(1)
  return (VIEWS as string[]).includes(h) ? (h as View) : 'home'
}
const LEVEL = { school: 'School', undergraduate: 'Undergraduate', postgraduate: 'Postgraduate', other: 'Other' } as const

export default function Dashboard() {
  const { signOut } = useAuth()
  const [me, setMe] = useState<Me | null>(null)
  const [view, setView] = useState<View>(viewFromHash)

  const [skills, setSkills] = useState<Skill[] | null>(null)
  const [skillsError, setSkillsError] = useState('')
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [savedProfile, setSavedProfile] = useState<StudentProfile>(emptyProfile())
  const [profileError, setProfileError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  const [type, setType] = useState<OpportunityType | null>(null)
  const [includeIneligible, setIncludeIneligible] = useState(false)
  const [result, setResult] = useState<MatchResponse | null>(null)
  const [matchedProfile, setMatchedProfile] = useState<StudentProfile | null>(null)
  const [matching, setMatching] = useState(false)
  const [matchError, setMatchError] = useState('')
  const requestNo = useRef(0) // ignore answers to superseded match requests

  useEffect(() => {
    api<Me>('/me').then(setMe).catch(() => setMe(null))
    getSkills().then((r) => setSkills(r.items)).catch((e: Error) => setSkillsError(e.message))
    getStudentProfile()
      .then((r) => { setProfile(r.profile); setSavedProfile(r.profile) })
      .catch((e: Error) => { setProfileError(e.message); setProfile(emptyProfile()) })
  }, [])

  useEffect(() => {
    const onHash = () => { setView(viewFromHash()); window.scrollTo({ top: 0 }) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (v: View) => {
    if (window.location.hash === `#${v}`) setView(v)
    else window.location.hash = v
  }

  const skillNames = useMemo(() => new Map((skills ?? []).map((s) => [s.id, s.name])), [skills])

  async function match(opts: { type?: OpportunityType | null; includeIneligible?: boolean; profileOverride?: StudentProfile } = {}) {
    const draft = opts.profileOverride ?? profile
    if (!draft) return
    if (profileProblem(draft)) {
      go('profile')
      return
    }
    const no = ++requestNo.current
    setMatching(true)
    setMatchError('')
    try {
      const res = await findMatches({
        profile: draft,
        opportunity_type: opts.type !== undefined ? opts.type : type,
        include_ineligible: opts.includeIneligible ?? includeIneligible,
      })
      if (no !== requestNo.current) return
      setResult(res)
      setMatchedProfile(draft)
    } catch (e) {
      if (no !== requestNo.current) return
      setResult(null)
      setMatchError((e as Error).message)
    }
    setMatching(false)
  }

  function matchAndShow() {
    go('discover')
    void match()
  }

  async function save() {
    if (!profile) return
    setSaving(true)
    setSaveMessage('')
    try {
      const r = await saveStudentProfile(profile)
      setSavedProfile(r.profile)
      setSaveMessage('Profile saved.')
    } catch (e) {
      setSaveMessage(`Could not save: ${(e as Error).message}`)
    }
    setSaving(false)
  }

  function changeProfile(p: StudentProfile) {
    setProfile(p)
    setSaveMessage('')
  }

  // Filters re-run matching only once the student has asked for results.
  function changeType(t: OpportunityType | null) {
    setType(t)
    if (profile) void match({ type: t })
  }
  function changeIncludeIneligible(v: boolean) {
    setIncludeIneligible(v)
    if (profile) void match({ includeIneligible: v })
  }

  const firstName = me?.email ? me.email.split('@')[0] : ''
  const loadErrors = (
    <>
      <ErrorNote message={profileError && `Could not load your saved profile, so the form starts empty. ${profileError}`} />
      <ErrorNote message={skillsError && view !== 'profile' ? `Could not load skills: ${skillsError}` : ''} />
    </>
  )

  return (
    <AppShell
      view={view}
      email={me?.email ?? null}
      matchCount={result ? result.items.length : null}
      matching={matching}
      canMatch={!!profile}
      onMatch={matchAndShow}
      onSignOut={() => void signOut()}
    >
      {USE_FIXTURES && (
        <p className="notice" role="note">
          Development fixtures are on (VITE_USE_FIXTURES). These results are sample data, not the live catalogue.
        </p>
      )}

      {view === 'home' && (
        <>
          <DotField />
          <header className="page-head">
            <div><p className="eyebrow">Overview</p><h1>Home</h1></div>
          </header>
          {loadErrors}
          <HomeOverview name={firstName} profile={profile} skillNames={skillNames} result={result} matching={matching} onMatch={matchAndShow} go={go} />
        </>
      )}

      {view === 'discover' && (
        <>
          <header className="page-head">
            <div><p className="eyebrow">Internships and hackathons</p><h1>Discover</h1></div>
            <button className="primary" type="button" onClick={() => void match()} disabled={matching || !profile}>{matching ? 'Matching…' : 'Find matches'}</button>
          </header>
          {loadErrors}
          {profile && (
            <div className="glass profile-strip" aria-label="Eligibility details used for matching">
              <strong>Eligibility details</strong>
              <ul className="chips">
                <li className="chip">{profile.country_code ?? 'Any country'}</li>
                <li className="chip">{profile.study_level ? LEVEL[profile.study_level] : 'Study level not set'}</li>
                <li className="chip">{profile.graduation_year ? `Class of ${profile.graduation_year}` : 'Graduation year not set'}</li>
              </ul>
              <button type="button" onClick={() => go('profile')}>Edit profile</button>
            </div>
          )}
          {profile && (
            <DiscoverSkills
              skills={skills}
              profile={profile}
              matching={matching}
              onChange={changeProfile}
              onAnalyze={(draft) => void match({ profileOverride: draft })}
            />
          )}
          <MatchResults
            result={result}
            loading={matching}
            error={matchError}
            stale={!!matchedProfile && !!profile && !same(profile, matchedProfile)}
            type={type}
            includeIneligible={includeIneligible}
            onType={changeType}
            onIncludeIneligible={changeIncludeIneligible}
            onRetry={() => void match()}
            skillNames={skillNames}
            profile={matchedProfile}
          />
        </>
      )}

      {view === 'profile' && (
        <>
          <header className="page-head">
            <div><p className="eyebrow">Skills and eligibility</p><h1>Profile</h1></div>
          </header>
          {loadErrors}
          <div className="profile-layout">
            {profile === null ? (
              <p className="glass panel muted">Loading your profile…</p>
            ) : (
              <StudentProfileForm
                skills={skills}
                skillsError={skillsError}
                profile={profile}
                onChange={changeProfile}
                onMatch={matchAndShow}
                onSave={() => void save()}
                matching={matching}
                saving={saving}
                saveMessage={saveMessage}
                unsaved={!same(profile, savedProfile)}
              />
            )}
            <aside className="glass panel explain" aria-labelledby="how-h">
              <h2 id="how-h">How matching works</h2>
              <dl>
                <dt>Skill fit</dt>
                <dd>Required skills count twice as much as preferred ones. It measures overlap with the listing, not your chance of acceptance.</dd>
                <dt>Eligibility</dt>
                <dd>“Eligible” means every stated rule is known and met. If a rule is unclear or a detail is missing, you'll see “Needs verification”.</dd>
                <dt>Deadlines</dt>
                <dd>Closed and past-deadline listings are hidden. Unknown deadlines stay visible with a warning.</dd>
              </dl>
              <p>“Find matches” uses what is on this form without saving it. Use “Save profile” to keep it for next time.</p>
            </aside>
          </div>
        </>
      )}
    </AppShell>
  )
}
