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

  const fetchProfile = useCallback(async (userId?: string) => {
    if (!userId) return null

    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,first_names,last_names,role,active')
      .eq('id', userId)
      .single()

    if (error) throw error
    return data as Profile
  }, [])

  useEffect(() => {
    let mounted = true
    let requestNumber = 0

    const synchronizeSession = async (nextSession: Session | null) => {
      const currentRequest = ++requestNumber

      if (!mounted) return

      setSession(nextSession)
      setLoading(true)

      try {
        const nextProfile = await fetchProfile(nextSession?.user.id)

        if (mounted && currentRequest == requestNumber) {
          setProfile(nextProfile)
        }
      } catch (error) {
        console.error('No fue posible cargar el perfil del usuario:', error)

        if (mounted && currentRequest == requestNumber) {
          setProfile(null)
        }
      } finally {
        if (mounted && currentRequest == requestNumber) {
          setLoading(false)
        }
      }
    }

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error('No fue posible recuperar la sesión:', error)
        if (mounted) setLoading(false)
        return
      }

      void synchronizeSession(data.session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return

      /*
       * No se ejecutan consultas asíncronas de Supabase directamente
       * dentro de onAuthStateChange. Se difieren al siguiente ciclo para
       * evitar el bloqueo de supabase-js que podía dejar la pantalla vacía
       * después de iniciar sesión.
       */
      setSession(nextSession)
      setLoading(true)

      window.setTimeout(() => {
        if (mounted) {
          void synchronizeSession(nextSession)
        }
      }, 0)
    })

    return () => {
      mounted = false
      requestNumber += 1
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  const refreshProfile = async () => {
    const currentUserId = session?.user.id
    if (!currentUserId) {
      setProfile(null)
      return
    }

    const nextProfile = await fetchProfile(currentUserId)
    setProfile(nextProfile)
  }

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
