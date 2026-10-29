import { useEffect, useMemo, useRef, useState } from 'react'
import type { EligibilityStatus, MatchResponse, StudentProfile } from '../lib/types'

const W = 760, H = 640, CX = W / 2, CY = H / 2
const SKILL_R = { x: 125, y: 140 }
const OPP_R = { x: 215, y: 250 }
const MAX_SKILLS = 14, MAX_OPPS = 10

const STATUS_LABEL: Record<EligibilityStatus, string> = { eligible: 'Eligible', needs_verification: 'Check', ineligible: 'Not eligible' }

type SkillNode = { id: string; name: string; selected: boolean; x: number; y: number; a: number }
type OppNode = { id: string; title: string; status: EligibilityStatus; fit: number | null; x: number; y: number; matched: string[]; req: string[]; pref: string[] }

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const onEllipse = (a: number, r: { x: number; y: number }) => ({ x: CX + Math.cos(a) * r.x, y: CY + Math.sin(a) * r.y })

function meanAngle(angles: number[]): number | null {
  if (angles.length === 0) return null
  const s = angles.reduce((acc, a) => acc + Math.sin(a), 0), c = angles.reduce((acc, a) => acc + Math.cos(a), 0)
  return Math.atan2(s, c)
}

/** Lays out the student, their skills and the backend's results as a static network. No scoring happens here. */
function layout(profile: StudentProfile, names: Map<string, string>, result: MatchResponse | null) {
  const items = (result?.items ?? []).slice(0, MAX_OPPS)
  const selected = profile.skill_ids
  const extra: string[] = []
  for (const m of items) for (const id of [...m.missing_required_skills, ...m.missing_preferred_skills]) if (!selected.includes(id) && !extra.includes(id)) extra.push(id)
  const ids = [...selected, ...extra].slice(0, MAX_SKILLS)
  const skills: SkillNode[] = ids.map((id, i) => {
    const a = -Math.PI / 2 + (i / Math.max(ids.length, 1)) * Math.PI * 2
    return { id, name: names.get(id) ?? id, selected: selected.includes(id), a, ...onEllipse(a, SKILL_R) }
  })
  const angleOf = new Map(skills.map((s) => [s.id, s.a]))

  // Each result sits near the skills it shares with the student, then neighbours are pushed apart.
  const placed = items.map((m, i) => {
    const near = meanAngle(m.matched_skills.map((id) => angleOf.get(id)).filter((a): a is number => a !== undefined))
      ?? meanAngle(m.missing_required_skills.map((id) => angleOf.get(id)).filter((a): a is number => a !== undefined))
      ?? -Math.PI / 2 + ((i + 0.5) / items.length) * Math.PI * 2
    return { m, a: near }
  })
  placed.sort((p, q) => p.a - q.a)
  const minGap = (Math.PI * 2) / Math.max(placed.length, 1) * 0.8
  for (let pass = 0; pass < 40; pass++) {
    for (let i = 0; i < placed.length; i++) {
      const p = placed[i], q = placed[(i + 1) % placed.length]
      let gap = q.a - p.a
      if (i === placed.length - 1) gap += Math.PI * 2
      if (placed.length > 1 && gap < minGap) { const push = (minGap - gap) / 2; p.a -= push; q.a += push }
    }
  }
  const opps: OppNode[] = placed.map(({ m, a }) => ({
    id: m.opportunity.id, title: m.opportunity.title, status: m.eligibility_status, fit: m.skill_fit, ...onEllipse(a, OPP_R),
    matched: m.matched_skills, req: m.missing_required_skills, pref: m.missing_preferred_skills,
  }))
  return { skills, opps, hidden: (result?.items.length ?? 0) - items.length }
}

