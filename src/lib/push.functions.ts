import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Returns the VAPID public key so the browser can subscribe. Public value. */
export const getPushPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) throw new Error("VAPID_PUBLIC_KEY não configurada.");
  return { publicKey: key };
});

type SaveInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string | null;
};

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SaveInput) => {
    if (!data || typeof data !== "object") throw new Error("invalid input");
    const { endpoint, p256dh, auth } = data;
    if (!endpoint || !p256dh || !auth) throw new Error("subscription incompleta");
    return {
      endpoint: String(endpoint),
      p256dh: String(p256dh),
      auth: String(auth),
      user_agent: data.user_agent ? String(data.user_agent).slice(0, 500) : null,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: userId,
          endpoint: data.endpoint,
          p256dh: data.p256dh,
          auth: data.auth,
          user_agent: data.user_agent,
        },
        { onConflict: "endpoint" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { endpoint: string }) => {
    if (!data?.endpoint) throw new Error("endpoint obrigatório");
    return { endpoint: String(data.endpoint) };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

type SendInput = {
  user_id?: string;
  title: string;
  body?: string;
  url?: string;
  tag?: string;
};

/**
 * Envia uma push notification para um user_id (default: o próprio caller).
 * Ainda não é chamada por nenhum evento do sistema — uso manual/teste.
 */
export const sendPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: SendInput) => {
    if (!data?.title) throw new Error("title obrigatório");
    return {
      user_id: data.user_id ? String(data.user_id) : undefined,
      title: String(data.title).slice(0, 200),
      body: data.body ? String(data.body).slice(0, 500) : "",
      url: data.url ? String(data.url) : "/",
      tag: data.tag ? String(data.tag) : undefined,
    };
  })
  .handler(async ({ data, context }) => {
    const { buildPushPayload } = await import("@block65/webcrypto-web-push");

    const targetUserId = data.user_id ?? context.userId;

    // Autorização: apenas o próprio usuário ou admin pode disparar para outros.
    if (targetUserId !== context.userId) {
      const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      if (roleErr) throw new Error(roleErr.message);
      if (!isAdmin) throw new Error("Apenas admin pode enviar push para outros usuários.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subs, error: subsErr } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", targetUserId);
    if (subsErr) throw new Error(subsErr.message);
    if (!subs || subs.length === 0) {
      return { sent: 0, failed: 0, removed: 0, message: "Nenhuma inscrição para este usuário." };
    }

    const vapid = {
      subject: process.env.VAPID_SUBJECT!,
      publicKey: process.env.VAPID_PUBLIC_KEY!,
      privateKey: process.env.VAPID_PRIVATE_KEY!,
    };

    const message = {
      data: JSON.stringify({
        title: data.title,
        body: data.body,
        url: data.url,
        tag: data.tag,
      }),
      options: { ttl: 60 },
    };

    let sent = 0;
    let failed = 0;
    let removed = 0;
    const staleEndpoints: string[] = [];

    for (const sub of subs) {
      try {
        const payload = await buildPushPayload(
          message,
          {
            endpoint: sub.endpoint,
            expirationTime: null,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          vapid,
        );
        const res = await fetch(sub.endpoint, payload as unknown as RequestInit);
        if (res.status === 404 || res.status === 410) {
          staleEndpoints.push(sub.endpoint);
          removed++;
        } else if (res.status >= 200 && res.status < 300) {
          sent++;
        } else {
          failed++;
          console.error("[sendPush] endpoint respondeu", res.status, await res.text().catch(() => ""));
        }
      } catch (err) {
        failed++;
        console.error("[sendPush] erro ao enviar", err);
      }
    }

    if (staleEndpoints.length > 0) {
      await supabaseAdmin.from("push_subscriptions").delete().in("endpoint", staleEndpoints);
    }

    return { sent, failed, removed };
  });
