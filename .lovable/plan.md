## 1. Contagem às cegas (blind count)

Esconder o estoque esperado até o contador salvar. Mudanças em `src/routes/_authenticated/inventarios.$id.tsx`:

- **Lista de produtos**: remover `Est.: X` do subtítulo antes de contar. Continuar mostrando ✓ verde (correto) e ⚠️ amarelo (divergência) — só o número esperado fica oculto.
- **Modal `CountForm`**: esconder o card "Estoque atual" e a prévia de diferença enquanto o usuário digita. Só mostrar o resultado (bate / diferença de X unidades / Δ R$) **depois** de salvar, na tela seguinte (ou revelar o card após submit).
- Supervisor/admin continuam vendo o estoque na tela de detalhe do item já contado.

## 2. Corrigir erro Omie "Valor deve ser diferente de zero"

`src/lib/omie.server.ts` → `ajustarEstoqueOmie` envia `valor: 0`. A Omie exige valor unitário > 0 em `IncluirAjusteEstoque`.

- Passar `valor_unitario` como parâmetro novo.
- Em `pushCountToOmie` e no loop de `closeInventory` (src/lib/omie.functions.ts), enviar `valor_unitario: Number(item.unit_cost) || Number(item.product.cost) || 0.01` (fallback mínimo para custo zerado, evitando o erro).

## 3. Segurança — fechar auto-cadastro

**Crítico 1 e 2**: `signUpWithPin` chama `supabase.auth.signUp` direto do navegador. Qualquer visitante pode criar conta `contador` e ler todo o catálogo.

- Criar server function `bootstrapFirstAdmin` (sem middleware de auth) que:
  - verifica `SELECT count(*) FROM user_roles` = 0 no server (usando `supabaseAdmin`);
  - se vazio, cria o usuário via `supabaseAdmin.auth.admin.createUser` com role admin;
  - caso contrário, rejeita.
- Reescrever `FirstAdmin` em `src/routes/auth.tsx` para chamar essa server fn.
- Remover `signUpWithPin` de `src/lib/auth-helpers.ts` (não é mais usado por lugar nenhum — criação de novos usuários já passa pelo `createUserAsAdmin`).
- Desativar sign-ups públicos no Supabase Auth (via `supabase--configure_auth`, `disable_signup: true`).

**Warning 3**: `profiles.phone` visível a qualquer autenticado.

- Nova migração: substituir a policy "everyone signed-in reads profiles" por duas:
  - `SELECT` sem `phone`/`email` via **view** `public.profiles_public` (`security_invoker=on`) exposta a `authenticated`.
  - Policy na tabela base `profiles`: `SELECT USING (auth.uid() = id OR current_user_is_admin())` — só o próprio usuário ou admin lê a linha completa.
- Atualizar `useProfile` e telas que listam funcionários (`/auth`, ranking, etc.) para consumir `profiles_public` quando só precisa de `full_name/slug/avatar_color`. `/usuarios` (admin) continua lendo `profiles`.

## Arquivos afetados

- `src/routes/_authenticated/inventarios.$id.tsx` — blind count UI
- `src/lib/omie.server.ts` — parâmetro `valor_unitario`
- `src/lib/omie.functions.ts` — passar unit_cost para `ajustarEstoqueOmie`
- `src/lib/auth-helpers.ts` — remover `signUpWithPin`
- `src/lib/bootstrap.functions.ts` — nova server fn `bootstrapFirstAdmin`
- `src/routes/auth.tsx` — `FirstAdmin` chama a nova fn
- Nova migração SQL: view `profiles_public` + policies + grants
- `src/hooks/useProfile.ts` e telas que listam nomes — trocar fonte para `profiles_public` onde possível
- Chamar `supabase--configure_auth` para `disable_signup: true`

## Fora do escopo

- Fluxo de reset de PIN por email, migração Hostinger, notificações por email (fases posteriores já planejadas).
