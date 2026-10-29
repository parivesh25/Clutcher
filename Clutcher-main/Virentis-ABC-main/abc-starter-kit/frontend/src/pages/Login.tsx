import { FormEvent, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Briefcase, Code, Eye, EyeOff, Flame, Loader2, Lock, Mail, Trophy } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { APP_NAME, LiquidBackground, Logo, Wordmark } from '../components/Brand'
import { supabase } from '../lib/supabase'

export default function Login() {
  const { session, loading } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  if (!loading && session) return <Navigate to={from} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else if (!data.session) setNotice('Account created. Check your email to confirm it, then sign in.')
      else navigate(from, { replace: true })
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else navigate(from, { replace: true }) // RequireAuth sends you to 2FA if needed
    }
    setBusy(false)
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-6 font-sans text-slate-900">
      <LiquidBackground />
      <div className="relative z-10 w-full max-w-5xl grid lg:grid-cols-2 gap-8 items-center">
        <div className="hidden lg:block space-y-6 pr-6">
          <div className="flex items-center gap-3"><Logo size={56} className="logo-glow" /><Wordmark size="text-4xl" /></div>
          <h1 className="editorial-title text-5xl font-black leading-tight">
            Find it. Prep for it.<br /><span className="brand-text">Land it.</span>
          </h1>
          <p className="text-lg font-bold text-slate-700 max-w-md">
            Live jobs, internships, hackathons and competitions, with a skill-gap analysis and interview prep for every one.
          </p>
          <div className="flex flex-wrap gap-3">
            {[[<Briefcase key="b" className="w-4 h-4" />, 'Jobs & internships'], [<Code key="c" className="w-4 h-4" />, 'Hackathons'], [<Trophy key="t" className="w-4 h-4" />, 'Competitions'], [<Flame key="f" className="w-4 h-4" />, 'What’s trending']].map(([icon, label]) => (
              <span key={label as string} className="lg-chip rounded-2xl px-4 py-2.5 text-sm font-black flex items-center gap-2 text-indigo-900">{icon}{label}</span>
            ))}
          </div>
        </div>

        <div className="lg-panel rounded-[2rem] p-8 md:p-10 w-full max-w-md mx-auto">
          <div className="flex lg:hidden items-center gap-3 mb-6"><Logo size={44} /><Wordmark /></div>
          <h2 className="editorial-title text-3xl font-black">{mode === 'signin' ? 'Welcome back' : `Join ${APP_NAME}`}</h2>
          <p className="text-sm font-bold text-slate-600 mt-1">{mode === 'signin' ? 'Sign in to see your personalised picks.' : 'Create an account, then set up your profile.'}</p>

          <div className="flex p-1 mt-6 rounded-2xl bg-white/40 border border-white/70">
            {(['signin', 'signup'] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); setError(''); setNotice('') }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-black border-0 transition-all ${mode === m ? 'bg-white text-slate-900 shadow-md' : 'bg-transparent text-slate-600'}`}>
                {m === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4 mt-6">
            <label className="block space-y-1.5">
              <span className="text-xs font-black text-slate-700">Email</span>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input className="lg-input !pl-11" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@college.edu" required />
              </div>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-black text-slate-700">Password</span>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input className="lg-input !pl-11 !pr-11" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={8} placeholder="At least 8 characters" required />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 bg-transparent border-0 text-slate-500 hover:text-slate-900">
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>
            {error && <p role="alert" className="p-3 rounded-xl bg-rose-50/80 border border-rose-200 text-rose-700 text-sm font-bold">{error}</p>}
            {notice && <p role="status" className="p-3 rounded-xl bg-emerald-50/80 border border-emerald-200 text-emerald-800 text-sm font-bold">{notice}</p>}
            <button className="lg-btn w-full text-base" disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
