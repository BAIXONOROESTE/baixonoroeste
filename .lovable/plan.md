## Objetivo
Resolver 4 problemas relatados: (1) códigos de barras não encontrados vindos do Omie, (2) UI da câmera com botões escondidos, (3) alertas via WhatsApp que devem ir por e-mail + desativar WhatsApp por completo, (4) lista de produtos deve incluir inativos marcados em vermelho.

---

## 1. Códigos de barras do Omie

**Diagnóstico:** `src/lib/omie.functions.ts` grava só `barcode: p.codigo_barras`. A API `ListarProdutos` do Omie preenche o EAN em campos diferentes conforme o cadastro (`codigo_barras`, `ean`, `ean_13`). Se o produto foi cadastrado com EAN mas em outro campo, o `barcode` fica `null` no nosso banco e o scanner não acha nada.

**O que fazer:**
- Em `src/lib/omie.server.ts`, ampliar a interface `OmieProduto` para incluir `ean` e demais variantes.
- Em `src/lib/omie.functions.ts`, escolher o barcode como `p.codigo_barras || p.ean || p.ean_13 || null` (com trim e ignorando `"0"` ou string vazia).
- Adicionar no `sync_log` a contagem de produtos sem EAN (para o admin conseguir saber quantos itens ficaram sem código).
- Testes rápidos via `supabase--read_query` depois da execução para confirmar que a taxa de produtos com barcode subiu.

## 2. Câmera do scanner

**Diagnóstico:** `BarcodeScanner` usa `<video className="flex-1 object-cover">` em tela cheia preta com o rodapé de texto pequeno. Em iOS/Android o vídeo cobre a área e o botão de fechar (X) fica muito discreto no topo; não há botão para captura manual nem para digitar o EAN quando a leitura falha.

**O que fazer (`src/components/BarcodeScanner.tsx`):**
- Aumentar o botão de fechar (círculo grande com fundo escuro semi-transparente, canto superior direito, seguro contra safe-area do iOS: `env(safe-area-inset-top)`).
- Adicionar sobreposição com “moldura de mira” central para o usuário enquadrar o código.
- Adicionar barra inferior com:
  - Botão “Digitar código” que abre um input para digitar/colar o EAN e devolve pelo `onScan`.
  - Botão “Trocar câmera” quando houver mais de uma.
  - Se disponível, botão de lanterna (`ImageCapture.getPhotoCapabilities().torch`).
- Manter a decodificação automática (não é câmera de foto), mas com feedback visual (borda verde ao ler).

## 3. Desativar WhatsApp e migrar alertas para e-mail

**Diagnóstico:** WhatsApp já é um stub no-op em `notify.functions.ts`, mas ainda existem menções e um input de telefone com rótulo “WhatsApp”. `pushCountToOmie` e `closeInventory` já mandam e-mail; só falta o alerta de **divergência** e o **pedido de fechamento**.

**O que fazer:**
- `src/lib/notify.functions.ts`: `notifyDivergence` passa a enviar e-mail (template `count-completed` ou template novo `divergence-alert`) para `loadNotificationRecipients()`, com dedupe por `idempotencyKeyPrefix: divergence-<inventory_id>-<count_item_id>`. Mantém a assinatura para não quebrar o cliente.
- `src/lib/close-requests.functions.ts`: em `requestCloseInventory`, após criar o pedido, enviar e-mail para supervisores/admins com o link `/aprovar/<token>` (retornar `sent`/`targets` reais).
- `src/routes/_authenticated/inventarios.$id.tsx`: trocar a mensagem “via WhatsApp” por “por e-mail”.
- `src/routes/_authenticated/usuarios.tsx`: renomear rótulo do campo `phone` para “Telefone (opcional)” e remover qualquer sugestão de WhatsApp.
- Remover o `sendWhatsApp` e comentários mortos de `notify.functions.ts` (a função vira só e-mail).
- Manter a coluna `phone` no banco (não é destrutivo; pode voltar depois).

## 4. Lista de produtos: mostrar inativos em vermelho

**Diagnóstico:** Na tela `inventarios/$id.tsx` a consulta filtra `active=true`, escondendo produtos que o Omie inativou. O contador não consegue visualizar/conferir por que o item “sumiu”.

**O que fazer (`src/routes/_authenticated/inventarios.$id.tsx`):**
- Remover o filtro `.eq("active", true)` da query `products-for-inv` e trazer `active` no `select`.
- Ordenar por `active desc, name asc` para inativos irem para o fim.
- Renderizar itens com `!p.active` em vermelho (classe `border-destructive/40 bg-destructive/5 text-destructive`) com selo “Inativo”.
- Bloquear a seleção de produto inativo para contagem (mostrar toast “Produto inativo — peça reativação no Omie”), evitando novos `count_items` para inativos.
- Ajustar a barra de progresso: denominador continua sendo só ativos, para não distorcer.

## 5. Varredura geral por outros erros/conexões

Não vou refatorar código sem sintoma, mas nesta mesma passagem valido:
- `pushCountToOmie`, `closeInventory`, `requestCloseInventory`, `syncFamiliesAndProducts` — chamadas server-fn, cliente Supabase, RLS.
- Rodar `supabase--linter` e revisar `edge_function_logs` recentes (se houver) só para checar warnings críticos.
- Confirmar via `code--exec` de build+typecheck que nada quebrou após as mudanças.

---

### Fora do escopo
- Sem mudanças de schema (não vamos apagar `phone`, `close_requests`, nem colunas de WhatsApp).
- Sem alterar UI de outras telas além das listadas.
- Sem mexer em MCP, auth, ou nas correções de segurança já em andamento.
