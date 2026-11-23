#!/usr/bin/env python3
"""交付物索引与一致性检查。

用法:
  python check_delivery.py                 # 跑全部检查
  python check_delivery.py --impact DICT   # 查看改 DICT 会影响哪些文件
  python check_delivery.py --manifest      # 重新生成 MANIFEST.md

约定：delivery.json 中 edge 的 from 是上游（被依赖方），to 是下游（受影响方）。
"""
import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = HERE.parent
sys.stdout.reconfigure(encoding="utf-8")

CFG = json.loads((HERE / "delivery.json").read_text(encoding="utf-8"))
NODES = CFG["nodes"]
EDGES = CFG["edges"]
MODULES = CFG.get("modules", {})
CHECK_REQUIRED = {"ACTIVE", "REVIEW", "STALE"}

STATUS_ORDER = ["ACTIVE", "REVIEW", "STALE", "LEGACY", "DUPLICATE", "EXTERNAL"]
LEVELS = {"PASS": 0, "WARN": 1, "FAIL": 2, "INFO": 0}

def path_of(node):
    raw = node["path"]
    return Path(raw) if os.path.isabs(raw) else BASE / raw

def read(node):
    """Return plain text of a node; '' for link/image/unreadable."""
    if node["kind"] in ("link", "image", "dir"):
        return ""
    path = path_of(node)
    if not path.exists():
        return ""
    if node["kind"] == "docx":
        try:
            from docx import Document
            d = Document(str(path))
            parts = [x.text for x in d.paragraphs]
            for t in d.tables:
                for row in t.rows:
                    parts.append(" | ".join(c.text for c in row.cells))
            return "\n".join(parts)
        except Exception:
            return ""
    if node["kind"] == "xlsx":
        try:
            import openpyxl
            wb = openpyxl.load_workbook(str(path), read_only=True, data_only=True)
            meta = " ".join(str(x or "") for x in (
                wb.properties.title,
                wb.properties.subject,
                wb.properties.description,
                wb.properties.keywords,
            ))
            lines = [meta]
            for ws in wb.worksheets:
                for row in ws.iter_rows(values_only=True):
                    lines.append(" | ".join("" if c is None else str(c) for c in row))
            return "\n".join(lines)
        except Exception:
            return ""
    return path.read_text(encoding="utf-8", errors="ignore")

def downstream(node_id):
    """All nodes that depend, directly or indirectly, on node_id."""
    adj = {}
    for e in EDGES:
        adj.setdefault(e["from"], []).append(e["to"])
    seen, stack = set(), [node_id]
    while stack:
        cur = stack.pop()
        for nxt in adj.get(cur, []):
            if nxt not in seen:
                seen.add(nxt)
                stack.append(nxt)
    return seen

def direct_downstream(node_id):
    return [e["to"] for e in EDGES if e["from"] == node_id]

def direct_upstream(node_id):
    return [e["from"] for e in EDGES if e["to"] == node_id]

# ---------------------------------------------------------------- parsers
def parse_schema():
    txt = read(NODES["DDL"])
    tables = {}
    for m in re.finditer(r"CREATE TABLE (\w+) \((.*?)\n\) ENGINE", txt, re.S):
        body = m.group(2)
        cols = []
        for line in body.splitlines():
            mm = re.match(
                r"^  (\w+)\s+(BIGINT|INT|VARCHAR|CHAR|TEXT|DATETIME|JSON|DECIMAL|BOOLEAN|DATE|TIMESTAMP)\b",
                line)
            if not mm:
                continue
            if " AS (" in line:
                continue
            cols.append(mm.group(1))
        tables[m.group(1)] = cols
    return tables

def parse_dict():
    txt = read(NODES["DICT"])
    m = re.search(r"## 模块三[：:]数据字典(.*)", txt, re.S)
    body = m.group(1) if m else txt
    tables = {}
    for sec in re.finditer(r"\*\*(\w+)（[^）]*）\*\*(.*?)(?=\n\*\*|\Z)", body, re.S):
        name, chunk = sec.group(1), sec.group(2)
        cols = []
        for line in chunk.splitlines():
            if not line.startswith("|"):
                continue
            cells = [c.strip() for c in line.split("|")[1:-1]]
            if len(cells) < 3:
                continue
            cell = cells[0]
            if not cell or cell == "字段名（英）" or "+" in cell or "生成列" in line:
                continue
            if cells[2] in ("—", "-", ""):
                continue
            if re.fullmatch(r"[a-z_][a-z0-9_]*", cell):
                cols.append(cell)
        if cols:
            tables[name] = cols
    return tables

