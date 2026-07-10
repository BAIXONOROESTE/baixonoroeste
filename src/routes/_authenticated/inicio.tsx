import { createFileRoute, Link } from "@tanstack/react-router";
import { Package, ClipboardList, BarChart3, Trophy, AlertTriangle, FileText, Users, Settings, ScrollText, RefreshCw, Inbox } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { syncFamiliesAndProducts } from "@/lib/omie.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fmtDateTime } from "@/lib/format";


export const Route = createFileRoute("/_authenticated/inicio")({ component: HomePage });

const tiles = [
  { to: "/contar", label: "Nova contagem", icon: ClipboardList, roles: ["admin","supervisor","contador"] as const },
  { to: "/inventarios", label: "Inventários", icon: Package, roles: ["admin","supervisor","contador"] as const },
  { to: "/dashboard", label: "Dashboard", icon: BarChart3, roles: ["admin","supervisor"] as const },
  { to: "/ranking", label: "Ranking", icon: Trophy, roles: ["admin","supervisor","contador"] as const },
  { to: "/perdas", label: "Perdas & Quebras", icon: AlertTriangle, roles: ["admin","supervisor","contador"] as const },
  { to: "/relatorios", label: "Relatórios", icon: FileText, roles: ["admin","supervisor"] as const },
  { to: "/usuarios", label: "Usuários", icon: Users, roles: ["admin"] as const },
  { to: "/logs", label: "Logs", icon: ScrollText, roles: ["admin","supervisor"] as const },
  { to: "/configuracoes", label: "Configurações", icon: Settings, roles: ["admin"] as const },
];

function HomePage() {
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const syncFn = useServerFn(syncFamiliesAndProducts);

  const role = profile?.role ?? "contador";
  const isSup = role === "admin" || role === "supervisor";

  const { data: lastSync } = useQuery({
    queryKey: ["last-sync"],
    queryFn: async () => {
      const { data } = await supabase.from("sync_log").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });

  const { data: pendingCloses } = useQuery({
    queryKey: ["pending-close-requests"],
    enabled: isSup,
    queryFn: async () => {
      const { data } = await supabase
        .from("close_requests")
        .select("id, approval_token, created_at, inventory:inventories(name), requester:profiles!close_requests_requested_by_fkey(full_name)")
        .eq("status", "pendente")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    refetchOnWindowFocus: true,
  });


  const sync = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r) => {
      toast.success(`Sincronizado: ${r.familias} famílias, ${r.produtos} produtos.`);
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha na sincronização."),
  });

  const visible = tiles.filter((t) => (t.roles as readonly string[]).includes(role));


  return (
    <div className="mx-auto max-w-md px-4 pt-4 space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Olá,</p>
        <h1 className="text-2xl font-display font-semibold">{profile?.full_name}</h1>
      </div>

      {role === "admin" && (
        <div className="rounded-2xl bg-surface border border-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Sincronização com Omie</div>
              <div className="text-xs text-muted-foreground">Última: {fmtDateTime(lastSync?.started_at)}</div>
            </div>
            <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
              <RefreshCw className={`h-4 w-4 mr-1 ${sync.isPending ? "animate-spin" : ""}`} />
              {sync.isPending ? "Sincronizando" : "Sincronizar"}
            </Button>
          </div>
        </div>
      )}

      {isSup && pendingCloses && pendingCloses.length > 0 && (
        <div className="rounded-2xl bg-surface border border-warning/40 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-warning" />
            <div className="text-sm font-medium">Pedidos de fechamento pendentes ({pendingCloses.length})</div>
          </div>
          <ul className="space-y-2">
            {pendingCloses.map((r) => {
              const inv = r.inventory as { name?: string } | null;
              const req = r.requester as { full_name?: string } | null;
              return (
                <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl bg-background/40 p-2">
                  <div className="min-w-0">
                    <div className="text-sm truncate">{inv?.name ?? "Inventário"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {req?.full_name ?? "—"} · {fmtDateTime(r.created_at)}
                    </div>
                  </div>
                  <Link to="/aprovar/$token" params={{ token: r.approval_token }}>
                    <Button size="sm" variant="outline">Abrir</Button>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}


      <div className="grid grid-cols-2 gap-3">
        {visible.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.to} to={t.to} className="rounded-2xl bg-surface border border-border p-4 flex flex-col gap-2 hover:border-primary/50 transition">
              <Icon className="h-6 w-6 text-primary" />
              <div className="text-sm font-medium">{t.label}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
