"""Generate demo seed data (larger scale) for the ticketing system."""
import hashlib
import random
from pathlib import Path

random.seed(11)
OUT = Path(__file__).with_name("seed.sql")
PWD = "$2b$10$7hv8P2WWfliRu/dK2/07sexqm2i5oXM/1xtT7JYpx8YP9HOaPLmPW"  # Demo@1234

L = []
def w(s=""):
    L.append(s)

def T(m):
    "minutes from now; positive = past, negative = future"
    if m >= 0:
        return f"DATE_SUB(NOW(3), INTERVAL {m} MINUTE)"
    return f"DATE_ADD(NOW(3), INTERVAL {-m} MINUTE)"

def q(x):
    return "'" + str(x).replace("'", "''") + "'"

def sha(x):
    return hashlib.sha256(str(x).encode()).hexdigest()

def ins(table, cols, rows, chunk=200):
    rows = list(rows)
    for i in range(0, len(rows), chunk):
        vals = ",\n".join("(" + ",".join(str(c) for c in r) + ")" for r in rows[i:i + chunk])
        L.append(f"INSERT INTO {table} ({','.join(cols)}) VALUES\n{vals};")

# ------------------------------------------------------------------ venues / seats
VENUES = [
    dict(id=1, name="DSC Black Box Theatre", rows=10, cols=20,
         regions=[("A", 1, 4), ("B", 5, 7), ("C", 8, 10)], aisles=[5, 10, 15]),
    dict(id=2, name="Studio Theatre", rows=8, cols=15,
         regions=[("A", 1, 3), ("B", 4, 6), ("C", 7, 8)], aisles=[5, 10]),
    dict(id=3, name="Grand Hall", rows=14, cols=25,
         regions=[("A", 1, 5), ("B", 6, 10), ("C", 11, 14)], aisles=[6, 12, 18]),
]
SEATS, SEAT_INDEX, SEAT_REGION, VENUE_OF = {}, {}, {}, {}
sid = 0
for v in VENUES:
    lst = []
    for region, r0, r1 in v["regions"]:
        for r in range(r0, r1 + 1):
            for c in range(1, v["cols"] + 1):
                sid += 1
                lst.append(dict(seat_id=sid, region=region, row=r, col=c))
                SEAT_REGION[sid] = region
                VENUE_OF[sid] = v["id"]
    SEATS[v["id"]] = lst
    SEAT_INDEX[v["id"]] = {s["seat_id"]: i + 1 for i, s in enumerate(lst)}

# ------------------------------------------------------------------ events
EVENTS = [
    (1, "Thunderstorm", "A campus production of Cao Yu's classic family tragedy.", "DSC Drama Society", "thunderstorm"),
    (2, "City Sound: String Quartet", "A chamber concert of strings and piano with an interval.", "DSC Music Society", "city-sound"),
    (3, "Four Seasons Dance", "A contemporary dance suite in eight movements.", "DSC Dance Society", "four-seasons"),
    (4, "Late Night Comedy", "Stand-up and improvised sketches in English and Cantonese.", "DSC Comedy Club", "late-night-comedy"),
    (5, "Jazz in the Black Box", "A small ensemble jazz night with a guest vocalist.", "DSC Jazz Band", "jazz-night"),
    (6, "The Little Star", "A children's theatre piece about a star that lost its light.", "DSC Drama Society", "little-star"),
    (7, "Opera Gala: La Traviata Highlights", "Selected scenes and arias from Verdi's opera.", "DSC Opera Ensemble", "opera-gala"),
    (8, "Digital Light Showcase", "Generative visuals and sound by the media lab.", "DSC Media Lab", "light-showcase"),
]

