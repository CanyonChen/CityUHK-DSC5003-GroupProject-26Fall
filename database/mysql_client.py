"""Locate the command-line client used by the database checks."""
import os
import shutil
from pathlib import Path


def find_mysql():
    if os.environ.get("MYSQL_BIN"):
        return os.environ["MYSQL_BIN"]
    portable = Path(__file__).resolve().parents[1] / ".cache" / "runtime"
    for root in (os.environ.get("XAMPP_HOME"), portable, r"C:\xampp", r"D:\xampp", r"D:\_Coding\XAMPP"):
        if root:
            exe = Path(root) / "mysql" / "bin" / "mysql.exe"
            if exe.is_file():
                return str(exe)
    return shutil.which("mariadb") or shutil.which("mysql") or "mysql"
