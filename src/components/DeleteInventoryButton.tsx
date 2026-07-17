import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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

type Props = {
  inventoryId: string;
  inventoryName: string;
  variant?: "icon" | "full";
  redirectAfter?: boolean;
  onDeleted?: () => void;
};

export function DeleteInventoryButton({
  inventoryId,
  inventoryName,
  variant = "icon",
  redirectAfter = false,
  onDeleted,
}: Props) {
  const [open, setOpen] = useState(false);
  const [hasOmie, setHasOmie] = useState(false);
  const [checking, setChecking] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const openDialog = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setChecking(true);
    const { count } = await supabase
      .from("count_items")
      .select("id", { count: "exact", head: true })
      .eq("inventory_id", inventoryId)
      .not("omie_updated_at", "is", null);
    setHasOmie((count ?? 0) > 0);
    setChecking(false);
    setOpen(true);
  };

  const del = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("inventories").delete().eq("id", inventoryId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Inventário excluído.");
      qc.invalidateQueries({ queryKey: ["inventories-list"] });
      qc.invalidateQueries({ queryKey: ["inventory", inventoryId] });
      setOpen(false);
      onDeleted?.();
      if (redirectAfter) navigate({ to: "/inventarios" });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Falha ao excluir";
      toast.error(msg);
    },
  });

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={openDialog}
          disabled={checking}
          aria-label="Excluir inventário"
          className="inline-flex items-center justify-center h-8 w-8 rounded-md text-destructive hover:bg-destructive/10 shrink-0"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={openDialog}
          disabled={checking}
          className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-1" /> Excluir
        </Button>
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{inventoryName}"?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Isso remove todos os itens contados e não pode ser desfeito.</p>
                {hasOmie && (
                  <p className="text-destructive font-medium">
                    Atenção: alguns itens deste inventário já foram enviados para o ERP Omie.
                    Excluir aqui NÃO desfaz o ajuste de estoque já feito lá.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={del.isPending}
              onClick={(e) => {
                e.preventDefault();
                del.mutate();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {del.isPending ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
