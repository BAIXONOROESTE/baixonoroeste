import { createClient } from '@supabase/supabase-js';

const INVS = [
  { id: '579d8b94-14d8-4567-b8c0-b8ace86d7d7c', name: 'Contagem — CERVEJA' },
  { id: '3bca669b-af10-41bf-a1e1-9f5b647b9a27', name: 'Contagem — PEPSICO_SALGADOS' },
  { id: 'b8e56c31-88e2-4547-ba13-8b10853dfb8a', name: 'Contagem — BEBIDA DA FRUTA' },
];

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: {
    fetch: (input, init) => {
      const h = new Headers(init?.headers);
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if ((key.startsWith('sb_')) && h.get('Authorization') === `Bearer ${key}`) h.delete('Authorization');
      h.set('apikey', key);
      return fetch(input, { ...init, headers: h });
    },
  },
});

async function omieRequest({ endpoint, call, param }) {
  const body = { call, app_key: process.env.OMIE_APP_KEY, app_secret: process.env.OMIE_APP_SECRET, param: [param] };
  const res = await fetch(`https://app.omie.com.br/api/v1/${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { throw new Error(`resp inválida: ${text.slice(0,200)}`); }
  if (!res.ok || json?.faultstring) throw new Error(`Omie: ${json?.faultstring ?? `HTTP ${res.status}`}`);
  return json;
}

async function ajustar({ codigo_produto, quantidade, observacao, valor_unitario }) {
  const tipo = quantidade >= 0 ? 'ENT' : 'SAI';
  const valor = Number.isFinite(valor_unitario) && valor_unitario > 0 ? valor_unitario : 0.01;
  const fmt = (d) => d.toLocaleDateString('pt-BR');
  const today = new Date();
  const attempt = (dateStr) => omieRequest({
    endpoint: 'estoque/ajuste/', call: 'IncluirAjusteEstoque',
    param: { codigo_local_estoque: 0, id_prod: codigo_produto, data: dateStr, tipo,
      quan: Math.abs(quantidade), valor, obs: observacao, origem: 'AJU', motivo: 'INV' },
  });
  try { return await attempt(fmt(today)); }
  catch (e) {
    if (!/Data do Movimento/i.test(e.message)) throw e;
    for (let i = 1; i <= 3; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      try { return await attempt(fmt(d)); } catch (e2) { if (!/Data do Movimento/i.test(e2.message)) throw e2; }
    }
    throw e;
  }
}

let totalInv = 0, totalOk = 0, totalFail = 0, totalUnits = 0, totalValue = 0;

for (const inv of INVS) {
  const { data: pending, error } = await supabase
    .from('count_items')
    .select('id, difference, unit_cost, financial_diff, product:products(omie_id, name)')
    .eq('inventory_id', inv.id).eq('status', 'divergencia');
  if (error) { console.log(`ERR fetch ${inv.name}: ${error.message}`); continue; }
  if (!pending?.length) { console.log(`skip ${inv.name}: sem divergências`); continue; }

  console.log(`\n=== ${inv.name} (${pending.length} itens) ===`);
  let invOk = 0, invFail = 0;
  for (const item of pending) {
    const diff = Number(item.difference);
    if (diff === 0) { console.log(`- skip ${item.product.name}: diff=0`); continue; }
    try {
      const resp = await ajustar({
        codigo_produto: Number(item.product.omie_id),
        quantidade: diff,
        observacao: `Fechamento retroativo: ${inv.name}`,
        valor_unitario: Number(item.unit_cost) || 0,
      });
      await supabase.from('count_items').update({
        status: 'atualizado', omie_updated_at: new Date().toISOString(), omie_response: resp,
      }).eq('id', item.id);
      invOk++;
      totalUnits += Math.abs(diff);
      totalValue += Math.abs(Number(item.financial_diff) || 0);
      console.log(`OK ${item.product.name} (${diff})`);
    } catch (e) {
      invFail++;
      console.log(`ERR ${item.product.name}: ${e.message}`);
      await supabase.from('logs').insert({
        action: 'omie_ajuste_erro_retro', entity: 'count_item',
        details: { id: item.id, erro: e.message, inventory_id: inv.id },
      });
    }
  }
  totalInv++;
  totalOk += invOk;
  totalFail += invFail;
  console.log(`  → ok=${invOk} fail=${invFail}`);
}

console.log(`\n============ RESUMO ============`);
console.log(`Inventários processados: ${totalInv}`);
console.log(`Itens ajustados: ${totalOk}`);
console.log(`Falhas: ${totalFail}`);
console.log(`Unidades movimentadas: ${totalUnits}`);
console.log(`Valor financeiro |Δ|: R$ ${totalValue.toFixed(2)}`);
