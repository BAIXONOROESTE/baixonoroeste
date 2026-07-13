import * as React from 'react'
import { Body, Container, Head, Heading, Html, Img, Preview, Section, Text, Hr } from '@react-email/components'
import type { TemplateEntry } from './registry'

const LOGO_URL = 'https://baixonoroeste.lovable.app/__l5e/assets-v1/638c74d2-7edb-45e6-9a02-192e4ce3a36e/baixo-logo.png'

interface Props {
  product_name?: string
  product_code?: string
  unit?: string
  quantity?: number
  unit_cost?: number
  financial_value?: number
  reason?: string
  observation?: string
  registered_by?: string
  inventory_name?: string | null
  registered_at?: string
}

const LossRegistered = ({
  product_name = '—',
  product_code = '',
  unit = '',
  quantity = 0,
  unit_cost = 0,
  financial_value = 0,
  reason = '—',
  observation = '',
  registered_by = '—',
  inventory_name = null,
  registered_at = '',
}: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>{`Perda registrada: ${product_name} (${quantity} ${unit})`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Img src={LOGO_URL} alt="Baixo Noroeste" width="160" style={{ display: 'block', margin: '0 auto 12px auto', maxWidth: '160px', height: 'auto' }} />
          <Heading style={h1}>Perda / Quebra registrada</Heading>
          <Text style={sub}>{registered_at}</Text>
        </Section>

        <Section style={card}>
          <Text style={row}><strong>Produto:</strong> {product_name}{product_code ? ` (${product_code})` : ''}</Text>
          <Text style={row}><strong>Quantidade:</strong> {quantity} {unit}</Text>
          <Text style={row}><strong>Custo unit.:</strong> R$ {Number(unit_cost).toFixed(2)}</Text>
          <Text style={row}><strong>Valor total:</strong> R$ {Number(financial_value).toFixed(2)}</Text>
          <Text style={row}><strong>Motivo:</strong> {reason}</Text>
          {inventory_name ? <Text style={row}><strong>Inventário:</strong> {inventory_name}</Text> : null}
          {observation ? <Text style={row}><strong>Observação:</strong> {observation}</Text> : null}
          <Text style={row}><strong>Registrado por:</strong> {registered_by}</Text>
        </Section>

        <Hr style={hr} />
        <Text style={footer}>Notificação automática do sistema de inventário.</Text>
      </Container>
    </Body>
  </Html>
)

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif', margin: 0, padding: 0 }
const container = { maxWidth: '640px', margin: '0 auto', padding: '24px' }
const header = { textAlign: 'center' as const, paddingBottom: '16px' }
const h1 = { color: '#f5b400', fontSize: '22px', margin: '0 0 4px 0' }
const sub = { color: '#64748b', fontSize: '13px', margin: 0 }
const card = { backgroundColor: '#faf7f0', border: '1px solid #eadfc4', borderRadius: '12px', padding: '16px' }
const row = { color: '#0b0b0f', fontSize: '14px', margin: '4px 0' }
const hr = { borderColor: '#eadfc4', margin: '24px 0 12px 0' }
const footer = { color: '#94a3b8', fontSize: '11px', textAlign: 'center' as const }

export const template = {
  component: LossRegistered,
  subject: (d: Record<string, unknown>) => `[Baixo Noroeste] Perda registrada — ${d.product_name ?? ''}`,
  displayName: 'Perda/quebra registrada',
  previewData: {
    product_name: 'LICOR JAGERMEISTER 700ml',
    product_code: 'PRD00846',
    unit: 'UN',
    quantity: 2,
    unit_cost: 239.9,
    financial_value: 479.8,
    reason: 'Quebra',
    observation: 'Caiu no estoque',
    registered_by: 'PEDROHMG',
    inventory_name: 'Inventário Julho',
    registered_at: '13/07/2026 14:12',
  },
} satisfies TemplateEntry
