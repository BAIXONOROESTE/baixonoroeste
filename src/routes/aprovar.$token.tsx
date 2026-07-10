import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Package, Check, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { respondCloseRequest } from "@/lib/close-requests.functions";
import { listLoginProfiles } from "@/lib/login-profiles.functions";
import { fmtMoney } from "@/lib/format";

export const Route = createFileRoute("/aprovar/$token")({
  ssr: false,
  component: AprovarPage,
});

function AprovarPage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [req, setReq] = useState<{
    id: string; inventory_id: string; status: string;
    inventory_name: string; requester_name: string;
    divergencias: number; total_diff: number;
  } | null>(null);
  const respondFn = useServerFn(respondCloseRequest);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: r } = await supabase
        .from("close_requests")
        .select("id, inventory_id, status, requested_by, inventory:inventories(name)")
        .eq("approval_token", token).maybeSingle();
      if (!r) { setLoading(false); return; }
      const [{ data: profs }, { count: divCount }, { data: items }] = await Promise.all([
        supabase.rpc("list_login_profiles"),
        supabase.from("count_items").select("id", { count: "exact", head: true })
          .eq("inventory_id", r.inventory_id).eq("status", "divergencia"),
        supabase.from("count_items").select("financial_diff").eq("inventory_id", r.inventory_id),
      ]);
      const prof = (profs ?? []).find((p) => p.id === r.requested_by);
      const totalDiff = (items ?? []).reduce((acc, i) => acc + Number(i.financial_diff ?? 0), 0);
      setReq({
        id: r.id, inventory_id: r.inventory_id, status: r.status,
        inventory_name: (r.inventory as { name?: string } | null)?.name ?? "",
        requester_name: prof?.full_name ?? "—",

        divergencias: divCount ?? 0, total_diff: totalDiff,
      });
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) setNeedsLogin(true);
      setLoading(false);
    })();
  }, [token]);

  async function respond(approve: boolean) {
    setBusy(true);
    try {
      const r = await respondFn({ data: { token, approve } });
      toast.success(approve ? "Inventário fechado!" : "Pedido recusado.");
      navigate({ to: "/inventarios/$id", params: { id: r.inventory_id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao responder.");
    } finally { setBusy(false); }
  }

  if (loading) return <div className="min-h-dvh grid place-items-center text-muted-foreground">Carregando…</div>;

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-8 bg-background">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex flex-col items-center">
          <div className="h-14 w-14 rounded-2xl bg-primary/15 grid place-items-center mb-3">
            <Package className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-xl font-display font-semibold">Aprovar fechamento</h1>
        </div>

        {!req && (
          <div className="rounded-2xl bg-surface border border-border p-4 text-sm text-muted-foreground text-center">
            Link inválido ou pedido não encontrado.
          </div>
        )}

        {req && (
          <div className="rounded-2xl bg-surface border border-border p-4 space-y-3">
            <div>
              <div className="text-xs text-muted-foreground">Inventário</div>
              <div className="font-medium">{req.inventory_name}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Solicitado por</div>
              <div className="font-medium">{req.requester_name}</div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-muted p-2"><span className="text-muted-foreground">Divergências: </span><b>{req.divergencias}</b></div>
              <div className="rounded-lg bg-muted p-2"><span className="text-muted-foreground">Δ R$: </span><b className={req.total_diff < 0 ? "text-destructive" : ""}>{fmtMoney(req.total_diff)}</b></div>
            </div>
            <div className="text-xs text-muted-foreground pt-1">Status: <b>{req.status}</b></div>
          </div>
        )}

        {req && needsLogin && (
          <div className="rounded-2xl bg-warning/10 border border-warning/40 p-4 text-sm space-y-2">
            <div>Você precisa entrar como supervisor ou admin para responder.</div>
            <Button className="w-full" onClick={() => navigate({ to: "/auth" })}>Ir para login</Button>
          </div>
        )}

        {req && !needsLogin && req.status === "pendente" && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => respond(false)} disabled={busy}>
              <X className="h-4 w-4 mr-1" /> Recusar
            </Button>
            <Button onClick={() => respond(true)} disabled={busy}>
              <Check className="h-4 w-4 mr-1" /> Aprovar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
