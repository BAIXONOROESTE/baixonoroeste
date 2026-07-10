import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const syncFamiliesAndProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const isAdmin = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (isAdmin.error || !isAdmin.data) throw new Error("Apenas admin pode sincronizar.");

    const { listarTodasFamilias, listarTodosProdutosAtivos, listarPosicaoEstoque } = await import("@/lib/omie.server");


    // Usa o cliente autenticado (RLS scoped) — o usuário já foi validado como admin
    // e a policy "admin manages sync_log" permite escrita. Evita depender de
    // supabaseAdmin (que em ambientes com sb_secret_* pode não passar como service_role
    // para a Data API).
    const { data: syncRow, error: syncErr } = await supabase
      .from("sync_log")
      .insert({ type: "produtos+familias", status: "em_andamento", message: "Iniciando..." })
      .select("id")
      .single();
    if (syncErr || !syncRow) throw new Error(`Falha ao registrar sync_log: ${syncErr?.message ?? "sem retorno"}`);


    try {
      // Famílias
      const familias = await listarTodasFamilias();
      const famRows = familias.map((f) => ({
        omie_id: String(f.codigo),
        name: f.descricao ?? f.nomeFamilia ?? `Família ${f.codigo}`,
      }));
      if (famRows.length) {
        await supabase.from("families").upsert(famRows, { onConflict: "omie_id" });
      }
      const { data: famMap } = await supabase.from("families").select("id,omie_id");
      const famByOmie = new Map((famMap ?? []).map((f) => [f.omie_id!, f.id]));

      // Produtos + posição de estoque (ListarProdutos não retorna saldo)
      const [produtos, posicoes] = await Promise.all([
        listarTodosProdutosAtivos(),
        listarPosicaoEstoque(),
      ]);
      const saldoByCod = new Map<string, number>();
      for (const pos of posicoes) {
        // Preferir "fisico" (quantidade em estoque real); cai para nSaldo.
        const saldo = Number(pos.fisico ?? pos.nSaldo ?? 0);
        saldoByCod.set(String(pos.nCodProd), saldo);
      }
      const prodRows = produtos.map((p) => ({
        omie_id: String(p.codigo_produto),
        code: p.codigo ?? String(p.codigo_produto),
        barcode: p.codigo_barras || null,
        name: p.descricao,
        family_id: p.codigo_familia ? famByOmie.get(String(p.codigo_familia)) ?? null : null,
        family_name: p.familia ?? null,
        unit: p.unidade ?? null,
        stock_omie: saldoByCod.get(String(p.codigo_produto)) ?? 0,
        cost: Number(p.valor_unitario ?? 0),
        price: p.valor_unitario ? Number(p.valor_unitario) : null,
        location: p.local_estoque ?? null,
        active: true,
        last_synced_at: new Date().toISOString(),
      }));
      if (prodRows.length) {
        for (let i = 0; i < prodRows.length; i += 500) {
          await supabase.from("products").upsert(prodRows.slice(i, i + 500), { onConflict: "omie_id" });
        }
        const activeIds = prodRows.map((p) => p.omie_id);
        await supabase
          .from("products")
          .update({ active: false })
          .not("omie_id", "in", `(${activeIds.map((i) => `"${i}"`).join(",")})`);
      }

      await supabase
        .from("sync_log")
        .update({
          status: "sucesso",
          items_count: prodRows.length,
          message: `${famRows.length} famílias, ${prodRows.length} produtos.`,
          finished_at: new Date().toISOString(),
        })
        .eq("id", syncRow.id);

      await supabase.from("logs").insert({
        user_id: userId,
        action: "sync_omie",
        entity: "products",
        details: { familias: famRows.length, produtos: prodRows.length },
      });

      return { ok: true, familias: famRows.length, produtos: prodRows.length };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase
        .from("sync_log")
        .update({ status: "erro", message: msg, finished_at: new Date().toISOString() })
        .eq("id", syncRow.id);
      await supabase.from("logs").insert({ user_id: userId, action: "sync_omie_erro", details: { erro: msg } });
      throw e;
    }
  });


