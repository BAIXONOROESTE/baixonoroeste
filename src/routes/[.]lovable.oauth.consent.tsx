import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";

// Wrapper tipado — o namespace supabase.auth.oauth ainda é beta.
type OAuthResult = {
  data: {
    client?: { name?: string; client_name?: string; redirect_uris?: string[] } | null;
    scope?: string;
    redirect_url?: string;
    redirect_to?: string;
  } | null;
  error: { message: string } | null;
};
type OAuthClient = {
  getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
  approveAuthorization: (id: string) => Promise<OAuthResult>;
  denyAuthorization: (id: string) => Promise<OAuthResult>;
};
function oauthApi(): OAuthClient {
  const auth = supabase.auth as unknown as { oauth?: OAuthClient };
  if (!auth.oauth) throw new Error("Servidor OAuth indisponível.");
  return auth.oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("authorization_id ausente.");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) {
      window.location.href = immediate;
    }
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <div className="min-h-dvh grid place-items-center p-6 bg-background">
      <div className="max-w-sm text-center space-y-2">
        <h1 className="text-lg font-display font-semibold">Não foi possível carregar a autorização</h1>
        <p className="text-sm text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
      </div>
    </div>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.name ?? details?.client?.client_name ?? "Aplicativo externo";
  const scopes = (details?.scope ?? "").split(/\s+/).filter(Boolean);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (error) { setBusy(false); setError(error.message); return; }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) { setBusy(false); setError("Servidor não retornou URL de redirecionamento."); return; }
    window.location.href = target;
  }

  return (
    <main className="min-h-dvh grid place-items-center p-6 bg-background">
      <div className="w-full max-w-md rounded-2xl bg-surface border border-border p-6 space-y-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/15 grid place-items-center">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display font-semibold text-lg leading-tight">Conectar {clientName}</h1>
            <p className="text-xs text-muted-foreground">Baixo Noroeste — Inventário</p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          {clientName} poderá usar as ferramentas deste app agindo como você. As regras de acesso do sistema (RLS) continuam valendo.
        </p>

        {scopes.length > 0 && (
          <div className="text-xs">
            <div className="text-muted-foreground mb-1">Permissões solicitadas</div>
            <ul className="space-y-1">
              {scopes.map((s: string) => (
                <li key={s} className="rounded-md bg-muted px-2 py-1">{s}</li>
              ))}
            </ul>
          </div>
        )}

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" disabled={busy} onClick={() => decide(false)}>
            Cancelar
          </Button>
          <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
            {busy ? "..." : "Autorizar"}
          </Button>
        </div>
      </div>
    </main>
  );
}
