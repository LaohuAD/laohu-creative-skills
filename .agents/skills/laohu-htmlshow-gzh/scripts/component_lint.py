#!/usr/bin/env python3
"""组件库源头检查器 —— 可验证循环的第一道关。

扫描主题索引中已登记的库及通用库 .md 里的 ```html 代码块，检测会导致
排版问题的反模式。只看真实组件 HTML，不被说明文字干扰（grep 做不到）。

与 validate_gzh_html.py 配合构成闭环：
  改组件库 → component_lint.py 扫源头 → 生成产物 → validate_gzh_html.py 扫产物 → 修 → 重复

用法：
    component_lint.py [skill-dir]   # 默认当前目录
退出码：1 = 有 ERROR，0 = 通过。
"""

import os
import re
import sys

from pathlib import Path
from validate_gzh_html import validate


def component_sources(root):
    """Only registered runtime themes and the shared component library."""
    refs = Path(root) / "references"
    index = (refs / "theme-index.md").read_text(encoding="utf-8")
    names = sorted(set(re.findall(r"theme-[a-z0-9-]+\.md", "\n".join(line for line in index.splitlines() if line.startswith("|")))))
    return [refs / "common-components.md"] + [refs / name for name in names]

# 四周虚线框：border: ... dashed（不含方向，如 border-left dashed 不算）
FOURSIDE_DASHED = re.compile(r"border\s*:\s*[^;{}]*dashed", re.I)
CENTERED = re.compile(r"text-align\s*:\s*center", re.I)


def lint_file(path):
    text = open(path, encoding="utf-8", errors="replace").read()
    name = os.path.basename(path).replace("公众号排版组件库 —— ", "").replace(".md", "")
    found = []  # (level, msg)
    seen = set()

    def add(level, msg):
        if msg not in seen:
            seen.add(msg)
            found.append((level, msg))

    if os.path.basename(path).startswith("theme-"):
        required = {
            "设计变量": r"^## .*设计变量",
            "组件定义": r"^## 组件 \d+",
            "文章骨架": r"^## .*完整文章模板骨架",
            "组合配方": r"^## .*文章类型.*组件组合配方",
            "语义映射": r"^## Markdown .*映射规则",
        }
        for label, pattern in required.items():
            if not re.search(pattern, text, re.M):
                add("ERROR", f"主题缺少必备章节：{label}")

    for m in re.finditer(r"```html\s*\n(.*?)```", text, re.S):
        html = m.group(1)
        errors, _ = validate(html, article=False)
        line = text.count("\n", 0, m.start()) + 1
        for error in errors:
            add("ERROR", f"行 {line}：{error}")
        # 四周虚线框：正文强调勿用；居中块视为"占位/素材"组件，豁免
        if FOURSIDE_DASHED.search(html) and not CENTERED.search(html):
            add("WARN", "四周虚线框 border:…dashed（正文强调请用左竖条；"
                        "主题明确定义的虚线组件及居中素材占位例外）")
    return name, found


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    refs = component_sources(root)
    if not refs:
        print(f"未找到 {root}/references/*.md")
        sys.exit(1)

    total_err = total_warn = clean = 0
    print(f"📐 组件库源头检查：{len(refs)} 个库\n")
    for path in refs:
        name, found = lint_file(path)
        if not found:
            clean += 1
            continue
        errs = [m for lv, m in found if lv == "ERROR"]
        warns = [m for lv, m in found if lv == "WARN"]
        total_err += len(errs)
        total_warn += len(warns)
        print(f"── {name} ──")
        for m in errs:
            print(f"   ❌ {m}")
        for m in warns:
            print(f"   ⚠️  {m}")

    print(f"\n汇总：{clean}/{len(refs)} 个库干净，ERROR×{total_err}，WARN×{total_warn}")
    if total_err == 0 and total_warn == 0:
        print("✅ 全部组件库源头无反模式")
    sys.exit(1 if total_err else 0)


if __name__ == "__main__":
    main()
