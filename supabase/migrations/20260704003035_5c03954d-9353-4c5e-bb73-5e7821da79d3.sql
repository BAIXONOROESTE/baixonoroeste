
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.families TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.count_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.losses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loss_reasons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT SELECT, INSERT ON public.logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sync_log TO authenticated;

GRANT ALL ON public.products, public.families, public.inventories, public.count_items,
             public.losses, public.loss_reasons, public.profiles, public.user_roles,
             public.settings, public.logs, public.sync_log TO service_role;
