import React, { useState, useEffect, useRef } from 'react';
import { Route, Routes } from 'react-router-dom';
import {
  ExternalLink, XCircle, Sparkles, Bookmark, Briefcase, Code, Trophy, GraduationCap, Flame, Users,
  Home, Compass, LayoutDashboard, User, ArrowRight, Zap, Trash2, Network, Plus, LogOut, Pencil
} from 'lucide-react';
import SkillGraph from './components/SkillGraph';
import Login from './pages/Login';
import TwoFactorSetup from './pages/TwoFactorSetup';
import TwoFactorVerify from './pages/TwoFactorVerify';
import RequireAuth from './components/RequireAuth';
import { useAuth } from './auth/AuthContext';
import { saveStudentProfile } from './lib/matcher';
import DiscoverView from './components/Discovery';
import ProfileForm from './components/ProfileForm';
import { APP_NAME, GlassCursor, LiquidBackground, Logo, Wordmark } from './components/Brand';
import { TYPE_LABEL, type FeedItem, type FeedType, type TrendingRow, fmtCount, getFeed, getTrending } from './lib/feed';
import { type Profile, STUDY_LEVELS, missingFields, useProfile } from './lib/profile';

export interface OpportunityItem {
  id: string | number;
  title: string;
  type: string;
  platform: string;
  location: string;
  deadline: string;
  prize: string;
  skills: string[];
  description: string;
  source_url?: string;
  backendId?: string;
}

type Tab = 'home' | 'discover' | 'skills' | 'tracker' | 'profile';
type TrackedItem = { opportunity: OpportunityItem; status: string };

// The tracker lives in this browser, per account, so a refresh mid-demo doesn't wipe it.
function useTracker(userId: string) {
  const key = `clutcher.tracker.${userId}`;
  const [value, setValue] = useState<TrackedItem[]>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as TrackedItem[]) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
  }, [key, value]);
  return [value, setValue] as const;
}

const toTracked = (item: FeedItem): OpportunityItem => ({
  id: item.id,
  title: item.title,
  type: TYPE_LABEL[item.type],
  platform: item.source,
  location: item.location,
  deadline: item.deadline || 'Rolling',
  prize: item.compensation || item.organization,
  skills: item.skills,
  description: item.description,
  source_url: item.url,
});

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/2fa/setup" element={<TwoFactorSetup />} />
      <Route path="/2fa/verify" element={<TwoFactorVerify />} />
      <Route path="/*" element={<RequireAuth><ClutcherMain /></RequireAuth>} />
    </Routes>
  );
}

function ClutcherMain() {
  const { session } = useAuth();
  const userId = session!.user.id;
  const [profile, setProfile] = useProfile(userId);

  // Sync to the backend profile too; the app works from the local copy if that fails.
  const saveProfile = async (p: Profile) => {
    setProfile(p);
    try {
      await saveStudentProfile({
        skill_ids: p.skills.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
        country_code: 'IN',
        study_level: p.studyLevel === 'postgraduate' ? 'postgraduate' : p.studyLevel === 'school' ? 'school' : 'undergraduate',
        graduation_year: p.graduationYear ? Number(p.graduationYear) : null,
      });
    } catch { /* backend profile is optional */ }
  };

  return (
    <div className="min-h-screen text-slate-900 font-sans selection:bg-violet-600 selection:text-white relative">
      <ThemeStyles />
      <LiquidBackground />
      <GlassCursor />
      {missingFields(profile).length > 0
        ? <Onboarding email={session!.user.email ?? ''} profile={profile} onSave={saveProfile} />
        : <Shell userId={userId} profile={profile} saveProfile={saveProfile} />}
    </div>
  );
}

function ThemeStyles() {
  return (
    <style>{`
      .editorial-border { border: 1px solid rgba(255,255,255,0.8); }
      .editorial-shadow { box-shadow: 0 10px 40px -12px rgba(30, 27, 75, 0.2); }
      .apple-card-hover { transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.5s; }
      .apple-card-hover:hover { transform: translateY(-4px); }
      .apple-btn { transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.3s; }
      .apple-btn:hover { transform: translateY(-2px); }
      @keyframes fadeInScale { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
      .animate-apple-reveal { animation: fadeInScale 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }
    `}</style>
  );
}

