# Fase 1 — Fluxo de conferência, recontagem e ajuste

Escopo confirmado: fluxo completo de validação + webhook n8n. WhatsApp fica **por conta do seu fluxo no n8n** (o app dispara os eventos; o n8n envia). Notificações diretas do app continuam por e-mail.

## 1. Banco de dados (uma migração)

**`inventories`** — novos campos:
- `status` expandido: `pendente`, `em_andamento`, `concluida`, `pendente_validacao`, `divergencia`, `recontagem_solicitada`, `ajuste_solicitado`, `recontagem_enviada`, `aguardando_validacao`, `aprovada`, `reprovada` (mantém `aberto`/`fechado` como aliases legados).
- `type`: adiciona `'personalizado'` (mantém `total`/`familia`).
- `assigned_counter_id uuid`, `assigned_supervisor_id uuid`, `assigned_admin_id uuid` (FK profiles).
- `deadline_at timestamptz`, `notes text`, `tolerance_pct numeric default 0`.

**Novas tabelas:**
- `inventory_families(inventory_id, family_id)` — N famílias por inventário personalizado.
- `inventory_products(inventory_id, product_id)` — N produtos escolhidos manualmente.
- `count_item_history(id, count_item_id, inventory_id, product_id, quantity_before, quantity_counted, difference, action, actor_id, notes, created_at)` — snapshot a cada contagem/ajuste/recontagem.
- `count_item_reviews(id, count_item_id, action['aprovar'|'recontagem'|'ajuste'|'aprovar_parcial'|'reprovar'], reason, deadline_at, reviewer_id, created_at)` — decisão do supervisor/admin.
- `count_items`: adiciona `needs_recount boolean`, `needs_adjust boolean`, `round int default 1`, `reviewer_note text`.

**`settings`** — novos campos: `n8n_webhook_url text`, `n8n_webhook_secret text`, `tolerance_pct_default numeric`.

RLS + GRANTs padrão (authenticated + service_role); histórico só leitura para authenticated.

## 2. Server functions novas (`src/lib/inventory-flow.functions.ts`)

- `createInventory` — cria inventário com famílias/produtos/responsáveis/prazo/observações + dispara `tarefa_criada`.
- `submitForValidation` — colaborador envia; muda para `pendente_validacao`; dispara `tarefa_concluida`.
- `reviewCountItems({ inventory_id, decisions[] })` — supervisor/admin decide item a item (aprovar / recontagem / ajuste), grava em `count_item_reviews`, marca `needs_recount`/`needs_adjust` e atualiza status do inventário. Dispara `recontagem_solicitada` / `ajuste_solicitado`.
- `submitRecountOrAdjust` — colaborador reenvia; snapshot em `count_item_history`; muda para `aguardando_validacao`; dispara `recontagem_enviada`.
- `approveInventory` — aprovação final; dispara `tarefa_aprovada`; empurra ao Omie se `omie_update_mode='encerramento'`.
- Cada mutação também grava em `count_item_history` e `logs`.
- Permissões via `has_role`: só admin/supervisor podem aprovar/recontar/ajustar; colaborador só edita itens marcados.

## 3. Webhook n8n (`src/lib/n8n.server.ts`)

- Helper `fireN8nEvent(evento, payload)` — lê URL/secret de `settings`, POST JSON, HMAC opcional no header `X-Signature`, timeout 5s, falha silenciosa + log.
- Eventos: `tarefa_criada`, `tarefa_concluida`, `divergencia_encontrada`, `recontagem_solicitada`, `ajuste_solicitado`, `recontagem_enviada`, `tarefa_aprovada`.
- Payload inclui: `evento`, `tarefa_id`, `tarefa_nome`, `responsavel {nome, email, telefone}`, `supervisor`, `admin`, `itens_divergentes[]`, `motivo`, `deadline`.
- Configuração da URL na tela `Configurações` (existente) — dois campos novos.

## 4. E-mails (templates novos em `src/lib/email-templates/`)

- `task-assigned.tsx` — colaborador ao ser designado.
- `recount-requested.tsx` — colaborador (itens + motivo + prazo).
- `adjustment-requested.tsx` — colaborador (itens + motivo).
- `revalidation-needed.tsx` — supervisor/admin quando o colaborador reenvia.
- `task-approved.tsx` — todos os envolvidos.
- Reaproveita `count-completed` para divergências (já existe).

## 5. UI

**Nova criação de inventário** (`inventarios.index.tsx` — modal expandido):
- Tipo: total / família / **personalizado** (multi-select de famílias + busca de produtos).
- Selects para colaborador, supervisor, admin (lista de profiles filtrada por role).
- Data-limite (`datetime-local`), observações, tolerância %.

**Lista de inventários**:
- Cards de contagem: pendentes, em andamento, divergentes, pendentes de validação.
- Filtros: responsável, supervisor, status, período.
- Destaque visual (borda vermelha) para inventários com `deadline_at < now()` e status ainda aberto.

**Detalhe do inventário** (`inventarios.$id.tsx`):
- Contador vê só itens marcados quando status é `recontagem_solicitada`/`ajuste_solicitado`.
- Para supervisor/admin: nova aba **"Validar"** com tabela: produto, SKU, esperado, contado, Δ, Δ%, obs, badge +/-, filtro (todos/divergentes/aprovados), ações por linha (aprovar/recontar/ajustar) + ação em massa.
- Resumo no topo: nº divergências e Δ R$ total.
- Botão "Aprovar inventário" só habilita quando todas as divergências têm decisão.

**Tela de recontagem/ajuste (colaborador)**:
- Mostra só itens com `needs_recount`/`needs_adjust`, com quantidade original + campo nova quantidade + motivo do supervisor visível.
- Botão "Enviar para nova validação".

**Histórico de auditoria** — painel expansível no detalhe mostrando entradas de `count_item_history` + `count_item_reviews` + `logs` cronologicamente.

## 6. Segurança / consistência

- Todas as server fns usam `requireSupabaseAuth` + check `has_role`.
- Trigger em `count_items` para detecção automática de divergência considerando `tolerance_pct` do inventário.
- Não permite `approveInventory` se existir count_item divergente sem `count_item_reviews`.

## Fora desta fase (fica pronto para fase 2)

- WhatsApp direto pelo app (será via n8n).
- Aprovar via link mágico por e-mail (o app já tem `aprovar.$token.tsx` — mantido como está).

## Ordem de execução

1. Migração (schema + RLS + grants).
2. `n8n.server.ts` + campos em `settings` + tela de config.
3. Server functions de fluxo.
4. Templates de e-mail.
5. UI: criação → validação → recontagem/ajuste → histórico.
6. Testar fluxo end-to-end no preview autenticado (Playwright).
