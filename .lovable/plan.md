
# Sistema de Contagem de Estoque — Omie

App web mobile-first (funciona no celular via navegador, instalável na tela inicial). Backend: Lovable Cloud (Postgres + Auth + Edge Functions). Visual: dark bar/restaurante (#0B0B0F fundo, #F5B301 âmbar, tipografia Outfit + Inter).

## Módulos a construir (nesta ordem)

**1. Fundação**
- Ativar Lovable Cloud.
- Design system dark âmbar em `src/styles.css` (tokens oklch, sem cores hardcoded).
- Layout mobile-first com bottom nav (Início / Contar / Dashboard / Mais).

**2. Autenticação por PIN**
- Admin cria funcionários (nome + PIN 4-6 dígitos). Sistema gera um email interno (`{slug}@estoque.local`) e usa o PIN como senha no Auth (bcrypt do Supabase).
- Tela de login: lista de funcionários (avatares) → tecla o PIN → entra.
- 3 papéis via tabela `user_roles` + enum (`admin`, `supervisor`, `contador`) + função `has_role` SECURITY DEFINER.
- Primeiro usuário criado = admin (seed via migration + tela "criar primeiro admin" se vazio).

**3. Integração Omie**
- Secrets: `OMIE_APP_KEY`, `OMIE_APP_SECRET`.
- Server functions: `syncProducts` (paginado, só ativos), `syncFamilies`, `updateStock` (chama `PosicaoEstoque` / `ajusteestoque`).
- Tabelas espelho: `products`, `families`, `sync_log`. Nunca editadas manualmente pela UI.
- Botão "Sincronizar Produtos" com barra de progresso.

**4. Contagens**
- Tabelas: `inventories` (sessão de contagem), `count_items` (linhas), `losses` (perdas & quebras).
- 3 fluxos: por família, por produto (busca + scanner de código de barras via `@zxing/browser` usando câmera), inventário geral.
- Ao salvar item: grava com usuário/data/hora/qtd anterior/qtd contada/diferença/valor financeiro/status (Correto/Divergência/Atualizado).
- Configuração global "Modo de atualização Omie": Imediato ou No Encerramento.

**5. Perdas & Quebras**
- Ao registrar diferença, botão "Justificar como perda" abre modal com motivo (quebra, vencimento, degustação, consumo interno, desperdício, outro) + observação.
- Baixa é separada da divergência real → ranking dos funcionários fica limpo.

**6. Dashboard**
- Cards: produtos cadastrados, contados, pendentes, divergências, valor R$ das divergências, % concluído, última sync.
- Gráficos com Recharts (barras por família, pizza status, linha de progresso).

**7. Ranking**
- View SQL: `acertos / conferidos * 100` por funcionário/mês.
- Destaque dourado ≥ 90%.

**8. Relatórios**
- Divergências / Inventários / Funcionários / Famílias / Financeiro.
- Export CSV nativo, Excel via `xlsx`, PDF via `jspdf` + `jspdf-autotable`.

**9. Logs**
- Tabela `logs` alimentada por triggers e por chamadas explícitas nas edge functions (login/logout/sync/contagem/update Omie/erros).
- Tela filtro por tipo, usuário, período.

**10. Configurações**
- Modo de atualização Omie, credenciais (mascaradas), lista de motivos de perda editável.

**11. PWA + polish**
- Manifest para instalar no celular.
- Revisão de RLS, seed do primeiro admin, README de uso.

## Detalhes técnicos

**Rotas** (TanStack Start): `/auth` (PIN), `/_authenticated/` (todas as demais), `/contar/familia`, `/contar/produto`, `/contar/geral`, `/inventarios/$id`, `/dashboard`, `/ranking`, `/relatorios`, `/logs`, `/usuarios`, `/configuracoes`.

**RLS**: todas as tabelas ativas. Contador lê tudo mas só edita suas próprias contagens. Supervisor aprova divergências. Admin faz tudo.

**Omie**: chamado via `createServerFn` server-side (nunca do browser — protege as chaves). Rate limit respeitado com fila simples.

**Scanner**: `@zxing/browser` roda 100% no cliente, sem serviço pago.

**Sem serviços pagos**: tudo dentro do Lovable Cloud (que já é grátis para o volume de um bar).

## O que preciso de você depois do "aprovar"

1. Clicar para colar `OMIE_APP_KEY` e `OMIE_APP_SECRET` (formulário seguro — não colar no chat).
2. Definir o nome e PIN do primeiro admin na primeira tela.

Vou construir tudo em sequência sem parar entre módulos, e no final entrego o app funcionando + resumo. Aprovar?
