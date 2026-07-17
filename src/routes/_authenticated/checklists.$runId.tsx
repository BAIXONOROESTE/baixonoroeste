import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/checklists/$runId")({
  head: () => ({ meta: [{ title: "Checklist · Baixo Noroeste" }] }),
  component: RunStub,
  errorComponent: ({ error, reset }) => {
    return (
      <div className="p-6 space-y-3">
        <h1 className="text-lg font-semibold">Erro ao carregar checklist</h1>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button onClick={reset}>Tentar novamente</Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">Checklist não encontrado.</div>,
});

function RunStub() {
  const { runId } = Route.useParams();
  const router = useRouter();
  return (
    <div className="p-6 space-y-4 max-w-md mx-auto">
      <h1 className="text-lg font-semibold">Wizard em construção</h1>
      <p className="text-sm text-muted-foreground">
        A execução item-a-item deste checklist será liberada na próxima entrega.
      </p>
      <p className="text-xs text-muted-foreground break-all">Run ID: {runId}</p>
      <Button variant="outline" onClick={() => router.history.back()}>Voltar</Button>
    </div>
  );
}
