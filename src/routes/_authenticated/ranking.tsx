import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ranking")({ component: Ranking });

function Ranking() {
  const { data } = useQuery({
    queryKey: ["ranking"],
    queryFn: async () => (await supabase.from("ranking_view").select("*").order("percentual", { ascending: false })).data ?? [],
  });
  return (
    <div className="mx-auto max-w-md px-4 pt-4 space-y-3">
      <h1 className="text-2xl font-display font-semibold">Ranking</h1>
      {(data ?? []).map((r, i) => {
        const top = Number(r.percentual ?? 0) >= 90;
        return (
          <div key={`${r.user_id}-${r.month}`} className={`rounded-2xl border p-4 ${top ? "border-primary bg-primary/10 glow-primary" : "border-border bg-surface"}`}>
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-full grid place-items-center font-semibold ${top ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{r.full_name}</div>
                <div className="text-xs text-muted-foreground">Mês: {r.month}</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-display font-semibold flex items-center gap-1">
                  {top && <Trophy className="h-4 w-4 text-primary" />}
                  {Number(r.percentual ?? 0).toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">{r.acertos}/{r.conferidos}</div>
              </div>
            </div>
          </div>
        );
      })}
      {!data?.length && <p className="text-sm text-muted-foreground text-center py-8">Sem contagens ainda.</p>}
    </div>
  );
}
