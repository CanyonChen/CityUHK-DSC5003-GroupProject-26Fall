"""Check whether actual database column counts (excluding generated columns) match the data dictionary."""
import subprocess
import sys

MYSQL = r"D:\_Coding\XAMPP\mysql\bin\mysql.exe"
EXPECTED = {
    "users": 6, "role_assignments": 6, "venues": 6, "seats": 7, "events": 5,
    "event_media": 6, "performances": 11, "price_tiers": 5, "session_seats": 8,
    "orders": 12, "order_items": 5, "payment_attempts": 9, "payment_notifications": 9,
    "tickets": 5, "checkins": 4, "refunds": 9, "audit_logs": 9,
}

sql = ("SELECT table_name, COUNT(*) AS cols, "
       "SUM(CASE WHEN is_generated='ALWAYS' THEN 1 ELSE 0 END) AS gen "
       "FROM information_schema.columns WHERE table_schema='ticketing_system' "
       "GROUP BY table_name ORDER BY table_name;")
p = subprocess.run([MYSQL, "-u", "root", "-h", "127.0.0.1", "--default-character-set=utf8mb4",
                    "-e", sql], capture_output=True, text=True, encoding="utf-8", errors="replace")
if p.returncode != 0:
    print("Query failed:", p.stderr)
    sys.exit(1)

rows = {}
for line in p.stdout.strip().splitlines()[1:]:
    parts = line.split("\t")
    if len(parts) == 3:
        rows[parts[0]] = (int(parts[1]), int(parts[2]))

ok = True
print(f"{'Table':<26}{'Total':>5}{'Generated':>7}{'Business':>7}{'Dictionary':>6}  Result")
for t, exp in EXPECTED.items():
    if t not in rows:
        print(f"{t:<26}{'Missing':>5}")
        ok = False
        continue
    total, gen = rows[t]
    biz = total - gen
    status = "OK" if biz == exp else "MISMATCH"
    if biz != exp:
        ok = False
    print(f"{t:<26}{total:>5}{gen:>7}{biz:>7}{exp:>6}  {status}")

extra = set(rows) - set(EXPECTED)
if extra:
    print("Extra tables:", extra)
    ok = False

print("\n=== Column count check", "PASS" if ok else "FAIL", "===")
sys.exit(0 if ok else 1)
