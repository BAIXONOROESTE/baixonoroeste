## Bug

Em `src/routes/_authenticated/inventarios.$id.tsx` (linhas 165–168), a condição:

```ts
const showValidation = isSupOrAdmin && (
  [...status de validação...].includes(inv?.status ?? "")
  || (divergencias > 0 && !closed)   // ← problema
);
```

Faz com que, para supervisor/admin, **basta uma única divergência** para a tela de contagem ser substituída pela tela de validação — mesmo com o inventário ainda em `pendente` / `em_andamento` e produtos por contar. Isso interrompe a contagem no meio, especialmente em inventários "Por família" e "Personalizado" contados pelo próprio supervisor.

## Correção

Remover o fallback `divergencias > 0 && !closed` e passar a mostrar a tela de validação **apenas** quando o inventário efetivamente entrou em um status de validação (ou seja, a contagem já foi enviada / o inventário está em fluxo de aprovação).

Nova condição:

```ts
const validationStatuses = [
  "pendente_validacao",
  "aguardando_validacao",
  "divergencia",
  "recontagem_enviada",
  "recontagem_solicitada",
  "ajuste_solicitado",
];
const showValidation = isSupOrAdmin && validationStatuses.includes(inv?.status ?? "");
```

Assim:

- Supervisor/admin contando um inventário `pendente` ou `em_andamento` continua vendo a tela de contagem até terminar, independentemente de haver itens divergentes durante o processo.
- Quando ele (ou outro contador) clica em "Enviar para validação" e o inventário muda para `pendente_validacao` / `aguardando_validacao` / `divergencia`, aí sim a tela de validação aparece.
- Fluxo de recontagem/ajuste solicitado continua acionando a tela para o supervisor, como já acontece hoje.
- Nada muda para contador comum (`showRecount` permanece igual).

## Escopo

- Editar somente as linhas 165–168 de `src/routes/_authenticated/inventarios.$id.tsx`.
- Nenhuma alteração de schema, RLS, server function, ou outros componentes.

## Teste manual após aplicar

1. Login como supervisor, criar inventário "Por família".
2. Contar um item com quantidade divergente do esperado.
3. Confirmar que a tela **continua** na contagem (não pula para validação) e o restante dos produtos ainda pode ser contado.
4. Ao clicar "Enviar para validação", a tela de validação aparece normalmente.