function Onboarding({ email, profile, onSave }: { email: string; profile: Profile; onSave: (p: Profile) => Promise<void> }) {
  const { signOut } = useAuth();
  return (
    <div className="relative z-10 max-w-3xl mx-auto px-5 py-10 md:py-16 animate-apple-reveal">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3"><Logo size={44} /><Wordmark /></div>
        <button onClick={() => signOut()} className="lg-pill rounded-xl px-3 py-2 text-xs font-black text-slate-700 flex items-center gap-1.5"><LogOut className="w-3.5 h-3.5" /> Sign out</button>
      </div>
      <div className="lg-panel rounded-[2rem] p-7 md:p-10">
        <div className="text-xs font-black uppercase tracking-widest text-violet-700 flex items-center gap-2"><Sparkles className="w-4 h-4" /> Step 1 of 1 · Set up your profile</div>
        <h1 className="editorial-title text-4xl md:text-5xl font-black mt-2">Let’s set up your profile.</h1>
        <p className="font-bold text-slate-600 mt-2 mb-8">Signed in as {email}. Tell us about your education and skills so {APP_NAME} can rank every live opportunity for you.</p>
        <ProfileForm initial={profile} onSave={onSave} submitLabel="Show my recommendations" onboarding />
      </div>
    </div>
  );
}

