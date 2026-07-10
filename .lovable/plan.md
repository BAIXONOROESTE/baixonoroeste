# Plano revisado — Baixo Noroeste Inventário

## 1. Rebrand "Estoque Omie" → "Baixo Noroeste"

Trocar em: `src/routes/auth.tsx` (h1), `src/components/AppShell.tsx` (topo), `src/routes/__root.tsx` (title/og/twitter/description), `src/routes/_authenticated/inventarios.$id.tsx` (label do card vira "Estoque atual"), `public/manifest.webmanifest`, `src/styles.css` (comentário).

## 2. Corrigir PIN + mudar para 6-8 dígitos

**Diagnóstico:** consultar via `read_query` os 2 usuários criados (`auth.users` + `profiles`) e conferir se o slug do profile bate com o email interno `slug@estoque.local`. Suspeita principal: `handle_new_user` grava um slug diferente do que a UI de login usa para montar o email, então o `signInWithPassword` procura conta inexistente.

**Correções:**
- `createUserAsAdmin`: forçar `profiles.slug` = slug usado no email, sobrescrevendo o trigger.
- `auth-helpers.ts` (`signUpWithPin`, `signInWithPin`), `usuarios.tsx`, `auth.tsx`: mínimo de PIN passa a ser **6 dígitos** (máx 8). Placeholders e validações atualizados.
- Botão "Resetar PIN" por linha em `/usuarios` (admin define novo PIN manualmente via `supabaseAdmin.auth.admin.updateUserById`) — funciona **agora**, antes do fluxo por email ficar pronto.

Os 2 usuários existentes que estão com PIN quebrado: eu reseto o PIN deles diretamente via server-side na mesma migração/execução (você me diz que PIN quer, ou eu gero um aleatório e mostro).

## 3. Campo `profiles.email` (email real)

Migração adiciona `profiles.email TEXT UNIQUE NULL`. UI `/usuarios` ganha campo "Email para recuperação" no cadastro e na edição por linha. Obrigatório para admin/supervisor; opcional para contador (contador que não tiver email não recebe notificação nem reset por email).

## 4. Configurações de email do app

Estender tabela `settings` com:
- `notif_from_email` (ex: `notificacoes@baixonoroeste.com.br`)
- `notif_from_name` (ex: `Baixo Noroeste Inventário`)
- `notif_reply_to` (opcional)
- `notif_enabled` (bool master)

Tela `/configuracoes` (admin) ganha seção "Notificações por Email" com esses campos. O `From` real das notificações usa esse valor (o domínio precisa estar no mesmo sender domain verificado no Lovable Emails — vou validar isso na hora de enviar).

## 5. Infra Lovable Emails

- Diálogo `presentation-open-email-setup` para configurar domínio `notificacoes.baixonoroeste.com.br` (ou o subdomínio que você escolher — o Lovable delega via NS records na Hostinger).
- `email_domain--setup_email_infra` (queues, cron, tabelas de log/suppression).
- `email_domain--scaffold_transactional_email` (rotas send/preview/unsubscribe).
- `email_domain--scaffold_auth_email_templates` (para o email de reset de PIN).
- Templates React Email em `src/lib/email-templates/`:
  - `count-closed-notifier.tsx` — vai para admins/supervisores
  - `count-closed-confirmation.tsx` — vai para o contador
  - `loss-recorded-notifier.tsx` — perda/quebra
  - `pin-reset.tsx` — reset de senha
- `registry.ts` atualizado.
- Helper `src/lib/email/send.ts`.

## 6. Emails de notificação ao fechar contagem / perda

Disparo nos 3 pontos:
- `close-requests.functions.ts` → `approveCloseRequest`
- `inventarios.$id.tsx` → fechamento direto por supervisor/admin
- `LossModal` → gravação de perda

Conteúdo do email para admins/supervisores:
- Quem contou, família, data/hora
- Tipo: **Contagem de inventário** ou **Perda/Quebra**
- Tabela de produtos processados: SKU, nome, estoque Omie anterior, contado, diferença absoluta, diferença %
- **% de diferença total do inventário** = Σ |diferença| / Σ estoque_anterior × 100
- Link direto: `https://<seu-dominio>/inventarios/$id` ou `/perdas`

Email para o contador: resumo simples confirmando o processamento.

