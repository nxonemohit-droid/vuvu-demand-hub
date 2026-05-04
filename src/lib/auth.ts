import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s); setUser(s?.user ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session); setUser(data.session?.user ?? null); setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user, loading };
}

export type AppRole = "admin" | "bd" | "viewer";

export function useRoles() {
  const { user, loading: sessionLoading } = useSession();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setRefreshTick((t) => t + 1);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) {
      setRoles([]);
      setLoading(false);
      return;
    }
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        setRoles((data ?? []).map((r) => r.role as AppRole));
        setLoading(false);
      });
  }, [user, sessionLoading, refreshTick]);

  return {
    user,
    roles,
    loading: sessionLoading || loading,
    isAdmin: roles.includes("admin"),
    isBD: roles.includes("bd"),
    isViewer: roles.includes("viewer"),
  };
}

export async function signOut() {
  await supabase.auth.signOut();
}