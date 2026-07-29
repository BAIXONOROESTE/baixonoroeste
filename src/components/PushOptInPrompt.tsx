import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const DISMISS_KEY = "push-optin-dismissed-at";
const SESSION_KEY = "push-optin-shown-session";
const REPROMPT_DAYS = 7;

export function PushOptInPrompt() {
  const { status, working, enable } = usePushNotifications();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (status !== "granted-not-subscribed" && status !== "default") return;
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    if (dismissedAt) {
      const ageDays = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
      if (ageDays < REPROMPT_DAYS) return;
    }

    // Pequeno delay pra não competir com renderização inicial da tela.
    const t = setTimeout(() => setOpen(true), 800);
    return () => clearTimeout(t);
  }, [status]);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {}
    setOpen(false);
  }

  async function handleEnable() {
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {}
    await enable();
    // Ao ativar, também limpa o "dismissed" pra não reperguntar caso desative depois.
    try {
      localStorage.removeItem(DISMISS_KEY);
    } catch {}
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) dismiss();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <BellRing className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">Ativar notificações?</DialogTitle>
          <DialogDescription className="text-center">
            Receba avisos de chamados de manutenção e aprovações de checklist direto no celular,
            mesmo com o app fechado.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={handleEnable} disabled={working} className="w-full">
            {working ? "Ativando…" : "Ativar"}
          </Button>
          <Button variant="ghost" onClick={dismiss} disabled={working} className="w-full">
            Agora não
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
