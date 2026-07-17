Corrigir a query de busca de produtos em `src/routes/_authenticated/contar.tsx` para que, nos modos "Por produto" e "Personalizado", produtos vinculados a famílias com `countable = false` não apareçam nos resultados.

### Alteração técnica

No `useQuery` com `queryKey: ["prod-search-contar", ...]`, ajustar a consulta ao Supabase:

- Manter `.select("id, code, name, family_name, active")` como base.
- Adicionar o join interno com `families` e filtrar por `families.countable = true`.
- Garantir que o tipo retornado continue compatível com o uso atual (acessamos apenas `id`, `name`, `code`).

A forma sugerida é usar o embed `family:families!inner(countable)` e `.eq("families.countable", true)`, o que força o Supabase a aplicar o filtro no join. Se o tipo gerado incluir o campo aninhado, faremos um mapeamento simples (`data ?? []`) para não quebrar as referências em `p.name`/`p.code`.

### Testes

1. Marcar uma família como desativada (countable = false) em Configurações.
2. Em "Nova contagem" > "Por produto", buscar um produto dessa família: não deve aparecer.
3. Em "Nova contagem" > "Personalizado", buscar o mesmo produto: não deve aparecer.
4. Verificar que "Geral" e "Por família" continuam funcionando normalmente (sem regressão).
5. Executar o typecheck/build para garantir que não houve quebra de tipos.