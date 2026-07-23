import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Camera, Wrench, X } from "lucide-react";
import { toast } from "sonner";
import { CameraCaptureModal } from "@/components/CameraCaptureModal";
import { useServerFn } from "@tanstack/react-start";
import { notifyMaintenanceTicketAssigned } from "@/lib/maintenance.functions";
import { listLoginProfiles } from "@/lib/login-profiles.functions";

type CapturedEvidence = {
  blob: Blob;
  ext: "jpg" | "webm" | "mp4";
  type: "foto" | "video";
};

const NONE = "__none__";

export function MaintenanceTicketDialog({
  open,
  onOpenChange,
  relatedRunItemId = null,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  relatedRunItemId?: string | null;
  onCreated?: () => void;
}) {
  const { data: profile } = useProfile();
  const uid = profile?.id ?? null;
  const qc = useQueryClient();
  const notifyAssigned = useServerFn(notifyMaintenanceTicketAssigned);
  const listLoginProfilesFn = useServerFn(listLoginProfiles);

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [evidence, setEvidence] = useState<CapturedEvidence | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [assignedTo, setAssignedTo] = useState<string>(NONE);

  // Lista TODOS os perfis ativos (admin, supervisor e colaborador),
  // reaproveitando a mesma consulta usada na tela de login.
  const { data: assignable } = useQuery({
    queryKey: ["login-profiles-active"],
    queryFn: async () => {
      const rows = await listLoginProfilesFn();
      return (rows ?? []).filter((p) => p.active);
    },
    enabled: open,
  });

  // Preview object URL — cria/limpa conforme evidência muda.
  const evidenceUrl = useMemo(
    () => (evidence ? URL.createObjectURL(evidence.blob) : null),
    [evidence],
  );
  useEffect(() => {
    return () => {
      if (evidenceUrl) URL.revokeObjectURL(evidenceUrl);
    };
  }, [evidenceUrl]);

  const reset = () => {
    setTitle("");
    setDesc("");
    setEvidence(null);
    setAssignedTo(NONE);
  };

  const createTicket = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error("Sem usuário autenticado.");
      if (!title.trim()) throw new Error("Informe um título.");
      const assignee = assignedTo !== NONE ? assignedTo : null;
      const { data: t, error } = await supabase
        .from("maintenance_tickets")
        .insert({
          title: title.trim(),
          description: desc.trim() || null,
          reported_by: uid,
          related_run_item_id: relatedRunItemId,
          assigned_to: assignee,
          status: assignee ? "em_andamento" : "aberto",
        })
        .select("id")
        .single();
      if (error) throw error;
      if (evidence) {
        const contentType =
          evidence.type === "video"
            ? evidence.ext === "mp4"
              ? "video/mp4"
              : "video/webm"
            : "image/jpeg";
        const path = `${uid}/${t.id}/${Date.now()}.${evidence.ext}`;
        const { error: upErr } = await supabase.storage
          .from("maintenance-evidence")
          .upload(path, evidence.blob, { contentType });
        if (upErr) throw upErr;
        const { error: insErr } = await supabase
          .from("maintenance_ticket_evidence")
          .insert({
            ticket_id: t.id,
            evidence_path: path,
            evidence_type: evidence.type,
            created_by: uid,
          });
        if (insErr) throw insErr;
      }
      // Envio de e-mail não-bloqueante para o responsável designado.
      if (assignee) {
        notifyAssigned({ data: { ticket_id: t.id } })
          .then((r) => {
            if (!r?.ok || (r.sent ?? 0) === 0) {
              const suffix =
                r?.reason === "suppressed"
                  ? " (e-mail em lista de supressão)"
                  : r?.reason === "assignee_without_email"
                    ? " (responsável sem e-mail cadastrado)"
                    : "";
              toast.warning(
                `Chamado criado, mas não foi possível notificar por e-mail${suffix}.`,
              );
            }
          })
          .catch((err) => {
            console.error("[MaintenanceTicketDialog] notify falhou", err);
            toast.warning("Chamado criado, mas não foi possível notificar por e-mail.");
          });
      }
    },
    onSuccess: () => {
      toast.success("Problema reportado! O time de manutenção foi avisado.");
      qc.invalidateQueries({ queryKey: ["maintenance-tickets"] });
      reset();
      onOpenChange(false);
      onCreated?.();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao reportar problema."),
  });

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) reset();
          onOpenChange(v);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wrench className="h-4 w-4" /> Reportar problema de manutenção
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Título</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Freezer com barulho estranho"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Descrição</label>
              <Textarea
                rows={3}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Descreva o problema…"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Responsável (opcional)</label>
              <Select value={assignedTo} onValueChange={setAssignedTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Sem responsável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem responsável</SelectItem>
                  {(assignable ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Se escolher alguém, o chamado já entra em atendimento e um e-mail é enviado.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Evidência <span className="text-destructive">*</span>
              </label>
              {evidence && evidenceUrl ? (
                <div className="relative inline-block">
                  {evidence.type === "foto" ? (
                    <img
                      src={evidenceUrl}
                      alt="Prévia da evidência"
                      className="h-24 w-24 rounded-md border border-border object-cover"
                    />
                  ) : (
                    <video
                      src={evidenceUrl}
                      controls
                      className="h-24 w-24 rounded-md border border-border object-cover bg-black"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setEvidence(null)}
                    aria-label="Remover evidência"
                    className="absolute -top-2 -right-2 rounded-full bg-background border border-border p-0.5 shadow hover:bg-muted"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setCameraOpen(true)}
                  >
                    <Camera className="h-4 w-4 mr-1.5" /> Adicionar foto/vídeo
                  </Button>
                  <p className="text-xs text-amber-600">
                    É obrigatório anexar uma foto ou vídeo do problema.
                  </p>
                </>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createTicket.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => createTicket.mutate()}
              disabled={!title.trim() || createTicket.isPending}
            >
              {createTicket.isPending ? "Enviando…" : "Reportar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(blob, ext, type) => setEvidence({ blob, ext, type })}
      />
    </>
  );
}
