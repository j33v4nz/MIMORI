-- LOCAL DEVELOPMENT ONLY. Never apply this file to a hosted production database.
-- This identity supports DISABLE_AUTH=true; it has no password or auth identity
-- and cannot be used for password login. Real users sign up through the dashboard.
INSERT INTO public.organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'MIMORI Dev')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, aud, role, email, encrypted_password,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
        'sandbox@mimori.local', NULL, '{}'::jsonb, '{}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.org_members (org_id, user_id, role)
VALUES ('00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000001', 'owner')
ON CONFLICT (org_id, user_id) DO NOTHING;
