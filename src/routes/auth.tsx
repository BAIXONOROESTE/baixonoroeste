import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { signInWithPin, slugify } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Package } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { bootstrapFirstAdmin } from "@/lib/bootstrap.functions";
import { listLoginProfiles } from "@/lib/login-profiles.functions";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? s.next : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Entrar — Baixo Noroeste" },
      { name: "description", content: "Acesse o sistema de contagem de estoque da Baixo Noroeste com seu PIN pessoal. Área restrita a colaboradores." },
      { property: "og:title", content: "Entrar — Baixo Noroeste" },
      { property: "og:description", content: "Login por PIN para colaboradores da Baixo Noroeste no sistema de inventário." },
      { property: "og:url", content: "https://inventario.baixonoroeste.com.br/auth" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://inventario.baixonoroeste.com.br/auth" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        if (next) window.location.assign(next);
        else navigate({ to: "/inicio", replace: true });
      }
    });
  }, [navigate, next]);

  const { data: profiles, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["auth-profiles"],
    queryFn: async () => (await listLoginProfiles()) ?? [],
  });

  const isFirstUse = !isLoading && !isError && (profiles?.length ?? 0) === 0;

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4 py-8 bg-background">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="h-16 w-16 rounded-2xl bg-primary/15 grid place-items-center mb-3 glow-primary">
            <Package className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-display font-semibold">Estoque Omie — Contagem de estoque</h1>
          <p className="text-sm text-muted-foreground">Inventário</p>
        </div>
        {isLoading ? (
          <AuthStatusCard title="Carregando usuários" message="Aguarde um instante." />
        ) : isError ? (
          <AuthStatusCard
            title="Não foi possível carregar os usuários"
            message={error instanceof Error ? error.message : "Tente novamente."}
            actionLabel={isFetching ? "Tentando..." : "Tentar novamente"}
            onAction={() => refetch()}
            disabled={isFetching}
          />
        ) : isFirstUse ? (
          <FirstAdmin onDone={() => refetch()} next={next} />
        ) : (
          <PinLogin profiles={profiles ?? []} next={next} />
        )}
      </div>
    </div>
  );
}

function AuthStatusCard({
  title,
  message,
  actionLabel,
  onAction,
  disabled,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-surface border border-border p-5 shadow-xl text-center">
      <h2 className="text-lg font-display font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      {actionLabel && onAction ? (
        <Button className="mt-4 w-full" onClick={onAction} disabled={disabled}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

function PinLogin({ profiles, next }: { profiles: { id: string | null; full_name: string | null; slug: string | null; avatar_color: string | null }[]; next?: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit() {
    if (!selected) return;
    if (pin.length < 6) { toast.error("O PIN tem no mínimo 6 dígitos."); return; }
    setLoading(true);
    const { error } = await signInWithPin(selected, pin);
    setLoading(false);
    if (error) { toast.error("PIN incorreto."); setPin(""); return; }
    await supabase.from("logs").insert({ action: "login", entity: "auth", user_id: (await supabase.auth.getUser()).data.user?.id });
    if (next) window.location.assign(next);
    else navigate({ to: "/inicio", replace: true });
  }

  const selectedProfile = profiles.find((p) => p.slug === selected);

  return (
    <div className="rounded-2xl bg-surface border border-border p-5 shadow-xl">
      {!selected ? (
        <>
          <h2 className="text-sm text-muted-foreground mb-3">Selecione seu nome</h2>
          <div className="grid grid-cols-2 gap-2">
            {profiles.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelected(p.slug)}
                className="rounded-xl border border-border p-3 flex flex-col items-center gap-2 hover:bg-muted transition"
              >
                <div className="h-12 w-12 rounded-full bg-primary/20 grid place-items-center font-semibold text-primary">
                  {(p.full_name ?? "").slice(0, 2).toUpperCase()}
                </div>
                <span className="text-sm font-medium leading-tight text-center">{p.full_name}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <button onClick={() => { setSelected(null); setPin(""); }} className="text-xs text-muted-foreground mb-3">← trocar usuário</button>
          <div className="text-center mb-4">
            <div className="h-14 w-14 rounded-full bg-primary/20 grid place-items-center mx-auto font-semibold text-primary text-lg">
              {(selectedProfile?.full_name ?? "").slice(0, 2).toUpperCase()}
            </div>
            <div className="mt-2 font-medium">{selectedProfile?.full_name}</div>
          </div>
          <label className="text-xs text-muted-foreground">PIN</label>
          <Input
            type="password" inputMode="numeric" maxLength={8} autoFocus
            value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="text-center text-2xl tracking-widest mt-1"
          />
          <PinPad onKey={(k) => setPin((p) => k === "back" ? p.slice(0, -1) : (p + k).slice(0, 8))} />
          <Button className="w-full mt-3" disabled={loading} onClick={submit}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </>
      )}
    </div>
  );
}

function PinPad({ onKey }: { onKey: (k: string) => void }) {
  const keys = ["1","2","3","4","5","6","7","8","9","","0","back"];
  return (
    <div className="grid grid-cols-3 gap-2 mt-4">
      {keys.map((k, i) => k === "" ? <div key={i} /> : (
        <button key={i} type="button" onClick={() => onKey(k)}
          aria-label={k === "back" ? "Apagar" : undefined}
          className="h-14 rounded-xl bg-muted hover:bg-secondary text-xl font-medium text-foreground active:scale-95 transition">
          {k === "back" ? "⌫" : k}
        </button>
      ))}
    </div>
  );
}

function FirstAdmin({ onDone, next }: { onDone: () => void; next?: string }) {
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const bootstrap = useServerFn(bootstrapFirstAdmin);
  const navigate = useNavigate();

  async function submit() {
    if (!name.trim() || pin.length < 6 || pin.length > 8) {
      toast.error("Nome e PIN (6 a 8 dígitos) obrigatórios."); return;
    }
    setLoading(true);
    const slug = slugify(name);
    try {
      await bootstrap({ data: { fullName: name.trim(), slug, pin } });
      toast.success("Primeiro administrador criado!");
      const { error } = await signInWithPin(slug, pin);
      if (error) {
        toast.message("Faça login com seu PIN para continuar.");
        onDone();
      } else if (next) {
        window.location.assign(next);
      } else {
        navigate({ to: "/inicio", replace: true });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar administrador.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl bg-surface border border-border p-5">
      <h2 className="text-lg font-display font-semibold">Configuração inicial</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Nenhum usuário cadastrado ainda. Crie a conta do primeiro administrador.
      </p>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground">Seu nome</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: João Silva" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">PIN (6 a 8 dígitos)</label>
          <Input type="password" inputMode="numeric" maxLength={8} value={pin}
                 onChange={(e) => setPin(e.target.value.replace(/\D/g,""))} className="text-center text-xl tracking-widest" />
        </div>
        <Button className="w-full" onClick={submit} disabled={loading}>
          {loading ? "Criando..." : "Criar administrador"}
        </Button>
      </div>
    </div>
  );
}
