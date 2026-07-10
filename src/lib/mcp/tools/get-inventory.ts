import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase-for-user";

export default defineTool({
  name: "get_inventory",
  title: "Detalhes do inventário",
  description: "Retorna um inventário com seus itens contados (produto, quantidade contada, diferença, status).",
  inputSchema: {
    inventory_id: z.string().uuid().describe("ID do inventário."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ inventory_id }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    const sb = supabaseForUser(ctx);
    const [{ data: inv, error: invErr }, { data: items, error: itemsErr }] = await Promise.all([
      sb.from("inventories").select("*").eq("id", inventory_id).maybeSingle(),
      sb.from("count_items")
        .select("id, product_id, quantity_before, quantity_counted, difference, financial_diff, status, product:products(code, name, unit)")
        .eq("inventory_id", inventory_id)
        .order("created_at", { ascending: true }),
    ]);
    if (invErr) return { content: [{ type: "text", text: invErr.message }], isError: true };
    if (!inv) return { content: [{ type: "text", text: "Inventário não encontrado." }], isError: true };
    if (itemsErr) return { content: [{ type: "text", text: itemsErr.message }], isError: true };
    const payload = { inventory: inv, items: items ?? [] };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
