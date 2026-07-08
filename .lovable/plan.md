## Corrigir erro de sync Omie

**Erro:** `Tag [FILTRAR_APENAS_ATIVO] não faz parte da estrutura do tipo complexo [produto_servico_list_request]`

A API `ListarProdutos` do Omie não aceita `filtrar_apenas_ativo`. O filtro de ativos já é feito depois via `p.inativo !== "S"`, então basta remover o parâmetro.

### Alteração
`src/lib/omie.server.ts` → em `listarTodosProdutosAtivos`, remover a linha `filtrar_apenas_ativo: "S"` do `param`. Mantém `apenas_importado_api: "N"` e `filtrar_apenas_omiepdv: "N"` (válidos).

### Verificação de retrabalho
Revisar todas as chamadas `omieRequest` no projeto para conferir tags inválidas:
- `PesquisarFamilias` — apenas `pagina` e `registros_por_pagina` (ok)
- `ListarProdutos` — remover tag inválida (fix acima)
- `IncluirAjusteEstoque` — campos padrão do Omie (ok)

Nenhum outro ponto de sincronização/consulta Omie existe além desses três em `omie.server.ts`. `omie.functions.ts` apenas consome esses helpers.

### Resultado esperado
Sincronizar Omie em `/contar` conclui, popula `families` e `products`, e a Nova contagem passa a listar famílias e produtos na busca.
