CREATE TABLE public.missing_barcode_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  reported_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.missing_barcode_reports TO authenticated;
GRANT ALL ON public.missing_barcode_reports TO service_role;

ALTER TABLE public.missing_barcode_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read missing barcode reports"
  ON public.missing_barcode_reports FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated insert own missing barcode reports"
  ON public.missing_barcode_reports FOR INSERT
  TO authenticated
  WITH CHECK (reported_by = auth.uid());

CREATE INDEX idx_missing_barcode_reports_created_at ON public.missing_barcode_reports (created_at DESC);
CREATE INDEX idx_missing_barcode_reports_product_id ON public.missing_barcode_reports (product_id);