## 7. Fluxo público "Esqueci meu PIN"

- Migração: tabela `pin_reset_tokens` (id, user_id, token único, expires_at 30 min, used_at).
- Server fn `requestPinReset` (público): recebe email → busca `profiles.email` → gera token → dispara email com link `https://<dominio>/resetar-pin/$token`.
- Rota pública `/resetar-pin/$token`: valida token, pede novo PIN (6-8 dígitos), server fn `resetPinWithToken` usa service role para trocar a senha e marca token como usado.
- Botão "Esqueci meu PIN" na tela `/auth`, abaixo dos avatares.
- **Backup para admin sem email:** botão "Entrar como admin com PIN mestre" na `/auth` — segundo admin/supervisor pode logar e resetar. Alternativa: procedimento documentado usando o **próprio botão "Resetar PIN"** de outro admin (todo sistema com admins tem redundância assumindo pelo menos 2 admins). Se você tem só 1 admin, o caminho de recuperação é o email de reset — por isso o email do admin é obrigatório.

## 8. Segurança

Rodar `security--run_security_scan` no fim e corrigir tudo que aparecer:
- Grants faltando em tabelas novas (`pin_reset_tokens`, `notification_outbox`, `close_requests`).
- Policies restritas: `pin_reset_tokens` sem SELECT público (só service role); `profiles.email` visível só para o próprio user e para admins; `notification_outbox` só admin.
- Funções sem `search_path` corrigidas.
- Confirmar RLS em todas as tabelas novas.

## 9. Migração para subdomínio na Hostinger

**Passos que VOCÊ executa** (te dou o passo-a-passo em tela):

1. No Lovable: clicar **Publish** para gerar o `.lovable.app`.
2. Project Settings → Domains → **Connect Domain** → digitar `inventario.baixonoroeste.com.br` (ou o nome que preferir).
3. Lovable mostra os registros DNS a criar.
4. No painel da Hostinger → **Domínios → baixonoroeste.com.br → DNS/Nameservers → Gerenciar registros DNS**, adicionar:
   - Registro **A** ou **CNAME** (o que o Lovable pedir) para `inventario` apontando ao IP/host do Lovable.
   - Registro **TXT** `_lovable.inventario` com o valor de verificação.
5. Aguardar propagação (até algumas horas; normalmente < 30 min na Hostinger). SSL é automático.

**Para o email `notificacoes@baixonoroeste.com.br`:**

- O **envio** dos emails de app (transacionais) é feito pelo Lovable Emails a partir de um **subdomínio delegado** (`notificacoes.baixonoroeste.com.br` ou similar) — na Hostinger você troca os NS desse subdomínio para os que o Lovable indicar.
- Isso **não conflita** com o email `notificacoes@baixonoroeste.com.br` que você usa no Hostinger Email/Titan (que fica no domínio raiz `baixonoroeste.com.br`).
- Se você quiser que o From apareça literalmente `notificacoes@baixonoroeste.com.br` (domínio raiz, sem subdomínio), aí é preciso configurar SPF/DKIM/DMARC no domínio raiz sem quebrar seu Hostinger Email — mais complicado e exige análise dos MX/SPF atuais. Recomendo usar `notificacoes@notificacoes.baixonoroeste.com.br` OU criar um alias visual (`Baixo Noroeste <notificacoes@baixonoroeste.com.br>` com envelope em outro domínio).

**Vou te guiar em tempo real** quando você chegar em cada passo do Hostinger — me mostra a tela e eu digo o que preencher.

## Ordem de execução

1. Rebrand + PIN mínimo 6 dígitos + botão "Resetar PIN".
2. Diagnóstico + reset dos 2 usuários quebrados.
3. Migração `profiles.email` + campo na UI + settings de notificação.
4. Setup Lovable Emails (aqui você entra no diálogo do domínio).
5. Templates + gatilhos (fechamento/perda).
6. Fluxo público de reset por email.
7. Security scan + correções.
8. Guia passo-a-passo do subdomínio na Hostinger.

## Fora de escopo

- Twilio/WhatsApp (mantido desligado como combinado).
- Marketing/newsletter.
- Realtime em pedidos pendentes.
- Reconfigurar email principal `@baixonoroeste.com.br` no Hostinger Email/Titan.
