import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// The browser only uses Supabase for signing in. All data goes through the Flask API.
export const supabaseConfigured = Boolean(url && key)
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing-key')
