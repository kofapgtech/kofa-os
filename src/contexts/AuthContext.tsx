import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import type { Profile } from '@/lib/types'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  /** Operational leadership: Command centre access, acts on any project.
   *  Does NOT include hr_manager — HR gets narrower, specific grants
   *  below rather than this broad one. */
  isLeadership: boolean
  isAdmin: boolean
  /** Everything admin can do except invite/create/delete a user identity. */
  isExecutive: boolean
  isAdminOrExecutive: boolean
  /** Owner of the ACTIVE workspace — settings and ownership transfer. */
  isOwner: boolean
  /** Sees rates, costs, and budget dollar figures wherever they appear —
   *  a wider set than isLeadership (adds hr_manager). */
  hasFinancialAccess: boolean
  isHR: boolean
  isPayrollAdmin: boolean
  /** Owns the org chart: create, rename, delete a workstream, set its lead(s)
   *  and move people in and out. Admin, executive and HR — mirrored exactly by
   *  can_manage_workstreams() in the database, which is the real gate. */
  canManageWorkstreams: boolean
  /** Engaged as a contractor rather than an employee. Not a role -- it cuts
   *  across all of them -- so it gates the client-commercial surfaces
   *  (Accounts) that contractors have no business seeing, independently of
   *  whatever role they hold. */
  isContractor: boolean
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>
  /** Full-page redirect to Google; resolves (almost) immediately, before the
   *  redirect happens, so an error here means the request itself failed
   *  (e.g. the provider isn't configured) -- a rejection *after* Google
   *  hands back (wrong email domain, no invite) instead lands back on
   *  /login with an error in the URL, which Login.tsx reads separately. */
  signInWithGoogle: () => Promise<{ error: string | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  /** Sets a new password on the current session — works whether the person
   *  signed in with a password or a magic link. No re-auth challenge; relies
   *  on the active Supabase session the same way the rest of the app does. */
  updatePassword: (password: string) => Promise<{ error: string | null }>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      // RLS scopes profiles to the active workspace, so filtering on the person
      // returns exactly their membership in the workspace they're currently in.
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.error('Failed to load profile', error)
      setProfile(null)
      return
    }
    setProfile(data as Profile | null)
  }

  async function refreshProfile() {
    if (session?.user?.id) await loadProfile(session.user.id)
  }

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!isMounted) return
      setSession(data.session)
      if (data.session?.user?.id) await loadProfile(data.session.user.id)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isMounted) return
      setSession(newSession)
      if (newSession?.user?.id) {
        await loadProfile(newSession.user.id)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => {
      isMounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  async function signInWithPassword(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  async function signInWithMagicLink(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    return { error: error?.message ?? null }
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        // `hd` narrows Google's own account chooser to the work domain -- a UX
        // hint only (Google enforces it for Workspace domains, not a hard
        // guarantee); the real enforcement is the restrict_new_auth_users_to_org_domain
        // trigger on auth.users, which rejects anyone else outright.
        queryParams: { hd: 'kofapg.com', prompt: 'select_account' },
      },
    })
    return { error: error?.message ?? null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
  }

  async function updatePassword(password: string) {
    const { error } = await supabase.auth.updateUser({ password })
    return { error: error?.message ?? null }
  }

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    isLeadership:
      profile?.role === 'admin' || profile?.role === 'dept_lead' || profile?.role === 'executive',
    isAdmin: profile?.role === 'admin',
    isExecutive: profile?.role === 'executive',
    isAdminOrExecutive: profile?.role === 'admin' || profile?.role === 'executive',
    isOwner: profile?.is_owner === true,
    hasFinancialAccess:
      profile?.role === 'admin' ||
      profile?.role === 'dept_lead' ||
      profile?.role === 'executive' ||
      profile?.role === 'hr_manager',
    isHR: profile?.role === 'admin' || profile?.role === 'hr_manager',
    isPayrollAdmin: profile?.role === 'admin' || profile?.role === 'hr_manager',
    canManageWorkstreams:
      profile?.role === 'admin' || profile?.role === 'executive' || profile?.role === 'hr_manager',
    isContractor: profile?.employment_type === 'contractor',
    signInWithPassword,
    signInWithMagicLink,
    signInWithGoogle,
    signOut,
    refreshProfile,
    updatePassword,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
