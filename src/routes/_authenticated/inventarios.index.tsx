import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/inventarios/")({ component: InventoriesList });

function InventoriesList() {
  const { data } = useQuery({
    queryKey: ["inventories"],
    queryFn: async () => (await supabase.from("inventories").select("*").order("started_at", { ascending: false }).limit(50)).data ?? [],
  });
  return (
    <div className="mx-auto max-w-md px-4 pt-4 space-y-3">
      <h1 className="text-2xl font-display font-semibold">Inventários</h1>
      {(data ?? []).map((inv) => (
        <Link key={inv.id} to="/inventarios/$id" params={{ id: inv.id }}
              className="block rounded-2xl bg-surface border border-border p-4 hover:border-primary/50">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{inv.name}</div>
              <div className="text-xs text-muted-foreground">{fmtDateTime(inv.started_at)}</div>
            </div>
            <span className={`text-xs rounded-full px-2 py-1 ${inv.status === "aberto" ? "bg-warning/20 text-warning" : "bg-success/20 text-success"}`}>
              {inv.status}
            </span>
          </div>
        </Link>
      ))}
      {!data?.length && <p className="text-sm text-muted-foreground text-center py-8">Nenhum inventário ainda.</p>}
    </div>
  );
}