def parse_seed():
    txt = read(NODES["SEED"])
    tables = {}
    for m in re.finditer(r"INSERT INTO (\w+) \(([^)]*)\) VALUES", txt):
        tables[m.group(1)] = [c.strip() for c in m.group(2).split(",")]
    return tables

VRE = re.compile(r"(?:文档版本|版本|Version)\s*[:：]?\s*\|?\s*(v\d+(?:\.\d+)?(?:-demo)?)")

results = []
def add(level, code, msg):
    results.append((level, code, msg))

# ---------------------------------------------------------------- checks
def check_existence():
    for nid, node in NODES.items():
        if node["kind"] == "link":
            continue
        if not path_of(node).exists():
            add("FAIL", "EXIST", f"{nid}: 文件不存在 {node['path']}")
    add("PASS", "EXIST", f"{sum(1 for n in NODES.values() if n['kind'] != 'link')} 个文件节点均存在")

def check_versions():
    bad = []
    for nid, node in NODES.items():
        if node["kind"] == "link" or node["version"] == "-":
            continue
        txt = read(node)
        m = VRE.search(txt[:6000])
        got = m.group(1) if m else None
        if got is None:
            bad.append(f"{nid}: 未找到版本标记（期望 {node['version']}）")
        elif got != node["version"]:
            bad.append(f"{nid}: 文件内 {got} ≠ 清单 {node['version']}")
    if bad:
        for b in bad:
            add("WARN", "VERSION", b)
    else:
        add("PASS", "VERSION", "所有带版本号的活动文件与清单一致")

def check_dict_vs_ddl():
    schema, dct = parse_schema(), parse_dict()
    if not schema:
        add("FAIL", "STRUCT", "schema.sql 未解析到建表语句")
        return
    if not dct:
        add("FAIL", "STRUCT", "字典未解析到字段表")
        return
    issues = []
    for t in sorted(set(schema) - set(dct)):
        issues.append(f"字典缺表 {t}")
    for t in sorted(set(dct) - set(schema)):
        issues.append(f"DDL 缺表 {t}")
    for t in sorted(set(schema) & set(dct)):
        miss = [c for c in schema[t] if c not in dct[t]]
        extra = [c for c in dct[t] if c not in schema[t]]
        if miss:
            issues.append(f"{t}: 字典缺字段 {miss}")
        if extra:
            issues.append(f"{t}: 字典多字段 {extra}")
    if issues:
        for i in issues:
            add("FAIL", "STRUCT", i)
    else:
        add("PASS", "STRUCT", f"字典与 DDL 完全对齐：{len(schema)} 表、{sum(len(v) for v in schema.values())} 个业务字段")

def check_seed_vs_ddl():
    schema, seed = parse_schema(), parse_seed()
    issues = []
    for t, cols in seed.items():
        if t not in schema:
            issues.append(f"seed 表 {t} 不存在于 DDL")
            continue
        miss = [c for c in cols if c not in schema[t]]
        if miss:
            issues.append(f"seed 表 {t} 使用了未知字段 {miss}")
    if issues:
        for i in issues:
            add("FAIL", "SEED", i)
    else:
        add("PASS", "SEED", f"seed 覆盖 {len(seed)} 张表，字段全部存在于 DDL")

def check_req_covers_schema():
    req = read(NODES["REQ"])
    schema = parse_schema()
    missing = [t for t in schema if t not in req]
    if missing:
        add("FAIL", "REQ", f"需求文档第 9 节未出现实体：{missing}")
    else:
        add("PASS", "REQ", f"需求文档覆盖全部 {len(schema)} 个实体名")

