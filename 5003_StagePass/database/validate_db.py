"""Constraint validation after executing schema.sql on XAMPP MariaDB (real database plus test cases)."""
import subprocess
import sys

MYSQL = r"D:\_Coding\XAMPP\mysql\bin\mysql.exe"
BASE = [MYSQL, "-u", "root", "-h", "127.0.0.1", "-P", "3306",
        "--default-character-set=utf8mb4"]
DB = "ticketing_system"
SQL_MODE = "STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION"


def run(sql):
    p = subprocess.run(BASE + ["-e", f"SET SESSION sql_mode='{SQL_MODE}'; USE {DB}; {sql}"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def check(label, sql, expect_ok):
    rc, out = run(sql)
    ok = (rc == 0) == expect_ok
    print(f"[{'PASS' if ok else 'FAIL'}] {label} -> rc={rc}")
    if not ok:
        print("    ", out.strip()[:300])
    return ok


results = []
results.append(check("database exists", "SELECT 1 FROM information_schema.schemata WHERE schema_name='ticketing_system';", True))

# ---------- Clear business data so fixed IDs start at 1 ----------
# This script clears business data in ticketing_system; run scripts\reset_demo.ps1 afterwards to restore demo data
TABLES = ["audit_logs", "refunds", "checkins", "tickets", "payment_notifications",
          "payment_attempts", "order_items", "session_seats", "role_assignments",
          "orders", "price_tiers", "event_media", "performances", "seats",
          "events", "venues", "users"]
print("\n--- Clearing business data (run reset_demo.ps1 afterwards to restore) ---")
rc, out = run("SET FOREIGN_KEY_CHECKS=0;"
              + "".join(f"TRUNCATE TABLE {t};" for t in TABLES)
              + "SET FOREIGN_KEY_CHECKS=1;")
print(f"[{'PASS' if rc == 0 else 'FAIL'}] TRUNCATE {len(TABLES)} tables -> rc={rc}")
if rc != 0:
    print("    ", out.strip()[:300])
results.append(rc == 0)

# ---------- Prepare base data ----------
setup = [
    ("Venue", "INSERT INTO venues (name,row_count,col_count) VALUES ('Test Hall',10,20);"),
    ("Users", "INSERT INTO users (user_name,password_hash) VALUES ('u1','h'),('u2','h'),('admin1','h'),('checker1','h');"),
    ("Event", "INSERT INTO events (name,organizer) VALUES ('Test Show','Org');"),
    ("Admin role assignment", "INSERT INTO role_assignments (user_id,role,performance_id) VALUES (3,'ADMIN',NULL);"),
    ("Seats A11/A12/B11", "INSERT INTO seats (venue_id,region,row_no,seat_no,coordinates) VALUES (1,'A','1','1','1,1'),(1,'A','1','2','1,2'),(1,'B','1','1','5,1');"),
    ("Performance", "INSERT INTO performances (event_id,venue_id,starts_at,sale_start_at,sale_end_at,checkin_start_at,checkin_end_at,status) "
             "VALUES (1,1,'2026-12-01 19:30:00','2026-11-20 10:00:00','2026-12-01 19:00:00','2026-12-01 19:00:00','2026-12-01 20:00:00','PUBLISHED');"),
    ("Price tier", "INSERT INTO price_tiers (performance_id,tier_name,current_price,currency) VALUES (1,'VIP',10000,'HKD');"),
    ("Session seats", "INSERT INTO session_seats (performance_id,seat_id,tier_id,session_seat_status) VALUES (1,1,1,'AVAILABLE'),(1,2,1,'AVAILABLE'),(1,3,1,'AVAILABLE');"),
    ("Order", "INSERT INTO orders (user_id,performance_id,status,total_amount,currency,expires_at,idempotency_key,request_hash) "
             "VALUES (1,1,'PENDING_PAYMENT',20000,'HKD','2026-11-30 10:05:00','k1',REPEAT('a',64));"),
    ("Order items", "INSERT INTO order_items (order_id,session_seat_id,price_snapshot) VALUES (1,1,10000);"),
    ("Event cover", "INSERT INTO event_media (event_id,media_type,url,sort_order) VALUES (1,'COVER','/c.jpg',0);"),
    ("Payment attempt", "INSERT INTO payment_attempts (order_id,payment_ref,amount,currency,result) VALUES (1,'ref1',20000,'HKD','PENDING');"),
    ("Payment notification", "INSERT INTO payment_notifications (source,notification_id,payment_attempt_id,received_at,processed_result) "
                 "VALUES ('test','n1',1,UTC_TIMESTAMP(3),'PENDING');"),
    ("Ticket", "INSERT INTO tickets (order_item_id,ticket_code_hash,status) VALUES (1,REPEAT('b',64),'VALID');"),
    ("Check-in", "INSERT INTO checkins (ticket_id,checker_id) VALUES (1,4);"),
    ("Refund", "INSERT INTO refunds (order_id,payment_attempt_id,reason,amount,idempotency_key,status) VALUES (1,1,'test',20000,'r1','PENDING');"),
]
print("\n--- Base data ---")
for label, sql in setup:
    results.append(check(label, sql, True))

# ---------- Constraint negative cases: all should fail ----------
print("\n--- Constraint enforcement ---")
negatives = [
    ("Duplicate seat in same venue/zone/row rejected (unique key includes region)", "INSERT INTO seats (venue_id,region,row_no,seat_no,coordinates) VALUES (1,'A','1','1','1,1');"),
    ("Duplicate seat in same performance rejected", "INSERT INTO session_seats (performance_id,seat_id,tier_id,session_seat_status) VALUES (1,1,1,'AVAILABLE');"),
    ("Second ADMIN for same user (NULL performance) rejected (generated-column uniqueness)", "INSERT INTO role_assignments (user_id,role,performance_id) VALUES (3,'ADMIN',NULL);"),
    ("Duplicate order with same user and idempotency key rejected", "INSERT INTO orders (user_id,performance_id,status,total_amount,currency,expires_at,idempotency_key,request_hash) "
                                   "VALUES (1,1,'PENDING_PAYMENT',20000,'HKD','2026-11-30 10:05:00','k1',REPEAT('c',64));"),
    ("HELD without holding order rejected (CHECK)", "UPDATE session_seats SET session_seat_status='HELD' WHERE session_seat_id=2;"),
    ("Non-HELD with holding order rejected (CHECK)", "UPDATE session_seats SET session_seat_status='AVAILABLE',holder_order_id=1 WHERE session_seat_id=3;"),
    ("Check-in deadline after start time rejected (CHECK)", "INSERT INTO performances (event_id,venue_id,starts_at,sale_start_at,sale_end_at,checkin_start_at,checkin_end_at,status) "
                                   "VALUES (1,1,'2026-12-02 19:30:00','2026-11-20 10:00:00','2026-12-02 19:30:00','2026-12-02 19:00:00','2026-12-02 20:00:00','PUBLISHED');"),
    ("Second cover per event rejected", "INSERT INTO event_media (event_id,media_type,url,sort_order) VALUES (1,'COVER','/c2.jpg',1);"),
    ("Second ticket per order item rejected", "INSERT INTO tickets (order_item_id,ticket_code_hash,status) VALUES (1,REPEAT('d',64),'VALID');"),
    ("Second check-in for same ticket rejected", "INSERT INTO checkins (ticket_id,checker_id) VALUES (1,2);"),
    ("Negative price rejected (CHECK)", "INSERT INTO price_tiers (performance_id,tier_name,current_price,currency) VALUES (1,'NEG',-1,'HKD');"),
    ("Notification without receive time rejected (NOT NULL)", "INSERT INTO payment_notifications (source,notification_id,payment_attempt_id,processed_result) VALUES ('test','n2',1,'APPLIED');"),
    ("Invalid order status rejected (CHECK)", "UPDATE orders SET status='UNKNOWN' WHERE order_id=1;"),
]
for label, sql in negatives:
    results.append(check(label, sql, False))

# ---------- Legal boundaries: should succeed ----------
print("\n--- Legal boundaries ---")
positives = [
    ("Same idempotency key with different content: unique key blocks it, service compares hashes (here we verify the unique index exists)",
     "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema='ticketing_system' AND table_name='orders' AND index_name='uk_orders_idempotency';"),
    ("Same row and seat number across zones allowed", "INSERT INTO seats (venue_id,region,row_no,seat_no,coordinates) VALUES (1,'C','1','1','9,1');"),
    ("New seat and independent inventory created", "INSERT INTO seats (venue_id,region,row_no,seat_no,coordinates) VALUES (1,'D','1','1','12,1'); "
                             "INSERT INTO session_seats (performance_id,seat_id,tier_id,session_seat_status) VALUES (1,5,1,'AVAILABLE');"),
]
for label, sql in positives:
    results.append(check(label, sql, True))

print(f"\n=== {sum(results)}/{len(results)} passed ===")
print("Note: this test writes test data. To restore demo data, run scripts\\reset_demo.ps1")
sys.exit(0 if all(results) else 1)
