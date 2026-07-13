DROP POLICY IF EXISTS "signed-in read inv_products" ON public.inventory_products;
DROP POLICY IF EXISTS "signed-in read inv_families" ON public.inventory_families;

CREATE POLICY "assigned or supervisor/admin read inv_products"
ON public.inventory_products
FOR SELECT
TO authenticated
USING (
  public.current_user_is_supervisor_or_admin()
  OR EXISTS (
    SELECT 1
    FROM public.inventories i
    WHERE i.id = inventory_products.inventory_id
      AND i.assigned_counter_id = auth.uid()
  )
);

CREATE POLICY "assigned or supervisor/admin read inv_families"
ON public.inventory_families
FOR SELECT
TO authenticated
USING (
  public.current_user_is_supervisor_or_admin()
  OR EXISTS (
    SELECT 1
    FROM public.inventories i
    WHERE i.id = inventory_families.inventory_id
      AND i.assigned_counter_id = auth.uid()
  )
);