
DROP POLICY IF EXISTS "assigned or supervisor/admin insert counts" ON public.count_items;
CREATE POLICY "assigned or supervisor/admin insert counts"
ON public.count_items
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_user_is_supervisor_or_admin()
  OR (
    counted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.inventories i
      WHERE i.id = count_items.inventory_id
        AND i.assigned_counter_id = auth.uid()
        AND (
          i.type::text = 'geral'
          OR (
            i.type::text = 'familia'
            AND EXISTS (
              SELECT 1 FROM public.products p
              WHERE p.id = count_items.product_id
                AND p.family_id = i.family_id
            )
          )
          OR (
            i.type::text IN ('personalizado','produto')
            AND EXISTS (
              SELECT 1 FROM public.inventory_products ip
              WHERE ip.inventory_id = i.id
                AND ip.product_id = count_items.product_id
            )
          )
        )
    )
  )
);
