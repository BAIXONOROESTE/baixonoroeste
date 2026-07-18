import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Wrench } from "lucide-react";

type Status = "aberto" | "em_andamento" | "resolvido";
type EvidenceRow = { id: string; evidence_path: string; evidence_type: "foto" | "video" };
type RelatedItem = {
  template_item: { title: string } | null;
  run: { template: { name: string } | null } | null;
} | null;

type Ticket = {
  id: string;
  title: string;
  description: string | null;
  status: Status;
  reported_by: string;
  assigned_to: string | null;
  resolution_note: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  related_run_item_id: string | null;
  related_item: RelatedItem;
  evidence: EvidenceRow[];
  reporter_name: string | null;
  assigned_name: string | null;
  resolver_name: string | null;
};

export const Route = createFileRoute("/_authenticated/manutencao")({
  head: () => ({ meta: [{ title: "Manutenção · Baixo Noroeste" }] }),
  component: MaintenancePage,
  errorComponent: ({ error }) => (
    <div className="p-6 space-y-2">
      <h1 className="text-lg font-semibold">Erro ao carregar chamados</h1>
      <p className="text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Página não encontrada.</div>,
});

function MaintenancePage() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const uid = profile?.id ?? null;
  const [tab, setTab] = useState<Status>("aberto");

  const ticketsQuery = useQuery({
    queryKey: ["maintenance-tickets"],
    queryFn: async (): Promise<Ticket[]> => {
      const { data, error } = await supabase
        .from("maintenance_tickets")
        .select(
          `id, title, description, status, reported_by, assigned_to,
           resolution_note, resolved_by, resolved_at, created_at, related_run_item_id,
           related_item:checklist_run_items!maintenance_tickets_related_run_item_id_fkey(
             template_item:checklist_template_items(title),
             run:checklist_runs(template:checklist_templates(name))
           ),
           evidence:maintenance_ticket_evidence(id, evidence_path, evidence_type)`,
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      const ids = Array.from(
        new Set(
          rows
            .flatMap((r) => [r.reported_by, r.assigned_to, r.resolved_by])
            .filter(Boolean) as string[],
        ),
      );
      const names: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", ids);
        (profs ?? []).forEach((p: any) => {
          names[p.id] = p.full_name ?? "—";
        });
      }
      return rows.map((r) => ({
        ...r,
        reporter_name: names[r.reported_by] ?? null,
        assigned_name: r.assigned_to ? names[r.assigned_to] ?? null : null,
        resolver_name: r.resolved_by ? names[r.resolved_by] ?? null : null,
      })) as Ticket[];
    },
  });

  const startAtt = useMutation({
    mutationFn: async (t: Ticket) => {
      const { error } = await supabase
        .from("maintenance_tickets")
        .update({ status: "em_andamento", assigned_to: t.assigned_to ?? uid })
        .eq("id", t.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Atendimento iniciado");
      qc.invalidateQueries({ queryKey: ["maintenance-tickets"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao iniciar."),
  });

  const resolveTicket = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const { error } = await supabase
        .from("maintenance_tickets")
        .update({
          status: "resolvido",
          resolution_note: note,
          resolved_by: uid,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Chamado resolvido");
      qc.invalidateQueries({ queryKey: ["maintenance-tickets"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao resolver."),
  });

  const tickets = ticketsQuery.data ?? [];
  const counts = useMemo(
    () => ({
      aberto: tickets.filter((t) => t.status === "aberto").length,
      em_andamento: tickets.filter((t) => t.status === "em_andamento").length,
      resolvido: tickets.filter((t) => t.status === "resolvido").length,
    }),
    [tickets],
  );
  const filtered = tickets.filter((t) => t.status === tab);

  return (
    <div className="max-w-2xl w-full mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Wrench className="h-5 w-5" /> Manutenção
        </h1>
        <p className="text-xs text-muted-foreground">
          Chamados reportados pelos colaboradores.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Status)}>
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="aberto">Aberto ({counts.aberto})</TabsTrigger>
          <TabsTrigger value="em_andamento">Em andamento ({counts.em_andamento})</TabsTrigger>
          <TabsTrigger value="resolvido">Resolvido ({counts.resolvido})</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="space-y-3 mt-4">
          {ticketsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum chamado nessa categoria.</p>
          ) : (
            filtered.map((t) => (
              <TicketCard
                key={t.id}
                ticket={t}
                onStart={() => startAtt.mutate(t)}
                onResolve={(note) => resolveTicket.mutate({ id: t.id, note })}
                starting={startAtt.isPending}
                resolving={resolveTicket.isPending}
              />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TicketCard({
  ticket,
  onStart,
  onResolve,
  starting,
  resolving,
}: {
  ticket: Ticket;
  onStart: () => void;
  onResolve: (note: string) => void;
  starting: boolean;
  resolving: boolean;
}) {
  const [note, setNote] = useState("");
  const [resolvingOpen, setResolvingOpen] = useState(false);

  const statusBadge =
    ticket.status === "aberto" ? (
      <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30">
        Aberto
      </Badge>
    ) : ticket.status === "em_andamento" ? (
      <Badge variant="outline" className="bg-blue-500/15 text-blue-600 border-blue-500/30">
        Em andamento
      </Badge>
    ) : (
      <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">
        Resolvido
      </Badge>
    );

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate">{ticket.title}</div>
          <div className="text-xs text-muted-foreground">
            Reportado por {ticket.reporter_name ?? "—"} ·{" "}
            {new Date(ticket.created_at).toLocaleString("pt-BR")}
          </div>
        </div>
        {statusBadge}
      </div>

      {ticket.description && (
        <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
      )}

      {ticket.related_item?.template_item?.title && (
        <p className="text-xs text-muted-foreground">
          Vindo do checklist
          {ticket.related_item.run?.template?.name
            ? ` "${ticket.related_item.run.template.name}"`
            : ""}{" "}
          · item "{ticket.related_item.template_item.title}"
        </p>
      )}

      {ticket.evidence?.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {ticket.evidence.map((e) => (
            <MaintEvidence key={e.id} ev={e} />
          ))}
        </div>
      )}

      {ticket.status === "aberto" && (
        <Button onClick={onStart} disabled={starting} size="sm">
          Iniciar atendimento
        </Button>
      )}

      {ticket.status === "em_andamento" && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            Atribuído a: {ticket.assigned_name ?? "—"}
          </div>
          {!resolvingOpen ? (
            <Button onClick={() => setResolvingOpen(true)} size="sm">
              Marcar como resolvido
            </Button>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium">Como foi resolvido?</label>
              <Textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Descreva a solução aplicada…"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setResolvingOpen(false);
                    setNote("");
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  disabled={!note.trim() || resolving}
                  onClick={() => onResolve(note.trim())}
                >
                  Confirmar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {ticket.status === "resolvido" && (
        <div className="rounded-md bg-muted p-3 text-sm space-y-1">
          <div className="text-xs font-medium text-muted-foreground">
            Resolvido por {ticket.resolver_name ?? "—"}
            {ticket.resolved_at
              ? ` em ${new Date(ticket.resolved_at).toLocaleString("pt-BR")}`
              : ""}
          </div>
          {ticket.resolution_note && (
            <p className="whitespace-pre-wrap">{ticket.resolution_note}</p>
          )}
        </div>
      )}
    </Card>
  );
}

function MaintEvidence({ ev }: { ev: EvidenceRow }) {
  const sig = useQuery({
    queryKey: ["maintenance-evidence-sig", ev.evidence_path],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("maintenance-evidence")
        .createSignedUrl(ev.evidence_path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
    staleTime: 45 * 60 * 1000,
  });
  if (!sig.data) {
    return (
      <div className="w-full h-40 grid place-items-center text-xs text-muted-foreground border rounded-md">
        Carregando…
      </div>
    );
  }
  return ev.evidence_type === "video" ? (
    <video controls src={sig.data} className="w-full h-40 object-cover rounded-md border" />
  ) : (
    <a href={sig.data} target="_blank" rel="noreferrer">
      <img
        src={sig.data}
        alt="evidência"
        className="w-full h-40 object-cover rounded-md border"
      />
    </a>
  );
}
