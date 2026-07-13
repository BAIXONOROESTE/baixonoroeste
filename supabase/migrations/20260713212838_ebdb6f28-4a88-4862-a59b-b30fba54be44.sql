
-- count_item_history: scope reads to assigned counter or supervisor/admin
DROP POLICY IF EXISTS "signed-in read history" ON public.count_item_history;
CREATE POLICY "assigned or supervisor/admin read history"
ON public.count_item_history FOR SELECT
USING (
  public.current_user_is_supervisor_or_admin()
  OR EXISTS (
    SELECT 1 FROM public.inventories i
    WHERE i.id = count_item_history.inventory_id
      AND i.assigned_counter_id = auth.uid()
  )
);

-- logs: reads restricted to admin/supervisor or own rows; inserts require actor = auth.uid()
DROP POLICY IF EXISTS "signed-in read logs" ON public.logs;
CREATE POLICY "sup/admin or own read logs"
ON public.logs FOR SELECT
USING (
  public.current_user_is_supervisor_or_admin()
  OR user_id = auth.uid()
);

DROP POLICY IF EXISTS "signed-in insert logs" ON public.logs;
CREATE POLICY "own insert logs"
ON public.logs FOR INSERT
WITH CHECK (user_id = auth.uid());

-- losses: scope reads to creator, assigned counter of the related count_item, or sup/admin
DROP POLICY IF EXISTS "signed-in read losses" ON public.losses;
CREATE POLICY "assigned or supervisor/admin read losses"
ON public.losses FOR SELECT
USING (
  public.current_user_is_supervisor_or_admin()
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.count_items ci
    JOIN public.inventories i ON i.id = ci.inventory_id
    WHERE ci.id = losses.count_item_id
      AND i.assigned_counter_id = auth.uid()
  )
);

-- count_item_reviews: scope reads to reviewer, assigned counter, or sup/admin
DROP POLICY IF EXISTS "signed-in read reviews" ON public.count_item_reviews;
CREATE POLICY "assigned or supervisor/admin read reviews"
ON public.count_item_reviews FOR SELECT
USING (
  public.current_user_is_supervisor_or_admin()
  OR reviewer_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.inventories i
    WHERE i.id = count_item_reviews.inventory_id
      AND i.assigned_counter_id = auth.uid()
  )
);
