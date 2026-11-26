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
        is_code = tag == "code" or bool(CODE_STYLE.search(style))
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


class _TreeNode:
    def __init__(self, tag, attrs, line, parent=None):
        self.tag = tag
        self.attrs = dict(attrs)
        self.line = line
        self.parent = parent
        self.children = []
        self.text = []

    def visible_text(self):
        style = self.attrs.get("style", "") or ""
        opacity = re.search(r"(?:^|;)\s*opacity\s*:\s*0(?:\.0+)?\s*(?:!important\s*)?(?:;|$)", style, re.I)
        if "hidden" in self.attrs or HIDDEN_STYLE.search(style) or opacity:
            return ""
        return "".join(self.text) + "".join(child.visible_text() for child in self.children)

    def ancestors(self):
        node = self
        while node is not None:
            yield node
            node = node.parent


class _TreeProbe(HTMLParser):
    """Small stdlib DOM approximation for deterministic source-level candidates."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = _TreeNode("#root", {}, 1)
        self.stack = [self.root]
        self.nodes = []

    def handle_starttag(self, tag, attrs):
        node = _TreeNode(tag.lower(), attrs, self.getpos()[0], self.stack[-1])
        self.stack[-1].children.append(node)
        self.nodes.append(node)
        if tag.lower() not in VOID_TAGS:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        node = _TreeNode(tag.lower(), attrs, self.getpos()[0], self.stack[-1])
        self.stack[-1].children.append(node)
        self.nodes.append(node)

    def handle_endtag(self, tag):
        tag = tag.lower()
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.stack[-1].text.append(data)


BLOCK_TAGS = {
    "address", "article", "aside", "blockquote", "div", "dl", "fieldset", "figure",
    "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "main",
    "nav", "ol", "p", "pre", "section", "table", "ul",
}
MEDIA_TAGS = {"img", "video", "audio", "svg", "canvas", "iframe", "object", "embed"}
GRADIENT = re.compile(r"(?:linear|radial|conic)-gradient\s*\(", re.I)
CSS_LENGTH = re.compile(r"^(-?\d+(?:\.\d+)?)(px|pt|em|rem|cm|mm|in)?$", re.I)
TRANSPARENT_COLOR = re.compile(r"^(?:transparent|rgba\([^)]*,\s*0(?:\.0+)?\s*\))$", re.I)


def _style_map(node):
    result = {}
    for declaration in (node.attrs.get("style", "") or "").split(";"):
        if ":" not in declaration:
            continue
        key, value = declaration.split(":", 1)
        result[key.strip().lower()] = value.strip()
    return result


def _css_number(value, *, font_size=None):
    match = CSS_LENGTH.fullmatch((value or "").strip())
    if not match:
        return None
    number = float(match.group(1))
    unit = (match.group(2) or "").lower()
    if unit in ("em", "rem"):
        return number * (font_size or 16)
    return number


def _rule_hints(html):
    """Return deterministic checks and unconfirmed risk candidates from the upstream rule set."""
    probe = _TreeProbe()
    try:
        probe.feed(html)
        probe.close()
    except Exception:
        return [], []

    errors, warnings = [], []
    reported_chains = set()
    for node_no, node in enumerate(probe.nodes, 1):
        style = _style_map(node)
        attrs = node.attrs
        text = node.visible_text().strip()
        line = node.line
        label = f"节点 #{node_no} 第 {line} 行 <{node.tag}>"

        if node.tag == "span" and "leaf" in attrs:
            def first_block_descendant(parent):
                for child in parent.children:
                    if child.tag in BLOCK_TAGS:
                        return child
                    nested = first_block_descendant(child)
                    if nested:
                        return nested
                return None
            child = first_block_descendant(node)
            if child:
                errors.append(f"span-leaf-block：{label} 的 <span leaf> 包含块级 <{child.tag}>；将块级结构移到 leaf 外，重跑静态校验。")

        if node.tag == "section" and "nodeleaf" in attrs:
            warnings.append(f"section-nodeleaf：{label} 使用 nodeleaf，但当前固定来源没有公开可核对的组件允许清单；若无明确组件依据，移除该标记并保留普通 section；否则按该节点记录具体依据。")

        if node.tag not in MEDIA_TAGS:
            parent_same = (
                node.parent is not None
                and node.parent.tag == node.tag
                and _style_map(node.parent) == style
                and len(node.parent.children) == 1
                and not "".join(node.parent.text).strip()
            )
            if not parent_same:
                chain = [node]
                current = node
                while (
                    current.tag not in MEDIA_TAGS
                    and len(current.children) == 1
                    and not "".join(current.text).strip()
                ):
                    child = current.children[0]
                    if child.tag != current.tag or _style_map(child) != _style_map(current):
                        break
                    chain.append(child)
                    current = child
                if len(chain) > 10:
                    end_no = next((index for index, item in enumerate(probe.nodes, 1) if item is chain[-1]), node_no)
                    reported_chains.add((node_no, end_no, chain[0].line, chain[-1].line, chain[0].tag))
        if reported_chains and (node_no == len(probe.nodes)):
            for start_no, end_no, start_line, end_line, tag in sorted(reported_chains):
                errors.append(f"nest-depth：节点 #{start_no}–#{end_no} 的相同 <{tag}> / 相同内联样式 / 单子节点链超过10层（第 {start_line}–{end_line} 行）；删除冗余同层包装后重跑。")

        # Dark-mode gradient check is a source candidate, not the upstream mp-darkmode result.
        background = style.get("background", "") + " " + style.get("background-image", "")
        ignore_dm = set((attrs.get("data-ignore-dm", "") or "").split())
        if GRADIENT.search(background) and text and "text-bg-gradient" not in ignore_dm:
            warnings.append(
                f"darkmode-no-gradient 候选：{label} 同时有渐变背景和可见文字；确认文字确实压在渐变上，优先将渐变移到无文字装饰层或改为纯色。"
            )

        # Width rules depend on measured layout. These are only candidate findings.
        ignored_width = any("data-ignore-width" in ancestor.attrs for ancestor in node.ancestors())
        if not ignored_width:
            width = style.get("width", "") or attrs.get("width", "") or ""
            max_width = style.get("max-width", "")
            width_value = width.strip().lower()
            width_is_fixed = bool(
                width_value and width_value not in {"auto", "100%"}
                and not width_value.endswith("%")
                and _css_number(width_value) is not None
            )
            max_match = re.fullmatch(r"(\d+(?:\.\d+)?)%", max_width.strip())
            is_clamped = (
                (max_match is not None and 0 < float(max_match.group(1)) <= 100)
                or max_width.strip().lower() == "100vw"
            )
            descendants = []
            pending = list(node.children)
            while pending:
                descendant = pending.pop()
                descendants.append(descendant)
                pending.extend(descendant.children)
            images = [candidate for candidate in descendants if candidate.tag == "img"]
            image_width = _css_number(width_value)
            decorative_image = node.tag == "img" and not attrs.get("alt", "").strip() and image_width is not None and image_width <= 24
            has_content_image = any(
                candidate.attrs.get("alt", "").strip()
                or _css_number(_style_map(candidate).get("width", "") or candidate.attrs.get("width", "")) is None
                or (_css_number(_style_map(candidate).get("width", "") or candidate.attrs.get("width", "")) or 0) > 24
                for candidate in images
            )
            has_layout_content = bool(text or has_content_image or (node.tag == "img" and not decorative_image))
            if node.tag == "img" and not is_clamped and not decorative_image:
                warnings.append(
                    f"width 候选：{label} 图片没有 max-width:100%；按组件规则补自适应上限或按节点理由接受。"
                )
            elif width_is_fixed and node.tag not in {"svg"} and has_layout_content and not is_clamped:
                warnings.append(
                    f"width 候选：{label} 有固定宽度 {width!r}；改为自适应，或按明确的固定布局用途接受。"
                )

        if style.get("text-align", "").strip().lower() in {"start", "end"}:
            warnings.append(f"text-align：{label} 使用 {style['text-align']}；改为明确的 left/right/center 后重跑。")

        caret = style.get("caret-color", "").strip()
        if caret and TRANSPARENT_COLOR.fullmatch(caret):
            warnings.append(f"caret-color：{label} 光标颜色透明；改为可见颜色后复检编辑位置。")

        font_size = _css_number(style.get("font-size", ""))
        line_height = (style.get("line-height", "") or "").strip()
        if text and font_size is not None and line_height:
            ratio = re.fullmatch(r"(-?\d+(?:\.\d+)?)", line_height)
            line_px = float(ratio.group(1)) * font_size if ratio else _css_number(line_height, font_size=font_size)
            multiline = any(child.tag == "br" for child in node.children) or "\n" in "".join(node.text)
            if line_px is not None and line_px < font_size and multiline:
                warnings.append(f"line-height-overlapping 候选：{label} 显式行高小于字号且源文本包含换行；提高行高/调整字号，或按单行、无文字等规则例外接受。")

        height = _css_number(style.get("height", ""))
        overflow = (style.get("overflow", "") + " " + style.get("overflow-y", "")).lower()
        if text and (height == 0 or (height is not None and height <= 2 and "hidden" in overflow)):
            warnings.append(f"height 候选：{label} 有文字但高度为零/极小且可能裁切；移除固定高度，确为滚动容器时按节点理由接受。")

        if "!important" in (attrs.get("style", "") or "").lower():
            warnings.append(f"darkmode-important：{label} 含 !important；移除不必要的优先级强制并重跑。")

        if "data-no-dark" in attrs:
            warnings.append(f"darkmode-whitelist：{label} 设置 data-no-dark，只影响当前节点；移除无用标记，确有用途时按节点理由接受；后代仍单独检查。")

    return errors, warnings


def analyze(html, name="<input>", *, article=True):
    """Run local structural checks and return unresolved source-level candidates separately."""
    errors, leaf_count = validate(html, name, article=article)
    extra_errors, warnings = _rule_hints(html)
    return errors + extra_errors, warnings, leaf_count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", nargs="?", help="HTML 文件路径")
    parser.add_argument("--stdin", action="store_true", help="从标准输入读取")
    parser.add_argument(
        "--accept-warning", action="append", default=[], metavar="RULE@NODE=REASON",
        help="仅在按本地规则核对后，按具体节点记录可接受理由；未处理警告默认不通过。",
    )
    args = parser.parse_args()
    if args.stdin or not args.file:
        html, name = sys.stdin.read(), "<stdin>"
    else:
        with open(args.file, encoding="utf-8", errors="replace") as stream:
            html, name = stream.read(), args.file

    errors, warnings, leaf_count = analyze(html, name)
    print(f"公众号 HTML 静态规则检查：{name}")
    print(f"   span leaf 包裹: {leaf_count} 处")
    if errors:
        print(f"\n❌ 未通过 ×{len(errors)}:")
        for error in errors:
            print(f"   • {error}")
        print("\n静态规则检查未通过；请修复后重跑。")
        return 1
    accepted = {}
    for item in args.accept_warning:
        key, sep, reason = item.partition("=")
        if not sep or not reason.strip() or "@" not in key:
            print(f"✗ 无效的 --accept-warning：{item!r}；格式为 RULE@NODE=具体依据", file=sys.stderr)
            return 2
        accepted[key.strip()] = reason.strip()

    pending = []
    for warning in warnings:
        rule_match = re.match(r"^([a-z0-9-]+)(?: 候选)?(?:：| )", warning)
        rule = rule_match.group(1) if rule_match else warning.split(" ", 1)[0].removesuffix("：").removesuffix("候选")
        node_match = re.search(r"节点 #(\d+)", warning)
        location = f"{rule}@{node_match.group(1)}" if node_match else None
        if location and location in accepted:
            print(f"   ✓ 已按本地规则接受 {location}：{accepted.pop(location)}")
        else:
            pending.append(warning)
    if accepted:
        print("✗ --accept-warning 未匹配本次输出：" + ", ".join(accepted), file=sys.stderr)
        return 2
    if pending:
        print(f"\n⚠️ 未处理候选 ×{len(pending)}（不是上游引擎确认的违规；逐条修复或按规则记录具体接受依据）：")
        for warning in pending:
            print(f"   • {warning}")
        print("\n静态检查未完成；修复或逐项接受后重跑。")
        return 1
    print("\n✅ 内置静态规则检查通过。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