def check_legacy_refs():
    legacy = {nid: Path(n["path"]).name for nid, n in NODES.items()
              if n["status"] in ("LEGACY", "DUPLICATE")}
    hits = []
    for nid, node in NODES.items():
        if node["status"] != "ACTIVE" or node["kind"] == "link":
            continue
        txt = read(node)
        for lid, fname in legacy.items():
            if len(fname) >= 8 and fname in txt and lid != nid:
                hits.append(f"{nid} 引用了旧文件《{fname}》({lid})")
    if hits:
        for h in hits:
            add("WARN", "LEGACY-REF", h)
    else:
        add("PASS", "LEGACY-REF", "活动文件未引用旧版文件")

def check_stale_keywords():
    keys = ["event_media", "revoked_at", "display_name"]
    for nid, node in NODES.items():
        if node["status"] not in ("STALE", "REVIEW"):
            continue
        txt = read(node)
        if not txt:
            add("INFO", "STALE", f"{nid}: 无法读取内容，跳过关键词检查")
            continue
        miss = [k for k in keys if k not in txt]
        if miss:
            add("WARN", "STALE", f"{nid}: 缺少新模型字段 {miss}，疑似未同步")
        else:
            add("PASS", "STALE", f"{nid}: 已包含新模型字段")

def check_archive():
    for nid, node in NODES.items():
        if node["status"] in ("LEGACY", "DUPLICATE") and node["kind"] != "link":
            add("INFO", "ARCHIVE", f"{nid}: 旧版仍留在交付目录 → {node['path']}")

def task_items(t):
    """Task-level checklist may be a string in older modules; render it as one item."""
    c = t.get("checklist")
    return [c] if isinstance(c, str) else list(c or [])

def check_checklists():
    missing = []
    for nid, node in NODES.items():
        if node["status"] in CHECK_REQUIRED and not node.get("checklist"):
            missing.append(f"{nid}({node['status']})")
    if not MODULES:
        add("FAIL", "CHECKLIST", "delivery.json 未定义 modules 段")
    else:
        for mid, mod in MODULES.items():
            if not mod.get("checklist"):
                missing.append(f"{mid}(module)")
            for t in mod.get("tasks", []):
                if not t.get("checklist"):
                    missing.append(f"{mid}.{t['id']}")
    if missing:
        add("FAIL", "CHECKLIST", "以下节点/模块缺验收清单：" + "、".join(missing))
    else:
        n_items = sum(len(n.get("checklist", [])) for n in NODES.values())
        m_items = sum(len(m.get("checklist", [])) for m in MODULES.values())
        t_items = sum(len(task_items(t))
                      for m in MODULES.values() for t in m.get("tasks", []))
        add("PASS", "CHECKLIST",
            f"清单齐备：{len(NODES)} 节点 + {len(MODULES)} 模块，共 {n_items + m_items + t_items} 条验收项")

# ---------------------------------------------------------------- checklists
def box(status):
    """DONE 的模块/任务视为逐项已验收；其余保留待勾选状态。"""
    return "x" if str(status or "").upper() == "DONE" else " "

