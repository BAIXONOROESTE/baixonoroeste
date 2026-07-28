import { Bell, BellOff, BellRing } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { sendPush } from "@/lib/push.functions";

export function PushNotificationsToggle() {
  const { status, working, error, enable, disable } = usePushNotifications();
  const [testing, setTesting] = useState(false);
  const sendPushFn = useServerFn(sendPush);

  if (status === "unsupported") {
    return (
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-start gap-3">
          <BellOff className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Notificações não suportadas</p>
            <p className="text-xs text-muted-foreground">
              Seu navegador não permite receber notificações push. No iPhone, adicione o app à tela
              de início para habilitar.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        Carregando notificações…
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-start gap-3">
          <BellOff className="mt-0.5 h-5 w-5 text-destructive" />
          <div>
            <p className="text-sm font-medium">Notificações bloqueadas</p>
            <p className="text-xs text-muted-foreground">
              Você bloqueou as notificações neste navegador. Habilite nas permissões do site e
              recarregue a página.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const active = status === "granted-subscribed";

  async function handleTest() {
    setTesting(true);
    try {
      const res = await sendPushFn({
        data: {
          title: "Teste de notificação",
          body: "Se você está vendo isso, está tudo funcionando.",
          url: "/inicio",
          tag: "push-test",
        },
      });
      if (res.sent > 0) toast.success("Notificação de teste enviada!");
      else if (res.removed > 0) toast.warning("A inscrição expirou. Reative para receber novamente.");
      else toast.error("Nada foi enviado. Verifique as permissões do navegador.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar teste.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {active ? (
            <BellRing className="mt-0.5 h-5 w-5 text-primary" />
          ) : (
            <Bell className="mt-0.5 h-5 w-5 text-muted-foreground" />
          )}
          <div>
            <p className="text-sm font-medium">Notificações push</p>
            <p className="text-xs text-muted-foreground">
              {active
                ? "Você vai receber avisos mesmo com o app fechado neste dispositivo."
                : "Ative para receber avisos do sistema neste dispositivo."}
            </p>
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {active ? (
            <>
              <Button size="sm" variant="outline" onClick={disable} disabled={working}>
                Desativar
              </Button>
              <Button size="sm" variant="ghost" onClick={handleTest} disabled={testing}>
                {testing ? "Enviando…" : "Testar"}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={enable} disabled={working}>
              {working ? "Ativando…" : "Ativar notificações"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
