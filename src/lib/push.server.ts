// Server-only helper para enviar Web Push. Não importe deste arquivo em rotas/
// componentes — use as server functions em `push.functions.ts` ou funções
// server-side que já rodem no worker.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
};

export type PushResult = {
  sent: number;
  failed: number;
  removed: number;
  targets: number;
};

/**
 * Envia uma notificação push para todas as inscrições ativas de um usuário.
 * Remove endpoints expirados (404/410). Nunca lança — captura tudo e retorna o
 * resumo, para poder ser chamado como side-effect não-bloqueante.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<PushResult> {
  const result: PushResult = { sent: 0, failed: 0, removed: 0, targets: 0 };
  try {
    const { data: subs, error } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);
    if (error) {
      console.error("[sendPushToUser] load subs error", error);
      return result;
    }
    if (!subs || subs.length === 0) return result;
    result.targets = subs.length;

    const subject = process.env.VAPID_SUBJECT;
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!subject || !publicKey || !privateKey) {
      console.error("[sendPushToUser] VAPID keys ausentes");
      return result;
    }

    const { buildPushPayload } = await import("@block65/webcrypto-web-push");
    const message = {
      data: JSON.stringify({
        title: payload.title,
        body: payload.body ?? "",
        url: payload.url ?? "/",
        tag: payload.tag,
      }),
      options: { ttl: 60 },
    };
    const vapid = { subject, publicKey, privateKey };

    const stale: string[] = [];
    for (const sub of subs) {
      try {
        const pushRequest = await buildPushPayload(
          message,
          {
            endpoint: sub.endpoint,
            expirationTime: null,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          vapid,
        );
        const res = await fetch(sub.endpoint, pushRequest as unknown as RequestInit);
        if (res.status === 404 || res.status === 410) {
          stale.push(sub.endpoint);
          result.removed++;
        } else if (res.status >= 200 && res.status < 300) {
          result.sent++;
        } else {
          result.failed++;
          console.error(
            "[sendPushToUser] endpoint respondeu",
            res.status,
            await res.text().catch(() => ""),
          );
        }
      } catch (err) {
        result.failed++;
        console.error("[sendPushToUser] erro ao enviar", err);
      }
    }
    if (stale.length > 0) {
      await supabaseAdmin
        .from("push_subscriptions")
        .delete()
        .in("endpoint", stale)
        .then(({ error: delErr }) => {
          if (delErr) console.error("[sendPushToUser] cleanup stale error", delErr);
        });
    }
  } catch (err) {
    console.error("[sendPushToUser] falha inesperada", err);
  }
  return result;
}
