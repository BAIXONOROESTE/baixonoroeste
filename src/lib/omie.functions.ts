import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const syncFamiliesAndProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [isAdmin, isSupervisor] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "supervisor" }),
    ]);
    if ((isAdmin.error || !isAdmin.data) && (isSupervisor.error || !isSupervisor.data)) {
      throw new Error("Apenas supervisor ou administrador podem sincronizar.");
    }

    const { listarTodasFamilias, listarTodosProdutosAtivos, listarPosicaoEstoque } = await import("@/lib/omie.server");


    // Usa o cliente autenticado (RLS scoped) — o usuário já foi validado como supervisor/admin
    // e a policy de sync_log permite escrita. Evita depender de
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

      // Produtos + posição de estoque (ListarProdutos não retorna saldo).
      // A consulta de estoque do Omie às vezes falha com SOAP-ERROR; nesse caso
      // mantemos o último saldo salvo e não derrubamos a sincronização do catálogo.
      const produtos = await listarTodosProdutosAtivos();
      let posicoes: Awaited<ReturnType<typeof listarPosicaoEstoque>> = [];
      let stockWarning: string | null = null;
      try {
        posicoes = await listarPosicaoEstoque();
      } catch (e) {
        stockWarning = e instanceof Error ? e.message : String(e);
      }
      const saldoByCod = new Map<string, number>();
      for (const pos of posicoes) {
        // Preferir "fisico" (quantidade em estoque real); cai para nSaldo.
        const saldo = Number(pos.fisico ?? pos.nSaldo ?? 0);
        saldoByCod.set(String(pos.nCodProd), saldo);
      }
      const { data: existingProducts } = stockWarning
        ? await supabase.from("products").select("omie_id, stock_omie")
        : { data: [] as Array<{ omie_id: string | null; stock_omie: number | null }> };
      const existingStockByOmie = new Map(
        (existingProducts ?? [])
          .filter((p): p is { omie_id: string; stock_omie: number | null } => !!p.omie_id)
          .map((p) => [p.omie_id, Number(p.stock_omie ?? 0)]),
      );
      const pickBarcode = (p: import("@/lib/omie.server").OmieProduto): string | null => {
        const candidates = [p.codigo_barras, p.ean, p.ean_13, p.gtin];
        for (const c of candidates) {
          const s = (c ?? "").toString().trim();
          if (!s || s === "0" || s === "SEM GTIN") continue;
          return s;
        }
        return null;
      };
      let semBarcode = 0;
      const prodRows = produtos.map((p) => {
        const barcode = pickBarcode(p);
        if (!barcode) semBarcode++;
        return {
          omie_id: String(p.codigo_produto),
          code: p.codigo ?? String(p.codigo_produto),
          barcode,
          name: p.descricao,
          family_id: p.codigo_familia ? famByOmie.get(String(p.codigo_familia)) ?? null : null,
          family_name: p.familia ?? null,
          unit: p.unidade ?? null,
          stock_omie: saldoByCod.get(String(p.codigo_produto))
            ?? existingStockByOmie.get(String(p.codigo_produto))
            ?? Number(p.estoque_atual ?? p.quantidade_estoque ?? 0),
          cost: Number(p.valor_unitario ?? 0),
          price: p.valor_unitario ? Number(p.valor_unitario) : null,
          location: p.local_estoque ?? null,
          active: true,
          last_synced_at: new Date().toISOString(),
        };
      });
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
          message: stockWarning
            ? `${famRows.length} famílias, ${prodRows.length} produtos (${semBarcode} sem código de barras). Estoque mantido do último sync: ${stockWarning}`
            : `${famRows.length} famílias, ${prodRows.length} produtos (${semBarcode} sem código de barras).`,
          finished_at: new Date().toISOString(),
        })
        .eq("id", syncRow.id);

      await supabase.from("logs").insert({
        user_id: userId,
        action: "sync_omie",
        entity: "products",
        details: { familias: famRows.length, produtos: prodRows.length, sem_barcode: semBarcode },
      });

      return { ok: true, familias: famRows.length, produtos: prodRows.length, sem_barcode: semBarcode };
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

    async function fetchItemWithRetry() {
      for (let attempt = 0; attempt < 2; attempt++) {
        const { data: item, error } = await supabase
          .from("count_items")
          .select("*, product:products(omie_id, name, code, unit, family_id), inventory:inventories(status, name)")
          .eq("id", data.count_item_id)
          .single();
        if (item) return item;
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 500));
        } else {
          throw new Error(
            `Contagem não encontrada. Detalhes: count_item_id=${data.count_item_id}, erro=${error?.message ?? "sem erro, item nulo"}, code=${(error as { code?: string } | null)?.code ?? "N/A"}`,
          );
        }
      }
      throw new Error(`Contagem não encontrada. Detalhes: count_item_id=${data.count_item_id}`);
    }
    const item = await fetchItemWithRetry();

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
      const invName = (item as { inventory?: { name?: string } }).inventory?.name ?? `inventario ${item.inventory_id}`;
      const { data: counterProfile } = await supabaseAdmin
        .from("profiles").select("full_name").eq("id", item.counted_by).maybeSingle();
      const counterName = counterProfile?.full_name ?? "desconhecido";
      const resp = await ajustarEstoqueOmie({
        codigo_produto: Number(item.product.omie_id),
        quantidade: diff,
        observacao: `Contagem: ${invName} - contado por ${counterName}`,
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
    // Regra: se o produto NÃO tem família → e-mail individual imediato.
    // Se tem família → só dispara e-mail consolidado quando TODOS os produtos
    // da família (dentro do escopo deste inventário) já foram contados.
    try {
      const { sendTemplateEmail, loadNotificationRecipients } = await import("@/lib/email/notify.server");
      const productFamilyId = (item.product as { family_id?: string | null }).family_id ?? null;
      const inventoryId = item.inventory_id as string;

      if (!productFamilyId) {
        // ---- Modo individual (sem família) ----
        const { data: counter } = await supabaseAdmin
          .from("profiles").select("email, full_name").eq("id", item.counted_by).maybeSingle();
        const recipients = await loadNotificationRecipients(counter?.email ? [counter.email] : []);
        if (recipients.length > 0) {
          const expected = Number(item.quantity_before ?? 0);
          const counted = Number(item.quantity_counted);
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
      } else {
        // ---- Modo por família (agrupado) ----
        // 1) produtos ativos dessa família
        const { data: familyProducts } = await supabaseAdmin
          .from("products")
          .select("id")
          .eq("family_id", productFamilyId)
          .eq("active", true);
        let scopedProductIds = (familyProducts ?? []).map((p) => p.id as string);

        // 2) restringir ao escopo do inventário, se houver
        const { data: invProducts } = await supabaseAdmin
          .from("inventory_products")
          .select("product_id")
          .eq("inventory_id", inventoryId);
        if ((invProducts ?? []).length > 0) {
          const invSet = new Set((invProducts ?? []).map((r) => r.product_id as string));
          scopedProductIds = scopedProductIds.filter((id) => invSet.has(id));
        }

        // 3) contar quantos count_items já existem para esses produtos
        if (scopedProductIds.length > 0) {
          const { data: familyCountItems } = await supabaseAdmin
            .from("count_items")
            .select("id, product_id, quantity_before, quantity_counted, difference, financial_diff, status, product:products(name, code, unit)")
            .eq("inventory_id", inventoryId)
            .in("product_id", scopedProductIds);

          const countedIds = new Set((familyCountItems ?? []).map((r) => r.product_id as string));
          const allDone = scopedProductIds.every((id) => countedIds.has(id));

          if (allDone) {
            const { data: family } = await supabaseAdmin
              .from("families").select("name").eq("id", productFamilyId).maybeSingle();
            const { data: counter } = await supabaseAdmin
              .from("profiles").select("email, full_name").eq("id", item.counted_by).maybeSingle();
            const recipients = await loadNotificationRecipients(counter?.email ? [counter.email] : []);
            if (recipients.length > 0) {
              const emailItems = (familyCountItems ?? []).map((i) => {
                const expected = Number(i.quantity_before ?? 0);
                const counted = Number(i.quantity_counted);
                const d = Number(i.difference);
                return {
                  product: (i.product as { name: string }).name,
                  code: (i.product as { code?: string }).code,
                  expected,
                  counted,
                  diff: d,
                  diff_pct: expected === 0 ? (counted === 0 ? 0 : 100) : (d / expected) * 100,
                  sent_to_omie: i.status === "atualizado",
                  unit: (i.product as { unit?: string | null }).unit ?? undefined,
                };
              });
              const totalDiff = (familyCountItems ?? []).reduce(
                (a, i) => a + Number(i.financial_diff ?? 0),
                0,
              );
              await sendTemplateEmail({
                templateName: "count-completed",
                recipients,
                idempotencyKeyPrefix: `family-${inventoryId}-${productFamilyId}`,
                templateData: {
                  counter_name: counter?.full_name ?? "—",
                  inventory_name: (item as { inventory?: { name?: string } }).inventory?.name ?? "",
                  family_name: family?.name ?? "—",
                  finished_at: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
                  mode: "family",
                  total_diff_value: totalDiff,
                  items: emailItems,
                },
              });
            }
          }
        }
      }
    } catch (e) {
      console.error("[notify] contagem individual/família falhou", e);
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
      const { data: inv, error: invErr } = await supabase
        .from("inventories")
        .select("name, assigned_counter_id")
        .eq("id", data.inventory_id)
        .maybeSingle();
      if (invErr) throw new Error(`Falha ao buscar inventário: ${invErr.message}`);
      const invName = inv?.name ?? `inventario ${data.inventory_id}`;
      let invCounterName: string | null = null;
      if (inv?.assigned_counter_id) {
        const { data: invCounter } = await supabase
          .from("profiles").select("full_name").eq("id", inv.assigned_counter_id).maybeSingle();
        invCounterName = invCounter?.full_name ?? null;
      }

      const { data: pending, error: pendingErr } = await supabase
        .from("count_items")
        .select("*, product:products(omie_id, name)")
        .eq("inventory_id", data.inventory_id)
        .eq("status", "divergencia");
      if (pendingErr) throw new Error(`Falha ao buscar itens divergentes: ${pendingErr.message}`);

      // Prefetch counter names to avoid N+1 without breaking on missing FK embed.
      const counterIds = Array.from(new Set((pending ?? []).map((p) => p.counted_by).filter(Boolean) as string[]));
      const counterNameById = new Map<string, string>();
      if (counterIds.length) {
        const { data: counterProfiles } = await supabase
          .from("profiles").select("id, full_name").in("id", counterIds);
        for (const c of counterProfiles ?? []) {
          if (c.id && c.full_name) counterNameById.set(c.id, c.full_name);
        }
      }

      for (const item of pending ?? []) {
        const diff = Number(item.difference);
        if (diff === 0) continue;
        try {
          const counterName = (item.counted_by && counterNameById.get(item.counted_by)) ?? invCounterName ?? "desconhecido";
          const resp = await ajustarEstoqueOmie({
            codigo_produto: Number(item.product.omie_id),
            quantidade: diff,
            observacao: `Contagem: ${invName} - contado por ${counterName}`,
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


    const { error: updErr } = await supabase
      .from("inventories")
      .update({ status: "fechado", closed_at: new Date().toISOString() })
      .eq("id", data.inventory_id);
    if (updErr) throw new Error(`Falha ao fechar inventário: ${updErr.message}`);

    await supabaseAdmin.from("logs").insert({
      user_id: userId, action: "inventario_fechado", entity: "inventory",
      details: { inventory_id: data.inventory_id, push_to_omie: data.push_to_omie },
    });

    // Notificação por email do fechamento (fire-and-forget).
    try {
      const { sendTemplateEmail, loadNotificationRecipients } = await import("@/lib/email/notify.server");
      const [{ data: inv }, { data: allItems }] = await Promise.all([
        supabaseAdmin.from("inventories").select("name").eq("id", data.inventory_id).maybeSingle(),
        supabaseAdmin
          .from("count_items")
          .select("quantity_before, quantity_counted, difference, financial_diff, status, product:products(name, code, unit)")
          .eq("inventory_id", data.inventory_id),
      ]);
      const recipients = await loadNotificationRecipients();
      if (recipients.length > 0) {
        const items = (allItems ?? [])
          .filter((i) => Number(i.difference) !== 0)
          .map((i) => {
            const expected = Number(i.quantity_before ?? 0);
            const counted = Number(i.quantity_counted);
            const d = Number(i.difference);
            return {
              product: (i.product as { name: string }).name,
              code: (i.product as { code?: string }).code,
              expected, counted, diff: d,
              diff_pct: expected === 0 ? (counted === 0 ? 0 : 100) : (d / expected) * 100,
              sent_to_omie: i.status === "atualizado",
              unit: (i.product as { unit?: string | null }).unit ?? undefined,
            };
          });
        const totalDiff = (allItems ?? []).reduce((a, i) => a + Number(i.financial_diff ?? 0), 0);
        await sendTemplateEmail({
          templateName: "count-completed",
          recipients,
          idempotencyKeyPrefix: `close-${data.inventory_id}`,
          templateData: {
            counter_name: "—",
            inventory_name: inv?.name ?? "",
            finished_at: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
            mode: "closure",
            total_diff_value: totalDiff,
            items,
          },
        });
      }
    } catch (e) {
      console.error("[notify] fechamento falhou", e);
    }

    return { ok: true };
  });

export const reopenInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { inventory_id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin, error: roleErr } = await supabase.rpc("current_user_is_admin");
    if (roleErr || !isAdmin) throw new Error("Apenas administrador pode reabrir inventários.");

    const { error: updErr } = await supabase
      .from("inventories")
      .update({ status: "aberto", closed_at: null })
      .eq("id", data.inventory_id);
    if (updErr) throw new Error(`Falha ao reabrir inventário: ${updErr.message}`);

    await supabase.from("logs").insert({
      user_id: userId,
      action: "inventario_reaberto",
      entity: "inventory",
      details: { inventory_id: data.inventory_id },
    });

    return { ok: true };
  });


