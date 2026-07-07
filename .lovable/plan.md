## Correções de segurança e bugs

### 1. Erro RLS ao sincronizar Omie (`sync_log`)
O `syncFamiliesAndProducts` roda com o cliente autenticado do usuário (via `requireSupabaseAuth`), mas a tabela `sync_log` só tem policy de SELECT para admins — não há policy de INSERT para `authenticated`. Solução:
- Adicionar policy `INSERT` em `sync_log` para `authenticated` (`WITH CHECK (auth.uid() = triggered_by)`)
- Adicionar policy `UPDATE` para permitir atualização das próprias linhas de sync
- Alternativa mais robusta: usar `supabaseAdmin` para os inserts/updates de log dentro do handler (já autorizado)

### 2. Signup permite virar admin (crítico)
`handle_new_user()` lê `role` de `raw_user_meta_data` — qualquer um pode chamar `auth.signUp` direto com `data: { role: 'admin' }`. Correção:
- Alterar `handle_new_user()` para SEMPRE inserir `'contador'` (mantendo o bootstrap: primeiro usuário vira admin)
- Remover o campo `role` de `signUpWithPin` em `src/lib/auth-helpers.ts`
- Elevação de papel passa a ser exclusivamente feita por admin já logado via UI de usuários (já existe policy `admin manages roles`)

### 3. `closeInventory` e `pushCountToOmie` sem checagem de papel (crítico)
Ambos usam `supabaseAdmin` (bypass de RLS) e só exigem login. Correção em `src/lib/omie.functions.ts`:
- Após `requireSupabaseAuth`, chamar `context.supabase.rpc('current_user_is_supervisor_or_admin')` e rejeitar se `false`
- Aplicar em `closeInventory` e `pushCountToOmie`

### 4. Leaked Password Protection desabilitado
- Ativar HIBP via `configure_auth` (`password_hibp_enabled: true`)
- Isso também resolve a reclamação do usuário sobre "senha fraca"? Não — HIBP bloqueia senhas vazadas. A reclamação anterior era do requisito mínimo do Supabase. Mantém habilitado por segurança.

### 5. Função SECURITY DEFINER executável por authenticated
Já foi marcada como corrigida antes, mas o scanner voltou a apontar. Revisar `has_role`, `current_user_is_admin`, `current_user_is_supervisor_or_admin`, `handle_new_user`, `update_updated_at_column`:
- `handle_new_user` e `update_updated_at_column` são triggers → `REVOKE EXECUTE ... FROM authenticated, anon, public`
- `has_role`, `current_user_is_admin`, `current_user_is_supervisor_or_admin` precisam ser chamáveis por policies → manter `EXECUTE` apenas via policies (revogar de `public`, manter para `authenticated` só se usado em client; caso contrário revogar)
- Marcar finding como fixed depois

### 6. "Toda vez preciso cadastrar admin"
Provavelmente o app não persiste sessão ou o usuário está apagando cookies. Verificar `src/integrations/supabase/client.ts` (auto-gerado — não editar). Provável causa real: o trigger `handle_new_user` está criando novos usuários com role admin por causa do bug #2 acima OU o `_authenticated/route.tsx` está com `ssr: false` e a sessão não hidrata. Após corrigir #2, o comportamento deve estabilizar. Se persistir, investigar sessão do Supabase.

### Arquivos a alterar
- `supabase/migrations/<novo>.sql` — policies em `sync_log`, novo `handle_new_user`, REVOKE/GRANT nas funções SECURITY DEFINER
- `src/lib/auth-helpers.ts` — remover envio de `role` no signUp
- `src/lib/omie.functions.ts` — checagem de papel em `closeInventory` e `pushCountToOmie`
- `configure_auth` — ativar HIBP
- `manage_security_finding` — marcar findings resolvidos
