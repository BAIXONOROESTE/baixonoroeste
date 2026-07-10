import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase-for-user";

export default defineTool({
  name: "list_inventories",
  title: "Listar inventários",
  description: "Lista inventários (aberto/fechado) com nome, tipo, status e datas. Respeita o papel do usuário.",
  inputSchema: {
    status: z.enum(["aberto", "fechado", "todos"]).default("todos").describe("Filtrar por status."),
    limit: z.number().int().min(1).max(50).default(20),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    const sb = supabaseForUser(ctx);
    let q = sb.from("inventories")
      .select("id, name, type, status, started_at, closed_at, family_id")
      .order("started_at", { ascending: false })
      .limit(limit);
    if (status !== "todos") q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { inventories: data ?? [] },
    };
  },
});