# ------------------------------------------------------------------ performances
# (pid, event, venue, starts_m, status, occupancy, options)
PERFS = [
    (1, 1, 1, -2880, "PUBLISHED", 0.40, dict(pending=1, expired=1, blocked=4)),
    (2, 1, 1, -4320, "PUBLISHED", 1.00, dict()),
    (3, 2, 3, -5760, "PUBLISHED", 0.35, dict()),
    (4, 2, 1, -7200, "PUBLISHED", 0.30, dict()),
    (5, 3, 3, -8640, "PUBLISHED", 0.42, dict()),
    (6, 3, 1, -10080, "PUBLISHED", 0.35, dict()),
    (7, 4, 2, -11520, "PUBLISHED", 0.55, dict(pending=1)),
    (8, 5, 1, -12960, "PUBLISHED", 0.30, dict()),
    (9, 5, 2, -14400, "PUBLISHED", 1.00, dict()),
    (10, 6, 2, -17280, "SALES_PAUSED", 0.30, dict()),
    (11, 7, 3, -20160, "PUBLISHED", 0.30, dict()),
    (12, 8, 3, -23040, "DRAFT", 0.00, dict()),
    (13, 1, 1, -10, "PUBLISHED", 0.60, dict(checkin_frac=0.5, blocked=2)),
    (14, 3, 2, 2880, "FINISHED", 1.00, dict(checkin_all=True)),
    (15, 5, 3, 5760, "FINISHED", 0.70, dict(checkin_all=True, refunded=2)),
    (16, 2, 1, 8640, "FINISHED", 1.00, dict(checkin_all=True, rp=2, failed=1)),
]

PRICE = {1: {"A": 48000, "B": 32000, "C": 18000},
         2: {"A": 38000, "B": 26000, "C": 15000},
         3: {"A": 58000, "B": 38000, "C": 22000}}
TIER_NAME = {"A": "VIP", "B": "Standard", "C": "Economy"}

SS_BASE = {}
acc = 0
for pid, eid, vid, start, status, frac, opt in PERFS:
    SS_BASE[pid] = acc
    acc += len(SEATS[vid])

def price_of(seat_id):
    return PRICE[VENUE_OF[seat_id]][SEAT_REGION[seat_id]]

def tier_of(seat_id):
    return SEAT_REGION[seat_id]

# ------------------------------------------------------------------ in-memory tables
ORDER_ROWS, ITEM_ROWS, TICKET_ROWS, PAY_ROWS, NOTIF_ROWS, CHECKIN_ROWS, REFUND_ROWS = [], [], [], [], [], [], []
SEAT_STATE = {}   # (pid, seat_id) -> (status, holder, hold_expires_m)

def add_item(oid, pid, seat_id, created_m):
    ITEM_ROWS.append([len(ITEM_ROWS) + 1, oid, SS_BASE[pid] + SEAT_INDEX[VENUE_OF[seat_id]][seat_id],
                      price_of(seat_id), T(created_m)])
    return len(ITEM_ROWS)

def add_ticket(item_id, status, issued_m, checkin_m=None, checker=None):
    tid = len(TICKET_ROWS) + 1
    TICKET_ROWS.append([tid, item_id, q(sha(f"DEMO-TICKET-{item_id}")), q(status), T(issued_m)])
    if checkin_m is not None:
        CHECKIN_ROWS.append([len(CHECKIN_ROWS) + 1, tid, checker, T(checkin_m)])

def create_order(pid, uid, seat_ids, status, created_m, paid_m=None, expires_m=None, closed_m=None,
                 ticket_status=None, checkin_m=None, checker=None, seat_status="SOLD", total=None):
    oid = len(ORDER_ROWS) + 1
    if expires_m is None:
        expires_m = created_m - 10
    if total is None:
        total = sum(price_of(s) for s in seat_ids)
    ORDER_ROWS.append([oid, uid, pid, q(status), total, q("HKD"), T(expires_m), q(f"SEED-{pid}-{oid:05d}"),
                       q(sha(f"{pid}|{sorted(seat_ids)}|{total}")), T(created_m),
                       T(paid_m) if paid_m is not None else "NULL",
                       T(closed_m) if closed_m is not None else "NULL"])
    for s in seat_ids:
        SEAT_STATE[(pid, s)] = (seat_status, oid if seat_status == "HELD" else "NULL", None)
        iid = add_item(oid, pid, s, created_m)
        if ticket_status:
            add_ticket(iid, ticket_status, paid_m if paid_m is not None else created_m, checkin_m, checker)
    return oid, total

