import * as React from "react";
import { Body, Container, Head, Heading, Html, Img, Preview, Section, Text, Hr } from "@react-email/components";
import type { TemplateEntry } from "./registry";

const LOGO_URL = "https://baixonoroeste.lovable.app/__l5e/assets-v1/638c74d2-7edb-45e6-9a02-192e4ce3a36e/baixo-logo.png";

export type TaskKind = "assigned" | "recount" | "adjust" | "revalidation" | "approved";

interface Item {
  product: string;
  code?: string | null;
  expected?: number;
  counted?: number;
  diff?: number;
}

interface Props {
  kind: TaskKind;
  inventory_name?: string;
  actor_name?: string;
  reason?: string | null;
  deadline?: string | null;
  items?: Item[];
  action_url?: string;
}

const TITLES: Record<TaskKind, string> = {
  assigned: "Nova contagem designada a você",
  recount: "Recontagem solicitada",
  adjust: "Ajuste de contagem solicitado",
  revalidation: "Nova contagem aguardando validação",
  approved: "Inventário aprovado",
};

const SUBS: Record<TaskKind, string> = {
  assigned: "Você foi designado como responsável por uma contagem de estoque.",
  recount: "Alguns itens precisam ser recontados. Veja abaixo o motivo e a lista.",
  adjust: "Alguns itens precisam ter a quantidade ajustada. Veja abaixo.",
  revalidation: "O colaborador enviou uma nova contagem/ajuste. Por favor, valide.",
  approved: "A validação foi concluída e o inventário está aprovado.",
};

const TaskNotification = ({
  kind = "assigned",
  inventory_name = "—",
  actor_name,
  reason,
  deadline,
  items = [],
  action_url,
}: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>{`${TITLES[kind]} — ${inventory_name}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Img src={LOGO_URL} alt="Baixo Noroeste" width="160" style={logo} />
          <Heading style={h1}>Inventário Baixo Noroeste</Heading>
          <Text style={sub}>{TITLES[kind]}</Text>
        </Section>

        <Section style={card}>
          <Text style={row}><strong>Inventário:</strong> {inventory_name}</Text>
          {actor_name ? <Text style={row}><strong>Solicitado por:</strong> {actor_name}</Text> : null}
          {deadline ? <Text style={row}><strong>Prazo:</strong> {deadline}</Text> : null}
          <Text style={{ ...row, color: "#64748b", marginTop: 8 }}>{SUBS[kind]}</Text>
          {reason ? (
            <Text style={{ ...row, marginTop: 12 }}><strong>Motivo:</strong> {reason}</Text>
          ) : null}
        </Section>

        {items.length > 0 && (
          <Section>
            <Heading as="h2" style={h2}>Itens</Heading>
            <table style={table} cellPadding={0} cellSpacing={0}>
              <thead>
                <tr>
                  <th style={th}>Produto</th>
                  <th style={thNum}>Esp.</th>
                  <th style={thNum}>Cont.</th>
                  <th style={thNum}>Dif.</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} style={i % 2 ? trAlt : tr}>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{it.product}</div>
                      {it.code ? <div style={codeStyle}>{it.code}</div> : null}
                    </td>
                    <td style={tdNum}>{fmt(it.expected)}</td>
                    <td style={tdNum}>{fmt(it.counted)}</td>
                    <td style={{ ...tdNum, color: (it.diff ?? 0) > 0 ? "#22c55e" : (it.diff ?? 0) < 0 ? "#ef4444" : "#94a3b8", fontWeight: 600 }}>
                      {typeof it.diff === "number" ? (it.diff > 0 ? "+" : "") + fmt(it.diff) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        {action_url && (
          <Section style={{ textAlign: "center", marginTop: 20 }}>
            <a href={action_url} style={btn}>Abrir no aplicativo</a>
          </Section>
        )}

        <Hr style={hr} />
        <Text style={footer}>
          Este email é gerado automaticamente pelo sistema de inventário Baixo Noroeste.
        </Text>
      </Container>
    </Body>
  </Html>
);

function fmt(n?: number): string {
  if (typeof n !== "number") return "—";
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

const main = { backgroundColor: "#ffffff", fontFamily: "Inter, Arial, sans-serif", margin: 0, padding: 0 };
const container = { maxWidth: "640px", margin: "0 auto", padding: "24px" };
const header = { textAlign: "center" as const, paddingBottom: "16px" };
const logo = { display: "block", margin: "0 auto 12px auto", maxWidth: "160px", height: "auto" };
const h1 = { color: "#0b0b0f", fontSize: "20px", margin: "0 0 4px 0", fontWeight: 700 };
const h2 = { color: "#0b0b0f", fontSize: "16px", margin: "20px 0 8px 0" };
const sub = { color: "#64748b", fontSize: "14px", margin: 0 };
const card = { backgroundColor: "#faf7f0", border: "1px solid #eadfc4", borderRadius: "12px", padding: "16px" };
const row = { color: "#0b0b0f", fontSize: "14px", margin: "4px 0" };
const table = { width: "100%", borderCollapse: "collapse" as const, fontSize: "13px", marginTop: "8px" };
const th = { textAlign: "left" as const, padding: "8px 6px", borderBottom: "2px solid #eadfc4", color: "#64748b", fontWeight: 600 };
const thNum = { ...th, textAlign: "right" as const };
const tr = { backgroundColor: "#ffffff" };
const trAlt = { backgroundColor: "#faf7f0" };
const td = { padding: "8px 6px", borderBottom: "1px solid #f1eadb", color: "#0b0b0f", verticalAlign: "top" as const };
const tdNum = { ...td, textAlign: "right" as const };
const codeStyle = { color: "#94a3b8", fontSize: "11px", marginTop: "2px" };
const btn = { display: "inline-block", padding: "10px 20px", background: "#0b0b0f", color: "#ffffff", borderRadius: "8px", textDecoration: "none", fontWeight: 600, fontSize: "14px" };
const hr = { borderColor: "#eadfc4", margin: "24px 0 12px 0" };
const footer = { color: "#94a3b8", fontSize: "11px", textAlign: "center" as const };

function makeEntry(kind: TaskKind, label: string, subjectPrefix: string): TemplateEntry {
  return {
    component: (p: Props) => <TaskNotification {...p} kind={kind} />,
    subject: (d: Record<string, unknown>) => {
      const inv = (d.inventory_name as string) ?? "Inventário";
      return `[Baixo Noroeste] ${subjectPrefix} — ${inv}`;
    },
    displayName: label,
    previewData: {
      inventory_name: "Contagem de cervejas",
      actor_name: "Supervisor João",
      reason: "Quantidade divergente, favor recontar.",
      deadline: "12/07/2026 18:00",
      items: [{ product: "Cerveja X", code: "1023", expected: 50, counted: 45, diff: -5 }],
    },
  } satisfies TemplateEntry;
}

export const taskAssignedTemplate = makeEntry("assigned", "Tarefa designada", "Nova contagem");
export const recountRequestedTemplate = makeEntry("recount", "Recontagem solicitada", "Recontagem");
export const adjustRequestedTemplate = makeEntry("adjust", "Ajuste solicitado", "Ajuste");
export const revalidationNeededTemplate = makeEntry("revalidation", "Aguardando validação", "Nova validação");
export const taskApprovedTemplate = makeEntry("approved", "Inventário aprovado", "Aprovado");
