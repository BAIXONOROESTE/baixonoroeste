import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmtDateTime, fmtNumber } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/perdas")({ component: PerdasPage });

function PerdasPage() {
  const { data } = useQuery({
    queryKey: ["losses"],
    queryFn: async () => (await supabase.from("losses")
      .select("*, product:products(name, code, unit), reason:loss_reasons(name)")
      .order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  return (
    <div className="mx-auto max-w-md px-4 pt-4 space-y-2">
      <h1 className="text-2xl font-display font-semibold">Perdas & Quebras</h1>
      {(data ?? []).map((l) => (
        <div key={l.id} className="rounded-xl bg-surface border border-border p-3">
          <div className="flex justify-between items-start">
            <div className="min-w-0">
              <div className="font-medium truncate">{l.product?.name}</div>
              <div className="text-xs text-muted-foreground">{l.reason?.name} · {fmtNumber(l.quantity)} {l.product?.unit ?? ""}</div>
              {l.observation && <div className="text-xs mt-1">{l.observation}</div>}
            </div>
            <div className="text-xs text-muted-foreground text-right">
              <div>{l.user?.full_name}</div>
              <div>{fmtDateTime(l.created_at)}</div>
            </div>
          </div>
        </div>
      ))}
      {!data?.length && <p className="text-sm text-muted-foreground text-center py-8">Nenhuma perda registrada.</p>}
    </div>
  );
}
