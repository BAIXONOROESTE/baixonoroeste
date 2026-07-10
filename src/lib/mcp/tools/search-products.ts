import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase-for-user";

export default defineTool({
  name: "search_products",
  title: "Buscar produtos",
  description: "Busca produtos ativos por nome, código ou código de barras.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Texto a procurar (nome, código ou código de barras)."),
    limit: z.number().int().min(1).max(50).default(20),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    const sb = supabaseForUser(ctx);
    const like = `%${query}%`;
    const { data, error } = await sb.from("products")
      .select("id, code, barcode, name, unit, stock_omie, cost, price, family_name, location, active")
      .eq("active", true)
      .or(`name.ilike.${like},code.ilike.${like},barcode.ilike.${like}`)
      .limit(limit);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { products: data ?? [] },
    };
  },
});
