import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/domain'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId?: string) => {
    if (!userId) {
      setProfile(null)
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,first_names,last_names,role,active')
      .eq('id', userId)
      .single()

    if (error) throw error
    setProfile(data as Profile)
  }, [])

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return
      setSession(data.session)
      try {
        await loadProfile(data.session?.user.id)
      } finally {
        if (mounted) setLoading(false)
      }
    })

    const { data: subscription } = supabase.auth.onAuthStateChange(
      async (_event, nextSession) => {
        setSession(nextSession)
        try {
          await loadProfile(nextSession?.user.id)
        } finally {
          setLoading(false)
        }
      },
    )

    return () => {
      mounted = false
      subscription.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  const refreshProfile = async () => loadProfile(session?.user.id)

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      signIn,
      signOut,
      refreshProfile,
    }),
    [session, profile, loading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return context
}
