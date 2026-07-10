import sqlite3
import json
import time

DB = "C:/Users/Alexey/.local/share/mimocode/mimocode.db"
PROJECT_DIR = "C:/Users/Alexey/CascadeProjects/Portafor building permits"

conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# 1. List sessions for this project
print("=== PROJECT SESSIONS (newest first) ===")
cur.execute(
    "SELECT id, title, time_created FROM session WHERE directory LIKE '%Portafor%' ORDER BY time_created DESC"
)
sessions = cur.fetchall()
for s in sessions:
    print(f"  {s['id']} | {s['title']} | ts={s['time_created']}")

# 2. For the most recent non-checkpoint session, gather messages
for s in sessions:
    if 'checkpoint-writer' not in (s['title'] or ''):
        sid = s['id']
        print(f"\n=== RECENT MESSAGES for {sid} ({s['title']}) ===")
        
        cur.execute("""
            SELECT m.id as msg_id, json_extract(m.data, '$.role') as role, m.agent_id, m.time_created,
                   json_extract(p.data, '$.type') as part_type,
                   json_extract(p.data, '$.tool') as tool,
                   json_extract(p.data, '$.text') as text,
                   substr(CAST(json_extract(p.data, '$.state.output') AS TEXT), 1, 400) as tool_output
            FROM message m
            JOIN part p ON p.message_id = m.id
            WHERE m.session_id = ?
            ORDER BY m.time_created DESC, p.time_created DESC
            LIMIT 100
        """, (sid,))
        rows = cur.fetchall()
        
        msgs = {}
        for r in rows:
            mid = r['msg_id']
            if mid not in msgs:
                msgs[mid] = {'role': r['role'], 'agent_id': r['agent_id'], 'time': r['time_created'], 'parts': []}
            msgs[mid]['parts'].append({
                'type': r['part_type'],
                'tool': r['tool'],
                'text': r['text'],
                'tool_output': r['tool_output']
            })
        
        for mid, mdata in msgs.items():
            role = mdata['role']
            agent = mdata['agent_id'] or 'main'
            if role == 'user':
                text_parts = [p['text'] for p in mdata['parts'] if p['type'] == 'text' and p['text']]
                if text_parts:
                    print(f"  USER ({agent}): {text_parts[0][:300]}")
            elif role == 'assistant':
                text_parts = [p['text'] for p in mdata['parts'] if p['type'] == 'text' and p['text']]
                tool_names = [p['tool'] for p in mdata['parts'] if p['tool']]
                if text_parts:
                    combined = ' '.join([t[:200] for t in text_parts])
                    print(f"  ASST ({agent}): {combined[:300]}")
                if tool_names:
                    print(f"    tools: {tool_names}")
                for p in mdata['parts']:
                    if p['tool'] in ('write', 'edit', 'bash', 'memory') and p['tool_output']:
                        print(f"    [{p['tool']}] {p['tool_output'][:200]}")
        break

# 3. Also get the second most recent session
if len(sessions) > 1:
    for s in sessions[1:]:
        if 'checkpoint-writer' not in (s['title'] or ''):
            sid2 = s['id']
            print(f"\n=== RECENT MESSAGES for {sid2} ({s['title']}) ===")
            
            cur.execute("""
                SELECT m.id as msg_id, json_extract(m.data, '$.role') as role, m.agent_id,
                       json_extract(p.data, '$.type') as part_type,
                       json_extract(p.data, '$.tool') as tool,
                       json_extract(p.data, '$.text') as text,
                       substr(CAST(json_extract(p.data, '$.state.output') AS TEXT), 1, 400) as tool_output
                FROM message m
                JOIN part p ON p.message_id = m.id
                WHERE m.session_id = ?
                ORDER BY m.time_created DESC, p.time_created DESC
                LIMIT 60
            """, (sid2,))
            rows2 = cur.fetchall()
            
            msgs2 = {}
            for r in rows2:
                mid = r['msg_id']
                if mid not in msgs2:
                    msgs2[mid] = {'role': r['role'], 'agent_id': r['agent_id'], 'parts': []}
                msgs2[mid]['parts'].append({
                    'type': r['part_type'],
                    'tool': r['tool'],
                    'text': r['text'],
                    'tool_output': r['tool_output']
                })
            
            for mid, mdata in msgs2.items():
                role = mdata['role']
                agent = mdata['agent_id'] or 'main'
                if role == 'user':
                    text_parts = [p['text'] for p in mdata['parts'] if p['type'] == 'text' and p['text']]
                    if text_parts:
                        print(f"  USER ({agent}): {text_parts[0][:300]}")
                elif role == 'assistant':
                    text_parts = [p['text'] for p in mdata['parts'] if p['type'] == 'text' and p['text']]
                    tool_names = [p['tool'] for p in mdata['parts'] if p['tool']]
                    if text_parts:
                        combined = ' '.join([t[:200] for t in text_parts])
                        print(f"  ASST ({agent}): {combined[:300]}")
                    if tool_names:
                        print(f"    tools: {tool_names}")
                    for p in mdata['parts']:
                        if p['tool'] in ('write', 'edit', 'bash', 'memory') and p['tool_output']:
                            print(f"    [{p['tool']}] {p['tool_output'][:200]}")
            break

# 4. Search for user directives across all project sessions
print("\n=== USER DIRECTIVES ===")
cur.execute("""
    SELECT m.session_id, json_extract(p.data, '$.text') as text
    FROM message m
    JOIN part p ON p.message_id = m.id
    WHERE json_extract(m.data, '$.role') = 'user'
      AND json_extract(p.data, '$.type') = 'text'
      AND (
           json_extract(p.data, '$.text') LIKE '%always%'
           OR json_extract(p.data, '$.text') LIKE '%never%'
           OR json_extract(p.data, '$.text') LIKE '%remember%'
           OR json_extract(p.data, '$.text') LIKE '%rule%'
           OR json_extract(p.data, '$.text') LIKE '%decision%'
           OR json_extract(p.data, '$.text') LIKE '%decided%'
           OR json_extract(p.data, '$.text') LIKE '%workflow%'
           OR json_extract(p.data, '$.text') LIKE '%push%'
      )
    ORDER BY m.time_created DESC
    LIMIT 20
""")
for r in cur.fetchall():
    text = r['text'] or ''
    print(f"  [{r['session_id']}] {text[:300]}")

conn.close()
