import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Bookmark, BookmarkCheck, Briefcase, Calendar, CheckCircle2, Clock, Code, ExternalLink, Flame,
  GraduationCap, Loader2, MapPin, RefreshCw, Search, Sparkles, Target, Trophy, Users, XCircle,
  Compass, TrendingUp, LayoutGrid, Brain, ListChecks, Lightbulb, ArrowRight,
} from 'lucide-react'
import {
  type Analysis, type FeedItem, type FeedResponse, type FeedType, type InterviewPrep, type Recommendation,
  type TrendingRow, TYPE_LABEL, daysLeft, fmtCount, getAnalysis, getFeed, getInterviewPrep, getRecommendations,
  getTrending, parseSkills, refreshFeed, timeAgo,
} from '../lib/feed'

type Tab = 'foryou' | 'trending' | 'all'
const TYPES: FeedType[] = ['job', 'internship', 'hackathon', 'competition']

interface Props {
  skillsText: string
  setSkillsText: (v: string) => void
  isBookmarked: (item: FeedItem) => boolean
  onBookmark: (item: FeedItem) => void
  onRegister: (item: FeedItem) => void
}

export default function DiscoverView({ skillsText, setSkillsText, isBookmarked, onBookmark, onRegister }: Props) {
  const [tab, setTab] = useState<Tab>('foryou')
  const [meta, setMeta] = useState<Pick<FeedResponse, 'updated_at' | 'sources' | 'counts'> | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshNote, setRefreshNote] = useState('')
  const [prepItem, setPrepItem] = useState<FeedItem | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const skills = useMemo(() => parseSkills(skillsText), [skillsText])

  useEffect(() => {
    getFeed({ type: 'none-just-meta' }).then((r) => setMeta(r)).catch(() => {})
  }, [reloadKey])

  const doRefresh = async () => {
    setRefreshing(true)
    setRefreshNote('')
    try {
      const r = await refreshFeed()
      setRefreshNote(`Synced ${r.total} live opportunities`)
      setReloadKey((k) => k + 1)
    } catch (e) {
      setRefreshNote(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setRefreshing(false)
    }
  }

  const total = meta ? Object.values(meta.counts).reduce((a, b) => a + (b ?? 0), 0) : 0
  const cardProps = { skills, isBookmarked, onBookmark, onRegister, onPrep: setPrepItem }

  return (
    <div className="pb-24 min-h-screen animate-apple-reveal">
      <div className="pt-8 px-5">
        <div className="max-w-6xl mx-auto lg-panel rounded-[2rem] p-6 md:p-9">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
            <div>
              <h2 className="editorial-title text-4xl md:text-5xl font-black text-slate-900">Discovery Engine</h2>
              <div className="flex flex-wrap items-center gap-2 mt-3 text-xs font-bold text-slate-600">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                <span className="text-slate-900 font-black">{total.toLocaleString()} open opportunities</span>
                <span>live from {meta ? Object.keys(meta.sources).join(' · ') || 'saved snapshot' : '…'}</span>
                <span className="text-slate-400">•</span>
                <span>updated {timeAgo(meta?.updated_at ?? null)}</span>
              </div>
            </div>
            <div className="flex flex-col items-start md:items-end gap-1">
              <button
                onClick={doRefresh}
                disabled={refreshing}
                className="flex items-center gap-2 bg-slate-900 text-white px-5 py-3 rounded-2xl font-black text-sm apple-btn disabled:opacity-60"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Scanning live sites…' : 'Live Sync'}
              </button>
              {refreshNote && <span className="text-xs font-bold text-slate-500">{refreshNote}</span>}
            </div>
          </div>

          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-3xl blur opacity-25 group-hover:opacity-40 transition-opacity" />
            <div className="relative bg-white/70 border border-white rounded-2xl flex items-center p-3 shadow-sm">
              <div className="pl-4 pr-3 text-indigo-600"><Search className="w-6 h-6 stroke-[3]" /></div>
              <input
                type="text"
                value={skillsText}
                onChange={(e) => setSkillsText(e.target.value)}
                placeholder="Your skills, comma separated (e.g. Python, React, SQL, DSA)"
                className="w-full py-3 bg-transparent text-slate-900 text-lg font-black outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-6">
            <TabButton active={tab === 'foryou'} onClick={() => setTab('foryou')} icon={<Sparkles className="w-4 h-4" />} label="For You · AI Picks" />
            <TabButton active={tab === 'trending'} onClick={() => setTab('trending')} icon={<Flame className="w-4 h-4" />} label="Trending Now" />
            <TabButton active={tab === 'all'} onClick={() => setTab('all')} icon={<LayoutGrid className="w-4 h-4" />} label={`All Opportunities${total ? ` (${total})` : ''}`} />
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-10">
        {tab === 'foryou' && <ForYou key={reloadKey} {...cardProps} />}
        {tab === 'trending' && <Trending key={reloadKey} {...cardProps} />}
        {tab === 'all' && <AllOpportunities key={reloadKey} counts={meta?.counts ?? {}} {...cardProps} />}
      </div>

      {/* Portal: the page's reveal animation uses transform, which would trap a fixed overlay. */}
      {prepItem && createPortal(
        <InterviewPrepModal item={prepItem} skills={skills} onClose={() => setPrepItem(null)} onRegister={onRegister} />,
        document.body,
      )}
    </div>
  )
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black transition-all apple-btn ${
        active ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white/50 border-white/80 text-slate-700 hover:bg-white'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

interface CardActions {
  skills: string[]
  isBookmarked: (item: FeedItem) => boolean
  onBookmark: (item: FeedItem) => void
  onRegister: (item: FeedItem) => void
  onPrep: (item: FeedItem) => void
}

// ---------- For You ----------
function ForYou({ skills, ...actions }: CardActions) {
  const [types, setTypes] = useState<FeedType[]>([])
  const [recs, setRecs] = useState<Recommendation[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const skillKey = skills.join('|').toLowerCase()

  useEffect(() => {
    if (!skills.length) { setRecs([]); return }
    setLoading(true)
    const t = setTimeout(() => {
      getRecommendations(skills, types)
        .then((r) => { setRecs(r.items ?? []); setError('') })
        .catch((e) => setError(e instanceof Error ? e.message : 'Could not load recommendations'))
        .finally(() => setLoading(false))
    }, 450)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillKey, types.join()])

  const toggle = (t: FeedType) => setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="editorial-title text-3xl font-black text-slate-900 flex items-center gap-3">
            <Brain className="w-7 h-7 text-indigo-600" /> Your top {recs?.length || 15} moves right now
          </h3>
          <p className="text-slate-600 font-semibold mt-1 text-sm">
            Ranked by skill fit, how many students are joining, and how soon each one closes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button key={t} onClick={() => toggle(t)}
              className={`px-3.5 py-2 rounded-xl text-xs font-black border transition-all ${types.includes(t) ? 'bg-slate-900 text-white border-slate-900' : 'bg-white/50 text-slate-700 border-white/80 hover:bg-white'}`}>
              {TYPE_LABEL[t]}s
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorBox text={error} />}
      {!skills.length && <EmptyBox icon={<Target className="w-12 h-12" />} title="Add your skills above" text="Type a few skills (e.g. Python, React, SQL) and we'll rank every live opportunity for you." />}
      {loading && !recs?.length && <LoadingBox text="Analysing every live listing against your skills…" />}

      <div className={`space-y-6 transition-opacity ${loading ? 'opacity-60' : ''}`}>
        {recs?.map((rec) => (
          <FeedCard key={rec.item.id} item={rec.item} {...actions} skills={skills} highlight={rec.action} rec={rec} />
        ))}
        {recs && recs.length === 0 && skills.length > 0 && !loading && (
          <EmptyBox icon={<Compass className="w-12 h-12" />} title="No strong matches yet" text="Try adding more skills, or browse All Opportunities." />
        )}
      </div>
    </div>
  )
}

// ---------- Trending ----------
function Trending(actions: CardActions) {
  const [kind, setKind] = useState<FeedType | ''>('')
  const [rows, setRows] = useState<TrendingRow[] | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    setRows(null)
    getTrending(kind || undefined, 15)
      .then((r) => setRows(r.items ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load trending'))
  }, [kind])

  const peak = Math.max(1, ...(rows ?? []).map((r) => r.registrations))

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="editorial-title text-3xl font-black text-slate-900 flex items-center gap-3">
            <TrendingUp className="w-7 h-7 text-rose-600" /> Trending right now
          </h3>
          <p className="text-slate-600 font-semibold mt-1 text-sm">Real registration counts from each platform, weighted by how fast students are signing up.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['', ...TYPES] as const).map((t) => (
            <button key={t || 'all'} onClick={() => setKind(t)}
              className={`px-3.5 py-2 rounded-xl text-xs font-black border transition-all ${kind === t ? 'bg-rose-600 text-white border-rose-600' : 'bg-white/50 text-slate-700 border-white/80 hover:bg-white'}`}>
              {t ? `${TYPE_LABEL[t]}s` : 'Everything'}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorBox text={error} />}
      {!rows && !error && <LoadingBox text="Counting registrations…" />}

      <div className="lg-panel rounded-[1.75rem] divide-y divide-white/70 overflow-hidden">
        {rows?.map((row) => (
          <div key={row.item.id}>
            <button onClick={() => setOpen(open === row.item.id ? null : row.item.id)} className="w-full text-left px-6 py-5 flex items-center gap-5 bg-transparent hover:bg-white/40 transition-colors rounded-none border-0">
              <span className={`text-2xl font-black w-10 shrink-0 ${row.rank <= 3 ? 'text-rose-600' : 'text-slate-400'}`}>{row.rank}</span>
              <Logo item={row.item} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <TypeBadge type={row.item.type} />
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">{row.item.source} · {row.item.organization}</span>
                </div>
                <div className="font-black text-slate-900 truncate">{row.item.title}</div>
                <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-400 via-rose-500 to-fuchsia-600 rounded-full" style={{ width: `${Math.max(4, (row.registrations / peak) * 100)}%` }} />
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="flex items-center gap-1.5 justify-end text-lg font-black text-slate-900"><Flame className="w-5 h-5 text-rose-500" />{fmtCount(row.registrations)}</div>
                <div className="text-[11px] font-bold text-slate-500">{row.per_day ? `+${fmtCount(Math.round(row.per_day))}/day` : 'registered'}</div>
              </div>
            </button>
            {open === row.item.id && (
              <div className="px-6 pb-6 bg-slate-50"><FeedCard item={row.item} {...actions} /></div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------- All ----------
function AllOpportunities({ counts, ...actions }: CardActions & { counts: Partial<Record<FeedType, number>> }) {
  const [kind, setKind] = useState<FeedType | ''>('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState('popular')
  const [data, setData] = useState<FeedItem[] | null>(null)
  const [shown, setShown] = useState(24)
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => {
      getFeed({ type: kind, q, sort })
        .then((r) => { setData(r.items ?? []); setShown(24) })
        .catch((e) => setError(e instanceof Error ? e.message : 'Could not load opportunities'))
    }, 250)
    return () => clearTimeout(t)
  }, [kind, q, sort])

  return (
    <div className="space-y-8">
      <div className="flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {(['', ...TYPES] as const).map((t) => (
            <button key={t || 'all'} onClick={() => setKind(t)}
              className={`px-4 py-2 rounded-xl text-xs font-black border transition-all ${kind === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white/50 text-slate-700 border-white/80 hover:bg-white'}`}>
              {t ? `${TYPE_LABEL[t]}s (${counts[t] ?? 0})` : 'All'}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, company, skill, city…"
            className="lg-input !py-2.5 text-sm w-full lg:w-72" />
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="lg-input !py-2.5 text-sm !w-auto">
            <option value="popular">Most popular</option>
            <option value="deadline">Closing soon</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      </div>

      {error && <ErrorBox text={error} />}
      {!data && !error && <LoadingBox text="Loading live listings…" />}
      {data && <p className="text-sm font-black text-slate-600">{data.length} results</p>}

      <div className="grid gap-6">
        {data?.slice(0, shown).map((item) => <FeedCard key={item.id} item={item} {...actions} />)}
      </div>
      {data && shown < data.length && (
        <div className="text-center">
          <button onClick={() => setShown((s) => s + 24)} className="lg-pill px-6 py-3 rounded-2xl font-black text-sm apple-btn">
            Show more ({data.length - shown} left)
          </button>
        </div>
      )}
    </div>
  )
}

// ---------- Card ----------
function FeedCard({ item, skills, isBookmarked, onBookmark, onRegister, onPrep, highlight, rec }: CardActions & { item: FeedItem; highlight?: string; rec?: Recommendation }) {
  const [showAnalysis, setShowAnalysis] = useState(false)
  const mine = useMemo(() => new Set(skills.map((s) => s.toLowerCase())), [skills])
  const left = daysLeft(item.deadline)
  const saved = isBookmarked(item)
  const canPrep = item.type === 'job' || item.type === 'internship'

  return (
    <div className="lg-panel rounded-[1.75rem] p-6 md:p-7 apple-card-hover">
      {rec && (
        <div className="flex flex-wrap items-center gap-3 -mt-1 mb-5 pb-5 border-b border-white/70 pr-14">
          <div className="lg-dark rounded-2xl pl-4 pr-4 py-2 flex items-center gap-3 text-white shrink-0">
            <span className="editorial-title text-2xl font-bold leading-none tabular-nums">#{rec.rank}</span>
            <span className="w-px h-8 bg-white/20" />
            <ScoreRing value={rec.score} dark />
            <span className="leading-tight">
              <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">Match</span>
              <span className="block text-sm font-bold">{rec.score >= 75 ? 'Strong fit' : rec.score >= 50 ? 'Good fit' : 'Stretch'}</span>
            </span>
          </div>
          <div className="flex flex-wrap gap-2 min-w-0">
            {rec.reasons.map((r) => (
              <span key={r} className="flex items-center gap-1.5 text-xs font-black text-slate-800 bg-white/55 border border-white/80 rounded-xl px-3 py-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> {r}
              </span>
            ))}
          </div>
        </div>
      )}
      <button onClick={() => onBookmark(item)} title={saved ? 'Remove from tracker' : 'Save to tracker'}
        className={`absolute top-5 right-5 p-2.5 rounded-xl transition-all editorial-border hover:scale-110 ${saved ? 'bg-indigo-600 text-white' : 'bg-white/60 text-slate-900 hover:text-indigo-600'}`}>
        {saved ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
      </button>

      <div className="flex gap-4 pr-12">
        <Logo item={item} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={item.type} />
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">via {item.source}</span>
            {item.registrations ? (
              <span className="flex items-center gap-1 text-[11px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg">
                <Users className="w-3 h-3" /> {item.registrations.toLocaleString()} registered
              </span>
            ) : null}
          </div>
          <h3 className="editorial-title text-2xl md:text-3xl font-black text-slate-900 leading-tight mt-2">{item.title}</h3>
          <div className="text-sm font-bold text-slate-600 mt-1">{item.organization}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-bold text-slate-700 mt-4">
        <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-indigo-600" />{item.location}{item.mode && item.mode !== item.location ? ` · ${item.mode}` : ''}</span>
        {item.deadline && (
          <span className={`flex items-center gap-1.5 ${left !== null && left <= 3 ? 'text-rose-700' : ''}`}>
            <Calendar className="w-4 h-4" /> {left !== null && left >= 0 ? `Closes in ${left} day${left === 1 ? '' : 's'}` : item.deadline}
          </span>
        )}
        {item.compensation && <span className="flex items-center gap-1.5 text-indigo-800"><Trophy className="w-4 h-4 text-indigo-600" />{item.compensation}</span>}
      </div>

      {item.description && <p className="text-slate-700 text-sm leading-relaxed mt-4 line-clamp-3">{item.description}</p>}

      {item.skills.length > 0 && (
        <div className="mt-5">
          <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">Skills required</div>
          <div className="flex flex-wrap gap-2">
            {item.skills.map((s) => {
              const has = mine.has(s.toLowerCase())
              return (
                <span key={s} className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black border ${has ? 'bg-emerald-50 text-emerald-900 border-emerald-300' : 'bg-slate-50 text-slate-800 border-slate-300'}`}>
                  {has ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <XCircle className="w-3.5 h-3.5 text-slate-400" />}
                  {s}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {item.requirements.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">Minimum requirements</div>
          <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
            {item.requirements.map((r) => (
              <li key={r} className="flex items-start gap-2 text-xs font-bold text-slate-700"><GraduationCap className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />{r}</li>
            ))}
          </ul>
        </div>
      )}

      {highlight && (
        <div className="mt-5 flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-2xl px-4 py-3 text-sm font-black">
          <Lightbulb className="w-4 h-4 text-indigo-600 shrink-0" /> {highlight}
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button onClick={() => setShowAnalysis((v) => !v)}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-sm editorial-border apple-btn ${showAnalysis ? 'bg-indigo-600 text-white' : 'bg-white/60 text-slate-900 hover:bg-white'}`}>
          <Brain className={`w-4 h-4 ${showAnalysis ? 'text-white' : 'text-indigo-600'}`} />
          {showAnalysis ? 'Hide analysis' : 'AI Skill Gap Analysis'}
        </button>
        {canPrep && (
          <button onClick={() => onPrep(item)} className="flex items-center gap-2 px-5 py-3 rounded-2xl font-black text-sm bg-amber-50 text-amber-900 border border-amber-300 apple-btn">
            <ListChecks className="w-4 h-4" /> Start Interview Prep
          </button>
        )}
        <button onClick={() => onRegister(item)} className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-sm shadow-lg apple-btn ml-auto">
          Register on {item.source} <ExternalLink className="w-4 h-4" />
        </button>
      </div>

      {showAnalysis && <AnalysisPanel item={item} skills={skills} onPrep={canPrep ? () => onPrep(item) : undefined} />}
    </div>
  )
}

// ---------- Skill gap analysis ----------
const VERDICT_STYLE: Record<Analysis['verdict_key'], string> = {
  ready: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  almost: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  stretch: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
  urgent: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/40',
}

function AnalysisPanel({ item, skills, onPrep }: { item: FeedItem; skills: string[]; onPrep?: () => void }) {
  const [data, setData] = useState<Analysis | null>(null)
  const [error, setError] = useState('')
  const [stage, setStage] = useState(0)
  const stages = ['Reading the listing…', 'Comparing it with your skills…', 'Building your action plan…']

  useEffect(() => {
    let alive = true
    const tick = setInterval(() => setStage((s) => Math.min(s + 1, stages.length - 1)), 380)
    const started = Date.now()
    getAnalysis(item.id, skills)
      .then((r) => new Promise<Analysis>((res) => setTimeout(() => res(r), Math.max(0, 1100 - (Date.now() - started)))))
      .then((r) => { if (alive) setData(r) })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Analysis failed') })
      .finally(() => clearInterval(tick))
    return () => { alive = false; clearInterval(tick) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, skills.join('|')])

  return (
    <div className="mt-6 lg-dark rounded-3xl p-6 md:p-8 text-white animate-apple-reveal">
      {error && <p className="text-rose-300 font-bold text-sm">{error}</p>}
      {!data && !error && (
        <div className="flex items-center gap-3 py-8 justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
          <p className="text-sm font-black text-slate-300">{stages[stage]}</p>
        </div>
      )}
      {data && (
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row gap-6 md:items-center">
            <ScoreRing value={data.readiness} label="Ready" dark big />
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <span className="editorial-title text-2xl font-black">AI Skill Gap Analysis</span>
                <span className={`text-xs font-black px-2.5 py-1 rounded-lg border ${VERDICT_STYLE[data.verdict_key]}`}>{data.verdict}</span>
              </div>
              <p className="text-slate-300 font-semibold leading-relaxed text-sm">{data.summary}</p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <SkillColumn title="You already have" tone="emerald" items={data.have.map((s) => ({ name: s }))} empty="None of the listed skills yet" />
            <SkillColumn title="Close to what you know" tone="amber" items={data.transferable.map((t) => ({ name: t.skill, note: `via ${t.via}` }))} empty="—" />
            <SkillColumn title="You need to learn" tone="rose" items={data.missing.map((g) => ({ name: g.skill, note: `~${g.days} days`, href: g.resource }))} empty="No gaps. You're covered!" />
          </div>

          <div className="bg-slate-800/80 border border-slate-700 rounded-2xl p-5">
            <div className="text-xs font-black uppercase tracking-widest text-indigo-300 mb-4 flex items-center gap-2">
              <Target className="w-4 h-4" /> What to do before you apply
              {data.prep_days > 0 && <span className="ml-auto flex items-center gap-1 text-slate-400 normal-case tracking-normal"><Clock className="w-3.5 h-3.5" /> ~{data.prep_days} days of prep</span>}
            </div>
            <ol className="space-y-4">
              {data.steps.map((s, i) => (
                <li key={s.title} className="flex gap-4">
                  <span className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-xs font-black shrink-0">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="font-black text-sm">{s.title}</div>
                    <p className="text-slate-300 text-sm font-medium leading-relaxed break-words">
                      {linkify(s.detail)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {onPrep && (
            <button onClick={onPrep} className="flex items-center gap-2 bg-white text-slate-900 px-5 py-3 rounded-2xl font-black text-sm apple-btn">
              Continue to Interview Prep <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function linkify(text: string) {
  return text.split(/(https?:\/\/\S+)/g).map((part, i) =>
    /^https?:\/\//.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-indigo-300 underline underline-offset-2 hover:text-white">{new URL(part).hostname.replace('www.', '')}</a>
      : <React.Fragment key={i}>{part}</React.Fragment>,
  )
}

const TONES = {
  emerald: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
  amber: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
  rose: 'text-rose-300 border-rose-500/40 bg-rose-500/10',
}

function SkillColumn({ title, tone, items, empty }: { title: string; tone: keyof typeof TONES; items: Array<{ name: string; note?: string; href?: string }>; empty: string }) {
  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-4">
      <div className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">{title}</div>
      <div className="flex flex-wrap gap-2">
        {items.length === 0 && <span className="text-xs font-bold text-slate-500">{empty}</span>}
        {items.map((it) => {
          const body = <>{it.name}{it.note && <span className="opacity-70 font-bold"> · {it.note}</span>}</>
          return it.href
            ? <a key={it.name} href={it.href} target="_blank" rel="noopener noreferrer" className={`px-2.5 py-1 rounded-lg text-xs font-black border hover:brightness-125 ${TONES[tone]}`}>{body}</a>
            : <span key={it.name} className={`px-2.5 py-1 rounded-lg text-xs font-black border ${TONES[tone]}`}>{body}</span>
        })}
      </div>
    </div>
  )
}

// ---------- Interview prep ----------
function InterviewPrepModal({ item, skills, onClose, onRegister }: { item: FeedItem; skills: string[]; onClose: () => void; onRegister: (item: FeedItem) => void }) {
  const [data, setData] = useState<InterviewPrep | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'predicted' | 'past' | 'sources'>('predicted')
  const [done, setDone] = useState<Set<string>>(new Set())
  const [openQ, setOpenQ] = useState<string | null>(null)

  useEffect(() => {
    getInterviewPrep(item.id, skills).then(setData).catch((e) => setError(e instanceof Error ? e.message : 'Could not load prep'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id])

  const all = data ? [...data.predicted_questions.map((q) => q.question), ...data.past_questions.map((q) => q.question)] : []
  const progress = all.length ? Math.round((all.filter((q) => done.has(q)).length / all.length) * 100) : 0
  const toggleDone = (q: string) => setDone((prev) => { const n = new Set(prev); n.has(q) ? n.delete(q) : n.add(q); return n })

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <div className="lg-panel rounded-[2rem] max-w-3xl w-full max-h-[90vh] flex flex-col animate-apple-reveal" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 md:p-8 border-b border-slate-200">
          <button onClick={onClose} className="float-right text-slate-400 hover:text-slate-900 bg-transparent border-0 p-0 rounded-none"><XCircle className="w-6 h-6" /></button>
          <div className="text-xs font-black uppercase tracking-widest text-amber-700 flex items-center gap-2"><ListChecks className="w-4 h-4" /> Interview Prep</div>
          <h3 className="editorial-title text-2xl md:text-3xl font-black text-slate-900 mt-1 pr-8">{item.title}</h3>
          <div className="text-sm font-bold text-slate-600">{item.organization} · {TYPE_LABEL[item.type]}</div>
          {data && (
            <div className="mt-4">
              <div className="flex justify-between text-xs font-black text-slate-600 mb-1"><span>Practice progress</span><span>{progress}%</span></div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} /></div>
            </div>
          )}
          <div className="flex gap-2 mt-5">
            {([['predicted', 'AI Predicted'], ['past', 'Past Questions'], ['sources', 'Real Experiences']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-xl text-xs font-black ${tab === k ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{label}</button>
            ))}
          </div>
        </div>

        <div className="p-6 md:p-8 overflow-y-auto space-y-3">
          {error && <ErrorBox text={error} />}
          {!data && !error && <LoadingBox text="Predicting your interview questions…" />}
          {data && tab === 'predicted' && (
            <>
              {data.focus.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm font-bold text-amber-900">
                  Expect probing on <strong>{data.focus.join(', ')}</strong>: they're in the listing but not on your profile.
                </div>
              )}
              {data.predicted_questions.map((q) => (
                <QuestionRow key={q.question} q={q.question} done={done.has(q.question)} onToggle={() => toggleDone(q.question)}
                  meta={<span className="text-[11px] font-black text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-lg">{q.likelihood}% likely</span>}
                  open={openQ === q.question} onOpen={() => setOpenQ(openQ === q.question ? null : q.question)} detail={q.why} />
              ))}
            </>
          )}
          {data && tab === 'past' && data.past_questions.map((q) => (
            <QuestionRow key={q.question} q={q.question} done={done.has(q.question)} onToggle={() => toggleDone(q.question)}
              meta={<><span className="text-[11px] font-black text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg">{q.topic}</span>
                <span className={`text-[11px] font-black px-2 py-0.5 rounded-lg ${q.difficulty === 'Hard' ? 'bg-rose-100 text-rose-800' : q.difficulty === 'Medium' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{q.difficulty}</span></>} />
          ))}
          {data && tab === 'sources' && (
            <>
              <p className="text-sm font-bold text-slate-600">Read what real candidates were asked at {item.organization} and similar roles:</p>
              {data.sources.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 p-4 rounded-2xl editorial-border hover:bg-slate-50 font-black text-sm text-slate-900">
                  {s.label} <ExternalLink className="w-4 h-4 text-indigo-600 shrink-0" />
                </a>
              ))}
            </>
          )}
        </div>

        <div className="p-5 border-t border-slate-200 flex justify-end">
          <button onClick={() => onRegister(item)} className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-sm apple-btn">
            Ready? Register on {item.source} <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

function QuestionRow({ q, done, onToggle, meta, detail, open, onOpen }: { q: string; done: boolean; onToggle: () => void; meta: React.ReactNode; detail?: string; open?: boolean; onOpen?: () => void }) {
  return (
    <div className={`rounded-2xl border p-4 transition-colors ${done ? 'bg-emerald-50/80 border-emerald-200' : 'bg-white/60 border-white/80'}`}>
      <div className="flex gap-3 items-start">
        <button onClick={onToggle} title="Mark as practised" className={`w-6 h-6 p-0 rounded-lg border-2 shrink-0 flex items-center justify-center mt-0.5 ${done ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-300'}`}>
          {done && <CheckCircle2 className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className={`font-black text-sm text-slate-900 ${onOpen ? 'cursor-pointer' : ''}`} onClick={onOpen}>{q}</div>
          <div className="flex flex-wrap gap-2 mt-2">{meta}</div>
          {open && detail && <p className="text-xs font-bold text-slate-600 mt-2">Why we predict this: {detail}</p>}
        </div>
      </div>
    </div>
  )
}

// ---------- small bits ----------
/** Progress ring. The small one holds only the number; its label sits outside so nothing overflows. */
function ScoreRing({ value, label, dark, big }: { value: number; label?: string; dark?: boolean; big?: boolean }) {
  const size = big ? 108 : 46
  const stroke = big ? 8 : 4
  const r = size / 2 - stroke / 2 - 1
  const c = 2 * Math.PI * r
  const color = value >= 75 ? '#40a02b' : value >= 45 ? '#df8e1d' : '#d20f39' // Latte green / yellow / red
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={dark ? 'rgba(255,255,255,0.14)' : '#dce0e8'} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, value) / 100)} style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={`${big ? 'text-2xl' : 'text-[13px]'} font-bold tabular-nums ${dark ? 'text-white' : 'text-slate-900'}`}>{value}%</span>
        {big && label && <span className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</span>}
      </div>
    </div>
  )
}

function TypeBadge({ type }: { type: FeedType }) {
  const style = { job: 'bg-sky-50 text-sky-900', internship: 'bg-indigo-50 text-indigo-900', hackathon: 'bg-fuchsia-50 text-fuchsia-900', competition: 'bg-amber-50 text-amber-900' }[type]
  return (
    <span className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wider border border-slate-200 ${style}`}>
      {type === 'hackathon' || type === 'competition' ? <Code className="w-3 h-3" /> : <Briefcase className="w-3 h-3" />}
      {TYPE_LABEL[type]}
    </span>
  )
}

function Logo({ item }: { item: FeedItem }) {
  const [broken, setBroken] = useState(false)
  if (!item.logo || broken) {
    return <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-lg shrink-0">{(item.organization || item.title).charAt(0).toUpperCase()}</div>
  }
  return <img src={item.logo} alt="" onError={() => setBroken(true)} className="w-12 h-12 rounded-2xl object-contain bg-white border border-slate-200 shrink-0" />
}

function LoadingBox({ text }: { text: string }) {
  return <div className="flex items-center justify-center gap-3 py-16 text-slate-600 font-black"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" />{text}</div>
}

function ErrorBox({ text }: { text: string }) {
  return <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-bold">{text}</div>
}

function EmptyBox({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="text-center py-16 lg-panel rounded-3xl">
      <div className="text-slate-400 flex justify-center mb-3">{icon}</div>
      <h4 className="editorial-title text-2xl font-black text-slate-900">{title}</h4>
      <p className="text-slate-600 font-bold mt-1">{text}</p>
    </div>
  )
}
