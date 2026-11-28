"""Check local imports, document links and frontend/API route connections without dependencies."""
import argparse
import json
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--manifest", type=Path, help="Optional remote file inventory for a source-only checkout")
args = parser.parse_args()
known = set(json.loads(args.manifest.read_text(encoding="utf-8"))) if args.manifest else set()
issues, edges, clients, routes = [], [], [], []
excluded = {"node_modules", ".git", ".cache", "dist", "__pycache__"}
files = [p for p in ROOT.rglob("*") if p.is_file() and not (set(p.relative_to(ROOT).parts) & excluded)]
def exists(path):
    try:
        rel = path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return False
    return path.is_file() or rel in known
def record(source, target, kind):
    edges.append({"source": source.relative_to(ROOT).as_posix(), "target": target.relative_to(ROOT).as_posix(), "kind": kind})
def check_target(source, value, kind):
    if value.startswith(("#", "/", "data:", "mailto:")) or urlsplit(value).scheme:
        return
    target = source.parent / unquote(urlsplit(value).path)
    if not target.suffix:
        candidates = [target, *[Path(str(target) + ext) for ext in [".js", ".mjs", ".cjs", ".vue", ".json"]], target / "index.js", target / "index.html"]
    elif str(value).endswith("/"):
        candidates = [target / "index.html"]
    else:
        candidates = [target]
    match = next((p for p in candidates if exists(p) or (kind == "document" and p.is_dir())), None)
    if match:
        record(source, match.resolve(), kind)
    else:
        issues.append(f"{source.relative_to(ROOT)}: missing {kind} target {value}")
for source in files:
    text = source.read_text(encoding="utf-8-sig") if source.suffix.lower() in {".js", ".mjs", ".cjs", ".vue", ".md", ".html", ".css"} else ""
    if source.suffix in {".js", ".mjs", ".cjs", ".vue"}:
        for value in re.findall(r"""(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]""", text):
            if value.startswith("."):
                check_target(source, value, "import")
    if source.suffix == ".md":
        for value in re.findall(r"\[[^\]]*\]\(([^)]+)\)", text):
            check_target(source, value, "document")
    if source.suffix == ".html":
        for value in re.findall(r"""(?:src|href)=["']([^"']+)["']""", text):
            check_target(source, value, "asset")
# Match the API wrappers to registered Express routes, including dynamic identifiers.
app = (ROOT / "server/src/app.js").read_text(encoding="utf-8")
variables = dict(re.findall(r"const\s+(\w+)\s*=\s*require\(['\"]\./routes/([^'\"]+)['\"]\)", app))
mounts = {}
for prefix, name in re.findall(r"app\.use\(['\"]([^'\"]+)['\"],\s*(\w+)\)", app):
    if name in variables:
        mounts[variables[name]] = prefix
mounts["health"] = ""
for name, prefix in mounts.items():
    source = ROOT / ("server/src/routes/" + name + ".js")
    text = source.read_text(encoding="utf-8")
    for match in re.finditer(r"router\.(get|post|patch|put|delete)\(\s*['\"]([^'\"]+)['\"]", text):
        endpoint = (prefix + match.group(2)).rstrip("/") or "/"
        routes.append({"method": match.group(1).upper(), "path": endpoint, "file": source.relative_to(ROOT).as_posix(), "line": text[:match.start()].count("\n") + 1})
for folder in ["web-user", "web-admin"]:
    source = ROOT / folder / "src/api.js"
    text = source.read_text(encoding="utf-8")
    for match in re.finditer(r"""\bapi\(\s*(['"`])(.+?)\1""", text):
        endpoint = re.sub(r"\$\{qs\b.*", "", match.group(2)).split("?")[0]
        endpoint = re.sub(r"\$\{[^}]+\}", ":id", endpoint).rstrip("/") or "/"
        tail = text[match.end():].split(");", 1)[0]
        method_match = re.search(r"""method:\s*['"]([A-Z]+)['"]""", tail)
        method = method_match.group(1) if method_match else "GET"
        found = any(r["method"] == method and re.fullmatch(re.sub(r":[^/]+", "[^/]+", r["path"]), endpoint) for r in routes)
        clients.append({"file": source.relative_to(ROOT).as_posix(), "method": method, "path": endpoint, "matched": found})
        if not found:
            issues.append(f"{folder}: unmatched API {method} {endpoint}")
out = ROOT / ".cache/checks/project-links.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps({"issues": issues, "edges": edges, "routes": routes, "clients": clients}, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Checked {len(edges)} file relationships, {len(routes)} server routes and {len(clients)} frontend API calls.")
for issue in issues:
    print("FAIL", issue)
print("PASS" if not issues else "FAILED", out.relative_to(ROOT))
raise SystemExit(bool(issues))
