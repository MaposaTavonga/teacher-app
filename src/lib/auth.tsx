import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from './supabase';

export type Role = 'teacher' | 'hod' | 'admin';
export type MemberStatus = 'pending' | 'approved' | 'suspended';

export type Membership = {
  schoolId: string;
  schoolName: string | null; // hidden until approved (privacy rules)
  role: Role;
  status: MemberStatus;
};

type AuthState = {
  loading: boolean;
  session: Session | null;
  memberships: Membership[];
  /** Roles the user is approved for, across their schools. */
  approvedRoles: Role[];
  activeRole: Role | null;
  setActiveRole: (role: Role) => void;
  refreshMemberships: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

// Which experience opens first when someone has several roles.
const ROLE_PRIORITY: Role[] = ['teacher', 'hod', 'admin'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [chosenRole, setChosenRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  const loadMemberships = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setMemberships([]);
      return;
    }
    const { data, error } = await supabase
      .from('school_members')
      .select('school_id, role, status, schools(name)')
      .eq('user_id', userId);
    if (error) {
      console.warn('Could not load school memberships', error.message);
      setMemberships([]);
      return;
    }
    setMemberships(
      (data ?? []).map((row: any) => ({
        schoolId: row.school_id,
        schoolName: row.schools?.name ?? null,
        role: row.role,
        status: row.status,
      }))
    );
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadMemberships(data.session?.user.id);
      if (active) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setChosenRole(null);
      // Defer the query so it doesn't run inside the auth callback.
      setTimeout(() => loadMemberships(newSession?.user.id), 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadMemberships]);

  const approvedRoles = useMemo(() => {
    const roles = new Set(memberships.filter((m) => m.status === 'approved').map((m) => m.role));
    return ROLE_PRIORITY.filter((r) => roles.has(r));
  }, [memberships]);

  const activeRole = chosenRole && approvedRoles.includes(chosenRole) ? chosenRole : approvedRoles[0] ?? null;

  const value: AuthState = {
    loading,
    session,
    memberships,
    approvedRoles,
    activeRole,
    setActiveRole: setChosenRole,
    refreshMemberships: () => loadMemberships(session?.user.id),
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
