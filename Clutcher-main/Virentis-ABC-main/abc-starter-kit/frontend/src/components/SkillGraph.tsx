import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, CloudOff, FileText, Loader2, Network, Plus, RotateCcw, Sparkles, Upload, X } from 'lucide-react'
import { parseSkills } from '../lib/feed'
import {
  type Position, type ProfileKnowledgeGraph, type SkillKnowledgeGraph,
  createProfileKnowledgeGraph, getKnowledgeGraph, getSkillProgress, saveSkillProgress,
} from '../lib/knowledgeGraph'

// Latte palette, matching the rest of the app.
const C = { base: '#1e66f5', learned: '#40a02b', suggested: '#8c8fa1', growth: '#179299', context: '#9ca0b0', text: '#4c4f69' }
const W = 1000
const H = 620
const PAD = 60

type Local = { learned: string[]; resumeText: string; positions: Record<string, Position> }
const EMPTY_LOCAL: Local = { learned: [], resumeText: '', positions: {} }

function useLocalGraphState(userId: string) {
  const key = `clutcher.kg.${userId}`
  const [state, setState] = useState<Local>(() => {
    try { return { ...EMPTY_LOCAL, ...JSON.parse(localStorage.getItem(key) || '{}') } } catch { return EMPTY_LOCAL }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(state)) } catch { /* storage blocked */ }
  }, [key, state])
  return [state, setState] as const
}

interface Props {
  userId: string
  skillsText: string
  onSkillsChange: (skills: string) => void
}

