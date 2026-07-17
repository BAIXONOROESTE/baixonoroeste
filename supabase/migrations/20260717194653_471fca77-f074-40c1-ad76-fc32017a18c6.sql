
-- 1) checklist_templates
CREATE TABLE public.checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_templates TO authenticated;
GRANT ALL ON public.checklist_templates TO service_role;
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklist_templates select" ON public.checklist_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "checklist_templates insert sup/admin" ON public.checklist_templates FOR INSERT TO authenticated WITH CHECK (public.current_user_is_supervisor_or_admin());
CREATE POLICY "checklist_templates update sup/admin" ON public.checklist_templates FOR UPDATE TO authenticated USING (public.current_user_is_supervisor_or_admin()) WITH CHECK (public.current_user_is_supervisor_or_admin());
CREATE POLICY "checklist_templates delete sup/admin" ON public.checklist_templates FOR DELETE TO authenticated USING (public.current_user_is_supervisor_or_admin());
CREATE TRIGGER trg_checklist_templates_updated BEFORE UPDATE ON public.checklist_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) checklist_template_items
CREATE TABLE public.checklist_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  position INT NOT NULL,
  title TEXT NOT NULL,
  orientacao TEXT,
  evidence_required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_template_items TO authenticated;
GRANT ALL ON public.checklist_template_items TO service_role;
ALTER TABLE public.checklist_template_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklist_template_items select" ON public.checklist_template_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "checklist_template_items insert sup/admin" ON public.checklist_template_items FOR INSERT TO authenticated WITH CHECK (public.current_user_is_supervisor_or_admin());
CREATE POLICY "checklist_template_items update sup/admin" ON public.checklist_template_items FOR UPDATE TO authenticated USING (public.current_user_is_supervisor_or_admin()) WITH CHECK (public.current_user_is_supervisor_or_admin());
CREATE POLICY "checklist_template_items delete sup/admin" ON public.checklist_template_items FOR DELETE TO authenticated USING (public.current_user_is_supervisor_or_admin());
CREATE TRIGGER trg_checklist_template_items_updated BEFORE UPDATE ON public.checklist_template_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) checklist_runs
CREATE TABLE public.checklist_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.checklist_templates(id),
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento','aguardando_aprovacao','aprovado','reprovado')),
  started_by UUID NOT NULL REFERENCES auth.users(id),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_runs TO authenticated;
GRANT ALL ON public.checklist_runs TO service_role;
ALTER TABLE public.checklist_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklist_runs select" ON public.checklist_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "checklist_runs insert self" ON public.checklist_runs FOR INSERT TO authenticated WITH CHECK (started_by = auth.uid());
CREATE POLICY "checklist_runs update owner or sup/admin" ON public.checklist_runs FOR UPDATE TO authenticated
  USING (started_by = auth.uid() OR public.current_user_is_supervisor_or_admin())
  WITH CHECK (started_by = auth.uid() OR public.current_user_is_supervisor_or_admin());
CREATE TRIGGER trg_checklist_runs_updated BEFORE UPDATE ON public.checklist_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) checklist_run_items
CREATE TABLE public.checklist_run_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.checklist_runs(id) ON DELETE CASCADE,
  template_item_id UUID NOT NULL REFERENCES public.checklist_template_items(id),
  done BOOLEAN NOT NULL DEFAULT FALSE,
  evidence_path TEXT,
  evidence_type TEXT CHECK (evidence_type IN ('foto','video')),
  observacao TEXT,
  done_by UUID REFERENCES auth.users(id),
  done_at TIMESTAMPTZ,
  review_status TEXT NOT NULL DEFAULT 'pendente' CHECK (review_status IN ('pendente','aprovado','reprovado')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_run_items TO authenticated;
GRANT ALL ON public.checklist_run_items TO service_role;
ALTER TABLE public.checklist_run_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklist_run_items select" ON public.checklist_run_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "checklist_run_items insert in own run or sup/admin" ON public.checklist_run_items FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_supervisor_or_admin()
    OR EXISTS (SELECT 1 FROM public.checklist_runs r WHERE r.id = run_id AND r.started_by = auth.uid())
  );
CREATE POLICY "checklist_run_items update participant or sup/admin" ON public.checklist_run_items FOR UPDATE TO authenticated
  USING (
    public.current_user_is_supervisor_or_admin()
    OR done_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.checklist_runs r WHERE r.id = run_id AND r.started_by = auth.uid())
  )
  WITH CHECK (
    public.current_user_is_supervisor_or_admin()
    OR done_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.checklist_runs r WHERE r.id = run_id AND r.started_by = auth.uid())
  );
