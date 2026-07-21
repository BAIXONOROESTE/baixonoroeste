import * as React from "react";
import { Body, Container, Head, Heading, Html, Img, Preview, Section, Text, Hr } from "@react-email/components";
import type { TemplateEntry } from "./registry";

const LOGO_URL = "https://baixonoroeste.lovable.app/__l5e/assets-v1/638c74d2-7edb-45e6-9a02-192e4ce3a36e/baixo-logo.png";

interface Props {
  title?: string;
  description?: string | null;
  reporter_name?: string;
  reported_at?: string;
  action_url?: string;
}

const MaintenanceTicket = ({
  title = "—",
  description,
  reporter_name = "—",
  reported_at = "—",
  action_url,
}: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>{`Novo chamado de manutenção — ${title}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Img src={LOGO_URL} alt="Baixo Noroeste" width="160" style={logo} />
          <Heading style={h1}>Inventário Baixo Noroeste</Heading>
          <Text style={sub}>Você foi designado para um chamado de manutenção</Text>
        </Section>

        <Section style={card}>
          <Text style={row}><strong>Chamado:</strong> {title}</Text>
          <Text style={row}><strong>Reportado por:</strong> {reporter_name}</Text>
          <Text style={row}><strong>Quando:</strong> {reported_at}</Text>
          {description ? (
            <Text style={{ ...row, marginTop: 12 }}><strong>Descrição:</strong> {description}</Text>
          ) : null}
        </Section>

        {action_url && (
          <Section style={{ textAlign: "center", marginTop: 20 }}>
            <a href={action_url} style={btn}>Abrir Manutenção</a>
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

const main = { backgroundColor: "#ffffff", fontFamily: "Inter, Arial, sans-serif", margin: 0, padding: 0 };
const container = { maxWidth: "640px", margin: "0 auto", padding: "24px" };
const header = { textAlign: "center" as const, paddingBottom: "16px" };
const logo = { display: "block", margin: "0 auto 12px auto", maxWidth: "160px", height: "auto" };
const h1 = { color: "#0b0b0f", fontSize: "20px", margin: "0 0 4px 0", fontWeight: 700 };
const sub = { color: "#64748b", fontSize: "14px", margin: 0 };
const card = { backgroundColor: "#faf7f0", border: "1px solid #eadfc4", borderRadius: "12px", padding: "16px" };
const row = { color: "#0b0b0f", fontSize: "14px", margin: "4px 0" };
const btn = { display: "inline-block", padding: "10px 20px", background: "#0b0b0f", color: "#ffffff", borderRadius: "8px", textDecoration: "none", fontWeight: 600, fontSize: "14px" };
const hr = { borderColor: "#eadfc4", margin: "24px 0 12px 0" };
const footer = { color: "#94a3b8", fontSize: "11px", textAlign: "center" as const };

export const maintenanceTicketTemplate = {
  component: MaintenanceTicket,
  subject: (d: Record<string, unknown>) => {
    const t = (d.title as string) ?? "Chamado";
    return `[Baixo Noroeste] Novo chamado de manutenção — ${t}`;
  },
  displayName: "Chamado de manutenção",
  previewData: {
    title: "Freezer com barulho estranho",
    description: "O freezer do estoque está fazendo um barulho fora do normal desde ontem.",
    reporter_name: "Colaborador João",
    reported_at: "20/07/2026 14:32",
    action_url: "https://baixonoroeste.lovable.app/manutencao",
  },
} satisfies TemplateEntry;
