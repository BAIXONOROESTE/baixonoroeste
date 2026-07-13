import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { syncFamiliesAndProducts } from "@/lib/omie.functions";
import { useProfile } from "@/hooks/useProfile";
import { useOnlineStatus } from "./useOnlineStatus";

/**
 * Auto-sync Omie products & stock in background.
 * - Runs on mount if last sync older than `auto_sync_interval_seconds`.
 * - Re-runs on tab visibility if hidden for more than the interval.
 * - Admin-only (only admin can call the sync fn); others just consume the results.
 */
export function useAutoSync() {
  const { data: profile } = useProfile();
  const online = useOnlineStatus();
  const qc = useQueryClient();
  const syncFn = useServerFn(syncFamiliesAndProducts);
  const runningRef = useRef(false);

  const { data: settings } = useQuery({
    queryKey: ["public-settings"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_public_settings");
      return data?.[0] ?? null;
    },
    staleTime: 60_000,
  });

  const isAdmin = profile?.role === "admin";

  const { data: lastSync } = useQuery({
    queryKey: ["last-sync-log"],
    queryFn: async () => (await supabase
      .from("sync_log")
      .select("finished_at, status")
      .eq("status", "sucesso")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle()).data,
    refetchInterval: 30000,
    staleTime: 15000,
    enabled: isAdmin,
  });

  const intervalSec = settings?.auto_sync_interval_seconds ?? 300;

  useEffect(() => {
    if (!isAdmin || !online) return;
    let cancelled = false;

    async function maybeSync() {
      if (runningRef.current) return;
      const lastMs = lastSync?.finished_at ? new Date(lastSync.finished_at).getTime() : 0;
      const ageSec = (Date.now() - lastMs) / 1000;
      if (ageSec < intervalSec) return;
      runningRef.current = true;
      try {
        await syncFn();
        if (!cancelled) {
          qc.invalidateQueries({ queryKey: ["last-sync-log"] });
          qc.invalidateQueries({ queryKey: ["products-for-inv"] });
        }
      } catch { /* silent */ }
      finally { runningRef.current = false; }
    }

    void maybeSync();
    const t = window.setInterval(maybeSync, intervalSec * 1000);
    const onVis = () => { if (document.visibilityState === "visible") void maybeSync(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isAdmin, online, intervalSec, lastSync?.finished_at, syncFn, qc]);
}
