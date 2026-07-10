import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase-for-user";

export default defineTool({
  name: "my_profile",
  title: "Meu perfil",
  description: "Retorna o perfil do usuário autenticado (nome, slug e papéis).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    const sb = supabaseForUser(ctx);
    const userId = ctx.getUserId();
    if (!userId) return { content: [{ type: "text", text: "Token sem sub." }], isError: true };
    const [{ data: profile, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
      sb.from("profiles").select("id, full_name, slug, avatar_color, active, email, phone").eq("id", userId).maybeSingle(),
      sb.from("user_roles").select("role").eq("user_id", userId),
    ]);
    if (pErr) return { content: [{ type: "text", text: pErr.message }], isError: true };
    if (rErr) return { content: [{ type: "text", text: rErr.message }], isError: true };
    const payload = { profile, roles: (roles ?? []).map((r) => r.role) };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