export default function SkillGraph({ userId, skillsText, onSkillsChange }: Props) {
  const [local, setLocal] = useLocalGraphState(userId)
  const [catalogue, setCatalogue] = useState<SkillKnowledgeGraph | null>(null)
  const [graph, setGraph] = useState<ProfileKnowledgeGraph | null>(null)
  const [depth, setDepth] = useState(1)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [sync, setSync] = useState<'idle' | 'saving' | 'cloud' | 'device'>('idle')
  const [showResume, setShowResume] = useState(false)
  const loadedRemote = useRef(false)
  const skills = useMemo(() => parseSkills(skillsText), [skillsText])

  // Catalogue (for the skill tags) and any progress saved to the account on another device.
  useEffect(() => {
    getKnowledgeGraph().then(setCatalogue).catch(() => {})
    getSkillProgress()
      .then((p) => {
        setLocal((prev) => ({
          ...prev,
          learned: Array.from(new Set([...prev.learned, ...p.learned.map((l) => l.skill_id)])),
          positions: { ...p.positions, ...prev.positions },
        }))
        setSync('cloud')
      })
      .catch(() => setSync('device'))
      .finally(() => { loadedRemote.current = true })
  }, [setLocal])

  // The backend builds the graph: base = profile tags + resume, learned = completed, suggested = neighbours.
  useEffect(() => {
    const t = setTimeout(() => {
      createProfileKnowledgeGraph({ current_skills: skills, learned_skills: local.learned, resume_text: local.resumeText, expansion_depth: depth })
        .then((g) => { setGraph(g); setError('') })
        .catch((e) => setError(e instanceof Error ? e.message : 'Could not build your skill graph'))
    }, 200)
    return () => clearTimeout(t)
  }, [skills.join('|'), local.learned.join('|'), local.resumeText, depth]) // eslint-disable-line react-hooks/exhaustive-deps

  // Save only the user's own skill IDs and node positions, never the whole graph.
  useEffect(() => {
    if (!graph || !loadedRemote.current) return
    const t = setTimeout(() => {
      setSync('saving')
      saveSkillProgress({
        base_skill_ids: graph.profile.base_skill_ids,
        learned_skill_ids: graph.profile.learned_skill_ids,
        resume_skill_ids: graph.profile.resume_skill_ids,
        positions: Object.fromEntries(Object.entries(local.positions).filter(([id]) => graph.nodes.some((n) => n.id === id && n.state !== 'suggested'))),
      }).then(() => setSync('cloud')).catch(() => setSync('device'))
    }, 900)
    return () => clearTimeout(t)
  }, [graph, local.positions])

  const learn = (id: string) => setLocal((p) => ({ ...p, learned: p.learned.includes(id) ? p.learned : [...p.learned, id] }))
  const unlearn = (id: string) => setLocal((p) => ({ ...p, learned: p.learned.filter((x) => x !== id) }))
  const toggleTag = (label: string) => {
    const has = skills.some((s) => s.toLowerCase() === label.toLowerCase())
    onSkillsChange((has ? skills.filter((s) => s.toLowerCase() !== label.toLowerCase()) : [...skills, label]).join(', '))
  }
  const setPosition = useCallback((id: string, pos: Position) => setLocal((p) => ({ ...p, positions: { ...p.positions, [id]: pos } })), [setLocal])

  const node = graph?.nodes.find((n) => n.id === selected) ?? null
  const baseLabels = new Set(graph?.nodes.filter((n) => n.state === 'base').map((n) => n.id))

  return (
    <div className="max-w-7xl mx-auto px-5 py-10 space-y-6 animate-apple-reveal">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="editorial-title text-4xl font-bold text-slate-900 flex items-center gap-3">
            <Network className="w-8 h-8 text-teal-600" /> Your Skill Graph
          </h2>
          <p className="text-slate-600 font-semibold mt-1">It starts from what you know and grows every time you learn something new.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SyncBadge sync={sync} />
          <div className="lg-pill rounded-xl px-3 py-2 flex items-center gap-2 text-xs font-bold text-slate-700">
            Reach
            {[0, 1, 2, 3].map((d) => (
              <button key={d} onClick={() => setDepth(d)} className={`w-7 h-7 rounded-lg border-0 p-0 text-xs font-bold ${depth === d ? 'bg-slate-900 text-white' : 'bg-white/60 text-slate-700'}`}>{d}</button>
            ))}
          </div>
          <button onClick={() => setShowResume((v) => !v)} className="lg-pill rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-teal-600" /> {local.resumeText ? 'Resume added' : 'Add resume'}
          </button>
        </div>
      </div>

      {showResume && <ResumeBox text={local.resumeText} onSave={(resumeText) => { setLocal((p) => ({ ...p, resumeText })); setShowResume(false) }} onClose={() => setShowResume(false)} />}
      {error && <div className="p-4 rounded-2xl bg-red-50/80 border border-red-200 text-red-700 text-sm font-bold">{error}</div>}

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="lg-panel rounded-[1.75rem] p-3 overflow-hidden">
          {!graph && !error && <div className="h-[420px] flex items-center justify-center gap-3 font-bold text-slate-600"><Loader2 className="w-5 h-5 animate-spin" /> Growing your graph…</div>}
          {graph && graph.nodes.length === 0 && (
            <div className="h-[420px] flex flex-col items-center justify-center text-center px-6">
              <Network className="w-12 h-12 text-slate-400 mb-3" />
              <p className="font-bold text-slate-700">None of your skills are in the graph catalogue yet.</p>
              <p className="text-sm font-semibold text-slate-500 mt-1">Pick a few skills below, or add your resume.</p>
            </div>
          )}
          {graph && graph.nodes.length > 0 && (
            <GraphCanvas graph={graph} positions={local.positions} hover={hover} selected={selected}
              onHover={setHover} onSelect={setSelected} onMove={setPosition} />
          )}
          <Legend />
        </div>

        <div className="space-y-4">
          {graph && (
            <div className="lg-panel rounded-3xl p-5 grid grid-cols-3 text-center">
              <Stat n={graph.summary.base_count} label="Base" color={C.base} />
              <Stat n={graph.summary.learned_count} label="Learned" color={C.learned} />
              <Stat n={graph.summary.suggested_count} label="Next up" color={C.growth} />
            </div>
          )}

          {node ? (
            <div className="lg-panel rounded-3xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: node.state === 'base' ? C.base : node.state === 'learned' ? C.learned : C.growth }}>
                    {node.state === 'base' ? 'You know this' : node.state === 'learned' ? 'Learned' : 'Suggested next'} · {node.category}
                  </div>
                  <div className="editorial-title text-2xl font-bold text-slate-900">{node.label}</div>
                </div>
                <button onClick={() => setSelected(null)} className="p-1 bg-transparent border-0 text-slate-400 hover:text-slate-900"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-sm font-medium text-slate-700">{node.description}</p>
              {node.origins.length > 0 && <p className="text-xs font-bold text-slate-500">From: {node.origins.map((o) => o === 'profile_tag' ? 'your profile' : o === 'resume' ? 'your resume' : 'your learning').join(', ')}</p>}
              <div className="text-xs font-bold text-slate-600 space-y-1">
                {graph!.edges.filter((e) => e.source === node.id || e.target === node.id).slice(0, 6).map((e) => {
                  const other = graph!.nodes.find((n) => n.id === (e.source === node.id ? e.target : e.source))
                  return <div key={`${e.source}-${e.target}-${e.relationship}`}>{e.source === node.id ? node.label : other?.label} <span className="text-slate-400">{e.relationship.replace(/_/g, ' ')}</span> {e.source === node.id ? other?.label : node.label}</div>
                })}
              </div>
              {node.state === 'suggested' && (
                <button onClick={() => learn(node.id)} className="lg-btn w-full"><CheckCircle2 className="w-4 h-4" /> I’ve learned {node.label}</button>
              )}
              {node.state === 'learned' && (
                <button onClick={() => unlearn(node.id)} className="lg-pill w-full rounded-2xl py-3 text-sm font-bold text-slate-700 flex items-center justify-center gap-2"><RotateCcw className="w-4 h-4" /> Mark as not learned</button>
              )}
            </div>
          ) : graph && graph.next_skills.length > 0 && (
            <div className="lg-panel rounded-3xl p-5">
              <div className="text-xs font-bold uppercase tracking-widest text-teal-700 mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4" /> Learn next</div>
              <div className="space-y-2.5">
                {graph.next_skills.slice(0, 6).map((s) => (
                  <div key={s.id} className="flex items-center gap-3">
                    <button onClick={() => setSelected(s.id)} className="flex-1 min-w-0 text-left bg-transparent border-0 p-0">
                      <div className="flex justify-between text-sm font-bold text-slate-900"><span className="truncate">{s.label}</span><span className="text-slate-500 tabular-nums">{Math.round(s.readiness * 100)}%</span></div>
                      <div className="h-1.5 rounded-full bg-slate-200 mt-1 overflow-hidden"><div className="h-full rounded-full bg-teal-500" style={{ width: `${s.readiness * 100}%` }} /></div>
                    </button>
                    <button onClick={() => learn(s.id)} title={`Mark ${s.label} as learned`} className="w-8 h-8 p-0 rounded-lg border-0 bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 hover:bg-emerald-100"><Plus className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {catalogue && (
            <div className="lg-panel rounded-3xl p-5">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-1">Your skills</div>
              <p className="text-xs font-semibold text-slate-500 mb-3">Tap to add or remove. This updates your profile too.</p>
              <div className="flex flex-wrap gap-1.5">
                {catalogue.nodes.map((n) => {
                  const on = skills.some((s) => s.toLowerCase() === n.label.toLowerCase()) || baseLabels.has(n.id)
                  return (
                    <button key={n.id} onClick={() => toggleTag(n.label)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white/50 text-slate-700 border-white/80 hover:bg-white'}`}>
                      {n.label}
                    </button>
                  )
                })}
              </div>
              {graph && graph.unmatched_skills.length > 0 && (
                <p className="text-[11px] font-semibold text-slate-500 mt-3">Not in the graph yet: {graph.unmatched_skills.join(', ')}. They still count for job matching.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function GraphCanvas({ graph, positions, hover, selected, onHover, onSelect, onMove }: {
  graph: ProfileKnowledgeGraph
  positions: Record<string, Position>
  hover: string | null
  selected: string | null
  onHover: (id: string | null) => void
  onSelect: (id: string | null) => void
  onMove: (id: string, pos: Position) => void
}) {
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<{ id: string; moved: boolean } | null>(null)
  const [live, setLive] = useState<Record<string, Position>>({})

  const pos = (id: string, fallback: Position) => {
    const p = live[id] ?? positions[id] ?? fallback
    return { x: PAD + p.x * (W - 2 * PAD), y: PAD + p.y * (H - 2 * PAD) }
  }
  const byId = Object.fromEntries(graph.nodes.map((n) => [n.id, n]))
  const focus = hover ?? selected
  const linked = new Set(focus ? graph.edges.flatMap((e) => (e.source === focus || e.target === focus ? [e.source, e.target] : [])) : [])

  const toNormalized = (e: React.PointerEvent): Position => {
    const box = svg.current!.getBoundingClientRect()
    const x = ((e.clientX - box.left) / box.width) * W
    const y = ((e.clientY - box.top) / box.height) * H
    const clamp = (v: number) => Math.min(0.98, Math.max(0.02, v))
    return { x: clamp((x - PAD) / (W - 2 * PAD)), y: clamp((y - PAD) / (H - 2 * PAD)) }
  }

  return (
    <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none touch-none" onClick={() => onSelect(null)}
      onPointerMove={(e) => {
        if (!drag.current) return
        drag.current.moved = true
        const p = toNormalized(e)
        setLive((l) => ({ ...l, [drag.current!.id]: p }))
      }}
      onPointerUp={() => {
        const d = drag.current
        drag.current = null
        if (d?.moved && live[d.id]) onMove(d.id, live[d.id])
        setLive({})
      }}>
      <defs>
        <filter id="kg-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="7" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <style>{`@keyframes kg-flow { to { stroke-dashoffset: -24; } } .kg-growth { animation: kg-flow 1.4s linear infinite; }`}</style>

      {graph.edges.map((e) => {
        const a = pos(e.source, byId[e.source].position)
        const b = pos(e.target, byId[e.target].position)
        const dim = focus && !(e.source === focus || e.target === focus)
        const style = e.state === 'known'
          ? { stroke: C.base, strokeWidth: 2 + e.weight * 2, opacity: 0.75 }
          : e.state === 'growth'
            ? { stroke: C.growth, strokeWidth: 2, strokeDasharray: '8 4', opacity: 0.85 }
            : { stroke: C.context, strokeWidth: 1.2, strokeDasharray: '2 5', opacity: 0.7 }
        return <line key={`${e.source}-${e.target}-${e.relationship}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...style}
          className={e.state === 'growth' ? 'kg-growth' : ''} style={{ opacity: dim ? 0.12 : style.opacity, transition: 'opacity 0.2s' }} strokeLinecap="round" />
      })}

      {graph.nodes.map((n) => {
        const p = pos(n.id, n.position)
        const r = n.state === 'suggested' ? 20 : 25
        const dim = focus && focus !== n.id && !linked.has(n.id)
        const isSel = selected === n.id
        return (
          <g key={n.id} transform={`translate(${p.x} ${p.y})`} style={{ opacity: dim ? 0.3 : 1, transition: 'opacity 0.2s', cursor: 'grab' }}
            onPointerEnter={() => onHover(n.id)} onPointerLeave={() => onHover(null)}
            onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { id: n.id, moved: false } }}
            onClick={(e) => { e.stopPropagation(); if (!drag.current?.moved) onSelect(n.id) }}>
            {n.state === 'base' && <circle r={r + 7} fill="none" stroke={C.base} strokeOpacity={0.35} strokeWidth={3} />}
            {n.state === 'learned' && <circle r={r + 4} fill={C.learned} opacity={0.35} filter="url(#kg-glow)" />}
            <circle r={r}
              fill={n.state === 'base' ? C.base : n.state === 'learned' ? C.learned : 'rgba(255,255,255,0.75)'}
              stroke={n.state === 'suggested' ? C.suggested : 'white'} strokeWidth={n.state === 'suggested' ? 2 : 2.5}
              strokeDasharray={n.state === 'suggested' ? '4 3' : undefined} />
            {isSel && <circle r={r + 12} fill="none" stroke={C.text} strokeWidth={1.5} strokeDasharray="3 4" />}
            <text y={4} textAnchor="middle" fontSize={11} fontWeight={700} fill={n.state === 'suggested' ? C.text : 'white'} style={{ pointerEvents: 'none' }}>
              {n.label.length > 6 ? n.label.slice(0, 2).toUpperCase() : n.label}
            </text>
            <text y={r + 18} textAnchor="middle" fontSize={13} fontWeight={700} fill={C.text} style={{ pointerEvents: 'none' }}>{n.label}</text>
            {n.state === 'learned' && (
              <g transform={`translate(${r - 4} ${-r - 4})`} style={{ pointerEvents: 'none' }}>
                <rect x={-14} y={-9} width={30} height={16} rx={8} fill={C.learned} />
                <text x={1} y={3} textAnchor="middle" fontSize={9} fontWeight={800} fill="white">NEW</text>
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 px-4 pb-3 pt-1 text-xs font-bold text-slate-600">
      <span className="flex items-center gap-1.5"><svg width="16" height="16"><circle cx="8" cy="8" r="5" fill={C.base} /><circle cx="8" cy="8" r="7.2" fill="none" stroke={C.base} strokeOpacity=".35" strokeWidth="1.5" /></svg>Base</span>
      <span className="flex items-center gap-1.5"><svg width="16" height="16"><circle cx="8" cy="8" r="6" fill={C.learned} /></svg>Learned</span>
      <span className="flex items-center gap-1.5"><svg width="16" height="16"><circle cx="8" cy="8" r="6" fill="white" stroke={C.suggested} strokeDasharray="2 2" /></svg>Suggested</span>
      <span className="flex items-center gap-1.5"><svg width="26" height="6"><line x1="1" y1="3" x2="25" y2="3" stroke={C.base} strokeWidth="3" /></svg>Known link</span>
      <span className="flex items-center gap-1.5"><svg width="26" height="6"><line x1="1" y1="3" x2="25" y2="3" stroke={C.growth} strokeWidth="2" strokeDasharray="5 3" /></svg>Growth</span>
      <span className="flex items-center gap-1.5"><svg width="26" height="6"><line x1="1" y1="3" x2="25" y2="3" stroke={C.context} strokeWidth="1.5" strokeDasharray="1.5 3" /></svg>Context</span>
      <span className="text-slate-400">Drag nodes · click for details</span>
    </div>
  )
}

function Stat({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <div>
      <div className="editorial-title text-3xl font-bold tabular-nums" style={{ color }}>{n}</div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
    </div>
  )
}

function SyncBadge({ sync }: { sync: 'idle' | 'saving' | 'cloud' | 'device' }) {
  if (sync === 'idle') return null
  const text = { saving: 'Saving…', cloud: 'Saved to your account', device: 'Saved on this device' }[sync]
  return (
    <span className="lg-pill rounded-xl px-3 py-2 text-xs font-bold text-slate-600 flex items-center gap-1.5">
      {sync === 'device' ? <CloudOff className="w-3.5 h-3.5" /> : sync === 'saving' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
      {text}
    </span>
  )
}

function ResumeBox({ text, onSave, onClose }: { text: string; onSave: (t: string) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(text)
  const [note, setNote] = useState('')
  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      setNote('PDF text can’t be read in the browser yet. Open the PDF, copy all the text and paste it here.')
      return
    }
    setDraft((await file.text()).slice(0, 100_000))
    setNote(`Loaded ${file.name}`)
  }
  return (
    <div className="lg-panel rounded-3xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-bold text-slate-900 flex items-center gap-2"><FileText className="w-4 h-4 text-teal-600" /> Resume</div>
        <button onClick={onClose} className="p-1 bg-transparent border-0 text-slate-400 hover:text-slate-900"><X className="w-4 h-4" /></button>
      </div>
      <p className="text-xs font-semibold text-slate-500">Skills we spot in your resume become Base skills in your graph.</p>
      <textarea value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 100_000))} rows={6} placeholder="Paste your resume text here…" className="lg-input resize-y font-medium text-sm" />
      <div className="flex flex-wrap items-center gap-3">
        <label className="lg-pill rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 flex items-center gap-2 cursor-pointer">
          <Upload className="w-4 h-4" /> Upload .txt
          <input type="file" accept=".txt,.md,.pdf,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <button onClick={() => onSave(draft)} className="lg-btn !py-2.5">Use this resume</button>
        {text && <button onClick={() => onSave('')} className="text-sm font-bold text-slate-500 bg-transparent border-0 underline">Remove resume</button>}
        {note && <span className="text-xs font-bold text-slate-500">{note}</span>}
      </div>
    </div>
  )
}
