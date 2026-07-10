## 1. Cadastro de usuários — "Chave administrativa ausente"

**Causa:** em `src/lib/auth-admin.server.ts`, `signServiceRoleJwt()` tenta assinar um JWT ES256 usando `SUPABASE_JWKS`/`SUPABASE_SECRET_KEYS`, mas no Lovable Cloud a `SUPABASE_SERVICE_ROLE_KEY` vem no formato novo `sb_secret_...` (não é JWT de 3 partes) e o JWKS público não contém a chave privada (`d`) necessária para assinar. Resultado: erro em `getSigningJwk`.

**Correção:** As chaves `sb_secret_*` já são aceitas diretamente pelo GoTrue como credencial de service role — não é preciso gerar JWT. Simplificar `auth-admin.server.ts` para:

- Usar `SUPABASE_SERVICE_ROLE_KEY` diretamente como `Authorization: Bearer` e `apikey`.
- Fallback: se por acaso a chave for JWT legado (3 partes), continua funcionando igual.
- Remover todo o código de JWKS / `crypto.subtle` / `collectPrivateJwks` (não é mais necessário).
- Manter mensagens de erro em português e as funções exportadas (`createAuthUserAsService`, `updateAuthUserPasswordAsService`) com a mesma assinatura, para não mexer nos chamadores.

## 2. Registrar Perda & Quebra sem depender de contagem prévia

**Situação atual:** em `src/routes/_authenticated/inventarios.$id.tsx` (linhas 322‑326), o botão "Perda" no `CountForm` só aparece quando `currentItem && !revealed`, ou seja, o produto precisa já ter uma contagem salva. Não há caminho para lançar perda de um produto que o usuário simplesmente quer registrar.

**Correção:** o `LossModal` já aceita `count_item_id` opcional, então basta expor o fluxo:

- Mostrar o botão "Perda" no `CountForm` mesmo sem `currentItem` (passando `count_item_id` como `undefined` quando ainda não houver contagem).
- Adicionar um botão/ícone "Perda" na lista de produtos do inventário (mesma linha do produto), abrindo o `LossModal` direto com o `product_id`, sem precisar entrar na tela de contagem.
- Nenhuma alteração de banco: `losses.count_item_id` já é nullable e a política RLS existente cobre inserts sem count_item.

## Arquivos alterados

- `src/lib/auth-admin.server.ts` — simplificar autenticação admin usando a service role key diretamente.
- `src/routes/_authenticated/inventarios.$id.tsx` — permitir abrir `LossModal` sem contagem prévia (botão no CountForm sempre visível + atalho na lista de produtos).

## Validação

- Cadastrar um novo usuário (supervisor/contador) pela tela de admin e confirmar sucesso.
- Abrir um inventário aberto, escolher um produto sem contagem e registrar uma perda; conferir toast de sucesso e que ela aparece em `/perdas`.