CREATE TRIGGER trg_checklist_run_items_updated BEFORE UPDATE ON public.checklist_run_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) checklist_run_item_reviews (append-only)
CREATE TABLE public.checklist_run_item_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_item_id UUID NOT NULL REFERENCES public.checklist_run_items(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.checklist_runs(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES auth.users(id),
  action TEXT NOT NULL CHECK (action IN ('aprovar','reprovar')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.checklist_run_item_reviews TO authenticated;
GRANT ALL ON public.checklist_run_item_reviews TO service_role;
ALTER TABLE public.checklist_run_item_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "checklist_run_item_reviews select" ON public.checklist_run_item_reviews FOR SELECT TO authenticated USING (true);
CREATE POLICY "checklist_run_item_reviews insert sup/admin self" ON public.checklist_run_item_reviews FOR INSERT TO authenticated
  WITH CHECK (public.current_user_is_supervisor_or_admin() AND reviewer_id = auth.uid());

-- 6) Storage policies (bucket "checklist-evidence" já criado via tool)
CREATE POLICY "checklist-evidence select authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'checklist-evidence');

CREATE POLICY "checklist-evidence insert own folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'checklist-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "checklist-evidence update own folder"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'checklist-evidence'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "checklist-evidence delete own folder or sup/admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'checklist-evidence'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.current_user_is_supervisor_or_admin()
    )
  );

-- 7) Seed
DO $seed$
DECLARE
  _abertura UUID;
  _fechamento UUID;
BEGIN
  INSERT INTO public.checklist_templates (name) VALUES ('Abertura de Loja') RETURNING id INTO _abertura;
  INSERT INTO public.checklist_template_items (template_id, position, title, orientacao, evidence_required) VALUES
    (_abertura, 1, 'Separar garrafas vazias e organizar caixas no pátio', 'Juntar as garrafas vazias espalhadas nas caixas de bebida em uma única caixa; quando encher, iniciar outra. Colocar as caixas cheias na área externa da loja (o pessoal da entrega busca). Espalhar as caixas vazias pelo pátio.', TRUE),
    (_abertura, 2, 'Organizar mesas, cadeiras e bistrôs', 'Buscar mesas, cadeiras e bistrôs em cima do freezer, levar para fora da loja, espalhar pelo pátio e colocar as capas em cada mesa.', TRUE),
    (_abertura, 3, 'Limpeza geral da loja', 'Passar pano em cada mesa, limpar o chão do térreo, limpar banheiros, juntar e jogar fora todo o lixo.', TRUE),
    (_abertura, 4, 'Organizar balcão', 'Recolher produtos espalhados pelo balcão, organizar produtos na vitrine, juntar todas as máquinas de cartão.', TRUE),
    (_abertura, 5, 'Organizar freezer', 'Se já foi organizado no dia anterior, pular. Caso contrário: repor mercadoria fora do lugar, separar águas (com e sem gás) e separar cervejas.', TRUE),
    (_abertura, 6, 'Conferir e guardar mercadoria recebida', 'Se chegou muita mercadoria: abrir espaço nos freezers, guardar e organizar o restante ao longo do dia. Se chegou pouca: guardar no freezer de 5 portas. Priorizar produtos de maior giro (cervejas, tabacaria, refrigerantes, energéticos). Se não chegou mercadoria, pular.', TRUE);

  INSERT INTO public.checklist_templates (name) VALUES ('Fechamento de Loja') RETURNING id INTO _fechamento;
  INSERT INTO public.checklist_template_items (template_id, position, title, orientacao, evidence_required) VALUES
    (_fechamento, 1, 'Confirmar colaboradores disponíveis no turno', 'Se houver 3 colaboradores: um fecha as comandas e recebe pagamentos, outro organiza e recolhe mesas/cadeiras, outro inicia limpeza e organização dos copos. Se equipe reduzida, priorizar início antecipado do fechamento.', FALSE),
    (_fechamento, 2, 'Iniciar limpeza da loja', NULL, TRUE),
    (_fechamento, 3, 'Recolher engradados', 'Guardar do lado do freezer de carne e do lado do freezer de 5 portas.', TRUE),
    (_fechamento, 4, 'Guardar bistrôs', 'Guardar atrás do freezer de 5 portas.', TRUE),
    (_fechamento, 5, 'Trocar copos de vidro dos clientes por copo de plástico', 'Copos de plástico se encontram no balcão.', FALSE),
    (_fechamento, 6, 'Retirar mesas desocupadas e fechar comandas', NULL, FALSE),
    (_fechamento, 7, 'Recolher mesas e cadeiras e apagar as luzes', 'Guardar as cadeiras atrás do freezer de 5 portas. Guardar as mesas em cima do freezer horizontal.', TRUE),
    (_fechamento, 8, 'Conferir ambiente', 'É proibido deixar produtos ou materiais expostos.', TRUE),
    (_fechamento, 9, 'Ligar alarme', 'Alarme fica no andar de cima.', FALSE),
    (_fechamento, 10, 'Trancar a porta', 'Cada colaborador tem chave própria para trancar a loja, exceto o Freelancer, que não possui chave.', FALSE);
END
$seed$;
