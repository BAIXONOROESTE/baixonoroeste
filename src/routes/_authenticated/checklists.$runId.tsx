import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Image as ImageIcon, Video as VideoIcon, Camera, X, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { CameraCaptureModal } from "@/components/CameraCaptureModal";

export const Route = createFileRoute("/_authenticated/checklists/$runId")({
  head: () => ({ meta: [{ title: "Checklist · Baixo Noroeste" }] }),
  component: RunPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-lg font-semibold">Erro ao carregar checklist</h1>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button onClick={() => { reset(); router.invalidate(); }}>Tentar novamente</Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">Checklist não encontrado.</div>,
});

type Evidence = {
  id: string;
  evidence_path: string;
  evidence_type: "foto" | "video";
  created_by: string;
  created_at: string;
};

type RunItem = {
  id: string;
  done: boolean;
  done_by: string | null;
  done_at: string | null;
  observacao: string | null;
  justificativa: string | null;
  review_status: "pendente" | "aprovado" | "reprovado";
  template_item: {
    title: string;
    orientacao: string | null;
    evidence_required: boolean;
    position: number;
  } | null;
  evidence: Evidence[];
};

type RunData = {
  id: string;
  status: "em_andamento" | "aguardando_aprovacao" | "aprovado" | "reprovado";
  started_by: string;
  submitted_at: string | null;
  template_id: string;
  template: { name: string; scheduled_time: string | null } | null;
  items: RunItem[];
};

