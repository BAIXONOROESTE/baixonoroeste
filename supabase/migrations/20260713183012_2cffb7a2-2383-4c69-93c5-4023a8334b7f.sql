DROP POLICY IF EXISTS "signed-in read inventories" ON public.inventories;
DROP POLICY IF EXISTS "supervisor/admin update inventories" ON public.inventories;
DROP POLICY IF EXISTS "signed-in read counts" ON public.count_items;
DROP POLICY IF EXISTS "signed-in insert own counts" ON public.count_items;
DROP POLICY IF EXISTS "own or supervisor update counts" ON public.count_items;

CREATE POLICY "assigned or supervisor/admin read inventories"
ON public.inventories
FOR SELECT
TO authenticated
USING (
  public.current_user_is_supervisor_or_admin()
  OR assigned_counter_id = auth.uid()
);

CREATE POLICY "assigned or supervisor/admin update inventories"
ON public.inventories
FOR UPDATE
TO authenticated
USING (
  public.current_user_is_supervisor_or_admin()
  OR assigned_counter_id = auth.uid()
)
WITH CHECK (
  public.current_user_is_supervisor_or_admin()
  OR assigned_counter_id = auth.uid()
);

CREATE POLICY "assigned or supervisor/admin read counts"
ON public.count_items
FOR SELECT
TO authenticated
USING (
  public.current_user_is_supervisor_or_admin()
  OR EXISTS (
    SELECT 1
    FROM public.inventories i
    WHERE i.id = count_items.inventory_id
      AND i.assigned_counter_id = auth.uid()
  )
);

CREATE POLICY "assigned or supervisor/admin insert counts"
ON public.count_items
FOR INSERT
TO authenticated
WITH CHECK (
  public.current_user_is_supervisor_or_admin()
  OR (
    counted_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.inventories i
      WHERE i.id = count_items.inventory_id
        AND i.assigned_counter_id = auth.uid()
    )
  )
);

CREATE POLICY "assigned or supervisor/admin update counts"
ON public.count_items
FOR UPDATE
TO authenticated
USING (
  public.current_user_is_supervisor_or_admin()
  OR EXISTS (
    SELECT 1
    FROM public.inventories i
    WHERE i.id = count_items.inventory_id
      AND i.assigned_counter_id = auth.uid()
  )
)
WITH CHECK (
  public.current_user_is_supervisor_or_admin()
  OR EXISTS (
    SELECT 1
    FROM public.inventories i
    WHERE i.id = count_items.inventory_id
      AND i.assigned_counter_id = auth.uid()
  )
);