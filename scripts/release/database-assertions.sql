BEGIN;
-- Production's signup trigger is tested separately below. Deterministic
-- fixture tenants avoid external identities and pre-existing developer data.
ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created;
INSERT INTO auth.users(id, email) VALUES
 ('20000000-0000-0000-0000-000000000001', 'owner-a@example.invalid'),
 ('20000000-0000-0000-0000-000000000002', 'owner-b@example.invalid'),
 ('20000000-0000-0000-0000-000000000003', 'member-a@example.invalid');
ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created;
INSERT INTO organizations(id, name) VALUES
 ('10000000-0000-0000-0000-000000000001', 'Test tenant A'),
 ('10000000-0000-0000-0000-000000000002', 'Test tenant B');
INSERT INTO org_members(org_id, user_id, role) VALUES
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','owner'),
 ('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','owner'),
 ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000003','member');
INSERT INTO rules(id,org_id,name,pattern,pattern_type,category,severity,enabled) VALUES
 ('80000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',
  'Foreign provenance fixture','fixture','keyword','threat','high',true);
INSERT INTO agents(id,org_id,name) VALUES
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Agent A'),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Agent B');
INSERT INTO sessions(id,org_id,agent_id) VALUES
 ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001'),
 ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002');
INSERT INTO events(id,org_id,session_id,event_type,payload,sequence_number) VALUES
 ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','manual','{}',1),
 ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','manual','{}',1);
INSERT INTO api_keys(id,org_id,key_prefix,key_hash,name) VALUES
 ('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','fixture',repeat('a',64),'test'),
 ('60000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','fixture',repeat('b',64),'oversized-batch-test');
INSERT INTO detections(id,event_id,org_id,layer,rule_id,category,severity,confidence,verdict)
SELECT '70000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',
       '10000000-0000-0000-0000-000000000001','rule',id,'threat','high',0.9,'malicious'
FROM rules WHERE org_id='10000000-0000-0000-0000-000000000001' ORDER BY name LIMIT 1;
INSERT INTO judge_settings(org_id,provider,model) VALUES
 ('10000000-0000-0000-0000-000000000001','ollama','fixture');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',true);
