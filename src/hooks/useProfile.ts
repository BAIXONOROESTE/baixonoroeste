import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "supervisor" | "contador";

export interface UserProfile {
  id: string;
  full_name: string;
  slug: string;
  avatar_color: string;
  role: AppRole;
}

/**
 * Tracks the current auth user id reactively, so the profile query key
 * is isolated per user. Without this, cached data from a previous session
 * (e.g. a contador) can be served to a newly-logged-in admin in the same tab,
 * making role checks (isSupOrAdmin) return the wrong value.
 */
function useAuthUserId(): string | null | undefined {
  // undefined = ainda não sabemos, null = deslogado, string = uid
  const [uid, setUid] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setUid(data.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUid(session?.user?.id ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return uid;
}

export function useProfile() {
  const uid = useAuthUserId();

  return useQuery<UserProfile | null>({
    queryKey: ["profile", uid ?? "anon"],
    enabled: uid !== undefined,
    queryFn: async () => {
      if (!uid) return null;
      const [{ data: profile, error: profileError }, { data: roles, error: rolesError }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, slug, avatar_color").eq("id", uid).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);
      if (profileError) throw profileError;
      if (rolesError) throw rolesError;
      if (!profile) return null;
      const roleList = (roles ?? []).map((r) => r.role as AppRole);
      const role: AppRole = roleList.includes("admin")
        ? "admin"
        : roleList.includes("supervisor")
          ? "supervisor"
          : "contador";
      return { ...profile, role };
    },
    staleTime: 30_000,
  });
}
