import sqlite3, json, time

DB = "C:/Users/Alexey/.local/share/mimocode/mimocode.db"
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# Get all non-checkpoint sessions for this project, ordered by time
cur.execute("""
    SELECT id, title, time_created 
    FROM session 
    WHERE directory LIKE '%Portafor%' 
      AND title NOT LIKE '%checkpoint-writer%'
    ORDER BY time_created DESC
""")
sessions = cur.fetchall()
print("=== ALL USER SESSIONS (this project) ===")
for s in sessions:
    ts = s['time_created']
    from datetime import datetime
    dt = datetime.fromtimestamp(ts / 1000)
    print(f"  {s['id']} | {dt.strftime('%Y-%m-%d %H:%M')} | {s['title']}")

# Check for any important user directives we haven't captured
print("\n=== KEY USER DIRECTIVES (all sessions) ===")
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
           OR json_extract(p.data, '$.text') LIKE '%important%'
           OR json_extract(p.data, '$.text') LIKE '%must%'
           OR json_extract(p.data, '$.text') LIKE '%push all%'
      )
      AND json_extract(p.data, '$.text') NOT LIKE '%system-reminder%'
      AND length(json_extract(p.data, '$.text')) < 500
    ORDER BY m.time_created DESC
    LIMIT 30
""")
for r in cur.fetchall():
    text = r['text'] or ''
    # Skip system reminders
    if '<system-reminder>' in text:
        continue
    if len(text.strip()) > 20:
        print(f"  [{r['session_id']}] {text[:300]}")

# Check for session with Payload CMS work
print("\n=== PAYLOAD CMS / BLOG SESSIONS ===")
cur.execute("""
    SELECT m.session_id, json_extract(p.data, '$.text') as text
    FROM message m
    JOIN part p ON p.message_id = m.id
    WHERE json_extract(m.data, '$.role') = 'user'
      AND json_extract(p.data, '$.type') = 'text'
      AND (
           json_extract(p.data, '$.text') LIKE '%payload%'
           OR json_extract(p.data, '$.text') LIKE '%blog%'
           OR json_extract(p.data, '$.text') LIKE '%email%'
      )
      AND json_extract(p.data, '$.text') NOT LIKE '%system-reminder%'
      AND length(json_extract(p.data, '$.text')) < 500
    ORDER BY m.time_created DESC
    LIMIT 15
""")
for r in cur.fetchall():
    text = r['text'] or ''
    if len(text.strip()) > 20:
        print(f"  [{r['session_id']}] {text[:300]}")

# Get the session about city status and middleware
print("\n=== MIDDLEWARE / WEBHOOK SESSION ===")
cur.execute("""
    SELECT json_extract(p.data, '$.text') as text
    FROM message m
    JOIN part p ON p.message_id = m.id
    WHERE m.session_id = 'ses_0b4501234ffeVcGI0rR1XHq3t3'
      AND json_extract(m.data, '$.role') = 'user'
      AND json_extract(p.data, '$.type') = 'text'
      AND json_extract(p.data, '$.text') NOT LIKE '%system-reminder%'
    ORDER BY m.time_created
""")
for r in cur.fetchall():
    text = r['text'] or ''
    if len(text.strip()) > 20:
        print(f"  {text[:400]}")

conn.close()
