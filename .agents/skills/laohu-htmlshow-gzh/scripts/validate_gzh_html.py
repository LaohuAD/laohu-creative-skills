#!/usr/bin/env python3
"""Statically check a WeChat article HTML fragment against this Skill's rules.

This does not verify rendering or clipboard behavior in the WeChat editor.
"""

import argparse
import re
import sys
from html.parser import HTMLParser


FORBIDDEN_TAGS = {
    "html", "head", "body", "title", "meta", "base", "style", "script", "link",
    "div", "button", "form", "input", "select", "option", "textarea", "video",
    "audio", "canvas", "svg", "iframe", "object", "embed", "source",
}
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
SKIP_TEXT_TAGS = {"head", "title", "style", "script", "template", "noscript"}
HIDDEN_STYLE = re.compile(r"(?:display\s*:\s*none|visibility\s*:\s*hidden)", re.I)
CODE_STYLE = re.compile(r"monospace|white-space\s*:\s*pre|courier|consolas|sf mono", re.I)
HALF_PUNCT = re.compile(r"[一-鿿㐀-䶿][,;.!?:]")
CHINESE_ASCII_QUOTE = re.compile(r"(?<=[一-鿿㐀-䶿])[\"\']|[\"\'](?=[一-鿿㐀-䶿])")
FORBIDDEN_STYLE = [
    (re.compile(r"position\s*:\s*(fixed|absolute|sticky)", re.I), "position fixed/absolute/sticky 不被支持"),
    (re.compile(r"float\s*:", re.I), "float 不被支持"),
    (re.compile(r"@media|@keyframes|@import", re.I), "CSS at-rule 不被支持"),
    (re.compile(r"display\s*:\s*grid", re.I), "display:grid 不被支持，请用 flex"),
    (re.compile(r"var\s*\(\s*--", re.I), "CSS 变量 var(--x) 不被支持，请写死值"),
    (re.compile(r"url\s*\(\s*['\"]?https?://[^)]*\.(woff2?|ttf|otf|eot)", re.I), "外部字体不被支持"),
]


class FragmentChecker(HTMLParser):
    """Check tag/attribute policy and every visible non-whitespace text node."""

    def __init__(self, *, article=True):
        super().__init__(convert_charrefs=True)
        self.article = article
        self.stack = []  # (tag, is_leaf, is_hidden, is_code)
        self.leaf_depth = 0
        self.hidden_depth = 0
        self.code_depth = 0
        self.span_leaf_count = 0
        self.unwrapped = []
        self.half_punct = []
        self.errors = []
        self.top_level_tags = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if not self.stack:
            self.top_level_tags.append(tag)
        if tag in FORBIDDEN_TAGS:
            self.errors.append(f"禁用标签 <{tag}>")
        for name in attrs:
            if name in {"class", "id"}:
                self.errors.append(f"禁用属性 {name}=（<{tag}>）")
            elif name.startswith("on"):
                self.errors.append(f"禁用事件属性 {name}=（<{tag}>）")
        style = attrs.get("style", "") or ""
        for pattern, message in FORBIDDEN_STYLE:
            if pattern.search(style):
                self.errors.append(f"{message}（<{tag}>）")

        is_leaf = tag == "span" and "leaf" in attrs
        is_hidden = "hidden" in attrs or bool(HIDDEN_STYLE.search(style))
        is_code = bool(CODE_STYLE.search(style))
        if is_leaf:
            self.span_leaf_count += 1
            self.leaf_depth += 1
        if is_hidden:
            self.hidden_depth += 1
        if is_code:
            self.code_depth += 1
        if tag not in VOID_TAGS:
            self.stack.append((tag, is_leaf, is_hidden, is_code))
        else:
            self._close_counters([(tag, is_leaf, is_hidden, is_code)])

    def _close_counters(self, items):
        for _, was_leaf, was_hidden, was_code in items:
            self.leaf_depth -= bool(was_leaf)
            self.hidden_depth -= bool(was_hidden)
            self.code_depth -= bool(was_code)

    def handle_endtag(self, tag):
        if self.stack and self.stack[-1][0] == tag:
            self._close_counters([self.stack.pop()])
            return
        if any(item[0] == tag for item in self.stack):
            self.errors.append(f"标签嵌套顺序错误：期望 </{self.stack[-1][0]}>，遇到 </{tag}>")
        else:
            self.errors.append(f"没有对应开始标签的 </{tag}>")

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID_TAGS:
            self.handle_endtag(tag)

    def handle_data(self, data):
        text = data.strip()
        if not text or self.hidden_depth or any(tag in SKIP_TEXT_TAGS for tag, *_ in self.stack):
            return
        if not self.stack:
            self.errors.append("正文片段顶层容器外含有可见文本")
        if not self.leaf_depth:
            parent = self.stack[-1][0] if self.stack else "(root)"
            self.unwrapped.append((text[:24] + ("…" if len(text) > 24 else ""), parent))
        if not self.code_depth and (HALF_PUNCT.search(text) or CHINESE_ASCII_QUOTE.search(text)):
            self.half_punct.append(text[:24] + ("…" if len(text) > 24 else ""))

    def finish(self):
        if self.stack:
            self.errors.append("未闭合标签：" + ", ".join(f"<{tag}>" for tag, *_ in self.stack[-5:]))
        if self.article and self.top_level_tags != ["section"]:
            self.errors.append("正文片段必须从顶层 <section> 容器开始；不要传完整预览页或 HTML 文档")
        if self.unwrapped:
            sample = "；".join(f"「{text}」(在 <{tag}> 内)" for text, tag in self.unwrapped[:5])
            self.errors.append(f"{len(self.unwrapped)} 处可见文字未被 <span leaf> 包裹：{sample}")
        if self.half_punct:
            sample = "；".join(f"「{text}」" for text in self.half_punct[:5])
            self.errors.append(f"{len(self.half_punct)} 处中文叙述含半角标点或直引号，应改中文全角（代码区及英文句子除外）：{sample}")


def validate(html, name="<input>", *, article=True):
    checker = FragmentChecker(article=article)
    try:
        checker.feed(html)
        checker.close()
        checker.finish()
    except Exception as exc:
        checker.errors.append(f"HTML 解析中断：{exc}")
    return checker.errors, checker.span_leaf_count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", nargs="?", help="HTML 文件路径")
    parser.add_argument("--stdin", action="store_true", help="从标准输入读取")
    args = parser.parse_args()
    if args.stdin or not args.file:
        html, name = sys.stdin.read(), "<stdin>"
    else:
        with open(args.file, encoding="utf-8", errors="replace") as stream:
            html, name = stream.read(), args.file

    errors, leaf_count = validate(html, name)
    print(f"公众号 HTML 静态规则检查：{name}")
    print(f"   span leaf 包裹: {leaf_count} 处")
    if errors:
        print(f"\n❌ 未通过 ×{len(errors)}:")
        for error in errors:
            print(f"   • {error}")
        print("\n静态规则检查未通过；请修复后重跑。")
        return 1
    print("\n✅ 静态规则检查通过；未验证微信公众号编辑器实际粘贴效果。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
