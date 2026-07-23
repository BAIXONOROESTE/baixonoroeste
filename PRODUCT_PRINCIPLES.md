# Princípios do Produto — App de Contagem de Inventário (Baixo Noroeste)

> Este arquivo deve ser lido por qualquer IA (Claude, Loveable, ou outra) antes de propor
> ou implementar qualquer mudança neste projeto. Ele existe para manter consistência
> entre sessões e evitar retrabalho, regressões e decisões contraditórias.

## O que este sistema é hoje

Um aplicativo mobile-first para gestão operacional da Baixo Noroeste, com três papéis
(admin, supervisor, colaborador/contador), integrado ao ERP Omie, construído
com Loveable + Supabase (Postgres com RLS) e hospedado em
inventario.baixonoroeste.com.br. Possui quatro módulos principais:

- Contagem de estoque (com sincronização automática ou por aprovação com a Omie)
- Gamificação (equipes, ranking mensal/semanal por precisão e prazo)
- Checklists de rotina (abertura/fechamento de loja, com evidência em foto/vídeo e aprovação)
- Manutenção (chamados de problemas reportados, com responsável e acompanhamento de status)

O objetivo principal é: dar confiabilidade e velocidade aos processos operacionais
da Baixo Noroeste, reduzindo erro humano e retrabalho manual.

Não é (ainda) um produto genérico para outras empresas. Qualquer decisão que
aumente a complexidade em nome de "generalização futura" deve ser explicitamente
aprovada por Pedro antes de ser implementada.

## Princípios

1. Resolver o problema de hoje antes do problema de amanhã. Não adicionar
   camadas de configuração genérica ("motor de checklists universal", multi-empresa,
   multi-ERP) enquanto os fluxos atuais não estiverem estáveis e em uso real.

2. Nunca duplicar componentes ou lógica já existente. Antes de criar algo novo,
   verificar se já existe uma função, hook ou componente equivalente no repositório.

3. Mudanças pequenas e testáveis. Cada prompt enviado ao Loveable deve
   representar uma evolução pequena e verificável — nunca múltiplas funcionalidades
   simultâneas. Aguardar confirmação de Pedro antes do próximo prompt.

4. Entender antes de alterar. Nenhuma mudança de banco de dados, RLS, trigger
   ou integração com a Omie deve ser feita sem antes ler o código/schema atual
   relacionado.

5. Segurança de dados por padrão. Toda tabela ou função nova deve ter permissões
   pensadas explicitamente por papel — nunca depender apenas da interface para
   esconder dados sensíveis, e nunca assumir que "estar logado" é suficiente:
   sempre checar se a pessoa tem permissão sobre o registro específico.

6. Rastreabilidade. Ações que afetam estoque, perdas, checklists, manutenção ou
   pontuação de colaboradores devem ser auditáveis (quem, quando, o quê). Tabelas
   de auditoria (ex: count_item_reviews, checklist_run_item_reviews, losses) são
   propositalmente somente-inserção — não "corrigir" isso automaticamente.

7. Desconfiar de correções automáticas do Loveable. Sugestões de "corrigir
   tudo" podem ser corretas em isolamento mas quebrar regras de negócio
   específicas deste app. Sempre revisar antes de aplicar.

8. Omie como fornecedor de dados, não como dono da lógica. A lógica de
   negócio vive no nosso banco; a Omie é consultada/atualizada, não é a fonte
   da verdade do processo operacional. Contagens sem divergência sincronizam
   automaticamente; contagens com divergência exigem aprovação explícita.

9. Simplicidade para quem usa. O colaborador não deve precisar entender nada
   técnico. Complexidade fica escondida para admin/supervisor.

10. Documentar o que muda. Mudanças relevantes de arquitetura, schema ou
    regra de negócio devem ser resumidas aqui.

11. Cuidado com nomes de arquivo de rota. Quando uma tela "lista" tiver uma
    tela "detalhe" filha (ex: checklists + checklists.$id), a tela lista deve
    se chamar Xxx.index.tsx, nunca Xxx.tsx — já causou bugs de navegação
    silenciosa mais de uma vez neste projeto.

12. Nenhuma função server-side deve confiar só em "usuário está logado".
    Sempre verificar se é o autor, o responsável, ou admin/supervisor antes
    de retornar dados sensíveis (e-mails, dados de outros colaboradores) ou
    permitir ações — mesmo em funções auxiliares/internas.

## Sobre generalizar o produto no futuro

Se um dia fizer sentido comercial oferecer este sistema para outros bares,
restaurantes ou distribuidoras, isso é uma decisão de produto que deve ser
tomada conscientemente — não uma reformulação silenciosa "enquanto" resolvemos
outra coisa. Quando esse dia chegar, este documento deve ser revisado e
expandido intencionalmente.

Não alterar mais nenhum outro arquivo.