DO $$ DECLARE changed integer; BEGIN
 IF (SELECT count(*) FROM agents) <> 1 OR (SELECT count(*) FROM sessions) <> 1 OR (SELECT count(*) FROM events) <> 1 THEN
   RAISE EXCEPTION 'Tenant A can read another tenant or cannot read its own rows';
 END IF;
 IF (SELECT count(*) FROM rules) <> 12 OR EXISTS(SELECT 1 FROM rules WHERE org_id <> '10000000-0000-0000-0000-000000000001') THEN
   RAISE EXCEPTION 'Legacy permissive rule read policy bypasses tenant scope';
 END IF;
 UPDATE rules SET enabled=false WHERE org_id='10000000-0000-0000-0000-000000000002';
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed <> 0 THEN RAISE EXCEPTION 'Cross-tenant rule toggle was permitted'; END IF;
 UPDATE events SET payload='{"changed":true}' WHERE id='50000000-0000-0000-0000-000000000002';
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed <> 0 THEN RAISE EXCEPTION 'Cross-tenant update was permitted'; END IF;
 BEGIN
   INSERT INTO events(org_id,session_id,event_type,payload,sequence_number) VALUES
    ('10000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000002','manual','{}',2);
   RAISE EXCEPTION 'Cross-tenant insert was permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 -- An own-org label cannot authorize links into another tenant's graph.
 BEGIN
   INSERT INTO sessions(org_id,agent_id) VALUES
    ('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002');
   RAISE EXCEPTION 'Own-org session linked to foreign agent';
 EXCEPTION WHEN foreign_key_violation OR insufficient_privilege THEN NULL; END;
 BEGIN
   INSERT INTO detections(event_id,org_id,layer,rule_id,category,severity,verdict) VALUES
    ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','rule',
     '80000000-0000-0000-0000-000000000002','threat','high','malicious');
   RAISE EXCEPTION 'Authenticated detection referenced a foreign tenant rule';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
   UPDATE detections SET rule_id='80000000-0000-0000-0000-000000000002'
    WHERE id='70000000-0000-0000-0000-000000000001';
   GET DIAGNOSTICS changed=ROW_COUNT;
   IF changed <> 0 THEN RAISE EXCEPTION 'Authenticated detection reassigned to a foreign tenant rule'; END IF;
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
   INSERT INTO events(org_id,session_id,event_type,payload,sequence_number) VALUES
    ('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','manual','{}',42);
   RAISE EXCEPTION 'Own-org event linked to foreign session';
 EXCEPTION WHEN foreign_key_violation OR insufficient_privilege THEN NULL; END;
 BEGIN
   INSERT INTO detections(event_id,org_id,layer,category,severity,verdict) VALUES
    ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','llm_judge','threat','high','malicious');
   RAISE EXCEPTION 'Own-org detection linked to foreign event';
 EXCEPTION WHEN foreign_key_violation OR insufficient_privilege THEN NULL; END;
 BEGIN
   UPDATE sessions SET agent_id='30000000-0000-0000-0000-000000000002'
    WHERE id='40000000-0000-0000-0000-000000000001';
   GET DIAGNOSTICS changed=ROW_COUNT;
   IF changed <> 0 THEN RAISE EXCEPTION 'Own-org session reassigned to foreign agent'; END IF;
 EXCEPTION WHEN foreign_key_violation OR insufficient_privilege THEN NULL; END;
 BEGIN
   UPDATE events SET session_id='40000000-0000-0000-0000-000000000002'
    WHERE id='50000000-0000-0000-0000-000000000001';
   GET DIAGNOSTICS changed=ROW_COUNT;
   IF changed <> 0 THEN RAISE EXCEPTION 'Own-org event reassigned to foreign session'; END IF;
 EXCEPTION WHEN foreign_key_violation OR insufficient_privilege THEN NULL; END;
 BEGIN
   UPDATE detections SET event_id='50000000-0000-0000-0000-000000000002'
    WHERE id='70000000-0000-0000-0000-000000000001';
   GET DIAGNOSTICS changed=ROW_COUNT;
   IF changed <> 0 THEN RAISE EXCEPTION 'Own-org detection reassigned to foreign event'; END IF;
 EXCEPTION WHEN foreign_key_violation OR insufficient_privilege THEN NULL; END;
 BEGIN
   UPDATE detections SET org_id='10000000-0000-0000-0000-000000000002'
    WHERE id='70000000-0000-0000-0000-000000000001';
   GET DIAGNOSTICS changed=ROW_COUNT;
   IF changed <> 0 THEN RAISE EXCEPTION 'Detection reassigned to foreign organization'; END IF;
 EXCEPTION WHEN foreign_key_violation OR insufficient_privilege THEN NULL; END;
 IF has_function_privilege(current_user,'public.check_rate_limit(uuid,integer,integer,integer)','EXECUTE') THEN
   RAISE EXCEPTION 'Authenticated role can invoke worker limiter';
 END IF;
 IF has_function_privilege(current_user,'private.seed_new_org_rules()','EXECUTE') THEN
   RAISE EXCEPTION 'Authenticated role can invoke private rule provisioning';
 END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000002',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM events) <> 1 OR EXISTS(SELECT 1 FROM events WHERE org_id='10000000-0000-0000-0000-000000000001') THEN
   RAISE EXCEPTION 'Tenant B isolation failed';
 END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',true);
