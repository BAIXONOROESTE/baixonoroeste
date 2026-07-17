# Checklists — Entrega 1 de 2: Menu + Tela "Lista do dia"

Escopo desta entrega: link no menu + rota `/checklists` (lista do dia). O wizard `/checklists/$runId` fica para um segundo prompt. Nenhum outro arquivo é alterado.

## 1. `src/components/AppShell.tsx`
- Importar `CheckSquare` de `lucide-react`.
- Adicionar em `drawerLinks` (após "Inventários"): `{ to: "/checklists", label: "Checklists", icon: CheckSquare, roles: ["admin","supervisor","contador"] }`.

## 2. `src/routes/_authenticated/checklists.tsx` (novo)

`createFileRoute("/_authenticated/checklists")` com `head()` ("Checklists · Baixo Noroeste") e `component`. Sem loader; usa `useQuery` direto conforme padrão de `ranking.tsx`/`inventarios.index.tsx`. Também define `errorComponent` e `notFoundComponent` mínimos.

### Data de hoje
`const todayISO = ` a data local formatada `YYYY-MM-DD` (sem UTC shift).

### Header
`"HOJE — quarta-feira, 17 de julho de 2026"` via `Intl.DateTimeFormat('pt-BR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' })`.

### Queries
- **Templates + runs de hoje** (uma query): `checklist_templates` com `active=true`, embed dos runs de hoje e contagem de itens:
  ```
  select id, name, scheduled_time,
         runs:checklist_runs!checklist_runs_template_id_fkey(
           id, status, started_by, submitted_at,
           items:checklist_run_items(id, done)
         )
  from checklist_templates
  where active = true
  ```
  Filtro `run_date = todayISO` aplicado com `.eq` no embed via `filter('runs.run_date', 'eq', todayISO)` (padrão PostgREST). Ordenação client-side: `scheduled_time` asc com nulls no fim, depois `name`.
- **Aprovações pendentes** (só admin/supervisor): `checklist_runs` where `status='aguardando_aprovacao'`, embed do template (name) e do starter (`profiles!checklist_runs_started_by_fkey(full_name)`). Query habilitada só quando `role in ('admin','supervisor')`.

### Renderização
Se `role in ('admin','supervisor')` **e** houver pendências: seção topo "Aguardando minha aprovação" com Cards compactos (nome do template · quem iniciou · data do run) + botão "Ver" (link para `/checklists/$runId`; a rota ainda não existe, então link será desabilitado com `title="Em breve"` — evita quebrar type-safe navigation criando um `<a>` só nesta entrega, ou aparece como texto muted até a Entrega 2). **Decisão:** deixar como `<span>` inerte com badge "abrir na Entrega 2" para não acoplar as duas entregas. (Se preferir usar `<Link>` desde já, avise; requer a rota criada como stub.)

Lista principal — um Card por template:
- Linha 1: hora (ex "08:00" ou "—" se null) · nome do template · badge de status à direita.
- Linha 2: `<Progress value={pct} />` + texto `${done}/${total} itens` (0/0 quando sem run).
- Linha 3: botão de ação.

Regras de badge + botão:
| Situação | Badge | Botão |
|---|---|---|
| Sem run · dentro da janela [-30min, +2h] do `scheduled_time` | "Agora" (accent) | Iniciar |
| Sem run · fora da janela ou sem horário | — | Iniciar |
| Run `em_andamento` | — | Continuar |
| Run `aguardando_aprovacao` | "Aguardando aprovação" | Ver |
| Run `aprovado` | "Finalizado" (verde) | Ver |
| Run `reprovado` | "Reprovado" (vermelho) | Ver |

Janela "Agora": só quando `scheduled_time != null`; comparação em minutos do dia (`now.getHours()*60+minutes`).

### Mutation "Iniciar"
`useMutation` com fluxo:
1. `insert` em `checklist_runs { template_id, run_date: todayISO, started_by: uid, status: 'em_andamento' }` retornando `id`.
2. `select` de `checklist_template_items` do template (todos), ordenado por `position`.
3. `insert` em batch em `checklist_run_items` (`run_id, template_item_id, done:false, review_status:'pendente'`).
4. Toast sucesso; `queryClient.invalidateQueries(['checklists','today'])`; navega para `/checklists/$runId` **quando a rota existir** — nesta entrega, sem rota destino, o botão "Iniciar" fica desabilitado com tooltip "Wizard chega na próxima entrega". (Ou: cria a rota stub agora — ver seção "Decisão a confirmar" abaixo.)

Toast (sonner) em cada mutation para sucesso/erro. `useProfile()` para pegar role e uid.

## Fora de escopo (Entrega 2)
- Rota `src/routes/_authenticated/checklists.$runId.tsx` (wizard item-a-item, upload de evidência, aprovação, submit).
- Uma vez pronta, os botões "Continuar/Ver/Iniciar" desta tela passam a navegar normalmente.

## Decisão a confirmar antes de eu implementar
Nesta entrega os botões de navegação (`Iniciar`, `Continuar`, `Ver`) apontam para `/checklists/$runId` que ainda não existe. Duas opções — me diga qual prefere:
- **(A) Botões desabilitados** com tooltip "Disponível na Entrega 2". Iniciar não cria run ainda. Mais seguro, evita runs órfãos no banco.
- **(B) Criar stub mínimo** `checklists.$runId.tsx` que só mostra "Wizard em construção. runId=X" para os botões já funcionarem e a mutation `Iniciar` já criar o run.

Padrão que sigo se você não responder: **(A)**.
