## Status atual + estabilizar app para teste (WhatsApp fica para depois)

### Onde estamos

Já foi entregue nas mensagens anteriores:
- **Migração aplicada**: `profiles.phone`, tabela `close_requests` (com token, status, `push_to_omie`), tabela `notification_outbox`, policy `anon` para listar perfis ativos (corrigiu o bug da "tela de configuração inicial").
- **Correção do PIN**: sufixo `#estq` no auth → PIN de 4 dígitos volta a funcionar.
- **Sync do estoque real do Omie**: `listarPosicaoEstoque` merge com `stock_omie`; `difference` gerado no banco → ajustes ENT/SAI corretos no fechamento.
- **UI de Usuários**: campo WhatsApp no cadastro + edição por linha, ativa/desativa.
- **Fluxo de fechamento com aprovação**: contador vê "Pedir fechamento", supervisor/admin vê "Fechar inventário". Página pública `/aprovar/$token` com resumo + botões Aprovar/Recusar.
- **Hook de divergência**: ao salvar contagem com status "divergencia" chama `notifyDivergence`.
- **Server fn `sendWhatsApp`**: já implementada com fallback silencioso — sem Twilio configurado, só loga um warn e segue.

### O que quero fazer nesta rodada

Remover qualquer dependência ativa do Twilio para o app rodar 100% limpo em teste. Nenhum warn no console, nenhuma expectativa de notificação. Como não vai ter WhatsApp, o supervisor precisa de outra forma de ver os pedidos de fechamento.

#### 1. Neutralizar WhatsApp sem quebrar o resto
- `src/lib/notify.functions.ts`:
  - `sendWhatsApp` vira stub que só retorna `{ ok: false, skipped: true }` sem tocar em `fetch`, sem `console.warn` ruidoso.
  - `notifyDivergence` vira no-op imediato (`return { ok: true, skipped: "wa_off" }`) — mantém a assinatura, então nada quebra em `inventarios.$id.tsx`.
- `src/lib/close-requests.functions.ts` (`requestCloseInventory`): pula toda a parte de envio, apenas cria o `close_request` e retorna `{ ok, token, sent: 0, targets: 0 }`. Toast do frontend passa a ser "Pedido enviado — aguardando aprovação".

#### 2. Tela para supervisor/admin ver e responder pedidos sem WhatsApp
- Novo card na tela `/inicio` (só para supervisor/admin): **Pedidos de fechamento pendentes** — lista `close_requests` com status `pendente`, mostra inventário, quem pediu, quantas divergências, botão "Abrir" que leva para `/aprovar/$token`.
- Badge simples no menu: contador de pendentes.
- Sem realtime, apenas refetch ao entrar na tela / após responder.

#### 3. Varredura de qualidade

Verificar/ajustar item a item antes de liberar teste:

- **Autenticação**
  - Tela `/auth` volta a listar avatares (policy anon aplicada).
  - PIN 4-8 dígitos aceito no login e no cadastro.
  - Criação de usuário pelo admin com todos os papéis (contador/supervisor/admin) e telefone opcional.
- **Sync Omie**
  - Rodar sync manual, conferir que `stock_omie` bate com o painel do Omie em uns 5 SKUs.
  - Produtos inativos não aparecem em nenhuma tela de contagem (confirmar filtro `inativo != 'S'`).
- **Contagem**
  - Contador conta, valores salvam, `difference` correto (positivo/negativo/zero).
  - Modo "imediato" no `settings`: item com divergência empurra ajuste na hora e vira `atualizado`.
  - Modo "encerramento": nada vai pro Omie até fechar.
- **Fechamento**
  - Como contador: botão "Pedir fechamento" grava close_request pendente, aparece na tela de pendentes do supervisor.
  - Como supervisor: botão "Fechar inventário" fecha direto (fluxo antigo, sem passar por close_request).
  - `/aprovar/$token`: supervisor deslogado vê resumo + CTA de login; logado vê Aprovar/Recusar; após aprovar, inventário fica `fechado` e (se `push_to_omie`) divergências vão pro Omie com log de erro por item.
- **Perdas** (fluxo `LossModal`): grava normalmente, aparece em `/perdas`, não interfere no fechamento.
- **Logs & Ranking**: continuam populando.

#### 4. Diagnóstico automatizado antes de te devolver
- Rodar Playwright em `http://localhost:8080`:
  1. `/auth` → screenshot mostrando pelo menos um avatar.
  2. Login como admin (usar sessão injetada) → `/usuarios` → screenshot com campo WhatsApp.
  3. `/inventarios` → abrir um inventário existente → screenshot.
  4. `/inicio` como supervisor → screenshot do card "Pedidos pendentes" (vazio ok).
- Se qualquer passo falhar, corrijo e repito antes de sinalizar OK.

#### 5. Quando você mandar reativar o WhatsApp
- Rodo `standard_connectors--connect twilio`.
- Peço secret `TWILIO_WHATSAPP_FROM` via `add_secret`.
- Reativo `sendWhatsApp` + `notifyDivergence` + envio em `requestCloseInventory` (basta reverter os stubs, o resto do código já está pronto).

### Fora de escopo desta rodada
- Configurar Twilio.
- Notificações por e-mail como alternativa.
- Realtime nos pedidos pendentes (fica com refetch on focus).
