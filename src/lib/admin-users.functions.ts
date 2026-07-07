import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "admin" | "supervisor" | "contador";

/**
 * Cria um novo funcionário sem afetar a sessão do admin logado (que é o que
 * `supabase.auth.signUp` faria no browser). Só admins podem chamar.
 * Também define o papel do novo usuário via user_roles (o trigger cria com
 * "contador" e aqui atualizamos se necessário).
 */
export const createUserAsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { fullName: string; slug: string; pin: string; role: Role; avatarColor?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Autoriza: apenas admin
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (roleErr || !isAdmin) throw new Error("Apenas administradores podem criar usuários.");

    if (!data.fullName.trim() || !data.slug.trim() || data.pin.length < 4) {
      throw new Error("Nome, slug e PIN (mín. 4 dígitos) são obrigatórios.");
    }
    if (!["admin", "supervisor", "contador"].includes(data.role)) {
      throw new Error("Papel inválido.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const email = `${data.slug}@estoque.local`;
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.pin,
      email_confirm: true,
      user_metadata: {
        full_name: data.fullName.trim(),
        slug: data.slug,
        avatar_color: data.avatarColor ?? "amber",
      },
    });
    if (createErr || !created?.user) throw new Error(createErr?.message ?? "Falha ao criar usuário.");

    const newUserId = created.user.id;

    // Se o papel desejado não for "contador" (default do trigger), ajustar.
    if (data.role !== "contador") {
      await supabase.from("user_roles").delete().eq("user_id", newUserId);
      const { error: insErr } = await supabase
        .from("user_roles")
        .insert({ user_id: newUserId, role: data.role });
      if (insErr) throw new Error(`Usuário criado, mas falhou ao definir papel: ${insErr.message}`);
    }

    return { ok: true, user_id: newUserId };
  });
