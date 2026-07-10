import * as React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Item {
  product: string
  code?: string
  expected: number
  counted: number
  diff: number
  diff_pct: number
  sent_to_omie: boolean
  unit?: string
}

interface Props {
  counter_name?: string
  inventory_name?: string
  family_name?: string
  finished_at?: string
  items?: Item[]
  mode?: 'individual' | 'closure'
  total_diff_value?: number
}

const CountCompleted = ({
  counter_name = '—',
  inventory_name = '—',
  family_name,
  finished_at,
  items = [],
  mode = 'individual',
  total_diff_value,
}: Props) => {
  const title = mode === 'closure' ? 'Inventário fechado' : 'Contagem concluída'
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>{`${title}: ${inventory_name} — ${counter_name}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Heading style={h1}>📦 Baixo Noroeste — Inventário</Heading>
            <Text style={sub}>{title}</Text>
          </Section>

          <Section style={card}>
            <Text style={row}><strong>Inventário:</strong> {inventory_name}</Text>
            {family_name ? <Text style={row}><strong>Família:</strong> {family_name}</Text> : null}
            <Text style={row}><strong>Contador:</strong> {counter_name}</Text>
            {finished_at ? <Text style={row}><strong>Concluído em:</strong> {finished_at}</Text> : null}
            {typeof total_diff_value === 'number' ? (
              <Text style={row}><strong>Diferença financeira total:</strong> R$ {total_diff_value.toFixed(2)}</Text>
            ) : null}
          </Section>

          <Section>
            <Heading as="h2" style={h2}>Produtos atualizados</Heading>
            {items.length === 0 ? (
              <Text style={muted}>Nenhum produto com divergência.</Text>
            ) : (
              <table style={table} cellPadding={0} cellSpacing={0}>
                <thead>
                  <tr>
                    <th style={th}>Produto</th>
                    <th style={thNum}>Sist.</th>
                    <th style={thNum}>Cont.</th>
                    <th style={thNum}>Dif.</th>
                    <th style={thNum}>%</th>
                    <th style={thNum}>Omie</th>
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
                      <td style={{ ...tdNum, color: it.diff === 0 ? '#94a3b8' : it.diff > 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                        {it.diff > 0 ? '+' : ''}{fmt(it.diff)}
                      </td>
                      <td style={tdNum}>{it.diff_pct.toFixed(1)}%</td>
                      <td style={tdNum}>{it.sent_to_omie ? '✓' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            Este email é gerado automaticamente pelo sistema de inventário Baixo Noroeste.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

function fmt(n: number): string {
  return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif', margin: 0, padding: 0 }
const container = { maxWidth: '640px', margin: '0 auto', padding: '24px' }
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
const tr = { backgroundColor: '#ffffff' }
const trAlt = { backgroundColor: '#faf7f0' }
const td = { padding: '8px 6px', borderBottom: '1px solid #f1eadb', color: '#0b0b0f', verticalAlign: 'top' as const }
const tdNum = { ...td, textAlign: 'right' as const }
const codeStyle = { color: '#94a3b8', fontSize: '11px', marginTop: '2px' }
const hr = { borderColor: '#eadfc4', margin: '24px 0 12px 0' }
const footer = { color: '#94a3b8', fontSize: '11px', textAlign: 'center' as const }

export const template = {
  component: CountCompleted,
  subject: (d: Record<string, unknown>) => {
    const inv = (d.inventory_name as string) ?? 'Inventário'
    const mode = d.mode === 'closure' ? 'Fechado' : 'Contagem'
    return `[Baixo Noroeste] ${mode} — ${inv}`
  },
  displayName: 'Contagem/Fechamento concluído',
  previewData: {
    counter_name: 'PEDROHMG',
    inventory_name: 'Inventário Diário — 10/07',
    family_name: 'Bebidas',
    finished_at: '10/07/2026 15:42',
    mode: 'individual',
    total_diff_value: -34.5,
    items: [
      { product: 'Água Bioleve 500ml', code: '1023', expected: 120, counted: 118, diff: -2, diff_pct: -1.7, sent_to_omie: true, unit: 'UN' },
      { product: 'Refri Cola 2L', code: '2045', expected: 40, counted: 43, diff: 3, diff_pct: 7.5, sent_to_omie: true, unit: 'UN' },
    ],
  },
} satisfies TemplateEntry
