## Correções

### 1) PIN de 4 dígitos rejeitado ("mínimo 6")

O PIN é usado como senha no Auth, que exige no mínimo 6 caracteres. A tela promete 4 a 8, mas o servidor rebate qualquer PIN < 6.

**Solução:** padronizar o PIN internamente adicionando um sufixo fixo (pepper) antes de mandar para o Auth, para que qualquer PIN de 4+ dígitos vire uma senha ≥ 6 caracteres. Assim mantemos "4 a 8 dígitos" na UX sem mexer na configuração do Auth.

Alteração em `src/lib/auth-helpers.ts`:
- Adicionar constante `PIN_SUFFIX = "#estq"` (fixa, não secreta — só serve para atender o mínimo do Auth).
- Nova função `pinToPassword(pin) => pin + PIN_SUFFIX`.
- `signInWithPin` e `signUpWithPin` passam a mandar `pinToPassword(pin)` no `password`.
- `src/lib/admin-users.functions.ts` (`createUserAsAdmin`): aplicar a mesma transformação ao criar usuários via admin API (`password: data.pin + "#estq"`), mantendo o mínimo de 4 dígitos na validação atual.

Observação: usuários já existentes criados com PIN puro continuam válidos porque só o admin bootstrap foi criado até agora com PIN ≥ 6; contas novas passam a usar o formato com sufixo. Se algum usuário legado com PIN curto existir e não conseguir entrar, o admin pode recriá-lo pela tela de Usuários.

### 2) "Apenas supervisor ou administrador podem enviar ajustes ao Omie" ao salvar contagem

Fluxo: o contador salva um item → `onSaved` dispara `pushCountToOmie` quando o modo é `imediato` → a função exige supervisor/admin e derruba com 403.

O modo imediato é uma configuração do admin: quem estiver contando (inclusive contador) deve conseguir empurrar o ajuste do item que acabou de salvar. A trava de papel deve continuar somente no fechamento em massa e em ações manuais de supervisor.

**Solução em `src/lib/omie.functions.ts` (`pushCountToOmie`):**
- Remover o `current_user_is_supervisor_or_admin`.
- Exigir apenas usuário autenticado (`requireSupabaseAuth` já cobre) e validar que o `count_item` pertence a um inventário ainda `aberto` e que `counted_by = auth.uid()` OU que o usuário é supervisor/admin. Isso mantém a segurança (contador não empurra ajuste de contagem alheia) sem bloquear o fluxo legítimo.
- `closeInventory` permanece restrito a supervisor/admin (correto).

### Verificação
- Login com PIN de 4 dígitos passa.
- Contador salva item em inventário com `omie_update_mode = imediato` → status vira `atualizado` sem erro de permissão.
- Supervisor/admin fecha inventário normalmente.