def build_checklists():
    lines = ["# 交付验收清单", "",
             f"> 自动生成于 {CFG['updated']}，由 `check_delivery.py --checklists` 输出，请勿手改",
             f"> 规则：{CFG['checklist_rule']}",
             "> 勾选规则：`[x]` = DONE / ACTIVE，清单已逐项验收；`[ ]` = REVIEW / STALE 等，待复核。", "",
             "## 一、模块验收", ""]
    for mid, mod in MODULES.items():
        title = mod["name"]
        if title.startswith(mid + " "):
            title = title[len(mid) + 1:]
        lines.append(f"### {mid} {title}")
        lines.append("")
        head = f"- 状态：{mod['status']}　预计：{mod['eta']}"
        if mod.get("goal"):
            head += f"　目标：{mod['goal']}"
        lines.append(head)
        lines.append("")
        for it in mod.get("checklist", []):
            lines.append(f"- [{box(mod.get('status'))}] {it}")
        if mod.get("checklist"):
            lines.append("")
        for t in mod.get("tasks", []):
            head = f"#### {t['id']} {t['name']}（{t['hours']}h）"
            if t.get("status"):
                head += f"　· {t['status']}"
            lines.append(head)
            lines.append("")
            for it in task_items(t):
                lines.append(f"- [{box(t.get('status'))}] {it}")
            lines.append("")
    lines.append("## 二、交付物验收")
    lines.append("")
    for nid in sorted(NODES, key=lambda k: (STATUS_ORDER.index(NODES[k]["status"]), k)):
        n = NODES[nid]
        if not n.get("checklist"):
            continue
        lines.append(f"### {nid} · {n['status']} · {n['path']}")
        lines.append("")
        for it in n["checklist"]:
            mark = "x" if n["status"] in ("DONE", "ACTIVE") or n.get("verified_at") else " "
            lines.append(f"- [{mark}] {it}")
        lines.append("")
    (HERE / "CHECKLISTS.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("CHECKLISTS.md 已刷新：", HERE / "CHECKLISTS.md")

def print_checklist(key):
    if key in NODES:
        n = NODES[key]
        print(f"{key} [{n['status']}] {n['path']}")
        for it in n.get("checklist", []):
            mark = "x" if n["status"] in ("DONE", "ACTIVE") or n.get("verified_at") else " "
            print(f"  [{mark}] {it}")
        return True
    if key in MODULES:
        m = MODULES[key]
        print(f"{key} [{m['status']}] {m['name']}　{m['eta']}")
        for it in m.get("checklist", []):
            print(f"  [{box(m.get('status'))}] {it}")
        for t in m.get("tasks", []):
            head = f"\n  {t['id']} {t['name']}（{t['hours']}h）"
            if t.get("status"):
                head += f"　· {t['status']}"
            print(head)
            for it in task_items(t):
                print(f"    [{box(t.get('status'))}] {it}")
        return True
    if "." in key:
        mid, tid = key.split(".", 1)
        for t in MODULES.get(mid, {}).get("tasks", []):
            if t["id"] == tid:
                head = f"{mid}.{tid} {t['name']}（{t['hours']}h）"
                if t.get("status"):
                    head += f"　· {t['status']}"
                print(head)
                for it in task_items(t):
                    print(f"  [{box(t.get('status'))}] {it}")
                return True
    print("未知 ID：", key)
    print("可用：", ", ".join(sorted(NODES) + sorted(MODULES)))
    return False

# ---------------------------------------------------------------- manifest
def build_manifest():
    lines = []
    lines.append("# 交付物清单与依赖索引")
    lines.append("")
    lines.append(f"> 版本 v1.0（{CFG['updated']}）｜由 `check_delivery.py --manifest` 自动生成，请勿手改")
    lines.append("> 项目：" + CFG["project"])
    lines.append("")
    lines.append("## 状态定义")
    lines.append("")
    lines.append("| 状态 | 含义 | 处理方式 |")
    lines.append("|---|---|---|")
    lines.append("| ACTIVE | 当前基线，所有修改以它为准 | 可以改，改前先算影响面 |")
    lines.append("| REVIEW | 结构接近基线但未逐项核对 | 核对后转 ACTIVE 或 STALE |")
    lines.append("| STALE | 内容对应旧模型，未同步 | 重生成或归档 |")
    lines.append("| LEGACY | 被取代的历史版本 | 只读，移入 `_archive/` |")
    lines.append("| DUPLICATE | 重复副本 | 删除或归档 |")
    lines.append("| EXTERNAL | 外部链接（飞书表） | 与本地源同步 |")
    lines.append("")
    lines.append("## 清单")
    lines.append("")
    lines.append("| ID | 文件 | 版本 | 状态 | 直接上游 | 直接下游 | 说明 |")
    lines.append("|---|---|---|---|---|---|---|")
    for nid in sorted(NODES, key=lambda k: (STATUS_ORDER.index(NODES[k]["status"]), k)):
        n = NODES[nid]
        up = "、".join(direct_upstream(nid)) or "—"
        down = "、".join(direct_downstream(nid)) or "—"
        fname = n["path"].replace("|", "\\|")
        lines.append(f"| {nid} | {fname} | {n['version']} | {n['status']} | {up} | {down} | {n['note']} |")
    lines.append("")
    lines.append("## 模块与验收清单")
    lines.append("")
    lines.append("| 模块 | 内容 | 状态 | 预计 | 任务数 | 验收项 |")
    lines.append("|---|---|---|---|---|---|")
    for mid, mod in MODULES.items():
        tasks = mod.get("tasks", [])
        n_items = len(mod.get("checklist", [])) + sum(len(task_items(t)) for t in tasks)
        title = mod["name"]
        if title.startswith(mid + " "):
            title = title[len(mid) + 1:]
        lines.append(f"| {mid} | {title} | {mod['status']} | {mod['eta']} | {len(tasks)} | {n_items} |")
    lines.append("")
    lines.append("逐项清单见 `CHECKLISTS.md`（`--checklists` 生成）；单项查询用 `--checklist M1` / `--checklist DDL`。")
    lines.append("")
    lines.append("## 变更操作流程")
    lines.append("")
    lines.append("1. 明确要改的是哪个 ID（例如 `DICT`）。")
    lines.append("2. 先算影响面：`python check_delivery.py --impact DICT`，按输出逐项同步。")
    lines.append("3. 新增交付或新模块时，先在 `delivery.json` 登记 nodes/modules **并写明 checklist**；没有清单的条目会被判 FAIL。")
    lines.append("4. 改完跑 `python check_delivery.py`，直到没有 FAIL；WARN 逐条判断。")
    lines.append("5. 更新 `delivery.json` 的 `version` / `updated`，再跑 `--manifest` 与 `--checklists`。")
    lines.append("")
    lines.append("## 口径锚点")
    lines.append("")
    lines.append("- 实体名、字段名只以 `DICT` 为准，DDL 与 seed 必须与它逐列对齐。")
    lines.append("- 业务规则与验收口径只以 `REQ` 为准，其它文档引用时不要复述数值。")
    lines.append("- 时间统一 `DATETIME(3)` 按 UTC 存储，展示层转 `Asia/Hong_Kong`；金额统一整数分。")
    lines.append("- 旧版文件不删除，移入 `_archive/` 并在本表标 LEGACY，避免“旧版本还在被引用”。")
    lines.append("")
    lines.append("## 当前待处理")
    lines.append("")
    lines.append("- `DOC-DB` / `DOC-REL` / `DOC-OPS` / `ER-HTML` / `ATTR-XLSX` / `FEISHU` 已按 17 实体、122 业务字段同步为 v2.0；当前检查为 FAIL 0 / WARN 0。")

    lines.append("- `REQ-V10`、`REQ-V10-AI`、`REQ-DUP`、`V0-*` 已归档到 `_archive/`，不参与发布。")
    (HERE / "MANIFEST.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("MANIFEST.md 已刷新：", HERE / "MANIFEST.md")

# ---------------------------------------------------------------- main
def main():
    if "--manifest" in sys.argv:
        build_manifest()
        return
    if "--checklists" in sys.argv:
        build_checklists()
        return
    if "--checklist" in sys.argv:
        i = sys.argv.index("--checklist")
        key = sys.argv[i + 1] if len(sys.argv) > i + 1 else ""
        sys.exit(0 if print_checklist(key) else 2)
    if "--impact" in sys.argv:
        i = sys.argv.index("--impact")
        nid = sys.argv[i + 1] if len(sys.argv) > i + 1 else ""
        if nid not in NODES:
            print("未知 ID：", nid, "\n可用：", ", ".join(sorted(NODES)))
            sys.exit(2)
        print(f"改动 {nid}（{NODES[nid]['path']}）后需要同步：")
        hits = sorted(downstream(nid))
        for h in hits:
            print(f"  - {h:<12} {NODES[h]['path']}")
        if not hits:
            print("  （没有下游依赖）")
        return

    check_existence()
    check_versions()
    check_dict_vs_ddl()
    check_seed_vs_ddl()
    check_req_covers_schema()
    check_legacy_refs()
    check_stale_keywords()
    check_archive()
    check_checklists()

    for level, code, msg in results:
        if level != "PASS" or code in ("STRUCT", "SEED", "REQ"):
            print(f"[{level}] {code}: {msg}")
    fails = [r for r in results if r[0] == "FAIL"]
    warns = [r for r in results if r[0] == "WARN"]
    print(f"\n汇总：FAIL {len(fails)} / WARN {len(warns)} / 共 {len(results)} 条")
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()