def add_payment(oid, amount, result="SUCCEEDED", category="NORMAL", created_m=0, ref=None):
    pid_ = len(PAY_ROWS) + 1
    PAY_ROWS.append([pid_, oid, q(ref or f"PAY-{pid_:05d}"), amount, q("HKD"), q(result),
                     q(category) if category else "NULL", T(created_m), T(created_m - 1)])
    return pid_

def add_notice(attempt, result, received_m, digest=None):
    nid = len(NOTIF_ROWS) + 1
    NOTIF_ROWS.append([nid, q("demo-gateway"), q(f"NOTIF-{nid:05d}"), attempt, T(received_m),
                       T(received_m - 1) if result != "PENDING" else "NULL", q(result),
                       q(sha(digest or f"payload-{nid}"))])

def add_refund(oid, attempt, amount, status, created_m, reason, key=None):
    rid = len(REFUND_ROWS) + 1
    REFUND_ROWS.append([rid, oid, attempt, q(reason), amount, q(key or f"REF-{rid:05d}"), q(status),
                        T(created_m), T(created_m - 1)])

# ------------------------------------------------------------------ generate
CHECKER_OF = {13: (32, 34), 14: (32, 33), 15: (33,), 16: (34,)}

for pid, eid, vid, start, status, frac, opt in PERFS:
    seats = [s["seat_id"] for s in SEATS[vid]]
    random.shuffle(seats)
    pos = [0]
    def take(k):
        pos[0] += k
        return seats[pos[0] - k:pos[0]]

    sale_start_m = start + 30240
    sale_end_m = start + 30
    checkers = CHECKER_OF.get(pid, (32,))

    # blocked seats
    for _ in range(opt.get("blocked", 0)):
        for s in take(1):
            SEAT_STATE[(pid, s)] = ("BLOCKED", "NULL", None)

    # P1 specials: late payment, cancelled, expired history (seats released)
    if pid == 1:
        st = take(2)
        oid, total = create_order(pid, 3, st, "EXPIRED", 40, expires_m=30, closed_m=29, seat_status="AVAILABLE")
        att = add_payment(oid, total, "SUCCEEDED", "AWAITING_REFUND", 25)
        add_notice(att, "APPLIED", 24, "late-settlement")
        add_refund(oid, att, total, "PENDING", 20, "Payment arrived after the order expired")

        st = take(2)
        oid, total = create_order(pid, 5, st, "CANCELLED", 150, expires_m=140, closed_m=100, seat_status="AVAILABLE")
        add_payment(oid, total, "FAILED", None, 145)

    # pending payment: seats held, no tickets
    for _ in range(opt.get("pending", 0)):
        st = take(2)
        oid, total = create_order(pid, random.randint(1, 30), st, "PENDING_PAYMENT", 2,
                                  expires_m=-8, seat_status="HELD")
        add_payment(oid, total, "PENDING", "NORMAL", 2)
        for s in st:
            SEAT_STATE[(pid, s)] = ("HELD", oid, -8)

    # expired history order (items kept, seats released)
    for _ in range(opt.get("expired", 0)):
        st = take(2)
        oid, total = create_order(pid, random.randint(1, 30), st, "EXPIRED", 45,
                                  expires_m=35, closed_m=34, seat_status="AVAILABLE")
        add_payment(oid, total, "FAILED", None, 42)

    # refund pending
    for _ in range(opt.get("rp", 0)):
        st = take(2)
        created = random.randint(200, 800)
        oid, total = create_order(pid, random.randint(1, 30), st, "REFUND_PENDING",
                                  created, paid_m=created - 3, ticket_status="REFUND_PENDING")
        att = add_payment(oid, total, "SUCCEEDED", "AWAITING_REFUND", created - 3)
        add_notice(att, "APPLIED", created - 4)
        add_refund(oid, att, total, "PENDING", created - 20, "Customer requested a refund")

    # refunded
    for _ in range(opt.get("refunded", 0)):
        st = take(2)
        created = random.randint(200, 800)
        oid, total = create_order(pid, random.randint(1, 30), st, "REFUNDED",
                                  created, paid_m=created - 3, ticket_status="VOID")
        att = add_payment(oid, total, "SUCCEEDED", "AWAITING_REFUND", created - 3)
        add_notice(att, "APPLIED", created - 4)
        add_refund(oid, att, total, "SUCCEEDED", created - 20, "Event date changed")

    # failed refund: order remains paid, tickets valid
    for _ in range(opt.get("failed", 0)):
        st = take(2)
        created = random.randint(300, 900)
        oid, total = create_order(pid, random.randint(1, 30), st, "PAID",
                                  created, paid_m=created - 3, ticket_status="VALID")
        att = add_payment(oid, total, "SUCCEEDED", "NORMAL", created - 3)
        add_notice(att, "APPLIED", created - 4)
        add_refund(oid, att, total, "FAILED", created - 15, "Gateway declined the refund")

    specials_sold = (opt.get("rp", 0) + opt.get("refunded", 0) + opt.get("failed", 0)) * 2
    total_seats = len(seats)
    target = total_seats if frac >= 1.0 else int(round(total_seats * frac))
    target -= specials_sold

    lo = 80 if sale_end_m < 80 else sale_end_m + 60
    hi = sale_start_m - 60
    remaining = target
    while remaining > 0:
        k = min(remaining, random.choice([2, 3, 4]))
        if remaining - k == 1:
            k = remaining
        st = take(k)
        created = random.randint(lo, hi)
        paid = created - random.randint(1, 4)
        checkin_m, checker = None, None
        if opt.get("checkin_all"):
            checkin_m = random.randint(start - 30, start + 30)
            checker = random.choice(checkers)
        elif opt.get("checkin_frac") and random.random() < opt["checkin_frac"]:
            checkin_m = random.randint(2, 15)
            checker = random.choice(checkers)
        oid, total = create_order(pid, random.randint(1, 30), st, "PAID", created, paid_m=paid,
                                  ticket_status="USED" if checkin_m else "VALID",
                                  checkin_m=checkin_m, checker=checker)
        att = add_payment(oid, total, "SUCCEEDED", "NORMAL", paid)
        add_notice(att, "APPLIED", paid - 1)
        remaining -= k

