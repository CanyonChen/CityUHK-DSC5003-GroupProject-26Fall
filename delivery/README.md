# delivery：交付索引（发布包内）

本目录只描述交付物之间关系，不存放文档与代码本身。

```powershell
python check_delivery.py                 # 全量一致性检查（FAIL 必须为 0）
python check_delivery.py --impact DICT   # 改字典会牵出哪些文件
python check_delivery.py --checklist M1  # 看模块验收项
python check_delivery.py --manifest      # 刷新 MANIFEST.md
python check_delivery.py --checklists    # 刷新 CHECKLISTS.md
```

节点状态：`ACTIVE` 为基线；`REVIEW` 待核对；`STALE` 需重同步；旧版不入库。
新增交付时必须同时写 `checklist`，否则检查判 FAIL。