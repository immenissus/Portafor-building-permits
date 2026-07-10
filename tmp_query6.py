import sqlite3, json

DB = "C:/Users/Alexey/.local/share/mimocode/mimocode.db"
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# Get ALL messages from ses_0b4501234ffeVcGI0rR1XHq3t3 with full detail
cur.execute("""
    SELECT m.id as msg_id, json_extract(m.data, '$.role') as role, m.agent_id,
           p.data as raw_part_data
    FROM message m
    JOIN part p ON p.message_id = m.id
    WHERE m.session_id = 'ses_0b4501234ffeVcGI0rR1XHq3t3'
    ORDER BY m.time_created, p.time_created
""")
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
    tool_output = str(state.get('output', ''))[:800] if isinstance(state, dict) else ''
    msgs[mid]['parts'].append({
        'type': pdata.get('type'), 'tool': tool_name, 'text': pdata.get('text'),
        'tool_input': tool_input, 'tool_output': tool_output,
    })

for mid, mdata in msgs.items():
    role = mdata['role']
    agent = mdata['agent_id'] or 'main'
    if role == 'assistant':
        text_parts = [p['text'] for p in mdata['parts'] if p['type'] == 'text' and p['text']]
        if text_parts:
            combined = ' '.join([t[:300] for t in text_parts])
            print(f"[ASST {agent}] {combined[:600]}")
        for p in mdata['parts']:
            tool = p['tool']
            if tool in ('write', 'edit') and p['tool_input']:
                ti = p['tool_input']
                fp = ti.get('file_path', '') if isinstance(ti, dict) else ''
                print(f"  {tool.upper()}: {fp}")
            elif tool == 'bash' and p['tool_output']:
                print(f"  BASH: {p['tool_output'][:400]}")

conn.close()
