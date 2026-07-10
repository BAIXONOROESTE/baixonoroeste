## Problema

Após criar o primeiro admin a tela não muda: o botão aparece de novo e o usuário acaba criando o admin várias vezes (o banco já tem 3 usuários duplicados). Duas causas:

1. `bootstrapFirstAdmin` cria o usuário no servidor mas **não abre sessão no navegador**, então a página só recarrega a lista e continua mostrando o formulário se ela vier vazia (foi o que aconteceu enquanto a permissão do `current_user_is_admin` estava negando o `listLoginProfiles`).
2. A rota `bootstrap` também não trava chamadas repetidas do mesmo formulário — cada clique cria mais um `auth.users` + `profiles` + `user_roles`.

## Correções

### 1. Auto-login após criar o primeiro admin (`src/routes/auth.tsx`)
No `FirstAdmin.submit()`, depois de `bootstrap({...})` bem-sucedido:
- Chamar `signInWithPin(slug, pin)` para abrir sessão no browser.
- Se der certo, `navigate({ to: "/inicio", replace: true })`.
- Se falhar, exibir toast pedindo para logar com o PIN e disparar `onDone()` (mostra o seletor de perfis).

### 2. Limpar admins duplicados
Rodar uma migration que apaga os 2 admins extras (mantém o mais antigo). Remove de `auth.users` (o cascade deleta `profiles` e `user_roles`).

### 3. (Opcional, defensivo) Bloquear duplo clique no bootstrap
Já existe `setLoading(true)` desabilitando o botão, então só precisamos garantir que uma segunda tentativa após sucesso não caia no formulário de novo — o item 1 resolve isso naturalmente.

## Resumo técnico

- Editar `src/routes/auth.tsx`: função `FirstAdmin` faz `signInWithPin` + navigate após `bootstrapFirstAdmin`.
- Migration: `DELETE FROM auth.users WHERE id IN (...ids dos admins extras, mantendo o primeiro)`.
