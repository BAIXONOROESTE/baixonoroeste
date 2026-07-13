
-- Tighten count_item_history INSERT: require the row belong to an inventory the actor is assigned to (or be supervisor/admin)
DROP POLICY IF EXISTS "signed-in insert history" ON public.count_item_history;
CREATE POLICY "assigned or supervisor/admin insert history"
ON public.count_item_history
FOR INSERT
TO authenticated
WITH CHECK (
  actor_id = auth.uid()
  AND (
    public.current_user_is_supervisor_or_admin()
    OR EXISTS (
      SELECT 1 FROM public.inventories i
      WHERE i.id = count_item_history.inventory_id
        AND i.assigned_counter_id = auth.uid()
    )
  )
);

-- Tighten count_items INSERT: require product_id to be part of the inventory's product list
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
    )
    AND EXISTS (
      SELECT 1 FROM public.inventory_products ip
      WHERE ip.inventory_id = count_items.inventory_id
        AND ip.product_id = count_items.product_id
    )
  )
);
