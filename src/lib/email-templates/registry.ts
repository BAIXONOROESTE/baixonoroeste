import type { ComponentType } from 'react'
import { template as countCompletedTemplate } from './count-completed'
import { template as lossesDailyTemplate } from './losses-daily'


export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'count-completed': countCompletedTemplate,
}
