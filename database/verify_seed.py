"""Invariant checks for the demo seed data (scale-agnostic)."""
import os
import subprocess
import sys
from mysql_client import find_mysql


MYSQL = find_mysql()
DB_NAME = os.environ.get("CITYUHK_EVENTS_HUB_DB_NAME") or os.environ.get("STAGEPASS_DB_NAME", "ticketing_system")


def q(sql):
    p = subprocess.run([MYSQL, "-u", "root", "-h", "127.0.0.1", "--default-character-set=utf8mb4",
                        "--database", DB_NAME, "-e", sql],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if p.returncode != 0:
        print("SQL error:", p.stderr.strip())
        return None
    lines = [l for l in p.stdout.strip().splitlines() if l.strip()]
    return [l.split("\t") for l in lines[1:]] if lines else []


checks = []
def expect(label, sql, predicate):
    rows = q(sql)
    ok = rows is not None and predicate(rows)
    checks.append(ok)
    print(f"[{'PASS' if ok else 'FAIL'}] {label}" + ("" if ok else f" -> {rows}"))

expect("Order total equals sum of item prices",
       "SELECT COUNT(*) FROM (SELECT o.order_id FROM orders o JOIN order_items i ON i.order_id=o.order_id "
       "GROUP BY o.order_id, o.total_amount HAVING o.total_amount <> SUM(i.price_snapshot)) x;",
       lambda r: r[0][0] == "0")

expect("Every SOLD seat has a ticket",
       "SELECT COUNT(*) FROM session_seats s LEFT JOIN order_items i ON i.session_seat_id=s.session_seat_id "
       "LEFT JOIN tickets t ON t.order_item_id=i.order_item_id "
       "WHERE s.session_seat_status='SOLD' AND t.ticket_id IS NULL;",
       lambda r: r[0][0] == "0")

expect("Every ticket maps to a SOLD seat",
       "SELECT COUNT(*) FROM tickets t JOIN order_items i ON i.order_item_id=t.order_item_id "
       "JOIN session_seats s ON s.session_seat_id=i.session_seat_id WHERE s.session_seat_status<>'SOLD';",
       lambda r: r[0][0] == "0")

expect("No seat has two tickets",
       "SELECT COUNT(*) FROM (SELECT i.session_seat_id FROM tickets t JOIN order_items i ON i.order_item_id=t.order_item_id "
       "GROUP BY i.session_seat_id HAVING COUNT(*) > 1) x;",
       lambda r: r[0][0] == "0")

expect("HELD seats always have holder and expiry",
       "SELECT COUNT(*) FROM session_seats WHERE session_seat_status='HELD' "
       "AND (holder_order_id IS NULL OR hold_expires_at IS NULL);",
       lambda r: r[0][0] == "0")

expect("Non-HELD seats never have a holder",
       "SELECT COUNT(*) FROM session_seats WHERE session_seat_status<>'HELD' AND holder_order_id IS NOT NULL;",
       lambda r: r[0][0] == "0")

expect("Every USED ticket has exactly one check-in",
       "SELECT COUNT(*) FROM (SELECT t.ticket_id FROM tickets t LEFT JOIN checkins c ON c.ticket_id=t.ticket_id "
       "WHERE t.status='USED' GROUP BY t.ticket_id HAVING COUNT(c.checkin_id) <> 1) x;",
       lambda r: r[0][0] == "0")

expect("No check-in on a non-USED ticket",
       "SELECT COUNT(*) FROM checkins c JOIN tickets t ON t.ticket_id=c.ticket_id WHERE t.status<>'USED';",
       lambda r: r[0][0] == "0")

expect("Successful payments match order amount",
       "SELECT COUNT(*) FROM payment_attempts p JOIN orders o ON o.order_id=p.order_id "
       "WHERE p.result='SUCCEEDED' AND p.amount<>o.total_amount;",
       lambda r: r[0][0] == "0")

expect("Refund amount never exceeds its payment",
       "SELECT COUNT(*) FROM refunds r JOIN payment_attempts p ON p.attempt_id=r.payment_attempt_id "
       "WHERE r.amount > p.amount;",
       lambda r: r[0][0] == "0")

expect("Every check-in has a valid role for that performance",
       "SELECT COUNT(*) FROM checkins c JOIN tickets t ON t.ticket_id=c.ticket_id "
       "JOIN order_items i ON i.order_item_id=t.order_item_id "
       "JOIN session_seats ss ON ss.session_seat_id=i.session_seat_id "
       "LEFT JOIN role_assignments ra ON ra.user_id=c.checker_id AND ra.performance_id=ss.performance_id "
       "AND ra.revoked_at IS NULL WHERE ss.performance_id IN (13,14,15,16) AND ra.assignment_id IS NULL;",
       lambda r: r[0][0] == "0")

expect("Sold-out performances have zero availability",
       "SELECT COUNT(*) FROM session_seats WHERE performance_id IN (2,9) AND session_seat_status='AVAILABLE';",
       lambda r: r[0][0] == "0")

expect("Check-in window open for the live demo performance",
       "SELECT COUNT(*) FROM performances WHERE performance_id=13 AND UTC_TIMESTAMP(3)>=checkin_start_at AND UTC_TIMESTAMP(3)<checkin_end_at;",
       lambda r: r[0][0] == "1")

print("\n--- distributions ---")
for label, sql in [
    ("orders by status", "SELECT status, COUNT(*) FROM orders GROUP BY status ORDER BY status;"),
    ("tickets by status", "SELECT status, COUNT(*) FROM tickets GROUP BY status ORDER BY status;"),
    ("seat inventory by performance", "SELECT performance_id, SUM(session_seat_status='AVAILABLE') avail, "
                                      "SUM(session_seat_status='HELD') held, SUM(session_seat_status='SOLD') sold, "
                                      "SUM(session_seat_status='BLOCKED') blocked FROM session_seats GROUP BY performance_id;"),
]:
    print(f"[{label}]")
    for row in q(sql) or []:
        print("   ", " | ".join(row))

print(f"\n=== {sum(checks)}/{len(checks)} invariant checks passed ===")
sys.exit(0 if all(checks) else 1)
