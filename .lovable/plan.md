# Revisão da Fase 1 + Plano da Fase 2

## Status da Fase 1 (revisão)

Já entregue e funcionando:
- Novos status de inventário (`pendente`, `divergencia`, `recontagem_solicitada`, `ajuste_solicitado`, `aguardando_validacao`, `aprovada`, `reprovada`, etc.).
- Tipo `personalizado` + tabelas `inventory_families` / `inventory_products`.
- Tabelas de auditoria `count_item_history` e `count_item_reviews`.
- Server functions do fluxo: `createInventoryTask`, `submitForValidation`, `reviewCountItems`, `submitRecountOrAdjust`, `approveInventoryTask`.
- Webhook n8n (`src/lib/n8n.server.ts`) com HMAC opcional + templates de e-mail (task-assigned, recount, adjustment, revalidation, approved).
- UI: `ValidationPanel`, `RecountAdjustView`, criação personalizada, contadores por status na lista, deadline destacada.
- Paginação de produtos por família na tela de contagem.

Pendências identificadas ao revisar:
1. **Sem autosave offline real** — hoje o `CountForm` grava no Supabase no clique de "Salvar"; se cair a internet perde o valor digitado; não há fila local.
2. **Recusa sem formulário estruturado** — `reviewCountItems` recebe decisões item a item, mas não há um "Recusar inventário" com motivo obrigatório + seleção em massa + prazo. Também não há um status `reprovada` amigável no fluxo (só via `approveInventoryTask({approved:false})`).
3. **Sync Omie manual** — só roda no botão "Sincronizar Omie" (admin). Não abre sozinho, não roda em background, não roda ao entrar numa tarefa.
4. **Sem indicador de conexão / última sync** na UI.
5. **Notificação de recusa** ainda usa e-mail; falta disparar evento n8n `inventory.rejected` com produtos divergentes + prazo para WhatsApp.

## Fase 2 — Escopo

### 1. Autosave + Offline (contagem)

Banco:
- Nada novo — `count_items` já tem unique `(inventory_id, product_id)` que serve de chave de idempotência.
- Adicionar coluna `client_mutation_id uuid` em `count_items` para dedupe explícito da fila local.

Cliente:
- Novo hook `useOfflineCountQueue(inventoryId)` em `src/hooks/useOfflineCountQueue.ts`:
  - Persiste mutações em `IndexedDB` (via `idb-keyval`, leve, sem service worker).
  - Cada mutação: `{id, inventory_id, product_id, quantity, unit_cost, quantity_before, created_at, synced_at?}`.
  - Autosave dispara em `onChange` do input com debounce 400ms (rascunho) + no blur/enter (commit).
  - Flush loop: sempre que `navigator.onLine` for true e houver pendências → upsert em lote em `count_items` com `onConflict: "inventory_id,product_id"`.
  - Ao sucesso, marca `synced_at` local e invalida a query `count-items`.
- Refatorar `CountForm` para chamar o hook em vez do `supabase.from(...).upsert` direto. Manter comportamento "às cegas" (revela após salvar/sync).
- Badge global em `AppShell`: `Online • Sincronizado` / `Offline • N pendentes` / `Sincronizando…` / última sync `hh:mm`.
- Toast discreto "Rascunho salvo" no autosave (throttled).
- Ao abrir uma tarefa com pendências locais → banner "Retomar contagem (N itens não sincronizados)" + botão para forçar flush.
- Status visual "Rascunho" na lista de inventários quando existe fila local para aquele id.

Registro:
- Ao sincronizar com sucesso, gravar em `logs` (action=`contagem_sincronizada`, details com contagem de itens e delay).

### 2. Formulário obrigatório de recusa

Banco (migração):
- Nova tabela `inventory_rejections`:
  - `inventory_id`, `rejected_by`, `reason text not null`, `notes text`, `recount_deadline timestamptz`, `product_ids uuid[] not null` (produtos marcados p/ recontagem), `created_at`.
  - Grants + RLS: só admin/supervisor insere; leitura para participantes do inventário.
- Trigger/valida no server fn: bloqueia `approveInventoryTask({approved:false})` sem registro correspondente.

