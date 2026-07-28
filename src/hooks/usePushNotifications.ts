import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getPushPublicKey,
  savePushSubscription,
  deletePushSubscription,
} from "@/lib/push.functions";

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
      if (permission === "granted" && sub) setStatus("granted-subscribed");
      else if (permission === "granted") setStatus("granted-not-subscribed");
      else setStatus("default");
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
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "default");
        return;
      }
      const reg =
        (await navigator.serviceWorker.getRegistration(SW_URL)) ??
        (await navigator.serviceWorker.register(SW_URL, { scope: "/" }));
      await navigator.serviceWorker.ready;

      const existing = await reg.pushManager.getSubscription();
      const { publicKey } = await fetchPublicKey();
      let sub = existing;
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      const p256dh = arrayBufferToBase64Url(sub.getKey("p256dh"));
      const auth = arrayBufferToBase64Url(sub.getKey("auth"));

      await saveSub({
        data: {
          endpoint: sub.endpoint,
          p256dh,
          auth,
          user_agent: navigator.userAgent ?? null,
        },
      });
      setStatus("granted-subscribed");
    } catch (e) {
      console.error("[usePushNotifications] enable", e);
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
        await sub.unsubscribe().catch(() => {});
        await deleteSub({ data: { endpoint } }).catch(() => {});
      }
      setStatus(Notification.permission === "granted" ? "granted-not-subscribed" : "default");
    } catch (e) {
      console.error("[usePushNotifications] disable", e);
      setError(e instanceof Error ? e.message : "Falha ao desativar.");
    } finally {
      setWorking(false);
    }
  }, [supported, deleteSub]);

  return { status, working, error, supported, enable, disable, refresh };
}
