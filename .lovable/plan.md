## Causa raiz

A tabela `public.user_roles` tem as policies RLS corretas (`read own roles or admin reads all` para `authenticated`), mas **não tem nenhum GRANT para o role `authenticated`** — `information_schema.role_table_grants` retorna vazio para essa tabela. Sem `GRANT SELECT`, o PostgREST bloqueia a leitura antes mesmo de avaliar a RLS, então `useProfile()` recebe erro de permissão, cai em `profileError` e o admin/supervisor perde a marcação de role no frontend → `isSupOrAdmin=false` → `canOpenInventory=false` para qualquer inventário que não seja dele → "Inventário indisponível".

A migration anterior (`20260713185500`) que tentou aplicar o grant não persistiu (provavelmente foi revertida ou nunca executou com sucesso).

## Correção

Uma única migration, mínima, só em `user_roles` — sem tocar em `inventories`, `count_items`, `inventory_products` ou `inventory_families`:

```sql
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL    ON public.user_roles TO service_role;
```

Não vou trocar para RPC. A policy direta já está correta (`user_id = auth.uid() OR current_user_is_admin()`); só faltava o grant de tabela que o PostgREST exige antes da RLS.

## Testes (item 3)

Após a migration, via Playwright no preview localhost, com sessões reais (login por PIN):

1. Logar como **admin** → criar inventário do tipo "Por família" ou "Geral" designado a um colaborador específico (não o próprio admin).
2. **Admin**: abrir o inventário recém-criado → deve entrar normalmente.
3. **Colaborador designado**: logar, abrir o inventário → deve entrar e conseguir editar contagens.
4. **Segundo colaborador (não designado)**: logar, tentar abrir → deve ver "Inventário indisponível".
5. **Supervisor**: logar, abrir o mesmo inventário → deve entrar normalmente.

Cada passo com screenshot de evidência.

## Confirmação final ao usuário

Vou reportar:
- Grant que faltava: `GRANT SELECT ON public.user_roles TO authenticated` (e `ALL` para `service_role`).
- Abordagem: ajuste do grant direto na policy existente, sem RPC.
- Resultado dos 4 cenários de teste com evidência.

## Fora de escopo (não vou mexer)

- Policies de `inventories`, `count_items`, `inventory_products`, `inventory_families` — permanecem como estão.
- Lógica de `canOpenInventory` no frontend — permanece; ela funcionará corretamente assim que `useProfile()` voltar a ler o role.