# duplicate / ignored notifications
if len(PAY_ROWS) >= 4:
    add_notice(2, "DUPLICATE", 300)
    add_notice(3, "DUPLICATE", 200)
    add_notice(4, "IGNORED", 120)

# ------------------------------------------------------------------ SQL output
w("-- Ticketing system demo seed data, generated by build_seed.py")
w("-- Version: v1.1-demo | DDL: schema.sql v1.1 | Generated: 2026-11-21")
w("-- All demo accounts use password Demo@1234; timestamps are relative to import time and stored in UTC")
w("SET SESSION sql_mode='STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';")
w("SET SESSION time_zone='+00:00';")
w("USE ticketing_system;")
w("")
w("-- Reset existing rows (script is re-runnable)")
for t in ["checkins", "refunds", "tickets", "payment_notifications", "payment_attempts",
          "order_items", "session_seats", "role_assignments", "orders", "price_tiers",
          "event_media", "performances", "seats", "events", "venues", "users", "audit_logs"]:
    w(f"DELETE FROM {t};")
w("")

ins("venues", ["venue_id", "name", "row_count", "col_count", "layout_json"],
    [[v["id"], q(v["name"]), v["rows"], v["cols"],
      q('{"aisles":' + str(v["aisles"]) + ',"stage":"north"}')] for v in VENUES])

users = [[i, q(f"buyer{i:02d}"), q(PWD), q(f"Buyer {i:02d}")] for i in range(1, 31)]
users += [[31, q("admin"), q(PWD), q("Administrator")],
          [32, q("checker01"), q(PWD), q("Checker One")],
          [33, q("checker02"), q(PWD), q("Checker Two")],
          [34, q("checker03"), q(PWD), q("Checker Three")]]