function Shell({ userId, profile, saveProfile }: { userId: string; profile: Profile; saveProfile: (p: Profile) => Promise<void> }) {
  const { session, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [bookmarks, setBookmarks] = useTracker(userId);
  const [applyModalOpp, setApplyModalOpp] = useState<OpportunityItem | null>(null);
  const [skillsText, setSkillsText] = useState(profile.skills);
  useEffect(() => setSkillsText(profile.skills), [profile.skills]);

  const go = (tab: Tab) => { setActiveTab(tab); window.scrollTo({ top: 0 }); };

  const toggleBookmark = (opportunity: OpportunityItem) => {
    setBookmarks(prev => prev.some(b => b.opportunity.id === opportunity.id)
      ? prev.filter(b => b.opportunity.id !== opportunity.id)
      : [...prev, { opportunity, status: 'saved' }]);
  };

  const updateBookmarkStatus = (id: string | number, newStatus: string) => {
    setBookmarks(prev => prev.map(b => b.opportunity.id === id ? { ...b, status: newStatus } : b));
  };

  // Registration happens on the source site; we open it and track it as Applied here.
  const handleRegister = (item: FeedItem) => {
    const opportunity = toTracked(item);
    window.open(item.url, '_blank', 'noopener,noreferrer');
    setBookmarks(prev => prev.some(b => b.opportunity.id === opportunity.id)
      ? prev.map(b => b.opportunity.id === opportunity.id ? { ...b, status: 'applied' } : b)
      : [...prev, { opportunity, status: 'applied' }]);
    setApplyModalOpp(opportunity);
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'discover':
        return (
          <DiscoverView
            skillsText={skillsText}
            setSkillsText={setSkillsText}
            isBookmarked={item => bookmarks.some(b => b.opportunity.id === item.id)}
            onBookmark={item => toggleBookmark(toTracked(item))}
            onRegister={handleRegister}
          />
        );
      case 'skills':
        return <SkillGraph userId={userId} skillsText={profile.skills} onSkillsChange={skills => saveProfile({ ...profile, skills })} />;
      case 'tracker':
        return <TrackerView bookmarks={bookmarks} updateBookmarkStatus={updateBookmarkStatus} toggleBookmark={toggleBookmark} />;
      case 'profile':
        return <ProfileView profile={profile} onSave={saveProfile} />;
      default:
        return <HomeView profile={profile} go={go} />;
    }
  };

  return (
    <div className="relative z-10 flex flex-col min-h-screen">
      <nav className="sticky top-0 z-50 px-4 pt-4">
        <div className="max-w-7xl mx-auto lg-panel rounded-[1.75rem] h-20 px-4 md:px-6 flex items-center justify-between gap-4">
          <button onClick={() => go('home')} className="flex items-center gap-3 bg-transparent border-0 p-0 rounded-none group">
            <Logo size={44} className="transition-transform duration-500 group-hover:rotate-12" />
            <span className="hidden sm:inline"><Wordmark /></span>
          </button>

          <div className="hidden md:flex items-center gap-1 p-1.5 rounded-2xl bg-white/30 border border-white/70 shadow-inner">
            <NavButton active={activeTab === 'home'} onClick={() => go('home')} icon={<Home className="w-[18px] h-[18px]" />} label="Home" />
            <NavButton active={activeTab === 'discover'} onClick={() => go('discover')} icon={<Compass className="w-[18px] h-[18px]" />} label="Discover" />
            <NavButton active={activeTab === 'skills'} onClick={() => go('skills')} icon={<Network className="w-[18px] h-[18px]" />} label="Skill Graph" />
            <NavButton active={activeTab === 'tracker'} onClick={() => go('tracker')} icon={<LayoutDashboard className="w-[18px] h-[18px]" />} label="Tracker" />
            <NavButton active={activeTab === 'profile'} onClick={() => go('profile')} icon={<User className="w-[18px] h-[18px]" />} label="Profile" />
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/40 border border-white/70 text-xs font-black text-violet-800">
              <Zap className="w-4 h-4 fill-violet-600 text-violet-600" /> AI Live
            </div>
            <button onClick={() => go('profile')} className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-white/40 border border-white/70" title={session?.user.email ?? ''}>
              <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-blue-600 text-white flex items-center justify-center font-black text-sm">{profile.name.charAt(0).toUpperCase()}</span>
              <span className="hidden xl:inline text-xs font-black text-slate-800 max-w-[110px] truncate">{profile.name.split(' ')[0]}</span>
            </button>
            <button onClick={() => signOut()} title="Sign out" className="p-2.5 rounded-xl bg-white/40 border border-white/70 text-slate-700 hover:text-rose-600">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="md:hidden max-w-7xl mx-auto mt-2 lg-panel rounded-2xl p-1.5 flex justify-between">
          {(['home', 'discover', 'skills', 'tracker', 'profile'] as Tab[]).map(t => (
            <button key={t} onClick={() => go(t)} className={`flex-1 py-2 rounded-xl text-xs font-black border-0 capitalize ${activeTab === t ? 'bg-white shadow text-slate-900' : 'bg-transparent text-slate-600'}`}>{t}</button>
          ))}
        </div>
      </nav>

      <main key={activeTab} className="flex-1 w-full">
        {renderContent()}
      </main>

      {applyModalOpp && (
        <div className="fixed inset-0 z-[60] bg-slate-900/30 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setApplyModalOpp(null)}>
          <div className="lg-panel rounded-[2rem] max-w-md w-full p-8 animate-apple-reveal" onClick={e => e.stopPropagation()}>
            <button onClick={() => setApplyModalOpp(null)} className="absolute top-6 right-6 text-slate-400 hover:text-slate-900 bg-transparent border-0 p-0">
              <XCircle className="w-6 h-6" />
            </button>
            <div className="w-16 h-16 lg-btn !p-0 !rounded-2xl mb-6 mx-auto">
              <ExternalLink className="w-8 h-8" />
            </div>
            <h3 className="editorial-title text-3xl font-black text-center text-slate-900 mb-2">Finish on {applyModalOpp.platform}</h3>
            <p className="text-slate-600 text-center text-sm font-semibold mb-6 leading-relaxed">
              We opened the official <span className="font-extrabold text-slate-900">{applyModalOpp.platform}</span> page for <span className="font-extrabold text-violet-700">{applyModalOpp.title}</span> in a new tab. Complete your registration there.
            </p>
            <div className="bg-white/50 p-4 rounded-2xl border border-white/80 mb-6 text-xs text-slate-800 font-bold space-y-2">
              <div><strong className="text-slate-900 font-black">Candidate:</strong> {profile.name}</div>
              <div><strong className="text-slate-900 font-black">Deadline:</strong> {applyModalOpp.deadline}</div>
              <div><strong className="text-slate-900 font-black">Tracker:</strong> Moved to Applied</div>
            </div>
            <div className="flex gap-3">
              {applyModalOpp.source_url && (
                <a href={applyModalOpp.source_url} target="_blank" rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 bg-white/60 border border-white/80 text-slate-900 py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider">
                  Reopen Page <ExternalLink className="w-4 h-4" />
                </a>
              )}
              <button onClick={() => { setApplyModalOpp(null); go('tracker'); }} className="flex-1 lg-btn !py-3.5 text-xs uppercase tracking-wider">
                Open Tracker
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-3 rounded-xl text-[15px] font-bold tracking-wide border transition-all duration-300 ${
        active
          ? 'bg-white/90 border-white text-slate-900 shadow-[0_6px_20px_-6px_rgba(76,29,149,0.35)]'
          : 'bg-transparent border-transparent text-slate-600 hover:text-slate-900 hover:bg-white/40'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

const ORBIT_ICONS = [
  { icon: <Briefcase className="w-5 h-5" />, label: 'Jobs' },
  { icon: <GraduationCap className="w-5 h-5" />, label: 'Internships' },
  { icon: <Code className="w-5 h-5" />, label: 'Hackathons' },
  { icon: <Trophy className="w-5 h-5" />, label: 'Competitions' },
];

function HomeView({ profile, go }: { profile: Profile; go: (tab: Tab) => void }) {
  const [trending, setTrending] = useState<TrendingRow[]>([]);
  const [counts, setCounts] = useState<Partial<Record<FeedType, number>>>({});

  useEffect(() => {
    getTrending(undefined, 14).then(r => setTrending(r.items ?? [])).catch(() => {});
    getFeed({ type: 'none' }).then(r => setCounts(r.counts ?? {})).catch(() => {});
  }, []);

  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  const floaters = trending.slice(0, 4);
  const positions = ['left-[2%] top-[14%]', 'right-[2%] top-[10%]', 'left-[5%] bottom-[16%]', 'right-[4%] bottom-[20%]'];

  return (
    <div className="relative overflow-hidden">
      <section className="relative min-h-[calc(100vh-7rem)] flex items-center justify-center px-6 py-14">
        {/* Live opportunities drifting around the hero (real trending data). */}
        {floaters.map((row, i) => (
          <div key={row.item.id} className={`hidden xl:block absolute ${positions[i]} w-64 float-card`} style={{ animationDelay: `${i * 1.3}s` }}>
            <div className="lg-panel rounded-2xl p-4">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-violet-700">
                {row.item.type === 'hackathon' || row.item.type === 'competition' ? <Code className="w-3 h-3" /> : <Briefcase className="w-3 h-3" />}
                {TYPE_LABEL[row.item.type]} · {row.item.source}
              </div>
              <div className="font-black text-sm mt-1 line-clamp-2">{row.item.title}</div>
              <div className="flex items-center justify-between mt-2 text-xs font-black">
                <span className="text-slate-500 truncate max-w-[60%]">{row.item.organization}</span>
                <span className="flex items-center gap-1 text-rose-600"><Flame className="w-3.5 h-3.5" />{fmtCount(row.registrations)}</span>
              </div>
            </div>
          </div>
        ))}

        <div className="relative z-10 max-w-4xl mx-auto w-full text-center animate-apple-reveal">
          <div className="relative mx-auto w-[300px] h-[300px] md:w-[360px] md:h-[360px] flex items-center justify-center mb-4">
            <div className="orbit o1 inset-0">
              {ORBIT_ICONS.map((o, i) => (
                <div key={o.label} className="orbit-item w-0 h-0" style={{ left: '50%', top: '50%', transform: `rotate(${i * 90}deg) translateY(-150px)` }}>
                  <div>
                    <div style={{ transform: `rotate(${-i * 90}deg)` }}>
                      <div className="lg-chip rounded-2xl w-11 h-11 -ml-[22px] -mt-[22px] flex items-center justify-center text-violet-700" title={o.label}>{o.icon}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="orbit o2" style={{ inset: '18%' }} />
            <div className="lg-panel rounded-full p-5 md:p-6">
              <Logo size={150} className="logo-glow" />
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl lg-chip text-violet-800 text-xs font-black uppercase tracking-widest">
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" /></span>
            {total ? `${total.toLocaleString()} live opportunities` : 'Live'} · Unstop · Devpost · Remotive
          </div>

          <h1 className="editorial-title text-5xl md:text-7xl font-black tracking-tight leading-[1.05] mt-6">
            Find it. Prep for it. <span className="brand-text">Land it.</span>
          </h1>
          <p className="text-lg md:text-xl text-slate-700 max-w-2xl mx-auto font-bold leading-relaxed mt-5">
            Every open job, internship, hackathon and competition in one place, ranked for your skills, with a gap analysis and interview prep for each one.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
            <button onClick={() => go('discover')} className="lg-btn text-lg !px-9 !py-4 w-full sm:w-auto">
              See my top picks <ArrowRight className="w-5 h-5" />
            </button>
            <button onClick={() => go('profile')} className="lg-pill w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-black text-lg text-slate-900">
              <Pencil className="w-5 h-5 text-violet-600" /> Edit profile
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-12 max-w-3xl mx-auto">
            {(['job', 'internship', 'hackathon', 'competition'] as FeedType[]).map(t => (
              <div key={t} className="lg-panel rounded-2xl py-4">
                <div className="text-3xl font-black brand-text">{counts[t] ?? '–'}</div>
                <div className="text-xs font-black uppercase tracking-wider text-slate-600">{TYPE_LABEL[t]}s open</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {trending.length > 0 && (
        <section className="relative pb-16 overflow-hidden">
          <div className="text-center text-xs font-black uppercase tracking-[0.3em] text-slate-500 mb-4 flex items-center justify-center gap-2"><Users className="w-4 h-4" /> Students are joining right now</div>
          <div className="ticker">
            {[...trending, ...trending].map((row, i) => (
              <div key={`${row.item.id}-${i}`} className="lg-chip rounded-2xl px-4 py-3 flex items-center gap-3 shrink-0">
                <span className="text-[10px] font-black uppercase tracking-wider text-violet-700">{TYPE_LABEL[row.item.type]}</span>
                <span className="font-black text-sm max-w-[260px] truncate">{row.item.title}</span>
                <span className="flex items-center gap-1 text-xs font-black text-rose-600"><Flame className="w-3.5 h-3.5" />{fmtCount(row.registrations)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function TrackerView({ 
  bookmarks, 
  updateBookmarkStatus, 
  toggleBookmark 
}: { 
  bookmarks: Array<{ opportunity: OpportunityItem; status: string }>;
  updateBookmarkStatus: (id: string | number, status: string) => void;
  toggleBookmark: (opp: OpportunityItem) => void;
}) {
  const columns = [
    { id: 'saved', title: 'Saved For Later', badgeBg: 'bg-slate-100 text-slate-900 font-black border border-slate-300' },
    { id: 'applied', title: 'Applied', badgeBg: 'bg-indigo-100 text-indigo-900 font-black border border-indigo-300' },
    { id: 'interviewing', title: 'Interviewing / Active', badgeBg: 'bg-emerald-100 text-emerald-900 font-black border border-emerald-300' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 min-h-screen space-y-12 animate-apple-reveal">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="editorial-title text-4xl font-black text-slate-900 flex items-center gap-3">
            <LayoutDashboard className="w-8 h-8 text-indigo-600" />
            Application Tracker
          </h2>
          <p className="text-slate-600 font-semibold mt-1">Everything you saved or registered for, by stage.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-slate-900 text-white font-black px-5 py-3 rounded-xl text-xs shadow-md">
            {bookmarks.length} Tracked
          </span>
        </div>
      </div>

      {bookmarks.length === 0 ? (
        <div className="text-center py-20 lg-panel rounded-3xl">
          <Bookmark className="w-16 h-16 text-slate-400 mx-auto mb-4 stroke-[2.5]" />
          <h3 className="editorial-title text-2xl font-black text-slate-900 mb-2">No tracked opportunities.</h3>
          <p className="text-slate-900 font-black">Bookmark or apply to opportunities from the Discover page to populate your tracker.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
          {columns.map(col => (
            <div key={col.id} className="lg-panel rounded-3xl p-6 min-h-[500px] flex flex-col apple-card-hover">
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
                <h3 className="font-black text-slate-900 text-base">
                  {col.title}
                </h3>
                <span className={`text-xs px-3 py-1 rounded-lg ${col.badgeBg}`}>
                  {bookmarks.filter(b => b.status === col.id).length}
                </span>
              </div>
              <div className="space-y-4 flex-1">
                {bookmarks.filter(b => b.status === col.id).map(b => (
                  <TrackerCard 
                    key={b.opportunity.id} 
                    bookmark={b} 
                    updateStatus={updateBookmarkStatus}
                    onRemove={() => toggleBookmark(b.opportunity)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrackerCard({ 
  bookmark, 
  updateStatus, 
  onRemove 
}: { 
  bookmark: { opportunity: OpportunityItem; status: string };
  updateStatus: (id: string | number, status: string) => void;
  onRemove: () => void;
}) {
  const { opportunity, status } = bookmark;
  return (
    <div className="lg-panel rounded-2xl p-5 space-y-3 relative group apple-card-hover">
      <button 
        onClick={onRemove}
        className="absolute top-4 right-4 text-slate-400 hover:text-red-600 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      <div className="pr-6">
        <span className="text-xs font-black uppercase text-indigo-600 tracking-wider">{opportunity.platform}</span>
        <h4 className="font-black text-slate-900 text-lg leading-tight mt-0.5">{opportunity.title}</h4>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs font-black text-slate-700">
        <span>{opportunity.prize}</span>
        <select 
          value={status} 
          onChange={(e) => updateStatus(opportunity.id, e.target.value)}
          className="bg-slate-100 border border-slate-300 rounded-lg px-2.5 py-1 text-slate-900 font-black outline-none cursor-pointer"
        >
          <option value="saved">Saved</option>
          <option value="applied">Applied</option>
          <option value="interviewing">Interviewing</option>
        </select>
      </div>
    </div>
  );
}

function ProfileView({ profile, onSave }: { profile: Profile; onSave: (p: Profile) => Promise<void> }) {
  const level = STUDY_LEVELS.find(l => l.value === profile.studyLevel)?.label;
  return (
    <div className="max-w-3xl mx-auto px-5 py-10 animate-apple-reveal">
      <div className="lg-panel rounded-[2rem] overflow-hidden">
        <div className="lg-dark px-8 py-9 text-white flex items-center gap-5">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-teal-500 to-blue-600 flex items-center justify-center font-black text-3xl shadow-xl shrink-0">
            {profile.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="editorial-title text-3xl md:text-4xl font-black truncate">{profile.name}</h2>
            <p className="text-slate-300 font-bold mt-1">{[profile.degree, profile.institution].filter(Boolean).join(' · ')}</p>
            <p className="text-slate-400 text-sm font-bold">{[level, profile.graduationYear && `Class of ${profile.graduationYear}`, profile.city].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <div className="p-7 md:p-9">
          <ProfileForm key={JSON.stringify(profile)} initial={profile} onSave={onSave} submitLabel="Save profile" />
        </div>
      </div>
    </div>
  );
}
