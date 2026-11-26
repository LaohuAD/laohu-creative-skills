#!/usr/bin/env python3
"""把公众号正文包装成复制预览，并可生成内嵌本地图片的便携正文。"""

import argparse
import base64
import html
from html.parser import HTMLParser
import mimetypes
import os
from pathlib import Path
import re
import sys
import tempfile
from urllib.parse import unquote, urlsplit


_SRC_ATTR = re.compile(
    r"(?i)(?<![\w:-])src\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s\"'=<>`]+))"
)
_SVG_START = re.compile(rb"^\s*(?:<\?xml[^>]*>\s*)?(?:<!doctype[^>]*>\s*)?<svg(?:\s|>)", re.I)
_IMAGE_MIME_BY_SIGNATURE = (
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
    (b"BM", "image/bmp"),
    (b"II*\x00", "image/tiff"),
    (b"MM\x00*", "image/tiff"),
)
_MIME_EXTENSIONS = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".jpe": "image/jpeg",
    ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
    ".bmp": "image/bmp", ".tif": "image/tiff", ".tiff": "image/tiff",
    ".svg": "image/svg+xml",
}


class ImageSourceError(ValueError):
    pass


class _ImageTagCollector(HTMLParser):
    def __init__(self, content):
        super().__init__(convert_charrefs=True)
        self.content = content
        self.line_offsets = [0]
        self.line_offsets.extend(match.end() for match in re.finditer("\n", content))
        self.replacements = []
        self.image_count = 0

    def handle_starttag(self, tag, attrs):
        if tag.lower() != "img":
            return
        self.image_count += 1
        attrs = [(name.lower(), value) for name, value in attrs]
        sources = [value for name, value in attrs if name == "src"]
        if len(sources) != 1 or not sources[0]:
            raise ImageSourceError(f"第 {self.image_count} 个 <img> 缺少唯一且非空的 src")

        raw_tag = self.get_starttag_text()
        line, column = self.getpos()
        start = self.line_offsets[line - 1] + column
        end = start + len(raw_tag)
        source_value = sources[0]
        portable_value = _portable_image_source(source_value, self.base_dir)
        if portable_value is None:
            return

        raw_src = list(_SRC_ATTR.finditer(raw_tag))
        if len(raw_src) != 1:
            raise ImageSourceError(f"无法安全替换第 {self.image_count} 个 <img> 的 src")
        attr = raw_src[0]
        value_group = next(index for index in (1, 2, 3) if attr.group(index) is not None)
        value_start, value_end = attr.span(value_group)
        updated_tag = raw_tag[:value_start] + portable_value + raw_tag[value_end:]
        self.replacements.append((start, end, updated_tag))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)


def _guess_image_mime(path, data):
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        sniffed = "image/webp"
    elif _SVG_START.match(data[:512]):
        sniffed = "image/svg+xml"
    else:
        sniffed = next((mime for signature, mime in _IMAGE_MIME_BY_SIGNATURE
                        if data.startswith(signature)), None)
    if not sniffed:
        raise ImageSourceError(f"无法识别图片 MIME：{path}")

    suffix = Path(path).suffix.lower()
    declared = _MIME_EXTENSIONS.get(suffix) or mimetypes.guess_type(str(path))[0]
    if declared and declared != sniffed:
        raise ImageSourceError(
            f"图片扩展名与实际 MIME 不一致：{path}（扩展名 {declared}，内容 {sniffed}）"
        )
    return sniffed


def _portable_image_source(source, base_dir):
    parsed = urlsplit(html.unescape(source))
    scheme = parsed.scheme.lower()
    if scheme in ("http", "https", "data") or source.startswith("//"):
        return None

    if scheme == "file":
        if parsed.netloc not in ("", "localhost"):
            raise ImageSourceError(f"不支持读取远程 file URI：{source}")
        image_path = Path(unquote(parsed.path))
    elif scheme:
        # 例如 cid: 等已有外部引用不由本工具解析或下载。
        return None
    else:
        path_text = unquote(parsed.path)
        image_path = Path(path_text)
        if not image_path.is_absolute():
            image_path = base_dir / image_path

    if not image_path.is_file():
        raise ImageSourceError(f"本地图片不存在或不可读：{image_path}（src={source}）")
    try:
        data = image_path.read_bytes()
    except OSError as error:
        raise ImageSourceError(f"读取本地图片失败：{image_path}：{error}") from error
    mime = _guess_image_mime(image_path, data)
    uri = "data:" + mime + ";base64," + base64.b64encode(data).decode("ascii")
    if parsed.fragment:
        uri += "#" + parsed.fragment
    return uri