ins("users", ["user_id", "user_name", "password_hash", "display_name"], users)

ins("events", ["event_id", "name", "description", "organizer", "created_at"],
    [[e[0], q(e[1]), q(e[2]), q(e[3]), T(30000 - e[0] * 1000)] for e in EVENTS])

media = []
for e in EVENTS:
    for mt, suffix, order in [("COVER", "cover", 0), ("GALLERY", "1", 1), ("GALLERY", "2", 2)]:
        media.append([len(media) + 1, e[0], q(mt), q(f"/media/{e[4]}-{suffix}.svg"), order])
ins("event_media", ["media_id", "event_id", "media_type", "url", "sort_order"], media)

seat_rows = []
for v in VENUES:
    for s in SEATS[v["id"]]:
        segment = 1 + sum(1 for aisle in v["aisles"] if aisle < int(s["col"]))
        seat_rows.append([s["seat_id"], v["id"], q(s["region"]), q(s["row"]), q(s["col"]),
                          q(f"{s['row']},{s['col']}"), q(f"{s['region']}-R{s['row']}-S{segment}")])
ins("seats", ["seat_id", "venue_id", "region", "row_no", "seat_no", "coordinates", "adjacent_group"], seat_rows)

perf_rows = []
for pid, eid, vid, start, status, frac, opt in PERFS:
    perf_rows.append([pid, eid, vid, T(start), T(start + 30240), T(start + 30),
                      T(start + 30), T(start - 30), q(status), T(30000 - pid * 500),
                      "NULL" if status == "DRAFT" else T(30000 - pid * 500)])
ins("performances", ["performance_id", "event_id", "venue_id", "starts_at", "sale_start_at", "sale_end_at",
                     "checkin_start_at", "checkin_end_at", "status", "created_at", "published_at"], perf_rows)

tiers = []
for pid, eid, vid, start, status, frac, opt in PERFS:
    for i, region in enumerate(["A", "B", "C"]):
        tiers.append([(pid - 1) * 3 + i + 1, pid, q(TIER_NAME[region]), PRICE[vid][region], q("HKD")])
ins("price_tiers", ["tier_id", "performance_id", "tier_name", "current_price", "currency"], tiers)

ins("orders", ["order_id", "user_id", "performance_id", "status", "total_amount", "currency", "expires_at",
               "idempotency_key", "request_hash", "created_at", "paid_at", "closed_at"], ORDER_ROWS)

ss_rows = []
for pid, eid, vid, start, status, frac, opt in PERFS:
    for s in SEATS[vid]:
        st, holder, exp = SEAT_STATE.get((pid, s["seat_id"]), ("AVAILABLE", "NULL", None))
        tier_id = (pid - 1) * 3 + {"A": 1, "B": 2, "C": 3}[s["region"]]
        ss_rows.append([SS_BASE[pid] + SEAT_INDEX[vid][s["seat_id"]], pid, s["seat_id"], tier_id,
                        q(st), holder, T(exp) if exp is not None else "NULL"])
ins("session_seats", ["session_seat_id", "performance_id", "seat_id", "tier_id", "session_seat_status",
                      "holder_order_id", "hold_expires_at"], ss_rows)

ins("order_items", ["order_item_id", "order_id", "session_seat_id", "price_snapshot", "created_at"], ITEM_ROWS)

role_rows = [[1, 31, q("ADMIN"), "NULL", T(30000), "NULL"],
             [2, 32, q("CHECKER"), 13, T(15000), "NULL"],
             [3, 32, q("CHECKER"), 14, T(15000), "NULL"],
             [4, 33, q("CHECKER"), 14, T(15000), "NULL"],
             [5, 33, q("CHECKER"), 15, T(9000), "NULL"],
             [6, 34, q("CHECKER"), 13, T(15000), "NULL"],
             [7, 34, q("CHECKER"), 16, T(9000), "NULL"],
             [8, 33, q("CHECKER"), 16, T(9000), T(8500)]]
