import sqlite3
import json

DB = "C:/Users/Alexey/.local/share/mimocode/mimocode.db"

conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

SESSIONS = [
    ("ses_0b4501234ffeVcGI0rR1XHq3t3", "Repair Clerk middleware, migrate Stripe webhooks"),
    ("ses_0c3c1f1a7ffeUqezVZmmMy5M7I", "Debugging Stripe Clerk Next.js redirect"),
    ("ses_0e34770c0ffeSzW5Y3rmr7YPIU", "Quick check-in"),
]

for sid, title in SESSIONS:
    print(f"\n{'='*80}")
    print(f"SESSION: {sid} ({title})")
    print(f"{'='*80}")
    
    cur.execute("""
        SELECT m.id as msg_id, json_extract(m.data, '$.role') as role, m.agent_id, m.time_created,
               p.data as raw_part_data
        FROM message m
        JOIN part p ON p.message_id = m.id
        WHERE m.session_id = ?
        ORDER BY m.time_created, p.time_created
    """, (sid,))
    rows = cur.fetchall()
    
    msgs = {}
    for r in rows:
        mid = r['msg_id']
        if mid not in msgs:
            msgs[mid] = {'role': r['role'], 'agent_id': r['agent_id'], 'parts': []}
        
        raw = r['raw_part_data']
        try:
            pdata = json.loads(raw) if raw else {}
        except:
            pdata = {}
        
        tool_name = pdata.get('tool')
        state = pdata.get('state', {})
        tool_input = state.get('input', {}) if isinstance(state, dict) else {}
        tool_output = str(state.get('output', ''))[:500] if isinstance(state, dict) else ''
        
        msgs[mid]['parts'].append({
            'type': pdata.get('type'),
            'tool': tool_name,
            'text': pdata.get('text'),
            'tool_input': tool_input,
            'tool_output': tool_output,
        })
    
    for mid, mdata in msgs.items():
        if mdata['role'] == 'user':
            text_parts = [p['text'] for p in mdata['parts'] if p['type'] == 'text' and p['text']]
            if text_parts:
                print(f"\n  [USER] {text_parts[0][:500]}")
    
    for mid, mdata in msgs.items():
        if mdata['role'] == 'assistant':
            agent = mdata['agent_id'] or 'main'
            text_parts = [p['text'] for p in mdata['parts'] if p['type'] == 'text' and p['text']]
            if text_parts:
                combined = ' '.join([t[:200] for t in text_parts])
                print(f"\n  [ASST {agent}] {combined[:400]}")
            
            for p in mdata['parts']:
                if p['tool'] == 'write' and p['tool_input']:
                    ti = p['tool_input']
                    fp = ti.get('file_path', '') if isinstance(ti, dict) else ''
                    ct = str(ti.get('content', ''))[:300] if isinstance(ti, dict) else ''
                    print(f"    WRITE: {fp}")
                    print(f"      content: {ct}")
                elif p['tool'] == 'edit' and p['tool_input']:
                    ti = p['tool_input']
                    fp = ti.get('file_path', '') if isinstance(ti, dict) else ''
                    old = str(ti.get('old_string', ''))[:150] if isinstance(ti, dict) else ''
                    new_s = str(ti.get('new_string', ''))[:150] if isinstance(ti, dict) else ''
                    print(f"    EDIT: {fp}")
                    print(f"      old: {old}")
                    print(f"      new: {new_s}")
                elif p['tool'] == 'bash' and p['tool_output']:
                    print(f"    BASH: {p['tool_output'][:400]}")
                elif p['tool'] == 'memory' and p['tool_output']:
                    print(f"    MEMORY: {p['tool_output'][:300]}")

conn.close()
