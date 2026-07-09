## Notificações WhatsApp para supervisores/admins

### Provedor recomendado: Twilio WhatsApp

Motivos:
- Já é conector oficial da Lovable → sem gerenciar `Account SID`/`Auth Token` manualmente, sem SDK.
- Sandbox gratuito para testar em minutos (você manda um "join <palavra>" pro número da Twilio e já recebe).
- Depois é só trocar o número para um WhatsApp Business aprovado, sem mexer no código.

Passos que você vai precisar fazer (fora do código):
1. Criar conta grátis em twilio.com.
2. Ativar o sandbox de WhatsApp (Console → Messaging → Try it out → Send a WhatsApp message).
3. Cada supervisor/admin manda "join <palavra-do-sandbox>" pro número Twilio pelo WhatsApp — só assim o sandbox pode enviar pra eles (regra da Meta).
4. Conectar o Twilio pelo painel de Connectors da Lovable (eu disparo o fluxo).

Quando quiser ir pra produção: número Business verificado + template aprovado pela Meta. O código não muda.

### O que vou construir

**1. Telefone dos usuários**
- Migração: adicionar coluna `phone TEXT` em `profiles` (formato E.164, ex: `+5511999999999`).
- Tela **Usuários**: campo "WhatsApp" ao criar/editar. Obrigatório pra supervisor/admin.

**2. Fluxo de aprovação de fechamento**
- Hoje `closeInventory` só supervisor/admin pode chamar. Vira:
  - Contador clica "Fechar inventário" → cria linha em nova tabela `close_requests` (`inventory_id`, `requested_by`, `status: pendente|aprovado|recusado`, `approved_by`, `token`) e dispara WhatsApp para todos os supervisores/admins com telefone cadastrado.
  - Mensagem: *"Contador Fulano pediu fechamento do inventário X (12 divergências, Δ R$ -230). Aprovar: https://app/aprovar/<token>"*
  - Link abre página protegida `/aprovar/$token`: supervisor loga (se ainda não logado), vê resumo (itens contados, divergências, Δ R$), botões **Aprovar** / **Recusar**. Aprovar chama `closeInventory` existente.
  - Se o usuário que solicitou já for supervisor/admin, pula a aprovação e fecha direto (como hoje).

**3. Alerta de divergência**
- Hook no salvamento de `count_items`: quando um item é criado com `status = 'divergencia'` (só na criação, não em edições), enfileira uma notificação.
- Pra não spammar: agrupar por inventário em janelas de 5 min. Uma mensagem por janela: *"Inventário X — 3 novas divergências detectadas por Fulano. Ver: https://app/inventarios/<id>"*.
- Implementado com uma tabela `notification_outbox` + server function `dispatchPendingNotifications` chamada no fim do save (dedup por `inventory_id` + timestamp).

**4. Server route de envio**
- `src/routes/api/internal/notify.ts` (ou server fn `sendWhatsApp`) que:
  - Recebe `{to, message}`.
  - Faz POST no gateway Twilio (`/Messages.json`) com `From = whatsapp:<numero-sandbox-ou-business>`, `To = whatsapp:<phone-do-perfil>`.
  - Loga sucesso/erro em `logs`.
- Número `From` fica em secret `TWILIO_WHATSAPP_FROM` (peço via `add_secret` depois do sandbox estar pronto).

### Ordem de execução
1. **Agora**: eu preparo migração (`profiles.phone`, `close_requests`, `notification_outbox`) e os componentes de UI.
2. **Você**: cria conta Twilio + ativa sandbox + me passa OK pra rodar `standard_connectors--connect twilio`.
3. **Eu**: conecto Twilio, peço secret `TWILIO_WHATSAPP_FROM`, ligo o envio real.
4. **Você**: cadastra telefone dos supervisores/admins na tela de Usuários, cada um manda "join <palavra>" pro Twilio, e testamos.

### Fora de escopo (por ora)
- Recebimento de mensagens do WhatsApp (webhook inbound).
- Template aprovado pela Meta (só necessário fora do sandbox).
- Rate limit customizado além do agrupamento por 5 min.