ins("role_assignments", ["assignment_id", "user_id", "role", "performance_id", "assigned_at", "revoked_at"],
    role_rows)

ins("payment_attempts", ["attempt_id", "order_id", "payment_ref", "amount", "currency", "result",
                         "handling_category", "created_at", "updated_at"], PAY_ROWS)

ins("payment_notifications", ["notice_id", "source", "notification_id", "payment_attempt_id",
                              "received_at", "processed_at", "processed_result", "payload_digest"], NOTIF_ROWS)

ins("tickets", ["ticket_id", "order_item_id", "ticket_code_hash", "status", "issued_at"], TICKET_ROWS)

ins("checkins", ["checkin_id", "ticket_id", "checker_id", "checked_in_at"], CHECKIN_ROWS)

ins("refunds", ["refund_id", "order_id", "payment_attempt_id", "reason", "amount", "idempotency_key",
                "status", "created_at", "updated_at"], REFUND_ROWS)

audit = []
n = [0]
def add_audit(actor_type, actor_id, obj_type, obj_id, action, summary, when, req):
    n[0] += 1
    audit.append([n[0], q(actor_type), actor_id, q(obj_type), obj_id, q(action), q(summary), T(when), q(req)])

add_audit("ADMIN", 31, "PERFORMANCE", 1, "PUBLISH", "DRAFT->PUBLISHED", 30000, "AUD-0001")
add_audit("ADMIN", 31, "PERFORMANCE", 11, "PUBLISH", "DRAFT->PUBLISHED", 29000, "AUD-0002")
add_audit("ADMIN", 31, "ROLE", 32, "GRANT", "NULL->CHECKER(P13,P14)", 15000, "AUD-0003")
add_audit("ADMIN", 31, "ROLE", 34, "REVOKE", "CHECKER(P16)->REVOKED", 8000, "AUD-0004")
for row in ORDER_ROWS[:6]:
    add_audit("USER", row[1], "ORDER", row[0], "CREATE", "NULL->PENDING_PAYMENT", 30000 - row[0], f"REQ-O{row[0]:05d}")
add_audit("SYSTEM", "NULL", "ORDER", 2, "PAYMENT_CONFIRMED", "PENDING_PAYMENT->PAID", 7000, "PAY-00002")
add_audit("SYSTEM", "NULL", "TICKET", 1, "ISSUE", "NULL->VALID", 7000, "PAY-00002")
add_audit("CHECKER", 32, "TICKET", 1, "CHECKIN", "VALID->USED", 30, "CHECKIN-0001")
add_audit("SYSTEM", "NULL", "REFUND", 1, "CREATE", "NULL->PENDING", 20, "REF-00001")
add_audit("SYSTEM", "NULL", "PAYMENT", 2, "NOTIFY_DUPLICATE", "APPLIED->DUPLICATE", 300, "NOTIF-DUP")
add_audit("ADMIN", 31, "PRICE", 1, "UPDATE", "48000->52000", 2000, "AUD-0005")
ins("audit_logs", ["log_id", "actor_type", "actor_id", "object_type", "object_id", "action",
                   "state_summary", "occurred_at", "request_id"], audit)

w("")
w(f"-- Summary: users {len(users)}, seats {len(seat_rows)}, performances {len(PERFS)}, session_seats {len(ss_rows)}, "
  f"orders {len(ORDER_ROWS)}, items {len(ITEM_ROWS)}, tickets {len(TICKET_ROWS)}, notifications {len(NOTIF_ROWS)}, "
  f"checkins {len(CHECKIN_ROWS)}, refunds {len(REFUND_ROWS)}")

OUT.write_text("\n".join(L) + "\n", encoding="utf-8")
print(f"seed.sql written | users {len(users)} seats {len(seat_rows)} session_seats {len(ss_rows)} "
      f"orders {len(ORDER_ROWS)} items {len(ITEM_ROWS)} tickets {len(TICKET_ROWS)} notices {len(NOTIF_ROWS)} "
      f"checkins {len(CHECKIN_ROWS)} refunds {len(REFUND_ROWS)}")
