import * as React from 'react'
import { Body, Container, Head, Heading, Html, Img, Preview, Section, Text, Hr } from '@react-email/components'

const LOGO_URL = 'https://baixonoroeste.lovable.app/__l5e/assets-v1/638c74d2-7edb-45e6-9a02-192e4ce3a36e/baixo-logo.png'
import type { TemplateEntry } from './registry'

interface Row {
  created_at: string
  product: string
  code?: string
  quantity: number
  unit?: string
  cost: number
  reason: string
  observation?: string
  registered_by: string
}

interface CountFamilyRow {
  family: string
  items_counted: number
  divergences: number
  diff_value: number
}

interface MissingBarcodeRow {
  product: string
  code: string
  times: number
  reporters: string[]
}

interface Props {
  date_label?: string
  rows?: Row[]
  total_value?: number
  counts_by_family?: CountFamilyRow[]
  counts_total_items?: number
  counts_total_divergences?: number
  counts_total_diff_value?: number
  missing_barcodes?: MissingBarcodeRow[]
}

const LossesDaily = ({
  date_label = '—',
  rows = [],
  total_value = 0,
  counts_by_family = [],
  counts_total_items = 0,
  counts_total_divergences = 0,
  counts_total_diff_value = 0,
  missing_barcodes = [],
}: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>{`Resumo diário — ${date_label}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Img src={LOGO_URL} alt="Baixo Noroeste" width="160" style={{ display: 'block', margin: '0 auto 12px auto', maxWidth: '160px', height: 'auto' }} />
          <Heading style={h1}>Resumo diário — Baixo Noroeste</Heading>
          <Text style={sub}>{date_label}</Text>
        </Section>

        <Section>
          <Heading as="h2" style={h2}>Contagens do dia</Heading>
          <Section style={card}>
            <Text style={row}><strong>Itens contados:</strong> {counts_total_items}</Text>
            <Text style={row}><strong>Divergências:</strong> {counts_total_divergences}</Text>
            <Text style={row}><strong>Valor total de diferença:</strong> R$ {counts_total_diff_value.toFixed(2)}</Text>
          </Section>
          {counts_by_family.length === 0 ? (
            <Text style={muted}>Nenhuma contagem registrada no período.</Text>
          ) : (
            <table style={table} cellPadding={0} cellSpacing={0}>
              <thead>
                <tr>
                  <th style={th}>Família</th>
                  <th style={thNum}>Itens</th>
                  <th style={thNum}>Divergências</th>
                  <th style={thNum}>Dif. financeira</th>
                </tr>
              </thead>
              <tbody>
                {counts_by_family.map((f, i) => (
                  <tr key={i} style={i % 2 ? trAlt : trS}>
                    <td style={td}>{f.family}</td>
                    <td style={tdNum}>{f.items_counted}</td>
                    <td style={tdNum}>{f.divergences}</td>
                    <td style={{ ...tdNum, color: f.diff_value === 0 ? '#94a3b8' : f.diff_value > 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                      R$ {f.diff_value.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section>
          <Heading as="h2" style={h2}>Perdas & Quebras</Heading>
          <Section style={card}>
            <Text style={row}><strong>Total de lançamentos:</strong> {rows.length}</Text>
            <Text style={row}><strong>Valor total:</strong> R$ {total_value.toFixed(2)}</Text>
          </Section>
          {rows.length === 0 ? (
            <Text style={muted}>Nenhuma perda ou quebra registrada no período.</Text>
          ) : (
            <table style={table} cellPadding={0} cellSpacing={0}>
              <thead>
                <tr>
                  <th style={th}>Hora</th>
                  <th style={th}>Produto</th>
                  <th style={thNum}>Qtd</th>
                  <th style={thNum}>Valor</th>
                  <th style={th}>Motivo</th>
                  <th style={th}>Registrado por</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={i % 2 ? trAlt : trS}>
                    <td style={td}>{r.created_at}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{r.product}</div>
                      {r.code ? <div style={codeStyle}>{r.code}</div> : null}
                      {r.observation ? <div style={codeStyle}>Obs.: {r.observation}</div> : null}
                    </td>
                    <td style={tdNum}>{fmt(r.quantity)} {r.unit ?? ''}</td>
                    <td style={tdNum}>R$ {(r.quantity * r.cost).toFixed(2)}</td>
                    <td style={td}>{r.reason}</td>
                    <td style={td}>{r.registered_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section>
          <Heading as="h2" style={h2}>Produtos sem código de barras reportados</Heading>
          {missing_barcodes.length === 0 ? (
            <Text style={muted}>Nenhum produto reportado sem código de barras.</Text>
          ) : (
            <table style={table} cellPadding={0} cellSpacing={0}>
              <thead>
                <tr>
                  <th style={th}>Produto</th>
                  <th style={th}>Código interno</th>
                  <th style={thNum}>Relatos</th>
                  <th style={th}>Reportado por</th>
                </tr>
              </thead>
              <tbody>
                {missing_barcodes.map((m, i) => (
                  <tr key={i} style={i % 2 ? trAlt : trS}>
                    <td style={td}>{m.product}</td>
                    <td style={td}>{m.code}</td>
                    <td style={tdNum}>{m.times}</td>
                    <td style={td}>{m.reporters.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>



        <Hr style={hr} />
        <Text style={footer}>Gerado automaticamente às 05:00 (horário de Brasília).</Text>
      </Container>
    </Body>
  </Html>
)

function fmt(n: number): string {
  return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif', margin: 0, padding: 0 }
const container = { maxWidth: '720px', margin: '0 auto', padding: '24px' }
const header = { textAlign: 'center' as const, paddingBottom: '16px' }
const h1 = { color: '#f5b400', fontSize: '22px', margin: '0 0 4px 0' }
const h2 = { color: '#0b0b0f', fontSize: '16px', margin: '20px 0 8px 0' }
const sub = { color: '#64748b', fontSize: '14px', margin: 0 }
const card = { backgroundColor: '#faf7f0', border: '1px solid #eadfc4', borderRadius: '12px', padding: '16px' }
const row = { color: '#0b0b0f', fontSize: '14px', margin: '4px 0' }
const muted = { color: '#94a3b8', fontSize: '14px' }
const table = { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px', marginTop: '8px' }
const th = { textAlign: 'left' as const, padding: '8px 6px', borderBottom: '2px solid #eadfc4', color: '#64748b', fontWeight: 600 }
const thNum = { ...th, textAlign: 'right' as const }
const trS = { backgroundColor: '#ffffff' }
const trAlt = { backgroundColor: '#faf7f0' }
const td = { padding: '8px 6px', borderBottom: '1px solid #f1eadb', color: '#0b0b0f', verticalAlign: 'top' as const }
const tdNum = { ...td, textAlign: 'right' as const }
const codeStyle = { color: '#94a3b8', fontSize: '11px', marginTop: '2px' }
const hr = { borderColor: '#eadfc4', margin: '24px 0 12px 0' }
const footer = { color: '#94a3b8', fontSize: '11px', textAlign: 'center' as const }

export const template = {
  component: LossesDaily,
  subject: (d: Record<string, unknown>) => `[Baixo Noroeste] Resumo diário — ${d.date_label ?? ''}`,
  displayName: 'Resumo diário (contagens + perdas)',
  previewData: {
    date_label: '10/07/2026',
    total_value: 479.8,
    rows: [
      { created_at: '14:12', product: 'LICOR JAGERMEISTER 700ml', code: 'PRD00846', quantity: 2, unit: 'UN', cost: 239.9, reason: 'Quebra', observation: 'Caiu no estoque', registered_by: 'PEDROHMG' },
    ],
    counts_by_family: [
      { family: 'Bebidas', items_counted: 12, divergences: 3, diff_value: -45.6 },
      { family: 'Mercearia', items_counted: 8, divergences: 0, diff_value: 0 },
    ],
    counts_total_items: 20,
    counts_total_divergences: 3,
    counts_total_diff_value: -45.6,
  },
} satisfies TemplateEntry