def make_portable_section(content, source_path):
    parser = _ImageTagCollector(content)
    parser.base_dir = Path(source_path).resolve().parent
    try:
        parser.feed(content)
        parser.close()
    except ImageSourceError:
        raise
    except Exception as error:
        raise ImageSourceError(f"解析正文图片失败：{error}") from error

    for start, end, updated_tag in reversed(parser.replacements):
        content = content[:start] + updated_tag + content[end:]
    return content


def _atomic_write(path, content):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix="." + path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as output:
            output.write(content)
        os.replace(temporary, path)
    except Exception:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def _arguments(argv):
    parser = argparse.ArgumentParser(
        description="生成微信公众号复制预览；--portable 另产内嵌本地图片的干净正文。"
    )
    parser.add_argument("section_html", help="纯 <section> 正文 HTML")
    parser.add_argument("preview_html", nargs="?", help="预览页输出路径")
    parser.add_argument("--portable", action="store_true",
                        help="另写可携带图片的干净正文，并让预览复制该正文")
    parser.add_argument("--body-output", help="--portable 的干净正文输出路径")
    parser.add_argument("--in-place", action="store_true",
                        help="仅与 --portable 同用；明确授权覆盖输入正文文件")
    args = parser.parse_args(argv)
    if args.in_place and not args.portable:
        parser.error("--in-place 必须与 --portable 同用")
    if args.body_output and not args.portable:
        parser.error("--body-output 必须与 --portable 同用")
    if args.in_place and args.body_output:
        parser.error("--in-place 与 --body-output 不能同时使用")
    return args


def main(argv=None):
    args = _arguments(argv)
    source = Path(args.section_html).expanduser()
    if not source.is_file():
        print(f"✗ 找不到文件: {source}", file=sys.stderr)
        return 1
    try:
        content = source.read_text(encoding="utf-8").strip()
    except (OSError, UnicodeError) as error:
        print(f"✗ 读取正文失败: {source}: {error}", file=sys.stderr)
        return 1

    try:
        portable_content = make_portable_section(content, source)
    except ImageSourceError as error:
        print(f"✗ 未生成预览或便携正文：{error}", file=sys.stderr)
        return 1

    source_stem = source.with_suffix("")
    preview = Path(args.preview_html).expanduser() if args.preview_html else Path(str(source_stem) + "_预览.html")
    body = None
    if args.portable:
        body = source if args.in_place else (
            Path(args.body_output).expanduser() if args.body_output
            else Path(str(source_stem) + "_便携.html")
        )
    resolved_preview = preview.resolve()
    if body is not None and resolved_preview == body.resolve():
        print("✗ 预览页和干净正文不能写入同一路径", file=sys.stderr)
        return 1
    if body is not None and body.resolve() == source.resolve() and not args.in_place:
        print("✗ 便携正文不能覆盖源正文；如需覆盖请显式使用 --in-place", file=sys.stderr)
        return 1
    if not args.in_place and resolved_preview == source.resolve():
        print("✗ 预览页不能覆盖源正文；如需覆盖正文，请使用 --portable --in-place", file=sys.stderr)
        return 1

    template_path = Path(__file__).resolve().parent.parent / "assets" / "preview-template.html"
    try:
        template = template_path.read_text(encoding="utf-8")
        title = source.stem
        preview_content = portable_content
        preview_html = template.replace("{{TITLE}}", html.escape(title)).replace(
            "<!--GZH_CONTENT-->", preview_content
        )
        if body is not None:
            _atomic_write(body, portable_content)
        _atomic_write(preview, preview_html)
    except OSError as error:
        print(f"✗ 写入交付文件失败：{error}", file=sys.stderr)
        return 1

    if body is not None:
        print(f"✓ 已生成便携干净正文（本地图片按原字节内嵌）: {body}")
    print(f"✓ 已生成带「复制」按钮的预览页: {preview}")
    print("  浏览器打开后点击「复制到公众号」，再粘贴并检查公众号实际接收的图片与样式。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
