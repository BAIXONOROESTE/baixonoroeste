import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";

type State = "loading" | "valid" | "invalid" | "already" | "confirming" | "done" | "error";

export const Route = createFileRoute("/unsubscribe")({
  validateSearch: (s: Record<string, unknown>) => ({ token: (s.token as string) ?? "" }),
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const { token } = useSearch({ from: "/unsubscribe" });
  const [state, setState] = useState<State>("loading");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    (async () => {
      try {
        const r = await fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`);
        const j = await r.json();
        if (!r.ok) { setState("invalid"); return; }
        if (j.valid === false && j.reason === "already_unsubscribed") { setState("already"); return; }
        setState(j.valid ? "valid" : "invalid");
      } catch { setState("error"); }
    })();
  }, [token]);

  async function confirm() {
    setState("confirming");
    try {
      const r = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const j = await r.json();
      if (j.success) setState("done");
      else if (j.reason === "already_unsubscribed") setState("already");
      else { setState("error"); setMsg(j.error ?? ""); }
    } catch { setState("error"); }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full rounded-2xl border border-border bg-surface p-6 text-center space-y-4">
        <h1 className="text-xl font-display font-semibold">📦 Baixo Noroeste</h1>
        {state === "loading" && <p className="text-muted-foreground text-sm">Verificando...</p>}
        {state === "invalid" && <p className="text-sm">Link inválido ou expirado.</p>}
        {state === "already" && <p className="text-sm">Você já está descadastrado das notificações.</p>}
        {state === "valid" && (
          <>
            <p className="text-sm text-muted-foreground">Deseja parar de receber os emails do inventário?</p>
            <button onClick={confirm} className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
              Confirmar descadastro
            </button>
          </>
        )}
        {state === "confirming" && <p className="text-muted-foreground text-sm">Processando...</p>}
        {state === "done" && <p className="text-sm">Pronto! Você não vai mais receber estes emails.</p>}
        {state === "error" && <p className="text-sm text-destructive">Erro: {msg || "tente novamente."}</p>}
      </div>
    </div>
  );
}
