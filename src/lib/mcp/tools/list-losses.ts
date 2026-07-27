import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase-for-user";

export default defineTool({
  name: "list_losses",
  title: "Listar perdas & quebras",
  description: "Lista perdas em uma janela de datas com produto, motivo, quantidade e quem lançou.",
  inputSchema: {
    from: z.string().describe("Data inicial ISO (ex: 2026-07-01) ou 2026-07-01T00:00:00Z."),
    to: z.string().describe("Data final ISO exclusiva."),
    limit: z.number().int().min(1).max(200).default(100),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ from, to, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb.from("losses")
      .select("id, quantity, observation, created_at, created_by, product:products(code, name, unit, cost), reason:loss_reasons(name)")
      .gte("created_at", from)
      .lt("created_at", to)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const userIds = Array.from(new Set((data ?? []).map((l: any) => l.created_by as string).filter(Boolean)));
    const usersById: Record<string, { full_name: string | null; slug: string | null }> = {};
    if (userIds.length > 0) {
      const { data: profs, error: profErr } = await sb
        .from("profiles")
        .select("id, full_name, slug")
        .in("id", userIds);
      if (profErr) return { content: [{ type: "text", text: profErr.message }], isError: true };
      for (const p of profs ?? []) {
        usersById[p.id as string] = { full_name: p.full_name as string | null, slug: p.slug as string | null };
      }
    }

    const losses = (data ?? []).map((l: any) => ({
      ...l,
      user: usersById[l.created_by] ?? { full_name: null, slug: null },
    }));

    return {
      content: [{ type: "text", text: JSON.stringify(losses, null, 2) }],
      structuredContent: { losses },
    };
  },
});
