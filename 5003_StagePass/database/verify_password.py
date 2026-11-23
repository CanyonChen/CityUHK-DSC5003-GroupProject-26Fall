"""Verify that demo account password hashes can be validated by bcrypt."""
import subprocess
import bcrypt

MYSQL = r"D:\_Coding\XAMPP\mysql\bin\mysql.exe"
p = subprocess.run([MYSQL, "-u", "root", "-h", "127.0.0.1", "--default-character-set=utf8mb4",
                    "-e", "USE ticketing_system; SELECT user_name, password_hash FROM users ORDER BY user_id;"],
                   capture_output=True, text=True, encoding="utf-8", errors="replace")
rows = [l.split("\t") for l in p.stdout.strip().splitlines()[1:] if l.strip()]
ok = True
for name, h in rows:
    good = bcrypt.checkpw(b"Demo@1234", h.encode())
    ok = ok and good
    print(f"{name:<10} {'PASS' if good else 'FAIL'}")
print(f"\nAccounts checked: {len(rows)}; overall {'PASS' if ok else 'FAIL'}")
