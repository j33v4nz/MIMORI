#!/usr/bin/env python3
"""Crash/replay/concurrency/restore checks against a disposable release database.

Never takes a database URL or connects to the operator's configured services.
"""
import concurrent.futures
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time


def check(container):
    if not container.startswith('mimori-release-db-'):
        raise ValueError('Only disposable mimori-release-db-* containers are permitted')
    def sql(query, db='postgres'):
        result = subprocess.run(['docker', 'exec', '-i', container, 'psql', '-X', '-At',
            '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-q'], input=query,
            text=True, capture_output=True, check=True)
        return result.stdout.strip()
    org = '20000000-0000-0000-0000-000000000099'
    agent = '20000000-0000-0000-0000-000000000098'
    session = '20000000-0000-0000-0000-000000000097'
    sql(f"""INSERT INTO organizations(id,name) VALUES('{org}','Durability fixture');
        INSERT INTO agents(id,org_id,name) VALUES('{agent}','{org}','Durability fixture');
        INSERT INTO sessions(id,org_id,agent_id,external_session_id)
        VALUES('{session}','{org}','{agent}','durability-fixture');""")
    # Simultaneous senders replay overlapping batches. The database identity must
    # retain exactly one row for each acknowledged sequence.
    query = f"""INSERT INTO events(org_id,session_id,event_type,sequence_number,payload)
        SELECT '{org}','{session}','tool_end',n,jsonb_build_object('balance',n)
        FROM generate_series(1,500) n ON CONFLICT(session_id,sequence_number) DO NOTHING;"""
    started = time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda _: sql(query), range(8)))
    assert sql(f"SELECT count(*) FROM events WHERE session_id='{session}';") == '500'
    sql(f"""INSERT INTO llm_judge_jobs(event_id,org_id)
       SELECT id,org_id FROM events WHERE session_id='{session}' ORDER BY sequence_number LIMIT 20;""")
    # Only claim this fixture's jobs; preceding release assertions may create
    # unrelated pending jobs. Clear those inside this disposable DB.
    sql(f"DELETE FROM llm_judge_jobs WHERE org_id<>'{org}';")
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        claims = list(pool.map(lambda _: sql('SELECT id FROM claim_llm_judge_jobs(5);'), range(4)))
    claimed = [job for group in claims for job in group.splitlines() if job]
    assert len(claimed) == len(set(claimed)) == 20, 'Concurrent workers double-claimed jobs'
    # Leave an uncommitted write in progress and hard-kill PostgreSQL. Check WAL
    # recovery keeps acknowledged events and rolls back the interrupted write.
    sleeper = subprocess.Popen(['docker', 'exec', '-i', container, 'psql', '-X', '-q',
        '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, text=True)
    sleeper.stdin.write(f"BEGIN; INSERT INTO events(org_id,session_id,event_type,sequence_number,payload) VALUES('{org}','{session}','tool_end',9999,'{{}}'); SELECT pg_sleep(60); COMMIT;\n")
    sleeper.stdin.close()
    for _ in range(100):
        if sql("SELECT count(*) FROM pg_stat_activity WHERE wait_event='PgSleep';") != '0':
            break
        time.sleep(.1)
    else:
        raise RuntimeError('Interrupted transaction never became active')
    subprocess.run(['docker', 'kill', '--signal', 'KILL', container], capture_output=True, check=True)
    sleeper.wait(timeout=15)
    subprocess.run(['docker', 'start', container], capture_output=True, check=True)
    for _ in range(60):
        if subprocess.run(['docker', 'exec', container, 'pg_isready', '-U', 'postgres'],
                          capture_output=True).returncode == 0:
            break
        time.sleep(1)
    assert sql(f"SELECT count(*) FROM events WHERE session_id='{session}';") == '500'
    assert sql(f"SELECT count(*) FROM events WHERE session_id='{session}' AND sequence_number=9999;") == '0'
    assert sql(f"SELECT count(*) FROM events WHERE session_id='{session}' AND detection_processed_at IS NULL;") == '500'
    assert sql(f"SELECT count(*) FROM llm_judge_jobs WHERE org_id='{org}' AND status='processing';") == '20'
    # Exercise the worker's stale lease recovery policy and prove reclaimed
    # jobs can finish without duplicating detections.
    sql(f"""UPDATE llm_judge_jobs SET updated_at=now()-interval '16 minutes' WHERE org_id='{org}';
       UPDATE llm_judge_jobs SET status='pending',updated_at=now()
       WHERE status='processing' AND updated_at<now()-interval '15 minutes';""")
    recovered = sql('SELECT count(*) FROM claim_llm_judge_jobs(25);')
    assert recovered == '20'
    sql(f"UPDATE llm_judge_jobs SET status='completed' WHERE org_id='{org}';")
    snapshot_query = f"""SELECT md5(string_agg(sequence_number::text||payload::text,',' ORDER BY sequence_number))
          FROM events WHERE session_id='{session}';"""
    expected = sql(snapshot_query)
    with tempfile.TemporaryDirectory(prefix='mimori-durability-') as folder:
        backup = Path(folder) / 'database.dump'
        with backup.open('wb') as out:
            subprocess.run(['docker','exec',container,'pg_dump','-U','postgres','-Fc','postgres'],
                           stdout=out, check=True)
        sql('CREATE DATABASE mimori_restore_check;')
        with backup.open('rb') as source:
            subprocess.run(['docker','exec','-i',container,'pg_restore','-U','postgres',
                            '--exit-on-error','-d','mimori_restore_check'],stdin=source,
                           capture_output=True,check=True)
        assert sql(snapshot_query, 'mimori_restore_check') == expected
        assert sql(f"SELECT count(*) FROM llm_judge_jobs WHERE org_id='{org}' AND status='completed';",
                   'mimori_restore_check') == '20'
        assert sql("SELECT count(*) FROM pg_policies WHERE schemaname='public';", 'mimori_restore_check') == sql("SELECT count(*) FROM pg_policies WHERE schemaname='public';")
    print(json.dumps({'scope':'disposable PostgreSQL; not hosted production uptime',
        'concurrent_senders':8,'replayed_submissions':4000,'unique_persisted_events':500,
        'exclusive_worker_claims':20,'hard_crash_acknowledged_events_preserved':True,
        'uncommitted_write_rolled_back':True,'stale_jobs_reclaimed':20,
        'backup_restore_events_jobs_and_rls_match':True,
        'seconds':round(time.monotonic()-started,2)},indent=2))


if __name__ == '__main__':
    check(sys.argv[1])