function RunPage() {
  const { runId } = Route.useParams();
  const { data: profile } = useProfile();
  const role = profile?.role ?? "contador";
  const uid = profile?.id ?? null;
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);

  const runQuery = useQuery({
    queryKey: ["checklists", "run", runId],
    queryFn: async (): Promise<RunData> => {
      const { data, error } = await supabase
        .from("checklist_runs")
        .select(
          `id, status, started_by, submitted_at, template_id,
           template:checklist_templates(name, scheduled_time),
           items:checklist_run_items(
             id, done, done_by, done_at, observacao, justificativa, review_status,
             template_item:checklist_template_items(title, orientacao, evidence_required, position),
             evidence:checklist_run_item_evidence(id, evidence_path, evidence_type, created_by, created_at)
           )`,
        )
        .eq("id", runId)
        .single();
      if (error) throw error;
      const items = ((data as any).items ?? []).slice().sort(
        (a: RunItem, b: RunItem) => (a.template_item?.position ?? 0) - (b.template_item?.position ?? 0),
      );
      return { ...(data as any), items } as RunData;
    },
  });

  const run = runQuery.data;
  const items = run?.items ?? [];
  const total = items.length;
  const done = items.filter((i) => i.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const item = items[currentIndex] ?? null;
  const isLast = currentIndex === total - 1 && total > 0;

  const canReview = role === "admin" || role === "supervisor";
  const mode: "execucao" | "aprovacao" | "leitura" = !run
    ? "leitura"
    : run.status === "em_andamento" && (uid === run.started_by || canReview)
      ? "execucao"
      : run.status === "aguardando_aprovacao" && canReview
        ? "aprovacao"
        : "leitura";

  const setDone = useMutation({
    mutationFn: async ({ itemId, doneVal }: { itemId: string; doneVal: boolean }) => {
      const { error } = await supabase
        .from("checklist_run_items")
        .update({
          done: doneVal,
          done_by: doneVal ? uid : null,
          done_at: doneVal ? new Date().toISOString() : null,
        })
        .eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklists", "run", runId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar."),
  });

  const saveObs = useMutation({
    mutationFn: async ({ itemId, value }: { itemId: string; value: string }) => {
      const { error } = await supabase
        .from("checklist_run_items")
        .update({ observacao: value || null })
        .eq("id", itemId);
      if (error) throw error;
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar observação."),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["checklists", "run", runId] }),
  });

  const saveJustificativa = useMutation({
    mutationFn: async ({ itemId, value }: { itemId: string; value: string }) => {
      const { error } = await supabase
        .from("checklist_run_items")
        .update({ justificativa: value || null })
        .eq("id", itemId);
      if (error) throw error;
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar justificativa."),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["checklists", "run", runId] }),
  });

  const uploadEvidence = useMutation({
    mutationFn: async ({
      itemId,
      blob,
      ext,
      type,
    }: {
      itemId: string;
      blob: Blob;
      ext: "jpg" | "webm" | "mp4";
      type: "foto" | "video";
    }) => {
      if (!uid) throw new Error("Sem usuário autenticado.");
      const contentType =
        type === "video" ? (ext === "mp4" ? "video/mp4" : "video/webm") : "image/jpeg";
      const path = `${uid}/${itemId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("checklist-evidence")
        .upload(path, blob, { contentType });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("checklist_run_item_evidence").insert({
        run_item_id: itemId,
        evidence_path: path,
        evidence_type: type,
        created_by: uid,
      });
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      toast.success("Evidência anexada");
      queryClient.invalidateQueries({ queryKey: ["checklists", "run", runId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao anexar evidência."),
  });

  const deleteEvidence = useMutation({
    mutationFn: async (ev: Evidence) => {
      const { error: dbErr } = await supabase.from("checklist_run_item_evidence").delete().eq("id", ev.id);
      if (dbErr) throw dbErr;
      await supabase.storage.from("checklist-evidence").remove([ev.evidence_path]);
    },
    onSuccess: () => {
      toast.success("Evidência removida");
      queryClient.invalidateQueries({ queryKey: ["checklists", "run", runId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao remover."),
  });

  const reviewItem = useMutation({
    mutationFn: async ({ itemId, action, reason }: { itemId: string; action: "aprovar" | "reprovar"; reason?: string }) => {
      if (!uid) throw new Error("Sem usuário autenticado.");
      const { error: insErr } = await supabase.from("checklist_run_item_reviews").insert({
        run_item_id: itemId,
        run_id: runId,
        reviewer_id: uid,
        action,
        reason: reason || null,
      });
      if (insErr) throw insErr;
      const { error: updErr } = await supabase
        .from("checklist_run_items")
        .update({ review_status: action === "aprovar" ? "aprovado" : "reprovado" })
        .eq("id", itemId);
      if (updErr) throw updErr;
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.action === "aprovar" ? "Item aprovado" : "Item reprovado");
      setRejecting(false);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: ["checklists", "run", runId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao registrar revisão."),
  });

  const submitForApproval = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("checklist_runs")
        .update({ status: "aguardando_aprovacao", submitted_at: new Date().toISOString() })
        .eq("id", runId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Checklist enviado para aprovação");
      queryClient.invalidateQueries({ queryKey: ["checklists"] });
      navigate({ to: "/checklists" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao enviar."),
  });

  const finishReview = useMutation({
    mutationFn: async () => {
      const hasReprovado = items.some((i) => i.review_status === "reprovado");
      const finalStatus = hasReprovado ? "reprovado" : "aprovado";
      const { error } = await supabase
        .from("checklist_runs")
        .update({ status: finalStatus })
        .eq("id", runId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Revisão concluída");
      queryClient.invalidateQueries({ queryKey: ["checklists"] });
      navigate({ to: "/checklists" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao concluir."),
  });

  if (runQuery.isLoading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (runQuery.isError) return <div className="p-6 text-sm text-destructive">Erro: {(runQuery.error as Error).message}</div>;
  if (!run || !item) return <div className="p-6">Checklist vazio.</div>;

  const isItemResolved = (i: RunItem) => {
    if (i.done) {
      return !i.template_item?.evidence_required || (i.evidence?.length ?? 0) > 0;
    }
    return !!(i.justificativa && i.justificativa.trim().length > 0);
  };
  const pendingItems = items.filter((i) => !isItemResolved(i));
  const canSubmit = pendingItems.length === 0;
  const canFinishReview = items.every((i) => i.review_status !== "pendente");

  return (
    <div className="flex flex-col min-h-[calc(100dvh-3.5rem)]">
      <div className="max-w-2xl w-full mx-auto p-4 pb-44 space-y-4 flex-1">
        {/* Header */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h1 className="font-semibold truncate">{run.template?.name ?? "Checklist"}</h1>
            <span className="text-xs text-muted-foreground">Progresso {pct}%</span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium rounded-full bg-muted px-2 py-1">
            Item {currentIndex + 1} de {total}
          </span>
          {item.template_item?.evidence_required && (
            <Badge variant="outline" className="bg-amber-500/15 text-amber-600 border-amber-500/30">
              Obrigatório
            </Badge>
          )}
          {item.review_status !== "pendente" && (
            <Badge
              variant="outline"
              className={
                item.review_status === "aprovado"
                  ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                  : "bg-destructive/15 text-destructive border-destructive/30"
              }
            >
              {item.review_status === "aprovado" ? "Aprovado" : "Reprovado"}
            </Badge>
          )}
        </div>

        <Card className="p-4 space-y-4">
          <div>
            <h2 className="font-medium">{item.template_item?.title}</h2>
            {item.template_item?.orientacao && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {expanded ? "Ver menos" : "Ver mais"}
              </button>
            )}
            {expanded && item.template_item?.orientacao && (
              <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                {item.template_item.orientacao}
              </p>
            )}
          </div>

          {mode === "execucao" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className={
                    !item.done && item.done_at
                      ? "border-destructive text-destructive bg-destructive/10"
                      : "border-destructive/50 text-destructive"
                  }
                  onClick={() => setDone.mutate({ itemId: item.id, doneVal: false })}
                  disabled={setDone.isPending}
                >
                  Não Feito
                </Button>
                <Button
                  variant="outline"
                  className={
                    item.done
                      ? "border-emerald-600 text-emerald-700 bg-emerald-500/10"
                      : "border-emerald-500/50 text-emerald-700"
                  }
                  onClick={() => setDone.mutate({ itemId: item.id, doneVal: true })}
                  disabled={setDone.isPending}
                >
                  Feito
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Evidências</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCameraOpen(true)}
                    disabled={uploadEvidence.isPending}
                  >
                    <Camera className="h-4 w-4 mr-1" /> Adicionar
                  </Button>
                </div>
                <EvidenceList
                  evidence={item.evidence}
                  canDelete={(ev) => ev.created_by === uid || canReview}
                  onDelete={(ev) => deleteEvidence.mutate(ev)}
                  renderMedia={false}
                />
              </div>

              {!item.done && item.done_at && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">
                    Por que não foi possível fazer este item?
                  </label>
                  <Textarea
                    key={`just-${item.id}`}
                    defaultValue={item.justificativa ?? ""}
                    rows={2}
                    placeholder="Descreva o motivo…"
                    onBlur={(e) => {
                      const value = e.target.value;
                      if (value !== (item.justificativa ?? "")) {
                        saveJustificativa.mutate({ itemId: item.id, value });
                      }
                    }}
                  />
                  {!(item.justificativa && item.justificativa.trim()) && (
                    <p className="text-xs text-amber-600">
                      Preencha o motivo para poder enviar este item.
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-sm font-medium">Observação</label>
                <Textarea
                  key={item.id}
                  defaultValue={item.observacao ?? ""}
                  rows={2}
                  onBlur={(e) => {
                    const value = e.target.value;
                    if (value !== (item.observacao ?? "")) {
                      saveObs.mutate({ itemId: item.id, value });
                    }
                  }}
                />
              </div>
            </>
          )}

          {mode === "aprovacao" && (
            <>
              {item.justificativa && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground">
                    Justificativa do colaborador (item não feito)
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{item.justificativa}</p>
                </div>
              )}
              {item.observacao && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground">Observação do colaborador</div>
                  <p className="text-sm whitespace-pre-wrap">{item.observacao}</p>
                </div>
              )}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">Evidências</div>
                <EvidenceList evidence={item.evidence} renderMedia />
              </div>

              {!rejecting ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="border-destructive text-destructive"
                    onClick={() => setRejecting(true)}
                    disabled={reviewItem.isPending}
                  >
                    Reprovar
                  </Button>
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => reviewItem.mutate({ itemId: item.id, action: "aprovar" })}
                    disabled={reviewItem.isPending}
                  >
                    Aprovar
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Justificativa da reprovação</label>
                  <Textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setRejecting(false);
                        setRejectReason("");
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      variant="destructive"
                      disabled={!rejectReason.trim() || reviewItem.isPending}
                      onClick={() =>
                        reviewItem.mutate({ itemId: item.id, action: "reprovar", reason: rejectReason.trim() })
                      }
                    >
                      Confirmar reprovação
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {mode === "leitura" && (
            <>
              <div className="text-sm">
                Status: {item.done ? "Feito" : "Não feito"}
              </div>
              {item.observacao && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground">Observação</div>
                  <p className="text-sm whitespace-pre-wrap">{item.observacao}</p>
                </div>
              )}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-2">Evidências</div>
                <EvidenceList evidence={item.evidence} renderMedia />
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Footer sticky */}
      <div className="fixed bottom-[4.1rem] inset-x-0 border-t border-border bg-surface/95 backdrop-blur px-4 py-3 z-20">
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={currentIndex === 0}
            onClick={() => {
              setExpanded(false);
              setRejecting(false);
              setRejectReason("");
              setCurrentIndex((i) => Math.max(0, i - 1));
            }}
          >
            Anterior
          </Button>
          {!isLast && (
            <Button
              className="flex-1"
              onClick={() => {
                setExpanded(false);
                setRejecting(false);
                setRejectReason("");
                setCurrentIndex((i) => Math.min(total - 1, i + 1));
              }}
            >
              Próximo
            </Button>
          )}
          {isLast && mode === "execucao" && (
            <div className="flex-1 flex flex-col gap-1">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    className={
                      canSubmit
                        ? "w-full"
                        : "w-full bg-muted text-muted-foreground opacity-60 hover:bg-muted"
                    }
                    disabled={!canSubmit || submitForApproval.isPending}
                  >
                    Enviar para aprovação
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Enviar checklist para aprovação?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Depois de enviar você não poderá mais alterar as respostas.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => submitForApproval.mutate()}>
                      Enviar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              {!canSubmit && (
                <p className="text-[11px] leading-tight text-amber-600">
                  {pendingItems.length === 1 ? "Falta 1 item" : `Faltam ${pendingItems.length} itens`}
                  : preencha evidência ou justificativa para continuar.
                  {" "}
                  <span className="text-muted-foreground">
                    ({pendingItems
                      .slice(0, 3)
                      .map((i) => i.template_item?.title ?? "sem título")
                      .join(", ")}
                    {pendingItems.length > 3 ? "…" : ""})
                  </span>
                </p>
              )}
            </div>
          )}
          {isLast && mode === "aprovacao" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  className="flex-1"
                  disabled={!canFinishReview || finishReview.isPending}
                  title={canFinishReview ? undefined : "Revise todos os itens antes de concluir"}
                >
                  Concluir revisão
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Concluir revisão?</AlertDialogTitle>
                  <AlertDialogDescription>
                    O checklist será marcado como aprovado (se todos os itens estiverem aprovados) ou reprovado.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => finishReview.mutate()}>Concluir</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {isLast && mode === "leitura" && (
            <Button className="flex-1" variant="outline" onClick={() => navigate({ to: "/checklists" })}>
              Voltar à lista
            </Button>
          )}
        </div>
      </div>

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={async (blob, ext, type) => {
          await uploadEvidence.mutateAsync({ itemId: item.id, blob, ext, type });
        }}
      />
    </div>
  );
}

function EvidenceList({
  evidence,
  renderMedia,
  canDelete,
  onDelete,
}: {
  evidence: Evidence[];
  renderMedia?: boolean;
  canDelete?: (ev: Evidence) => boolean;
  onDelete?: (ev: Evidence) => void;
}) {
  if (!evidence || evidence.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhuma evidência anexada.</p>;
  }
  return (
    <div className={renderMedia ? "grid grid-cols-2 gap-2" : "flex flex-wrap gap-2"}>
      {evidence.map((ev) => (
        <EvidenceItem
          key={ev.id}
          ev={ev}
          renderMedia={renderMedia}
          canDelete={canDelete?.(ev) ?? false}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function EvidenceItem({
  ev,
  renderMedia,
  canDelete,
  onDelete,
}: {
  ev: Evidence;
  renderMedia?: boolean;
  canDelete: boolean;
  onDelete?: (ev: Evidence) => void;
}) {
  const sig = useQuery({
    queryKey: ["checklist-evidence-sig", ev.evidence_path],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from("checklist-evidence")
        .createSignedUrl(ev.evidence_path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
    staleTime: 45 * 60 * 1000,
  });

  const shortName = ev.evidence_path.split("/").pop() ?? ev.evidence_path;
  const Icon = ev.evidence_type === "video" ? VideoIcon : ImageIcon;

  if (renderMedia) {
    return (
      <div className="relative rounded-md overflow-hidden border border-border bg-muted">
        {sig.data ? (
          ev.evidence_type === "video" ? (
            <video controls className="w-full h-40 object-cover" src={sig.data} />
          ) : (
            <a href={sig.data} target="_blank" rel="noreferrer">
              <img src={sig.data} alt="evidência" className="w-full h-40 object-cover" />
            </a>
          )
        ) : (
          <div className="w-full h-40 grid place-items-center text-xs text-muted-foreground">Carregando…</div>
        )}
        {canDelete && onDelete && (
          <button
            className="absolute top-1 right-1 rounded-full bg-black/60 text-white p-1 hover:bg-black/80"
            onClick={() => onDelete(ev)}
            aria-label="Remover evidência"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2 py-1 text-xs">
      <Icon className="h-3 w-3" />
      <span className="max-w-[10rem] truncate">{shortName}</span>
      {canDelete && onDelete && (
        <button className="hover:text-destructive" onClick={() => onDelete(ev)} aria-label="Remover">
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
