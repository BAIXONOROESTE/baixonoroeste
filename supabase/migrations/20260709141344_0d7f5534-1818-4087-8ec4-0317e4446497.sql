-- 1. Telefone no perfil
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;

-- 2. Pedidos de fechamento de inventário
CREATE TYPE public.close_request_status AS ENUM ('pendente', 'aprovado', 'recusado', 'cancelado');

CREATE TABLE public.close_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id UUID NOT NULL REFERENCES public.inventories(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.close_request_status NOT NULL DEFAULT 'pendente',
  push_to_omie BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approval_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  message TEXT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.close_requests TO authenticated;
GRANT ALL ON public.close_requests TO service_role;
-- anon precisa ler pelo token (link do whatsapp abre antes do login)
GRANT SELECT ON public.close_requests TO anon;

ALTER TABLE public.close_requests ENABLE ROW LEVEL SECURITY;

-- Contadores criam o próprio pedido
CREATE POLICY "authenticated can create own close request"
ON public.close_requests FOR INSERT TO authenticated
WITH CHECK (auth.uid() = requested_by);

-- Autor vê o próprio pedido; supervisor/admin veem todos
CREATE POLICY "authenticated read close requests"
ON public.close_requests FOR SELECT TO authenticated
USING (
  auth.uid() = requested_by
  OR public.current_user_is_supervisor_or_admin()
);

-- Só supervisor/admin aprova ou recusa
CREATE POLICY "supervisor updates close requests"
ON public.close_requests FOR UPDATE TO authenticated
USING (public.current_user_is_supervisor_or_admin())
WITH CHECK (public.current_user_is_supervisor_or_admin());

CREATE INDEX idx_close_requests_status ON public.close_requests(status);
CREATE INDEX idx_close_requests_inventory ON public.close_requests(inventory_id);

CREATE TRIGGER trg_close_requests_updated_at
BEFORE UPDATE ON public.close_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Fila de notificações (agrupamento de divergências)
CREATE TABLE public.notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,                 -- 'divergencia' | 'close_request'
  inventory_id UUID REFERENCES public.inventories(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now() + interval '5 minutes',
  sent_at TIMESTAMPTZ,
  error TEXT,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.notification_outbox TO service_role;

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
-- Sem policies para authenticated/anon — tabela é só backend (service_role)

CREATE INDEX idx_outbox_pending ON public.notification_outbox(scheduled_for) WHERE sent_at IS NULL;
CREATE INDEX idx_outbox_dedup ON public.notification_outbox(kind, inventory_id) WHERE sent_at IS NULL;