import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { fmtDateTime, fmtNumber, fmtMoney } from "@/lib/format";
import { useState } from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/_authenticated/relatorios")({ component: Relatorios });

type Tab = "divergencias" | "inventarios" | "financeiro" | "familias" | "funcionarios";

function Relatorios() {
  const [tab, setTab] = useState<Tab>("divergencias");
  const { data: rows, isLoading } = useQuery({
    queryKey: ["report", tab],
    queryFn: async () => {
      if (tab === "divergencias") {
        const { data } = await supabase.from("count_items")
          .select("created_at, quantity_before, quantity_counted, difference, financial_diff, status, product:products(name, code, family_name)")
          .eq("status", "divergencia").order("created_at", { ascending: false });
        return (data ?? []).map((r) => ({
          Data: fmtDateTime(r.created_at), Produto: r.product?.name, Código: r.product?.code,
          Família: r.product?.family_name, "Estoque anterior": r.quantity_before, "Contado": r.quantity_counted,
          Diferença: r.difference, "Δ R$": Number(r.financial_diff), Funcionário: "",
        }));
      }
      if (tab === "inventarios") {
        const { data } = await supabase.from("inventories").select("*").order("started_at", { ascending: false });
        return (data ?? []).map((r) => ({
          Nome: r.name, Tipo: r.type, Status: r.status,
          "Iniciado": fmtDateTime(r.started_at), "Fechado": fmtDateTime(r.closed_at), Por: "",
        }));
      }
      if (tab === "financeiro") {
        const { data } = await supabase.from("count_items").select("financial_diff, status");
        const per: Record<string, number> = {};
        (data ?? []).forEach((r) => { per[r.status] = (per[r.status] ?? 0) + Number(r.financial_diff ?? 0); });
        return Object.entries(per).map(([Status, v]) => ({ Status, "Δ R$": Number(v) }));
      }
      if (tab === "familias") {
        const { data } = await supabase.from("products").select("family_name, active");
        const per: Record<string, number> = {};
        (data ?? []).forEach((p) => { const f = p.family_name ?? "—"; per[f] = (per[f] ?? 0) + 1; });
        return Object.entries(per).map(([Família, v]) => ({ Família, "Produtos ativos": v }));
      }
      const { data } = await supabase.from("ranking_view").select("*").order("percentual", { ascending: false });
      return (data ?? []).map((r) => ({
        Funcionário: r.full_name, Mês: r.month, Conferidos: r.conferidos, Acertos: r.acertos,
        Divergências: r.divergencias, "Percentual": `${Number(r.percentual ?? 0).toFixed(1)}%`,
      }));
    },
  });

  function exportCSV() {
    if (!rows?.length) return;
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(";"), ...rows.map((r) => keys.map((k) => JSON.stringify((r as never as Record<string, unknown>)[k] ?? "")).join(";"))].join("\n");
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${tab}.csv`);
  }
  function exportXLSX() {
    if (!rows?.length) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows as never[]), tab);
    XLSX.writeFile(wb, `${tab}.xlsx`);
  }
  function exportPDF() {
    if (!rows?.length) return;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.text(`Relatório: ${tab}`, 14, 14);
    const keys = Object.keys(rows[0]);
    autoTable(doc, { head: [keys], body: rows.map((r) => keys.map((k) => String((r as never as Record<string, unknown>)[k] ?? ""))), startY: 20, styles: { fontSize: 8 } });
    doc.save(`${tab}.pdf`);
  }

  return (
    <div className="mx-auto max-w-md px-4 pt-4 space-y-4">
      <h1 className="text-2xl font-display font-semibold">Relatórios</h1>
      <div className="flex flex-wrap gap-1 text-xs">
        {(["divergencias","inventarios","financeiro","familias","funcionarios"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-1 rounded-full capitalize ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{t}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={exportCSV}><Download className="h-3 w-3 mr-1" />CSV</Button>
        <Button size="sm" variant="outline" onClick={exportXLSX}><Download className="h-3 w-3 mr-1" />Excel</Button>
        <Button size="sm" variant="outline" onClick={exportPDF}><Download className="h-3 w-3 mr-1" />PDF</Button>
      </div>
      <div className="rounded-2xl bg-surface border border-border overflow-hidden">
        {isLoading ? <div className="p-6 text-center text-sm text-muted-foreground">Carregando…</div> :
        !rows?.length ? <div className="p-6 text-center text-sm text-muted-foreground">Sem dados.</div> :
        <div className="overflow-x-auto"><table className="w-full text-xs">
          <thead className="bg-muted"><tr>{Object.keys(rows[0]).map((k) => <th key={k} className="text-left p-2">{k}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i} className="border-t border-border">{Object.keys(rows[0]).map((k) => {
              const v = (r as never as Record<string, unknown>)[k];
              return <td key={k} className="p-2">{typeof v === "number" && k.includes("R$") ? fmtMoney(v) : typeof v === "number" ? fmtNumber(v) : String(v ?? "")}</td>;
            })}</tr>
          ))}</tbody>
        </table></div>}
      </div>
    </div>
  );
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
