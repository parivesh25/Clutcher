import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type Aal = { current: string | null; next: string | null }
type AuthState = {
  session: Session | null
  loading: boolean
  aal: Aal            // aal1 = password only, aal2 = password + 2FA code
  hasFactor: boolean  // has this user finished setting up an authenticator app?
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthCtx = createContext<AuthState>(null as unknown as AuthState)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [aal, setAal] = useState<Aal>({ current: null, next: null })
  const [hasFactor, setHasFactor] = useState(false)

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    setSession(data.session)
    if (data.session) {
      const level = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      setAal({ current: level.data?.currentLevel ?? null, next: level.data?.nextLevel ?? null })
      const factors = await supabase.auth.mfa.listFactors()
      setHasFactor((factors.data?.totp.length ?? 0) > 0) // totp = verified authenticator apps only
    } else {
      setAal({ current: null, next: null })
      setHasFactor(false)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
    const { data } = supabase.auth.onAuthStateChange(() => {
      // setTimeout avoids calling Supabase from inside its own callback, which can freeze it.
      setTimeout(() => void refresh(), 0)
    })
    return () => data.subscription.unsubscribe()
  }, [refresh])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return <AuthCtx.Provider value={{ session, loading, aal, hasFactor, refresh, signOut }}>{children}</AuthCtx.Provider>
}
