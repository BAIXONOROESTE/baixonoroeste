import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "admin" | "supervisor" | "contador";

/**
 * Cria um novo funcionário sem afetar a sessão do admin logado. Só admins.
 * Força profiles.slug a bater com o slug do email (evita bug de "PIN incorreto"
 * quando o trigger handle_new_user gera um slug diferente).
 */
export const createUserAsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { fullName: string; slug: string; pin: string; role: Role; avatarColor?: string; phone?: string; email?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (roleErr || !isAdmin) throw new Error("Apenas administradores podem criar usuários.");

    if (!data.fullName.trim() || !data.slug.trim() || data.pin.length < 6 || data.pin.length > 8 || !/^\d+$/.test(data.pin)) {
      throw new Error("Nome, slug e PIN de 6 a 8 dígitos são obrigatórios.");
    }
    if (!["admin", "supervisor", "contador"].includes(data.role)) {
      throw new Error("Papel inválido.");
    }

    const { createAuthUserAsService } = await import("@/lib/auth-admin.server");

    const authEmail = `${data.slug}@users.baixonoroeste.com.br`;
    const created = await createAuthUserAsService({
      email: authEmail,
      password: `${data.pin}#estq`,
      email_confirm: true,
      user_metadata: {
        full_name: data.fullName.trim(),
        slug: data.slug,
        avatar_color: data.avatarColor ?? "amber",
      },
    });

    const newUserId = created.id;

    if (data.role !== "contador") {
      await supabase.from("user_roles").delete().eq("user_id", newUserId);
      const { error: insErr } = await supabase
        .from("user_roles")
        .insert({ user_id: newUserId, role: data.role });
      if (insErr) throw new Error(`Usuário criado, mas falhou ao definir papel: ${insErr.message}`);
    }

    // Sobrescrever o slug do profile para bater com o email interno
    // (o trigger handle_new_user pode ter usado outro valor).
    const profileUpdate: { slug: string; phone?: string; email?: string } = { slug: data.slug };
    if (data.phone && data.phone.trim()) profileUpdate.phone = data.phone.trim();
    if (data.email && data.email.trim()) profileUpdate.email = data.email.trim().toLowerCase();
    await supabase.from("profiles").update(profileUpdate).eq("id", newUserId);

    return { ok: true, user_id: newUserId };
  });

/**
 * Admin redefine o PIN de um funcionário (fluxo de emergência).
 */
export const resetUserPinAsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; new_pin: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (roleErr || !isAdmin) throw new Error("Apenas administradores podem resetar PIN.");

    if (!/^\d{6,8}$/.test(data.new_pin)) throw new Error("PIN deve ter de 6 a 8 dígitos.");
    if (!data.user_id) throw new Error("Usuário inválido.");

    const { updateAuthUserPasswordAsService } = await import("@/lib/auth-admin.server");
    await updateAuthUserPasswordAsService(data.user_id, `${data.new_pin}#estq`);

    await supabase.from("logs").insert({
      user_id: userId,
      action: "pin_reset_admin",
      entity: "user",
      details: { target_user_id: data.user_id },
    });
    return { ok: true };
  });
