"""Static validation for schema.sql: syntax parsing and structural assertions (no database required)."""
import pathlib
import sys

SQL_PATH = pathlib.Path(__file__).with_name("schema.sql")
sql = SQL_PATH.read_text(encoding="utf-8")

errors = []
warnings = []

# ---------- 1. Syntax parsing ----------
try:
    import sqlglot
    try:
        stmts = sqlglot.parse(sql, read="mysql")
        print(f"[syntax] sqlglot parsed successfully, statements={len([s for s in stmts if s is not None])}")
    except Exception as e:
        errors.append(f"sqlglot parse failed: {e}")
except ImportError:
    warnings.append("sqlglot is not installed; skipping syntax parsing")

# ---------- 2. Structural assertions ----------
EXPECTED_TABLES = [
    "venues", "users", "events", "seats", "performances", "event_media",
    "role_assignments", "price_tiers", "orders", "session_seats", "order_items",
    "payment_attempts", "payment_notifications", "tickets", "checkins",
    "refunds", "audit_logs",
]
for t in EXPECTED_TABLES:
    if f"CREATE TABLE {t} (" not in sql:
        errors.append(f"Missing table {t}")

if sql.count("ENGINE=InnoDB") != len(EXPECTED_TABLES):
    errors.append(f"ENGINE=InnoDB count {sql.count('ENGINE=InnoDB')}; expected {len(EXPECTED_TABLES)}")

for t in EXPECTED_TABLES:
    block_start = sql.find(f"CREATE TABLE {t} (")
    block_end = sql.find(") ENGINE=InnoDB", block_start)
    block = sql[block_start:block_end]
    if "PRIMARY KEY" not in block:
        errors.append(f"{t} is missing a primary key")

# Critical checks
checks = [
    ("seats unique key must include region", "UNIQUE (venue_id, region, row_no, seat_no)"),
    ("role_assignments generated column", "performance_key BIGINT AS (IFNULL(performance_id, 0))"),
    ("orders request fingerprint", "request_hash"),
    ("notification receive time", "received_at"),
    ("refund timestamp", "created_at        DATETIME(3)"),
    ("payment currency snapshot", "currency          CHAR(3)"),
    ("price tier name uniqueness", "UNIQUE (performance_id, tier_name)"),
    ("event cover uniqueness", "cover_event_id"),
    ("audit object primary key", "object_id"),
    ("ticket issue time", "issued_at"),
    ("expiry scan index", "idx_orders_expiry"),
    ("seat query index", "idx_session_seats_status"),
]
for label, needle in checks:
    if needle not in sql:
        errors.append(f"Missing/mismatch: {label}")

if "TIMESTAMPTZ" in sql:
    errors.append("TIMESTAMPTZ still present (unsupported by MySQL/MariaDB)")

# All foreign-key actions are RESTRICT
fk_count = sql.count("ON DELETE RESTRICT ON UPDATE RESTRICT")
print(f"[structure] foreign keys (RESTRICT)={fk_count}; tables={len(EXPECTED_TABLES)}; lines={len(sql.splitlines())}")

if errors:
    print("\n[FAIL]")
    for e in errors:
        print(" -", e)
    sys.exit(1)

print("\n[OK] all structural assertions passed")
if warnings:
    print("[warn]", "; ".join(warnings))