DO $$ DECLARE changed integer; BEGIN
 UPDATE judge_settings SET model='unauthorized';
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed <> 0 THEN RAISE EXCEPTION 'Non-owner can change judge settings'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','',true);
DO $$ BEGIN
 IF private.is_org_member('10000000-0000-0000-0000-000000000001') OR EXISTS(SELECT 1 FROM events) THEN
   RAISE EXCEPTION 'NULL-auth membership bypass resurrected';
 END IF;
 IF EXISTS(SELECT 1 FROM rules) THEN RAISE EXCEPTION 'NULL-auth can read tenant rules'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
 IF private.is_org_member('10000000-0000-0000-0000-000000000001') THEN
   RAISE EXCEPTION 'Anonymous membership bypass';
 END IF;
 IF has_function_privilege(current_user,'public.check_rate_limit(uuid,integer,integer,integer)','EXECUTE') THEN
   RAISE EXCEPTION 'Anonymous role can invoke worker limiter';
 END IF;
 IF has_function_privilege(current_user,'private.seed_new_org_rules()','EXECUTE') THEN
   RAISE EXCEPTION 'Anonymous role can invoke private rule provisioning';
 END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$ DECLARE first_check record; second_check record; oversized_check record; BEGIN
 IF (SELECT count(*) FROM events) <> 2 THEN RAISE EXCEPTION 'Worker cannot read all fixture tenants'; END IF;
 BEGIN
   INSERT INTO detections(event_id,org_id,layer,rule_id,category,severity,verdict) VALUES
    ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','rule',
     '80000000-0000-0000-0000-000000000002','threat','high','malicious');
   RAISE EXCEPTION 'Worker detection referenced a foreign tenant rule';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
   UPDATE detections SET rule_id='80000000-0000-0000-0000-000000000002'
    WHERE id='70000000-0000-0000-0000-000000000001';
   RAISE EXCEPTION 'Worker detection reassigned to a foreign tenant rule';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 SELECT * INTO first_check FROM check_rate_limit('60000000-0000-0000-0000-000000000001',60,120,100);
 SELECT * INTO second_check FROM check_rate_limit('60000000-0000-0000-0000-000000000001',60,120,30);
 IF NOT first_check.allowed OR second_check.allowed THEN RAISE EXCEPTION 'Atomic event-count limiter failed'; END IF;
 SELECT * INTO oversized_check FROM check_rate_limit('60000000-0000-0000-0000-000000000002',60,120,500);
 IF oversized_check.allowed THEN RAISE EXCEPTION 'Limiter allowed a single over-budget batch by clamping its charge'; END IF;
 UPDATE rate_limit_counters SET window_start=now()-interval '2 minutes', count=0
   WHERE api_key_id='60000000-0000-0000-0000-000000000002';
 SELECT * INTO oversized_check FROM check_rate_limit('60000000-0000-0000-0000-000000000002',60,120,500);
 IF oversized_check.allowed THEN RAISE EXCEPTION 'Limiter admitted over-budget batch after window reset'; END IF;
 UPDATE rate_limit_counters SET window_start=now()-interval '2 minutes', count=121
   WHERE api_key_id='60000000-0000-0000-0000-000000000002';
 SELECT * INTO oversized_check FROM check_rate_limit('60000000-0000-0000-0000-000000000002',60,120,1);
 IF NOT oversized_check.allowed OR oversized_check.current_count <> 1 THEN
   RAISE EXCEPTION 'Limiter failed to restore a legitimate budget after reset';
 END IF;
 BEGIN
   INSERT INTO llm_judge_jobs(event_id,org_id) VALUES
    ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001');
   RAISE EXCEPTION 'Worker linked judge job to foreign tenant event';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 BEGIN
   INSERT INTO events(org_id,session_id,event_type,payload,sequence_number) VALUES
    ('10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','manual','{}',43);
   RAISE EXCEPTION 'Worker bypassed event parent/tenant integrity';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 DELETE FROM api_keys WHERE id='60000000-0000-0000-0000-000000000002';
 IF EXISTS(SELECT 1 FROM rate_limit_counters WHERE api_key_id='60000000-0000-0000-0000-000000000002') THEN
   RAISE EXCEPTION 'Key deletion left an orphan rate counter';
 END IF;
END $$;
RESET ROLE;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('20000000-0000-0000-0000-000000000004','signup@example.invalid','{"name":"Signup fixture"}');
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM org_members WHERE user_id='20000000-0000-0000-0000-000000000004' AND role='owner') THEN
   RAISE EXCEPTION 'Signup organization trigger failed';
 END IF;
 IF (SELECT count(*) FROM rules JOIN org_members USING(org_id)
     WHERE user_id='20000000-0000-0000-0000-000000000004') <> 12 THEN
   RAISE EXCEPTION 'Signup organization lacks its twelve starter rules';
 END IF;
 IF (SELECT count(*) FROM rules WHERE enabled) < 6 THEN RAISE EXCEPTION 'Core rule seed missing'; END IF;
END $$;
ROLLBACK;
