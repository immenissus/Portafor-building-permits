import sqlite3, json

DB = "C:/Users/Alexey/.local/share/mimocode/mimocode.db"
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# Get all user messages from the most recent session (ses_0b4501234ffeVcGI0rR1XHq3t3)
cur.execute("""
    SELECT json_extract(p.data, '$.text') as text
    FROM message m
    JOIN part p ON p.message_id = m.id
    WHERE m.session_id = 'ses_0b4501234ffeVcGI0rR1XHq3t3'
      AND json_extract(m.data, '$.role') = 'user'
      AND json_extract(p.data, '$.type') = 'text'
    ORDER BY m.time_created DESC
    LIMIT 1
""")
r = cur.fetchone()
if r:
    print("=== LAST USER MESSAGE (Repair Clerk middleware) ===")
    print(r['text'][:1000])

# Get the last assistant message with text (should be the summary)
cur.execute("""
    SELECT json_extract(p.data, '$.text') as text
    FROM message m
    JOIN part p ON p.message_id = m.id
    WHERE m.session_id = 'ses_0b4501234ffeVcGI0rR1XHq3t3'
      AND json_extract(m.data, '$.role') = 'assistant'
      AND json_extract(p.data, '$.type') = 'text'
      AND json_extract(p.data, '$.text') IS NOT NULL
    ORDER BY m.time_created DESC
    LIMIT 1
""")
r = cur.fetchone()
if r:
    print("\n=== LAST ASSISTANT SUMMARY ===")
    print(r['text'][:2000])

# Also check the earlier session (ses_0c3c1f1a7ffeUqezVZmmMy5M7I) for the final summary
cur.execute("""
    SELECT json_extract(p.data, '$.text') as text
    FROM message m
    JOIN part p ON p.message_id = m.id
    WHERE m.session_id = 'ses_0c3c1f1a7ffeUqezVZmmMy5M7I'
      AND json_extract(m.data, '$.role') = 'assistant'
      AND json_extract(p.data, '$.type') = 'text'
      AND json_extract(p.data, '$.text') IS NOT NULL
    ORDER BY m.time_created DESC
    LIMIT 1
""")
r = cur.fetchone()
if r:
    print("\n=== LAST ASSISTANT SUMMARY (Debugging session) ===")
    print(r['text'][:2000])

# Check for any notes.md files in recent sessions
import os
notes_files = [
    "C:/Users/Alexey/.local/share/mimocode/memory/sessions/ses_0c3c1f1a7ffeUqezVZmmMy5M7I/notes.md",
    "C:/Users/Alexey/.local/share/mimocode/memory/sessions/ses_0e34770c0ffeSzW5Y3rmr7YPIU/notes.md",
    "C:/Users/Alexey/.local/share/mimocode/memory/sessions/ses_0b4501234ffeVcGI0rR1XHq3t3/notes.md",
]
for nf in notes_files:
    if os.path.exists(nf):
        with open(nf, 'r', encoding='utf-8') as f:
            content = f.read()
        if content.strip():
            print(f"\n=== NOTES: {nf} ===")
            print(content[:1000])
    else:
        print(f"\n=== NOTES: {nf} === (not found)")

conn.close()
