# Checklists — Entrega 2 de 2: Wizard `/checklists/$runId`

Substitui o stub atual (`src/routes/_authenticated/checklists.$runId.tsx`) pelo wizard item-a-item completo. Nenhum outro arquivo é alterado.

## Query única do run
```
select id, status, started_by, submitted_at, template_id,
       template:checklist_templates(name, scheduled_time),
       items:checklist_run_items(
         id, done, done_by, done_at, observacao, review_status,
         template_item:checklist_template_items(title, orientacao, evidence_required, position),
         evidence:checklist_run_item_evidence(id, evidence_path, evidence_type, created_by, created_at)
       )
where id = $runId
```
Itens ordenados client-side por `template_item.position`.

## Estado local
- `currentIndex` (useState, 0) — item ativo do wizard.
- `expanded` — toggle "Ver mais +" da orientação.
- `rejectingId` + `rejectReason` — controla o modo "informar justificativa" na aprovação.
- Signed URLs das evidências geradas sob demanda com `supabase.storage.from('checklist-evidence').createSignedUrl(path, 3600)`, cacheadas via `useQuery(['sig', path])`.

## Determinação do modo
- `execucao` — `run.status='em_andamento'` E (`uid === run.started_by` OU `role in ('admin','supervisor')`).
- `aprovacao` — `run.status='aguardando_aprovacao'` E `role in ('admin','supervisor')`.
- `leitura` — qualquer outro caso.

## Layout
- Header (dentro do main; AppShell já renderiza back/menu): nome do template · "Progresso 40%" · `<Progress />`.
- Pill "Item X de N" + Badge "Obrigatório" quando `evidence_required`.
- Card do item: título · disclosure "Ver mais +" com `orientacao` · corpo específico do modo.
- Rodapé sticky com "Anterior" / "Próximo". No último item o "Próximo" muda:
  - Execução → "Enviar para aprovação".
  - Aprovação → "Concluir revisão".
  - Leitura → apenas "Anterior/Próximo".

## Modo execução
- Botões lado a lado "Não Feito" (outline destructive) / "Feito" (outline emerald). O selecionado ganha fill. Cada clique `useMutation` faz `update` em `checklist_run_items` (`done`, `done_by=uid`, `done_at=now()`). Toast + invalidate.
- Seção **Evidências**:
  - Grid de chips: ícone `Image` (foto) / `Video` (vídeo) + nome curto do path + botão de remover (apenas para dono ou sup/admin, conforme RLS).
  - Botão "+" abre `<input type="file" ref hidden accept="image/*,video/*" capture="environment">`.
  - Ao selecionar:
    1. `type = file.type.startsWith('video') ? 'video' : 'foto'`.
    2. `path = ${uid}/${runItemId}/${Date.now()}.${ext}`.
    3. `supabase.storage.from('checklist-evidence').upload(path, file, { contentType: file.type })`.
    4. `insert` em `checklist_run_item_evidence`.
    5. Invalidate + toast. Em erro de upload, mostra toast e não insere linha.
- Textarea "Observação" com `defaultValue` da observação atual. `onBlur` só faz update se mudou.

## Modo aprovação
- Mostra orientação, `observacao` do colaborador (se houver) e evidências renderizadas:
  - `foto` → `<img>` com `object-cover` + click para abrir em nova aba.
  - `video` → `<video controls>` com o signed URL.
- Botões "Reprovar" / "Aprovar" abaixo do item:
  - "Aprovar" → `insert` em `checklist_run_item_reviews { action:'aprovar' }` + `update` `review_status='aprovado'`.
  - "Reprovar" → expande um `Textarea` de justificativa. Botão "Confirmar reprovação" fica disabled enquanto vazio. Ao confirmar → `insert` `{ action:'reprovar', reason }` + `update` `review_status='reprovado'`.
- Toast + invalidate após cada ação.

## Modo leitura
- Mostra título, orientação (aberta), observação, evidências (mesmo render de aprovação), status `done` e `review_status`. Sem botões de ação.

## Finalização

### "Enviar para aprovação" (execução, último item)
- Habilitado quando `items.every(i => i.done)` **e** todo item com `template_item.evidence_required=true` tem `evidence.length >= 1`.
- Se desabilitado, tooltip explica o que falta (ex: "3 itens sem marcação" ou "2 itens obrigatórios sem evidência").
- Confirma via `AlertDialog`. Update `checklist_runs { status:'aguardando_aprovacao', submitted_at: now() }`.
- Toast + `queryClient.invalidateQueries(['checklists'])` + `navigate({ to: '/checklists' })`.

### "Concluir revisão" (aprovação, último item)
- Habilitado quando `items.every(i => i.review_status !== 'pendente')`.
- Update `checklist_runs.status = items.some(i => i.review_status === 'reprovado') ? 'reprovado' : 'aprovado'`.
- Toast + invalidate + navigate.

## Errors / notFound
- `errorComponent` com botão "Tentar novamente" chamando `router.invalidate()` + reset.
- `notFoundComponent` simples.

## Toasts
- Sucesso/erro em cada mutation via sonner.

## Fora de escopo
- Não altera schema, triggers, políticas ou o bucket.
- Não mexe em contagem/inventário/ranking.
- CRUD de templates (criar/editar/desativar templates) segue fora — pode virar um Entrega 3 se quiser.
