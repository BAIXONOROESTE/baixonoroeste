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
      .select("id, quantity, observation, created_at, product:products(code, name, unit, cost), reason:loss_reasons(name), user:profiles!losses_created_by_fkey(full_name, slug)")
      .gte("created_at", from)
      .lt("created_at", to)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { losses: data ?? [] },
    };
  },
});
