Plano para corrigir o falso “primeiro acesso”:

1. **Parar de tratar erro como sistema vazio**
   - Ajustar a tela `/auth` para mostrar carregamento/erro com botão de tentar novamente quando a lista de usuários não carregar.
   - A tela “Configuração inicial / Criar administrador” só aparecerá quando o backend confirmar de verdade que não existe nenhum perfil ativo.

2. **Corrigir a busca pública de perfis do login**
   - Trocar a listagem de perfis pré-login para usar a função segura do banco que retorna somente dados permitidos: nome, slug, avatar/cor e status ativo.
   - Restaurar a permissão necessária para essa função ser chamada antes do login, já que a tela de PIN precisa listar usuários antes da autenticação.

3. **Manter o bloqueio de criação indevida de admin**
   - Não abrir auto-cadastro público.
   - Manter `bootstrapFirstAdmin` bloqueado quando já existir qualquer papel de usuário/admin cadastrado.

4. **Validar após a correção**
   - Confirmar que o banco continua com os usuários existentes.
   - Confirmar que a tela publicada deixa de mostrar “Criar administrador” e passa a mostrar a seleção de usuário/PIN.

Observação: verifiquei o banco agora e já existem 3 perfis ativos e 1 administrador; portanto o app realmente não deveria estar mostrando a tela de primeiro acesso.