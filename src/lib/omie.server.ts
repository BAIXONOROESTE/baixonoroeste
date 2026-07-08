// Cliente da API do Omie — server-only.
// Usa fetch nativo (Cloudflare Workers). Nunca importar do lado do cliente.

const OMIE_BASE = "https://app.omie.com.br/api/v1";

interface OmieCall {
  endpoint: string;   // ex: "geral/produtos/"
  call: string;       // ex: "ListarProdutos"
  param: unknown;     // objeto de parâmetros
}

export async function omieRequest<T = unknown>({ endpoint, call, param }: OmieCall): Promise<T> {
  const app_key = process.env.OMIE_APP_KEY;
  const app_secret = process.env.OMIE_APP_SECRET;
  if (!app_key || !app_secret) {
    throw new Error("Credenciais do Omie não configuradas (OMIE_APP_KEY / OMIE_APP_SECRET).");
  }
  const body = { call, app_key, app_secret, param: [param] };
  const res = await fetch(`${OMIE_BASE}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { throw new Error(`Omie retornou resposta inválida: ${text.slice(0, 200)}`); }
  if (!res.ok || (typeof json === "object" && json !== null && "faultstring" in (json as Record<string, unknown>))) {
    const msg = (json as { faultstring?: string; message?: string })?.faultstring ?? (json as { message?: string })?.message ?? `HTTP ${res.status}`;
    throw new Error(`Omie: ${msg}`);
  }
  return json as T;
}

// -------- Tipos parciais da API do Omie --------
export interface OmieFamilia {
  codigo: number;
  descricao?: string;
  nomeFamilia?: string;
  inativo?: string;
}
export interface OmieProduto {
  codigo_produto: number;
  codigo: string;
  codigo_barras?: string;
  descricao: string;
  unidade?: string;
  familia?: string;              // nome
  codigo_familia?: number;
  estoque_atual?: number;
  valor_unitario?: number;
  quantidade_estoque?: number;
  inativo?: string;              // "S" | "N"
  bloqueado?: string;
  local_estoque?: string;
}

export async function listarTodasFamilias(): Promise<OmieFamilia[]> {
  const all: OmieFamilia[] = [];
  let pagina = 1;
  while (true) {
    const resp = await omieRequest<{ famCadastro?: OmieFamilia[]; total_de_paginas?: number }>({
      endpoint: "geral/familias/",
      call: "PesquisarFamilias",
      param: { pagina, registros_por_pagina: 100 },
    });
    const arr = resp.famCadastro ?? [];
    all.push(...arr);
    const total = resp.total_de_paginas ?? 1;
    if (pagina >= total || arr.length === 0) break;
    pagina++;
  }
  return all.filter((f) => f.inativo !== "S");
}

export async function listarTodosProdutosAtivos(): Promise<OmieProduto[]> {
  const all: OmieProduto[] = [];
  let pagina = 1;
  while (true) {
    const resp = await omieRequest<{ produto_servico_cadastro?: OmieProduto[]; total_de_paginas?: number }>({
      endpoint: "geral/produtos/",
      call: "ListarProdutos",
      param: {
        pagina,
        registros_por_pagina: 100,
        apenas_importado_api: "N",
        filtrar_apenas_omiepdv: "N",
      },
    });
    const arr = resp.produto_servico_cadastro ?? [];
    all.push(...arr);
    const total = resp.total_de_paginas ?? 1;
    if (pagina >= total || arr.length === 0) break;
    pagina++;
  }
  return all.filter((p) => p.inativo !== "S");
}

export interface OmiePosicaoProduto {
  nCodProd: number;
  nSaldo?: number;
  fisico?: number;
  reservado?: number;
  nCMC?: number;
  nPrecoUnitario?: number;
}

/** Consulta o saldo atual (posição) do estoque de todos os produtos. */
export async function listarPosicaoEstoque(): Promise<OmiePosicaoProduto[]> {
  const all: OmiePosicaoProduto[] = [];
  let nPagina = 1;
  const dDataPosicao = new Date().toLocaleDateString("pt-BR"); // dd/mm/aaaa
  while (true) {
    const resp = await omieRequest<{
      produtos?: OmiePosicaoProduto[];
      nTotPaginas?: number;
    }>({
      endpoint: "estoque/consulta/",
      call: "ListarPosEstoque",
      param: {
        nPagina,
        nRegPorPagina: 100,
        dDataPosicao,
        cExibeTodos: "S",
        codigo_local_estoque: 0,
      },
    });
    const arr = resp.produtos ?? [];
    all.push(...arr);
    const total = resp.nTotPaginas ?? 1;
    if (nPagina >= total || arr.length === 0) break;
    nPagina++;
  }
  return all;
}


export async function ajustarEstoqueOmie(params: {
  codigo_produto: number;
  quantidade: number;
  observacao: string;
}): Promise<unknown> {
  const hoje = new Date().toLocaleDateString("pt-BR"); // dd/mm/aaaa
  const q = Number(params.quantidade);
  // tipo: ENT (entrada) para diferença positiva, SAI (saída) para negativa.
  const tipo = q >= 0 ? "ENT" : "SAI";
  return omieRequest({
    endpoint: "estoque/ajuste/",
    call: "IncluirAjusteEstoque",
    param: {
      codigo_local_estoque: 0,
      id_prod: params.codigo_produto,
      data: hoje,
      tipo,
      quan: Math.abs(q),
      valor: 0,
      obs: params.observacao,
      origem: "AJU",
      motivo: "INV",
    },
  });
}

