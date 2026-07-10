## Plano

1. Corrigir o cadastro de supervisores/contadores
   - Trocar o helper de criação/reset de usuários para usar o cliente administrativo do backend em vez de chamar `/auth/v1/admin/users` com `Authorization: Bearer sb_secret_*`.
   - Manter a validação atual: só admin cria usuários, PIN de 6 a 8 dígitos, papéis permitidos `admin`, `supervisor`, `contador`.
   - Garantir que o e-mail real digitado no formulário seja salvo no perfil do usuário criado, evitando a etapa separada pelo cliente.

2. Revisar o projeto por erros do mesmo tipo
   - Ajustar rotas internas de e-mail/unsubscribe/fila/suppression que criam cliente backend com chave interna no formato novo sem o fetch compatível já existente.
   - Evitar qualquer uso de chave `sb_secret_*` como se fosse JWT Bearer quando a API espera token assinado.
   - Preservar os checks de autorização existentes e não mexer em áreas fora desse problema.

3. Validar e-mails
   - Conferir o fluxo de fila e envio já configurado.
   - O domínio de e-mail está configurado, mas ainda pendente de DNS; os disparos só ficam efetivos depois dos registros DNS terminarem de verificar.
   - Se o código estiver bloqueando por chave interna, corrigir para permitir enfileirar/processar corretamente assim que o domínio verificar.

4. Verificar perdas/quebras
   - Confirmar que a alteração anterior realmente permite abrir “Perda” sem contagem salva.
   - Se ainda houver bloqueio, ajustar apenas o caminho necessário para registrar perda/quebra do produto selecionado.

5. Validação final
   - Rodar checagens focadas de código/erros.
   - Testar o fluxo de criar usuário pela tela `/usuarios` e revisar logs relevantes.
   - Checar status de e-mail após a correção e informar se ainda depende só de DNS.