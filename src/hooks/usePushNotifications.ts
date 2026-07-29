import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getPushPublicKey,
  savePushSubscription,
  deletePushSubscription,
} from "@/lib/push.functions";
import { supabase } from "@/integrations/supabase/client";

const SW_URL = "/sw.js";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function arrayBufferToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type PushStatus =
  | "unsupported"
  | "loading"
  | "denied"
  | "granted-subscribed"
  | "granted-not-subscribed"
  | "default";

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPublicKey = useServerFn(getPushPublicKey);
  const saveSub = useServerFn(savePushSubscription);
  const deleteSub = useServerFn(deletePushSubscription);

  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  const refresh = useCallback(async () => {
    if (!supported) {
      setStatus("unsupported");
      return;
    }
    try {
      const permission = Notification.permission;
      if (permission === "denied") {
        setStatus("denied");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration(SW_URL);
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (permission === "granted" && sub) {
        // Verifica se o endpoint está registrado no banco pro usuário atual —
        // se o usuário desativou (banco vazio) mas o navegador ainda tem a sub,
        // a UI precisa refletir "não ativado" para permitir reativar.
        const { data } = await supabase
          .from("push_subscriptions")
          .select("id")
          .eq("endpoint", sub.endpoint)
          .maybeSingle();
        setStatus(data ? "granted-subscribed" : "granted-not-subscribed");
      } else if (permission === "granted") {
        setStatus("granted-not-subscribed");
      } else {
        setStatus("default");
      }
    } catch (e) {
      console.error("[usePushNotifications] refresh", e);
      setStatus("default");
    }
  }, [supported]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    if (!supported) return;
    setWorking(true);
    setError(null);
    try {
      console.info("[push] enable: solicitando permissão");
      const permission = await Notification.requestPermission();
      console.info("[push] enable: permission =", permission);
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "default");
        return;
      }
      const reg =
        (await navigator.serviceWorker.getRegistration(SW_URL)) ??
        (await navigator.serviceWorker.register(SW_URL, { scope: "/" }));
      // Força atualização do SW — evita ficar preso a uma versão antiga em cache
      // que não recebe mais o evento 'push'.
      try {
        await reg.update();
      } catch (e) {
        console.warn("[push] enable: reg.update falhou", e);
      }
      await navigator.serviceWorker.ready;

      const { publicKey } = await fetchPublicKey();
      const appServerKey = urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer;

      // Se já existe uma subscription no navegador, reutiliza. Só recria quando
      // não há uma — isso evita o bug do Safari/iOS em que unsubscribe+subscribe
      // no mesmo carregamento gera um endpoint aparentemente novo mas que o
      // serviço de push responde 410 (Gone).
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        console.info("[push] enable: criando nova subscription");
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey,
        });
      } else {
        console.info("[push] enable: reutilizando subscription existente");
      }

      const p256dh = arrayBufferToBase64Url(sub.getKey("p256dh"));
      const auth = arrayBufferToBase64Url(sub.getKey("auth"));

      console.info("[push] enable: salvando no banco endpoint=", sub.endpoint.slice(0, 60));
      await saveSub({
        data: {
          endpoint: sub.endpoint,
          p256dh,
          auth,
          user_agent: navigator.userAgent ?? null,
        },
      });
      setStatus("granted-subscribed");
      console.info("[push] enable: OK");
    } catch (e) {
      console.error("[push] enable: falha", e);
      setError(e instanceof Error ? e.message : "Falha ao ativar notificações.");
    } finally {
      setWorking(false);
    }
  }, [supported, fetchPublicKey, saveSub]);

  const disable = useCallback(async () => {
    if (!supported) return;
    setWorking(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_URL);
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        const endpoint = sub.endpoint;
        console.info("[push] disable: removendo do banco endpoint=", endpoint.slice(0, 60));
        // Remove primeiro do banco (fonte da verdade para o envio). Deixamos a
        // subscription do navegador viva de propósito: se o usuário reativar
        // agora, reaproveitamos o mesmo endpoint em vez de recriar (o que no
        // Safari/iOS às vezes produz endpoints imediatamente inválidos).
        try {
          await deleteSub({ data: { endpoint } });
        } catch (e) {
          console.error("[push] disable: erro ao remover do banco", e);
          throw e;
        }
      }
      setStatus(Notification.permission === "granted" ? "granted-not-subscribed" : "default");
      console.info("[push] disable: OK");
    } catch (e) {
      console.error("[push] disable: falha", e);
      setError(e instanceof Error ? e.message : "Falha ao desativar.");
    } finally {
      setWorking(false);
    }
  }, [supported, deleteSub]);

  return { status, working, error, supported, enable, disable, refresh };
}
