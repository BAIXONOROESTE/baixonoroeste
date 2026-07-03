import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/logs")({ component: LogsPage });

function LogsPage() {
  const { data } = useQuery({
    queryKey: ["logs"],
    queryFn: async () => (await supabase.from("logs").select("*, user:profiles(full_name)").order("created_at", { ascending: false }).limit(300)).data ?? [],
  });
  return (
    <div className="mx-auto max-w-md px-4 pt-4 space-y-2">
      <h1 className="text-2xl font-display font-semibold">Logs</h1>
      {(data ?? []).map((l) => (
        <div key={l.id} className="rounded-xl bg-surface border border-border p-3 text-xs">
          <div className="flex justify-between">
            <span className="font-medium text-primary">{l.action}</span>
            <span className="text-muted-foreground">{fmtDateTime(l.created_at)}</span>
          </div>
          <div className="text-muted-foreground">{l.user?.full_name ?? "—"} · {l.entity ?? ""}</div>
          {l.details ? <pre className="mt-1 text-[10px] text-muted-foreground overflow-x-auto">{JSON.stringify(l.details)}</pre> : null}
        </div>
      ))}
      {!data?.length && <p className="text-sm text-muted-foreground text-center py-8">Sem logs.</p>}
    </div>
  );
}
