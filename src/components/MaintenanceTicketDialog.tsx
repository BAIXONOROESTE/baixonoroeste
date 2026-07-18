import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Camera, Wrench } from "lucide-react";
import { toast } from "sonner";
import { CameraCaptureModal } from "@/components/CameraCaptureModal";

type CapturedEvidence = {
  blob: Blob;
  ext: "jpg" | "webm" | "mp4";
  type: "foto" | "video";
};

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

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [evidence, setEvidence] = useState<CapturedEvidence | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const reset = () => {
    setTitle("");
    setDesc("");
    setEvidence(null);
  };

  const createTicket = useMutation({
    mutationFn: async () => {
      if (!uid) throw new Error("Sem usuário autenticado.");
      if (!title.trim()) throw new Error("Informe um título.");
      const { data: t, error } = await supabase
        .from("maintenance_tickets")
        .insert({
          title: title.trim(),
          description: desc.trim() || null,
          reported_by: uid,
          related_run_item_id: relatedRunItemId,
          status: "aberto",
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
            <div className="space-y-2">
              <label className="text-sm font-medium">Evidência (opcional)</label>
              {evidence ? (
                <div className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
                  <span className="truncate">
                    {evidence.type === "foto" ? "📷 Foto" : "🎥 Vídeo"} anexada
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setEvidence(null)}>
                    Remover
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCameraOpen(true)}
                >
                  <Camera className="h-4 w-4 mr-1.5" /> Adicionar foto/vídeo
                </Button>
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