export default function MatchGraph({ profile, skillNames, result, onOpen }: { profile: StudentProfile; skillNames: Map<string, string>; result: MatchResponse | null; onOpen: () => void }) {
  const { skills, opps, hidden } = useMemo(() => layout(profile, skillNames, result), [profile, skillNames, result])
  const [focus, setFocus] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  // On narrow screens the map scrolls sideways; start centred on "You".
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
  }, [])
  const pos = new Map(skills.map((s) => [s.id, s]))
  const lit = (oppId: string) => focus === null || focus === oppId
  const skillLit = (id: string) => focus === null || opps.some((o) => o.id === focus && [...o.matched, ...o.req, ...o.pref].includes(id))

  return (
    <div className="graph-scroll" ref={scroller}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="graph" role="img" aria-label={`Network of your ${profile.skill_ids.length} skills and ${opps.length} matched opportunities`}>
        <g className="edges">
          {skills.filter((s) => s.selected).map((s) => (
            <line key={`y-${s.id}`} x1={CX} y1={CY} x2={s.x} y2={s.y} className={`edge you ${skillLit(s.id) ? '' : 'dim'}`} />
          ))}
          {opps.map((o) => (
            <g key={`e-${o.id}`} className={lit(o.id) ? '' : 'dim'}>
              {o.matched.map((id) => pos.get(id) && <line key={id} x1={o.x} y1={o.y} x2={pos.get(id)!.x} y2={pos.get(id)!.y} className={`edge has s-${o.status}`} />)}
              {o.req.map((id) => pos.get(id) && <line key={id} x1={o.x} y1={o.y} x2={pos.get(id)!.x} y2={pos.get(id)!.y} className="edge need" />)}
              {o.pref.map((id) => pos.get(id) && <line key={id} x1={o.x} y1={o.y} x2={pos.get(id)!.x} y2={pos.get(id)!.y} className="edge nice" />)}
            </g>
          ))}
        </g>

        {skills.map((s) => (
          <g key={s.id} className={`skill-node ${s.selected ? 'mine' : 'gap'} ${skillLit(s.id) ? '' : 'dim'}`} transform={`translate(${s.x} ${s.y})`}>
            <circle r={s.selected ? 6 : 5} />
            <text y={-12} textAnchor="middle">{clip(s.name, 16)}</text>
          </g>
        ))}

        <g className="you-node" transform={`translate(${CX} ${CY})`}>
          <rect x={-34} y={-34} width={68} height={68} rx={10} />
          <text y={-2} textAnchor="middle" className="you-label">You</text>
          <text y={15} textAnchor="middle" className="you-sub">{profile.skill_ids.length} skills</text>
        </g>

        {opps.map((o) => {
          const right = o.x >= CX
          const r = o.fit === null ? 7 : 7 + (o.fit / 100) * 7
          return (
            <g
              key={o.id}
              className={`opp-node s-${o.status} ${lit(o.id) ? '' : 'dim'} ${o.fit === null ? 'nofit' : ''}`}
              transform={`translate(${o.x} ${o.y})`}
              tabIndex={0}
              role="button"
              aria-label={`${o.title}: ${o.fit === null ? 'insufficient skill data' : `${o.fit.toFixed(1)}% skill fit`}, ${STATUS_LABEL[o.status]}. Open in Discover.`}
              onMouseEnter={() => setFocus(o.id)}
              onMouseLeave={() => setFocus(null)}
              onFocus={() => setFocus(o.id)}
              onBlur={() => setFocus(null)}
              onClick={onOpen}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() } }}
            >
              <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={3} />
              <g transform={`translate(${right ? r + 10 : -(r + 10)} 0)`} textAnchor={right ? 'start' : 'end'}>
                <text y={-3} className="opp-title">{clip(o.title, 19)}</text>
                <text y={13} className="opp-sub">{o.fit === null ? 'no skill data' : `${o.fit.toFixed(1)}% fit`} · {STATUS_LABEL[o.status]}</text>
              </g>
            </g>
          )
        })}
        {!result && (
          <text x={CX} y={H - 24} textAnchor="middle" className="graph-hint">Press “Find matches” to connect your skills to open opportunities</text>
        )}
        {hidden > 0 && <text x={W - 16} y={H - 16} textAnchor="end" className="graph-hint">+{hidden} more in Discover</text>}
      </svg>
    </div>
  )
}
