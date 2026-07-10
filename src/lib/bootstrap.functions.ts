import { createServerFn } from "@tanstack/react-start";

/**
 * Cria o PRIMEIRO administrador do sistema.
 *
 * Endpoint público (sem middleware de auth) porque roda antes de existir
 * qualquer usuário. Bloqueia a si mesmo assim que já houver 1 role cadastrada,
 * fechando o buraco de auto-cadastro público.
 */
export const bootstrapFirstAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: { fullName: string; slug: string; pin: string }) => d)
  .handler(async ({ data }) => {
    const fullName = data.fullName?.trim() ?? "";
    const slug = data.slug?.trim() ?? "";
    const pin = data.pin ?? "";
    if (!fullName || !slug) throw new Error("Nome e slug obrigatórios.");
    if (!/^\d{6,8}$/.test(pin)) throw new Error("PIN deve ter 6 a 8 dígitos.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Só permite quando NINGUÉM ainda tem role — evita que a rota vire um
    // criador de admins depois do setup inicial.
    const { count, error: countErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id", { count: "exact", head: true });
    if (countErr) throw new Error(countErr.message);
    if ((count ?? 0) > 0) {
      throw new Error("Sistema já configurado. Peça a um administrador para criar sua conta.");
    }

    const authEmail = `${slug}@users.baixonoroeste.com.br`;
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password: `${pin}#estq`,
      email_confirm: true,
      user_metadata: { full_name: fullName, slug, avatar_color: "amber" },
    });
    if (createErr || !created?.user) throw new Error(createErr?.message ?? "Falha ao criar usuário.");

    // handle_new_user já promove o primeiro usuário a admin, mas garantimos aqui
    // por segurança (idempotente pelo unique constraint).
    await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: created.user.id, role: "admin" })
      .then(() => undefined, () => undefined);

    await supabaseAdmin.from("profiles").update({ slug }).eq("id", created.user.id);

    return { ok: true };
  });
