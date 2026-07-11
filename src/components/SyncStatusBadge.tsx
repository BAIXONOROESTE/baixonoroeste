import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CloudOff, Cloud, RefreshCw, AlertCircle } from "lucide-react";
import { useOfflineCountQueue } from "@/hooks/useOfflineCountQueue";

function relTime(iso: string | null): string {
  if (!iso) return "nunca";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function SyncStatusBadge() {
  const { online, pending, flushing, lastSync: lastCountSync } = useOfflineCountQueue();

  const { data: lastOmie } = useQuery({
    queryKey: ["last-sync-log"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sync_log")
        .select("finished_at, status")
        .eq("status", "sucesso")
        .order("finished_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const hasErrors = pending.some((p) => p.error);
  const hasPending = pending.length > 0;

  let label: string;
  let Icon = Cloud;
  let cls = "text-success";

  if (!online) {
    label = hasPending ? `Offline · ${pending.length} pend.` : "Offline";
    Icon = CloudOff;
    cls = "text-warning";
  } else if (flushing) {
    label = "Sincronizando…";
    Icon = RefreshCw;
    cls = "text-primary animate-pulse";
  } else if (hasErrors) {
    label = `Falha sync · ${pending.length}`;
    Icon = AlertCircle;
    cls = "text-destructive";
  } else if (hasPending) {
    label = `${pending.length} pend.`;
    Icon = RefreshCw;
    cls = "text-primary";
  } else {
    const latest = lastCountSync ?? lastOmie?.finished_at ?? null;
    label = `Sync · ${relTime(latest)}`;
  }

  return (
    <div className={`hidden sm:flex items-center gap-1.5 text-[11px] rounded-full px-2 py-1 bg-muted ${cls}`} title={`Estoque: ${lastOmie?.finished_at ? new Date(lastOmie.finished_at).toLocaleString("pt-BR") : "nunca"}`}>
      <Icon className={`h-3 w-3 ${flushing ? "animate-spin" : ""}`} />
      <span className="font-medium">{label}</span>
    </div>
  );
}
