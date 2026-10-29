import { FormEvent, useState } from 'react'
import { ArrowRight, CheckCircle2, GraduationCap, Plus, Sparkles, Target, User, X } from 'lucide-react'
import { type FeedType, TYPE_LABEL, parseSkills } from '../lib/feed'
import { type Profile, STUDY_LEVELS, missingFields } from '../lib/profile'

const SUGGESTED = [
  'Python', 'Java', 'C++', 'JavaScript', 'React', 'Node.js', 'SQL', 'Data Structures', 'Machine Learning',
  'Data Analysis', 'Figma', 'Git', 'AWS', 'Docker', 'Communication', 'Marketing', 'Sales', 'Content Writing',
]
const TYPES: FeedType[] = ['internship', 'job', 'hackathon', 'competition']

interface Props {
  initial: Profile
  onSave: (p: Profile) => void | Promise<void>
  submitLabel: string
  onboarding?: boolean
}

export default function ProfileForm({ initial, onSave, submitLabel, onboarding }: Props) {
  const [form, setForm] = useState<Profile>(initial)
  const [skillDraft, setSkillDraft] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const skills = parseSkills(form.skills)
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setForm((f) => ({ ...f, [k]: v }))

  const addSkill = (raw: string) => {
    const s = raw.trim()
    if (!s || skills.some((x) => x.toLowerCase() === s.toLowerCase())) return
    set('skills', [...skills, s].join(', '))
    setSkillDraft('')
  }
  const removeSkill = (s: string) => set('skills', skills.filter((x) => x !== s).join(', '))
  const toggleType = (t: FeedType) =>
    set('interests', form.interests.includes(t) ? form.interests.filter((x) => x !== t) : [...form.interests, t])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const missing = missingFields(form)
    if (missing.length) { setError(`Please add your ${missing.join(', ')}.`); return }
    setError('')
    await onSave(form)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      <Section icon={<User className="w-4 h-4" />} title="About you">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Full name *"><input className="lg-input" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Your name" /></Field>
          <Field label="City"><input className="lg-input" value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="e.g. Delhi" /></Field>
        </div>
      </Section>

      <Section icon={<GraduationCap className="w-4 h-4" />} title="Education">
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Current level *">
            <select className="lg-input" value={form.studyLevel} onChange={(e) => set('studyLevel', e.target.value as Profile['studyLevel'])}>
              <option value="">Choose…</option>
              {STUDY_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </Field>
          <Field label={form.studyLevel === 'school' ? 'School *' : 'College / University *'}>
            <input className="lg-input" value={form.institution} onChange={(e) => set('institution', e.target.value)} placeholder={form.studyLevel === 'school' ? 'e.g. DPS R.K. Puram' : 'e.g. IILM University'} />
          </Field>
          <Field label={form.studyLevel === 'school' ? 'Stream' : 'Degree & branch'}>
            <input className="lg-input" value={form.degree} onChange={(e) => set('degree', e.target.value)} placeholder={form.studyLevel === 'school' ? 'e.g. Science (PCM)' : 'e.g. B.Tech CSE'} />
          </Field>
          <Field label="Graduation year">
            <input className="lg-input" inputMode="numeric" value={form.graduationYear} onChange={(e) => set('graduationYear', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="e.g. 2027" />
          </Field>
        </div>
      </Section>

      <Section icon={<Sparkles className="w-4 h-4" />} title="Your skills *" hint="These drive your recommendations and skill-gap analysis.">
        <div className="flex flex-wrap gap-2 mb-3">
          {skills.map((s) => (
            <span key={s} className="lg-chip rounded-xl pl-3 pr-1.5 py-1.5 text-sm font-black text-slate-900 flex items-center gap-1.5">
              {s}
              <button type="button" onClick={() => removeSkill(s)} className="p-0.5 rounded-md bg-transparent border-0 text-slate-500 hover:text-rose-600" aria-label={`Remove ${s}`}><X className="w-3.5 h-3.5" /></button>
            </span>
          ))}
          {!skills.length && <span className="text-sm font-bold text-slate-500">No skills yet. Add some below.</span>}
        </div>
        <div className="flex gap-2">
          <input className="lg-input" value={skillDraft} onChange={(e) => setSkillDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkill(skillDraft) } }}
            placeholder="Type a skill and press Enter" />
          <button type="button" onClick={() => addSkill(skillDraft)} className="lg-btn shrink-0 !px-4"><Plus className="w-4 h-4" /></button>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {SUGGESTED.filter((s) => !skills.some((x) => x.toLowerCase() === s.toLowerCase())).slice(0, 12).map((s) => (
            <button type="button" key={s} onClick={() => addSkill(s)} className="px-3 py-1.5 rounded-xl text-xs font-black text-indigo-800 bg-white/50 border border-white/80 hover:bg-white">+ {s}</button>
          ))}
        </div>
      </Section>

      <Section icon={<Target className="w-4 h-4" />} title="What are you looking for?">
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button type="button" key={t} onClick={() => toggleType(t)}
              className={`px-4 py-2.5 rounded-xl text-sm font-black border transition-all ${form.interests.includes(t) ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white/50 text-slate-800 border-white/80 hover:bg-white'}`}>
              {TYPE_LABEL[t]}s
            </button>
          ))}
        </div>
        <Field label="Goal (optional)">
          <input className="lg-input" value={form.goal} onChange={(e) => set('goal', e.target.value)} placeholder="e.g. Land a data science internship by summer" />
        </Field>
      </Section>

      {error && <div className="p-4 rounded-2xl bg-rose-50/80 border border-rose-200 text-rose-700 text-sm font-bold">{error}</div>}
      <div className="flex items-center gap-4">
        <button type="submit" className="lg-btn text-base">
          {submitLabel} {onboarding && <ArrowRight className="w-5 h-5" />}
        </button>
        {saved && !onboarding && <span className="flex items-center gap-2 text-emerald-700 font-black"><CheckCircle2 className="w-5 h-5" /> Saved</span>}
      </div>
    </form>
  )
}

function Section({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-indigo-700">{icon}{title}</h3>
        {hint && <p className="text-xs font-bold text-slate-500 mt-1">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-black text-slate-700">{label}</span>
      {children}
    </label>
  )
}