Server function nova em `src/lib/inventory-flow.functions.ts`:
- `rejectInventoryTask({ inventory_id, reason, notes?, recount_deadline?, product_ids[] })`:
  - Verifica role admin/supervisor via `has_role`.
  - Insere `inventory_rejections`.
  - Marca `count_items.needs_recount=true` para os `product_ids`, cria reviews `needs_recount` e histórico.
  - Muda `inventories.status = 'recontagem_solicitada'` e `deadline_at = recount_deadline` quando informado.
  - Dispara `fireN8nEvent('inventory.rejected', { inventario, motivo, prazo, itens_para_recontar: [...] })` (para WhatsApp via n8n).
  - Envia e-mail template `recount-requested` (já existe).
  - Grava em `logs`.

UI:
- No `ValidationPanel`, botão "Recusar inventário" abre `RejectInventoryDialog`:
  - Campo motivo (required, textarea).
  - Multi-select dos itens divergentes (pré-marca todos com `status='divergencia'`).
  - Campo observações e date-time picker para prazo.
  - Validação: pelo menos 1 produto + motivo preenchido.
- Botão atual de "reprovar" item-a-item continua para casos simples.

### 3. Tela de recontagem (colaborador)

O `RecountAdjustView` já existe — melhorar:
- Cabeçalho mostra `motivo` + `notes` + `recount_deadline` vindos do último `inventory_rejections`.
- Lista somente itens com `needs_recount=true` (query já filtra).
- Mostra `quantity_counted` anterior (rótulo "Contagem anterior") + novo input.
- Botão "Enviar recontagem" → `submitRecountOrAdjust` (já existente) que grava em `count_item_history` (round++) e devolve para `aguardando_validacao`.

### 4. Histórico

- `count_item_history` já cobre. Adicionar view/panel "Histórico" na tela do inventário (admin/supervisor): quem recusou, quando, motivo, produtos, rounds, sync events (via `logs`).

### 5. Sincronização automática Omie

- Renomear `syncFamiliesAndProducts` para permanecer + novo server fn `syncProductsIncremental` (busca só ativos + delta por `updated_at` quando disponível; caso Omie não retorne, faz full sync leve).
- Novo hook `useAutoSync()` em `AppShell`:
  - Roda no mount (com debounce se última sync <60s).
  - Roda quando a rota casa `/inventarios/$id` (antes de renderizar contagem).
  - Interval configurável em `settings.auto_sync_interval_seconds` (default 300s).
  - Escuta `visibilitychange` → refaz se ficou >5min oculto.
- **Nunca sobrescreve** count_items — apenas atualiza `products.stock_omie/cost/active`.
- Última sync exibida no `AppShell` (mesmo badge do offline).
- Remove necessidade do botão manual (mas botão continua disponível para admin forçar).

### 6. Indicadores

Componente `<SyncStatusBadge/>` no header do `AppShell`:
- Estados: `online-synced`, `syncing`, `offline`, `error`, com timestamp da última sync bem-sucedida.
- Toast quando `offline → online` reconciliação começa e termina.

### 7. Segurança / consistência

- `rejectInventoryTask` e `approveInventoryTask` já usam `requireSupabaseAuth`; reforçar `has_role('admin'|'supervisor')`.
- Bloquear approve quando `count_items.needs_recount = true` existe (SQL check no início do handler).
- Colaborador só edita quando `inventory.status IN ('pendente','em_andamento','recontagem_solicitada','ajuste_solicitado')` e (`round=0` ou `needs_recount=true` para o item). Já hoje é UI-side; adicionar policy RLS coerente.

## Ordem de execução

1. Migração: `client_mutation_id`, `inventory_rejections`, RLS/GRANT, guarda em approve.
2. Hook offline + refactor do `CountForm` + badge de sync.
3. Server fn `rejectInventoryTask` + `RejectInventoryDialog` + evento n8n `inventory.rejected`.
4. Auto-sync Omie (`useAutoSync`) + `SyncStatusBadge` + remoção da dependência do botão manual.
5. Painel de histórico consolidado.
6. Testes ponta a ponta: contagem offline → volta online → sync; recusa → notificação → recontagem → aprovação.

## Fora de escopo desta fase

- WhatsApp direto no app (continua via n8n).
- Service Worker / PWA install (usaremos IndexedDB puro; PWA fica para depois se pedirem "instalar app").
- Reescrita da tela de contagem — apenas troca a camada de persistência.

Confirma para eu partir para implementação?
