Diagnóstico confirmado — sem aplicar correção.

1. O login por PIN usa Auth real
- O login por PIN não é só uma sessão custom/localStorage.
- Em `src/lib/auth-helpers.ts`, `signInWithPin(slug, pin)` chama `supabase.auth.signInWithPassword(...)`.
- O email interno é montado como `{slug}@users.baixonoroeste.com.br`, e o PIN vira a senha do Auth.
- Confirmei no banco que os perfis atuais têm usuário correspondente em `auth.users`:
  - Colaborador: `has_auth_user = true`
  - HIGOR BARBOSA: `has_auth_user = true`
  - LUCAS AURELIANO: `has_auth_user = true`
  - PEDROHMG/admin: `has_auth_user = true`

Conclusão: `auth.uid()` deve existir e deve corresponder ao `profiles.id` / `user_roles.user_id` para esses usuários. Então a hipótese de “PIN não gera sessão real” não é a causa principal neste app.

2. A policy nova realmente compara o responsável com `auth.uid()`

Policy atual em `public.inventories`:

```sql
CREATE POLICY "assigned or supervisor/admin read inventories"
ON public.inventories
FOR SELECT
TO authenticated
USING (
  public.current_user_is_supervisor_or_admin()
  OR assigned_counter_id = auth.uid()
);
```

Ou seja:
- supervisor/admin passa por `public.current_user_is_supervisor_or_admin()`;
- colaborador passa somente se `inventories.assigned_counter_id = auth.uid()`.

Policy de update em `public.inventories`:

```sql
CREATE POLICY "assigned or supervisor/admin update inventories"
ON public.inventories
FOR UPDATE
TO authenticated
USING (
  public.current_user_is_supervisor_or_admin()
  OR assigned_counter_id = auth.uid()
)
WITH CHECK (
  public.current_user_is_supervisor_or_admin()
  OR assigned_counter_id = auth.uid()
);
```

Policies de itens de contagem:

```sql
CREATE POLICY "assigned or supervisor/admin read counts"
ON public.count_items
FOR SELECT
TO authenticated
USING (
  public.current_user_is_supervisor_or_admin()
  OR EXISTS (
    SELECT 1
    FROM public.inventories i
    WHERE i.id = count_items.inventory_id
      AND i.assigned_counter_id = auth.uid()
  )
);
```

```sql
CREATE POLICY "assigned or supervisor/admin insert counts"
ON public.count_items
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_user_is_supervisor_or_admin()
  OR (
    counted_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.inventories i
      WHERE i.id = count_items.inventory_id
        AND i.assigned_counter_id = auth.uid()
    )
  )
);
```

```sql
CREATE POLICY "assigned or supervisor/admin update counts"
ON public.count_items
FOR UPDATE
TO authenticated
USING (
  public.current_user_is_supervisor_or_admin()
  OR EXISTS (
    SELECT 1
    FROM public.inventories i
    WHERE i.id = count_items.inventory_id
      AND i.assigned_counter_id = auth.uid()
  )
)
WITH CHECK (
  public.current_user_is_supervisor_or_admin()
  OR EXISTS (
    SELECT 1
    FROM public.inventories i
    WHERE i.id = count_items.inventory_id
      AND i.assigned_counter_id = auth.uid()
  )
);
```

Policies do escopo do inventário:

```sql
CREATE POLICY "assigned or supervisor/admin read inv_products"
ON public.inventory_products
FOR SELECT
TO authenticated
USING (
  public.current_user_is_supervisor_or_admin()
  OR EXISTS (
    SELECT 1
    FROM public.inventories i
    WHERE i.id = inventory_products.inventory_id
      AND i.assigned_counter_id = auth.uid()
  )
);
```

```sql
CREATE POLICY "assigned or supervisor/admin read inv_families"
ON public.inventory_families
FOR SELECT
TO authenticated
USING (
  public.current_user_is_supervisor_or_admin()
  OR EXISTS (
    SELECT 1
    FROM public.inventories i
    WHERE i.id = inventory_families.inventory_id
      AND i.assigned_counter_id = auth.uid()
  )
);
```

3. Contra qual coluna/valor ela compara
- Compara `inventories.assigned_counter_id` contra `auth.uid()`.
- Para inserir contagem, também exige `count_items.counted_by = auth.uid()`.
- O `assigned_counter_id` referencia `public.profiles(id)`, e os `profiles.id` conferidos existem em `auth.users`, então essa comparação faz sentido neste modelo de autenticação.

4. Diagnóstico da regressão do admin
A causa mais provável da regressão do admin não é `auth.uid()` nulo. O ponto suspeito é outro:

- O frontend decide se o usuário é admin/supervisor por `useProfile()`.
- `useProfile()` lê `public.user_roles` direto do cliente.
- A consulta de grants mostrou que `public.user_roles` está sem privilégio direto listado para `authenticated`.
- Se essa leitura falha, o código ignora o erro e cai no fallback `contador`:

```ts
const role: AppRole = roleList.includes("admin") ? "admin" : roleList.includes("supervisor") ? "supervisor" : "contador";
```

Resultado provável: o usuário admin é reconhecido pelo banco como admin para algumas policies, mas no frontend vira `contador`; então esta regra bloqueia a tela:

```ts
const isSupOrAdmin = profile?.role === "admin" || profile?.role === "supervisor";
const canOpenInventory = !!inv && !!profile && (isSupOrAdmin || inv.assigned_counter_id === profile.id);
```

Se o inventário recém-criado foi designado para outro colaborador, o admin com role lida como `contador` cai em `canOpenInventory = false` e vê “Inventário indisponível”.

5. Se aprovar a próxima correção, eu corrigiria sem mexer no modelo de autenticação
- Restaurar/garantir leitura segura de `user_roles` para o próprio usuário autenticado, ou trocar `useProfile()` para buscar a role por função segura/RPC já existente.
- Ajustar a tela para não depender de role frontend incorreta quando a policy do banco já autorizou admin/supervisor.
- Revisar as policies para manter:
  - colaborador: só inventários onde `assigned_counter_id = auth.uid()`;
  - supervisor/admin: qualquer inventário;
  - criação e sync: admin/supervisor conforme combinado.
- Depois testar os três perfis reais: colaborador responsável, supervisor e admin.