export const pushCountToOmie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { count_item_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ajustarEstoqueOmie } = await import("@/lib/omie.server");

    const { data: item, error } = await supabase
      .from("count_items")
      .select("*, product:products(omie_id, name, code, unit), inventory:inventories(status, name)")
      .eq("id", data.count_item_id)
      .single();
    if (error || !item) throw new Error("Contagem não encontrada.");

    // Autorização: o próprio autor da contagem pode empurrar seu item enquanto
    // o inventário está aberto. Supervisor/admin podem empurrar qualquer item.
    const isOwner = item.counted_by === userId;
    const inventoryOpen = (item as { inventory?: { status?: string } }).inventory?.status !== "fechado";
    if (!isOwner || !inventoryOpen) {
      const { data: allowed, error: roleErr } = await supabase.rpc("current_user_is_supervisor_or_admin");
      if (roleErr || !allowed) throw new Error("Sem permissão para enviar este ajuste ao Omie.");
    }


    const diff = Number(item.difference);
    let sentToOmie = false;
    if (diff === 0) {
      await supabaseAdmin.from("count_items").update({ status: "correto" }).eq("id", item.id);
    } else {
      const resp = await ajustarEstoqueOmie({
        codigo_produto: Number(item.product.omie_id),
        quantidade: diff,
        observacao: `Contagem Estoque App - inventário ${item.inventory_id}`,
        valor_unitario: Number(item.unit_cost) || 0,
      });
      await supabaseAdmin
        .from("count_items")
        .update({ status: "atualizado", omie_updated_at: new Date().toISOString(), omie_response: resp as never })
        .eq("id", item.id);
      sentToOmie = true;
    }

    await supabaseAdmin.from("logs").insert({
      user_id: userId,
      action: "omie_ajuste_estoque",
      entity: "count_item",
      details: { count_item_id: item.id, produto: item.product.name, diferenca: diff },
    });

    // Notificação por email (não bloqueia a resposta em caso de erro).
    try {
      const { sendTemplateEmail, loadNotificationRecipients } = await import("@/lib/email/notify.server");
      const { data: counter } = await supabaseAdmin
        .from("profiles").select("email, full_name").eq("id", item.counted_by).maybeSingle();
      const recipients = await loadNotificationRecipients(counter?.email ? [counter.email] : []);
      if (recipients.length > 0) {
        const expected = Number(item.stock_omie_snapshot ?? 0);
        const counted = Number(item.counted_qty);
        const diffPct = expected === 0 ? (counted === 0 ? 0 : 100) : (diff / expected) * 100;
        await sendTemplateEmail({
          templateName: "count-completed",
          recipients,
          idempotencyKeyPrefix: `count-${item.id}`,
          templateData: {
            counter_name: counter?.full_name ?? "—",
            inventory_name: (item as { inventory?: { name?: string } }).inventory?.name ?? "",
            finished_at: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
            mode: "individual",
            total_diff_value: Number(item.financial_diff ?? 0),
            items: [{
              product: item.product.name,
              code: item.product.code ?? undefined,
              expected,
              counted,
              diff,
              diff_pct: diffPct,
              sent_to_omie: sentToOmie,
              unit: item.product.unit ?? undefined,
            }],
          },
        });
      }
    } catch (e) {
      console.error("[notify] contagem individual falhou", e);
    }

    return { ok: true, skipped: diff === 0 };
  });


export const closeInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { inventory_id: string; push_to_omie: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Autorização: apenas supervisor/admin podem fechar inventário.
    const { data: allowed, error: roleErr } = await supabase.rpc("current_user_is_supervisor_or_admin");
    if (roleErr || !allowed) throw new Error("Apenas supervisor ou administrador podem fechar inventários.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ajustarEstoqueOmie } = await import("@/lib/omie.server");


    if (data.push_to_omie) {
      const { data: pending } = await supabase
        .from("count_items")
        .select("*, product:products(omie_id, name)")
        .eq("inventory_id", data.inventory_id)
        .eq("status", "divergencia");

      for (const item of pending ?? []) {
        const diff = Number(item.difference);
        if (diff === 0) continue;
        try {
          const resp = await ajustarEstoqueOmie({
            codigo_produto: Number(item.product.omie_id),
            quantidade: diff,
            observacao: `Fechamento inventário ${data.inventory_id}`,
            valor_unitario: Number(item.unit_cost) || 0,
          });
          await supabaseAdmin
            .from("count_items")
            .update({ status: "atualizado", omie_updated_at: new Date().toISOString(), omie_response: resp as never })
            .eq("id", item.id);
        } catch (e) {
          await supabaseAdmin.from("logs").insert({
            user_id: userId, action: "omie_ajuste_erro", entity: "count_item",
            details: { id: item.id, erro: e instanceof Error ? e.message : String(e) },
          });
        }
      }
    }

    await supabaseAdmin
      .from("inventories")
      .update({ status: "fechado", closed_at: new Date().toISOString() })
      .eq("id", data.inventory_id);

    await supabaseAdmin.from("logs").insert({
      user_id: userId, action: "inventario_fechado", entity: "inventory",
      details: { inventory_id: data.inventory_id, push_to_omie: data.push_to_omie },
    });
    return { ok: true };
  });
