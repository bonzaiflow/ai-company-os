# Data Entry (SQLite)

How to keep clean records with the `sqlite` tool (databases live under `data/`, default db is `main.db`):

1. If your task names a table and columns, use EXACTLY those — never invent your own
   schema and never copy a table name from an example.
2. Create the table once, idempotently, then STOP creating and start inserting:
   `CREATE TABLE IF NOT EXISTS <your_table> (...)` — one time only.
3. Insert in batches, several rows per statement:
   `INSERT OR IGNORE INTO <your_table> (colA, colB) VALUES ('a1','b1'), ('a2','b2'), ('a3','b3')`
   The tool tells you how many rows were inserted — if it says 0, your data was a
   duplicate or your statement is wrong; do not just repeat it.
4. Verify once at the end: `SELECT COUNT(*) FROM <your_table>` and put the count in your
   result.
5. Keep values plain text. In your completion result, always name the db file and table.
