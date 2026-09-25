import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'

import { supabase } from '../lib/supabase'
import type { MembershipRole, Organization, OrganizationMembership, Profile } from '../lib/database.types'

export interface Membership extends OrganizationMembership {
  organization: Organization
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  memberships: Membership[]
  activeMembership: Membership | null
  setActiveMembership: (membershipId: string) => void
  role: MembershipRole | null
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const ACTIVE_MEMBERSHIP_KEY = 'twincare.activeMembershipId'

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [activeMembershipId, setActiveMembershipId] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setSession(data.session)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const userId = session?.user.id
    if (!userId) {
      setProfile(null)
      setMemberships([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const load = async () => {
      const [profileResult, membershipResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase
          .from('organization_memberships')
          .select('*, organization:organizations(*)')
          .eq('user_id', userId)
          .eq('is_active', true),
      ])

      if (cancelled) return

      if (profileResult.error) {
        setError(profileResult.error.message)
      } else {
        setProfile(profileResult.data)
      }

      if (membershipResult.error) {
        setError(membershipResult.error.message)
        setMemberships([])
      } else {
        const rows = (membershipResult.data ?? []) as unknown as Membership[]
        setMemberships(rows)

        const stored = localStorage.getItem(ACTIVE_MEMBERSHIP_KEY)
        const valid = rows.some((m) => m.id === stored)
        setActiveMembershipId(valid ? stored : (rows[0]?.id ?? null))
      }

      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [session?.user.id])

  const setActiveMembership = useCallback((membershipId: string) => {
    setActiveMembershipId(membershipId)
    localStorage.setItem(ACTIVE_MEMBERSHIP_KEY, membershipId)
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) throw new Error(signInError.message)
  }, [])

  const signOut = useCallback(async () => {
    localStorage.removeItem(ACTIVE_MEMBERSHIP_KEY)
    await supabase.auth.signOut()
  }, [])

  const activeMembership = useMemo(
    () => memberships.find((m) => m.id === activeMembershipId) ?? null,
    [memberships, activeMembershipId],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      memberships,
      activeMembership,
      setActiveMembership,
      role: activeMembership?.role ?? null,
      loading,
      error,
      signIn,
      signOut,
    }),
    [session, profile, memberships, activeMembership, setActiveMembership, loading, error, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}

// eslint-disable-next-line react-refresh/only-export-components
export function homeRouteForRole(_role: MembershipRole | null): string {
  return '/'
}
