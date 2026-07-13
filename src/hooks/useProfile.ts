import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "supervisor" | "contador";

export interface UserProfile {
  id: string;
  full_name: string;
  slug: string;
  avatar_color: string;
  role: AppRole;
}

export function useProfile() {
  return useQuery<UserProfile | null>({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const [{ data: profile, error: profileError }, { data: roles, error: rolesError }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, slug, avatar_color").eq("id", u.user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.user.id),
      ]);
      if (profileError) throw profileError;
      if (rolesError) throw rolesError;
      if (!profile) return null;
      const roleList = (roles ?? []).map((r) => r.role as AppRole);
      const role: AppRole = roleList.includes("admin") ? "admin" : roleList.includes("supervisor") ? "supervisor" : "contador";
      return { ...profile, role };
    },
    staleTime: 30_000,
  });
}
