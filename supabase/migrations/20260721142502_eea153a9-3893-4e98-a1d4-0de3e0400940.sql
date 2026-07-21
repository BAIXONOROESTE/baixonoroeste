ALTER TABLE public.team_members DROP CONSTRAINT team_members_user_id_key;
ALTER TABLE public.team_members ADD CONSTRAINT team_members_user_id_team_id_key UNIQUE (user_id, team_id);