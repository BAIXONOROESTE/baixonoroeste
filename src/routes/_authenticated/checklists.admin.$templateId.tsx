import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowDown, ArrowLeft, ArrowUp, Camera, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { CameraCaptureModal } from "@/components/CameraCaptureModal";

export const Route = createFileRoute("/_authenticated/checklists/admin/$templateId")({
  head: () => ({ meta: [{ title: "Editar checklist · Baixo Noroeste" }] }),
  component: ChecklistAdminEditPage,
  errorComponent: ({ error, reset }) => (
    <div className="p-6 space-y-3">
      <h1 className="text-lg font-semibold">Erro</h1>
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <Button onClick={reset}>Tentar novamente</Button>
    </div>
  ),
  notFoundComponent: () => <div className="p-6">Página não encontrada.</div>,
});

type TemplateItem = {
  id: string;
  position: number;
  title: string;
  orientacao: string | null;
  evidence_required: boolean;
  reference_media_path: string | null;
  reference_media_type: "foto" | "video" | null;
};

type Template = {
  id: string;
  name: string;
  scheduled_time: string | null;
  active: boolean;
};

function ChecklistAdminEditPage() {
  const { templateId } = Route.useParams();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const role = profile?.role ?? "contador";
  const canManage = role === "admin" || role === "supervisor";
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [time, setTime] = useState("");
  const [dirty, setDirty] = useState(false);

  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TemplateItem | null>(null);
  const [itemTitle, setItemTitle] = useState("");
  const [itemOrient, setItemOrient] = useState("");
  const [itemEvReq, setItemEvReq] = useState(true);
  const [refMedia, setRefMedia] = useState<
    | { blob: Blob; ext: "jpg" | "webm" | "mp4"; type: "foto" | "video" }
    | null
  >(null);
  const [existingRef, setExistingRef] = useState<
    { path: string; type: "foto" | "video"; url: string } | null
  >(null);
  const [removeExistingRef, setRemoveExistingRef] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<TemplateItem | null>(null);

  const refPreviewUrl = useMemo(
    () => (refMedia ? URL.createObjectURL(refMedia.blob) : null),
    [refMedia],
  );
  useEffect(() => {
    return () => {
      if (refPreviewUrl) URL.revokeObjectURL(refPreviewUrl);
    };
  }, [refPreviewUrl]);

  const templateQuery = useQuery({
    queryKey: ["checklist-admin-template", templateId],
    enabled: canManage,
    queryFn: async (): Promise<Template> => {
      const { data, error } = await supabase
        .from("checklist_templates")
        .select("id, name, scheduled_time, active")
        .eq("id", templateId)
        .single();
      if (error) throw error;
      return data as Template;
    },
  });

  const itemsQuery = useQuery({
    queryKey: ["checklist-admin-items", templateId],
    enabled: canManage,
    queryFn: async (): Promise<TemplateItem[]> => {
      const { data, error } = await supabase
        .from("checklist_template_items")
        .select("id, position, title, orientacao, evidence_required, reference_media_path, reference_media_type")
        .eq("template_id", templateId)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as TemplateItem[];
    },
  });

  useEffect(() => {
    if (templateQuery.data && !dirty) {
      setName(templateQuery.data.name);
      setTime(templateQuery.data.scheduled_time?.slice(0, 5) ?? "");
    }
  }, [templateQuery.data, dirty]);

  const saveHeader = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Nome obrigatório.");
      const { error } = await supabase
        .from("checklist_templates")
        .update({ name: name.trim(), scheduled_time: time ? time : null })
        .eq("id", templateId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Checklist atualizado");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["checklist-admin-template", templateId] });
      qc.invalidateQueries({ queryKey: ["checklist-admin-templates"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  const openNewItem = () => {
    setEditingItem(null);
    setItemTitle("");
    setItemOrient("");
    setItemEvReq(true);
    setRefMedia(null);
    setExistingRef(null);
    setRemoveExistingRef(false);
    setItemDialogOpen(true);
  };
  const openEditItem = async (it: TemplateItem) => {
    setEditingItem(it);
    setItemTitle(it.title);
    setItemOrient(it.orientacao ?? "");
    setItemEvReq(it.evidence_required);
    setRefMedia(null);
    setRemoveExistingRef(false);
    setExistingRef(null);
    setItemDialogOpen(true);
    if (it.reference_media_path && it.reference_media_type) {
      const { data } = await supabase.storage
        .from("checklist-evidence")
        .createSignedUrl(it.reference_media_path, 3600);
      if (data?.signedUrl) {
        setExistingRef({
          path: it.reference_media_path,
          type: it.reference_media_type,
          url: data.signedUrl,
        });
      }
    }
  };

  const handleFilePick = (file: File) => {
    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    if (!isVideo && !isImage) {
      toast.error("Selecione uma imagem ou vídeo.");
      return;
    }
    const ext: "jpg" | "webm" | "mp4" = isVideo
      ? file.type.includes("mp4")
        ? "mp4"
        : "webm"
      : "jpg";
    setRefMedia({ blob: file, ext, type: isVideo ? "video" : "foto" });
    setRemoveExistingRef(true);
  };

  const saveItem = useMutation({
    mutationFn: async () => {
      if (!itemTitle.trim()) throw new Error("Informe o título.");
      let itemId: string;
      if (editingItem) {
        const { error } = await supabase
          .from("checklist_template_items")
          .update({
            title: itemTitle.trim(),
            orientacao: itemOrient.trim() || null,
            evidence_required: itemEvReq,
          })
          .eq("id", editingItem.id);
        if (error) throw error;
        itemId = editingItem.id;
      } else {
        const maxPos = (itemsQuery.data ?? []).reduce((m, i) => Math.max(m, i.position), 0);
        const { data: inserted, error } = await supabase
          .from("checklist_template_items")
          .insert({
            template_id: templateId,
            position: maxPos + 1,
            title: itemTitle.trim(),
            orientacao: itemOrient.trim() || null,
            evidence_required: itemEvReq,
          })
          .select("id")
          .single();
        if (error) throw error;
        itemId = inserted.id;
      }

      // Reference media: upload new / remove existing.
      if (refMedia) {
        const contentType =
          refMedia.type === "video"
            ? refMedia.ext === "mp4"
              ? "video/mp4"
              : "video/webm"
            : "image/jpeg";
        const path = `templates/${itemId}/reference.${refMedia.ext}`;
        const { error: upErr } = await supabase.storage
          .from("checklist-evidence")
          .upload(path, refMedia.blob, { contentType, upsert: true });
        if (upErr) throw upErr;
        // Remove previous file if the extension changed.
        if (
          editingItem?.reference_media_path &&
          editingItem.reference_media_path !== path
        ) {
          await supabase.storage
            .from("checklist-evidence")
            .remove([editingItem.reference_media_path]);
        }
        const { error: updErr } = await supabase
          .from("checklist_template_items")
          .update({ reference_media_path: path, reference_media_type: refMedia.type })
          .eq("id", itemId);
        if (updErr) throw updErr;
      } else if (removeExistingRef && editingItem?.reference_media_path) {
        await supabase.storage
          .from("checklist-evidence")
          .remove([editingItem.reference_media_path]);
        const { error: updErr } = await supabase
          .from("checklist_template_items")
          .update({ reference_media_path: null, reference_media_type: null })
          .eq("id", itemId);
        if (updErr) throw updErr;
      }
    },
    onSuccess: () => {
      toast.success(editingItem ? "Item atualizado" : "Item adicionado");
      setItemDialogOpen(false);
      setRefMedia(null);
      setExistingRef(null);
      setRemoveExistingRef(false);
      qc.invalidateQueries({ queryKey: ["checklist-admin-items", templateId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar item"),
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("checklist_template_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Item removido");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["checklist-admin-items", templateId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao remover"),
  });

  const swapPositions = useMutation({
    mutationFn: async ({ a, b }: { a: TemplateItem; b: TemplateItem }) => {
      // Swap via two-step to avoid unique conflicts if a partial unique index exists.
      const tmpPos = -Math.abs(a.position) - 1000000;
      const { error: e1 } = await supabase
        .from("checklist_template_items")
        .update({ position: tmpPos })
        .eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("checklist_template_items")
        .update({ position: a.position })
        .eq("id", b.id);
      if (e2) throw e2;
      const { error: e3 } = await supabase
        .from("checklist_template_items")
        .update({ position: b.position })
        .eq("id", a.id);
      if (e3) throw e3;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checklist-admin-items", templateId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao reordenar"),
  });

  const items = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);

  if (profileLoading) return <div className="p-6 text-muted-foreground">Carregando…</div>;
  if (!canManage) {
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-lg font-semibold">Acesso negado</h1>
        <p className="text-sm text-muted-foreground">
          Apenas admin ou supervisor podem gerenciar checklists.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/checklists">Voltar</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link to="/checklists/admin"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Editar checklist</h1>
          <p className="text-sm text-muted-foreground">Nome, horário e itens do modelo.</p>
        </div>
      </div>

      <Card className="p-4 space-y-3">
        <div className="space-y-1">
          <label className="text-sm font-medium">Nome</label>
          <Input
            value={name}
            onChange={(e) => { setName(e.target.value); setDirty(true); }}
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Horário programado (opcional)</label>
          <Input
            type="time"
            value={time}
            onChange={(e) => { setTime(e.target.value); setDirty(true); }}
          />
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => saveHeader.mutate()}
            disabled={!dirty || !name.trim() || saveHeader.isPending}
          >
            {saveHeader.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Itens ({items.length})</h2>
        <Button size="sm" onClick={openNewItem}>
          <Plus className="h-4 w-4 mr-1.5" /> Adicionar item
        </Button>
      </div>

      {itemsQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {items.length === 0 && !itemsQuery.isLoading && (
        <p className="text-sm text-muted-foreground">Nenhum item cadastrado.</p>
      )}

      <div className="space-y-2">
        {items.map((it, idx) => (
          <Card key={it.id} className="p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{it.title}</div>
                {it.orientacao && (
                  <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                    {it.orientacao}
                  </div>
                )}
                <div className="text-xs text-muted-foreground mt-1">
                  {it.evidence_required ? "Evidência obrigatória" : "Sem evidência"}
                </div>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={idx === 0 || swapPositions.isPending}
                  onClick={() => swapPositions.mutate({ a: it, b: items[idx - 1] })}
                  aria-label="Subir"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={idx === items.length - 1 || swapPositions.isPending}
                  onClick={() => swapPositions.mutate({ a: it, b: items[idx + 1] })}
                  aria-label="Descer"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => openEditItem(it)}>
                <Pencil className="h-4 w-4 mr-1.5" /> Editar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => setDeleteTarget(it)}
              >
                <Trash2 className="h-4 w-4 mr-1.5" /> Remover
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Dialog item */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar item" : "Adicionar item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Título</label>
              <Input value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Orientação</label>
              <Textarea rows={3} value={itemOrient} onChange={(e) => setItemOrient(e.target.value)} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-2">
              <div>
                <div className="text-sm font-medium">Evidência obrigatória</div>
                <div className="text-xs text-muted-foreground">Exigir foto/vídeo ao marcar como feito.</div>
              </div>
              <Switch checked={itemEvReq} onCheckedChange={setItemEvReq} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Foto ou vídeo de referência (como deve ficar) — opcional
              </label>
              {refMedia && refPreviewUrl ? (
                <div className="relative inline-block">
                  {refMedia.type === "foto" ? (
                    <img
                      src={refPreviewUrl}
                      alt="Prévia da referência"
                      className="h-24 w-24 rounded-md border border-border object-cover"
                    />
                  ) : (
                    <video
                      src={refPreviewUrl}
                      controls
                      className="h-24 w-24 rounded-md border border-border object-cover bg-black"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setRefMedia(null)}
                    aria-label="Remover"
                    className="absolute -top-2 -right-2 rounded-full bg-background border border-border p-0.5 shadow hover:bg-muted"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : existingRef && !removeExistingRef ? (
                <div className="relative inline-block">
                  {existingRef.type === "foto" ? (
                    <img
                      src={existingRef.url}
                      alt="Referência atual"
                      className="h-24 w-24 rounded-md border border-border object-cover"
                    />
                  ) : (
                    <video
                      src={existingRef.url}
                      controls
                      className="h-24 w-24 rounded-md border border-border object-cover bg-black"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setRemoveExistingRef(true)}
                    aria-label="Remover referência atual"
                    className="absolute -top-2 -right-2 rounded-full bg-background border border-border p-0.5 shadow hover:bg-muted"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setCameraOpen(true)}>
                    <Camera className="h-4 w-4 mr-1.5" /> Capturar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4 mr-1.5" /> Enviar arquivo
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFilePick(f);
                      e.target.value = "";
                    }}
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)} disabled={saveItem.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveItem.mutate()}
              disabled={!itemTitle.trim() || saveItem.isPending}
            >
              {saveItem.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover item?</AlertDialogTitle>
            <AlertDialogDescription>
              O item "{deleteTarget?.title}" será removido do modelo. Isso não afeta
              checklists já iniciados anteriormente — apenas os futuros deixarão de incluí-lo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeItem.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && removeItem.mutate(deleteTarget.id)}
              disabled={removeItem.isPending}
            >
              {removeItem.isPending ? "Removendo…" : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(blob, ext, type) => {
          setRefMedia({ blob, ext, type });
          setRemoveExistingRef(true);
        }}
      />
    </div>
  );
}
