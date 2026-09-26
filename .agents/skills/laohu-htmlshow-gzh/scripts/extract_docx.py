#!/usr/bin/env python3
"""Word .docx → Markdown 提取器（零外部依赖）。

格式归一化层的确定性组件：把 docx 的标题层级 / 粗体 / 列表 / 图片
转成本 skill 排版流程认识的 Markdown。

用法：
    extract_docx.py 文章.docx [-o 输出.md] [--force]
    # 内嵌图片解包到 输出.md 同目录的 images/ 下，md 里用相对路径引用

退出码：0 成功；1 失败（文件不存在 / 不是合法 docx）。
遇到未支持的正文结构或失效图片关系时停止且不落盘；已有 Markdown 需显式使用 --force。
"""

import argparse
import hashlib
import os
import re
import sys
import tempfile
import zipfile
import xml.etree.ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"


def load_styles(z):
    """styleId → 标题级别（1/2/3…）；非标题样式不入表。"""
    levels = {}
    try:
        root = ET.fromstring(z.read("word/styles.xml"))
    except KeyError:
        return levels
    for st in root.iter(f"{W}style"):
        sid = st.get(f"{W}styleId") or ""
        name_el = st.find(f"{W}name")
        name = (name_el.get(f"{W}val") if name_el is not None else "") or ""
        m = re.search(r"(?:heading|标题)\s*([1-6])", name, re.I) \
            or re.fullmatch(r"([1-6])", sid)
        if m:
            levels[sid] = int(m.group(1))
    return levels


def load_rels(z):
    """rId → 媒体文件路径（word/media/...）。"""
    rels = {}
    try:
        root = ET.fromstring(z.read("word/_rels/document.xml.rels"))
    except KeyError:
        return rels
    for rel in root:
        target = rel.get("Target") or ""
        if "media/" in target:
            rels[rel.get("Id")] = "word/" + target.lstrip("/").replace("../", "")
    return rels


def para_text(p, *, table_cell=False, image_link=None):
    """段内 run → Markdown；保留显式换行、Tab 与 run 强调。"""
    out = []
    for r_el in p.iter(f"{W}r"):
        rpr = r_el.find(f"{W}rPr")
        bold = rpr is not None and rpr.find(f"{W}b") is not None \
            and (rpr.find(f"{W}b").get(f"{W}val") or "1") not in ("0", "false")
        ul = rpr is not None and rpr.find(f"{W}u") is not None
        chunks = []
        def flush():
            text = "".join(chunks)
            chunks.clear()
            if text:
                if bold:
                    text = f"**{text}**"
                if ul:
                    text = f"<u>{text}</u>"
                out.append(text)

        for node in r_el.iter():
            if node.tag == f"{W}t":
                chunks.append(node.text or "")
            elif node.tag in (f"{W}br", f"{W}cr"):
                # Markdown hard break within one paragraph. Table cells use
                # HTML <br> so the table row itself cannot be split.
                chunks.append("<br>" if table_cell else "  \n")
            elif node.tag == f"{W}tab":
                # A fixed visible separator survives Markdown/HTML whitespace
                # collapsing; custom Word tab stops are intentionally not implied.
                chunks.append("\u00a0" * 4)
            elif node.tag == f"{A}blip":
                flush()
                if image_link is None:
                    raise ValueError("图片提取缺少资源处理器")
                out.append(image_link(node))
        flush()
    s = "".join(out)
    return re.sub(r"\*\*\*\*", "", s)  # 相邻粗体 run 合并的空标记


def image_suffix(data):
    """Return a stable common image extension, falling back to a safe suffix."""
    signatures = (
        (b"\x89PNG\r\n\x1a\n", ".png"),
        (b"\xff\xd8\xff", ".jpg"),
        (b"GIF87a", ".gif"),
        (b"GIF89a", ".gif"),
        (b"BM", ".bmp"),
        (b"II*\x00", ".tif"),
        (b"MM\x00*", ".tif"),
    )
    for signature, suffix in signatures:
        if data.startswith(signature):
            return suffix
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    probe = data.lstrip()[:256].lower()
    if probe.startswith(b"<svg") or (probe.startswith(b"<?xml") and b"<svg" in probe):
        return ".svg"
    if data.startswith(b"\xd7\xcd\xc6\x9a"):
        return ".emf"
    return ".bin"


def image_filename(data):
    digest = hashlib.sha256(data).hexdigest()
    return f"sha256-{digest}{image_suffix(data)}"


def create_or_reuse_image(directory, filename, data):
    """Create a content-addressed image without ever replacing an existing file."""
    digest = hashlib.sha256(data).hexdigest()
    target = os.path.join(directory, filename)
    fd, temporary = tempfile.mkstemp(prefix=".extract-", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
        try:
            os.link(temporary, target)
            created = True
        except FileExistsError:
            with open(target, "rb") as stream:
                existing_digest = hashlib.sha256(stream.read()).hexdigest()
            if existing_digest != digest:
                raise OSError(f"内容哈希文件已存在但内容不匹配，拒绝覆盖：{target}")
            created = False
        return target, created
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def create_markdown(path, content, *, force=False):
    """Atomically create Markdown; replacement requires explicit --force."""
    directory = os.path.dirname(os.path.abspath(path))
    fd, temporary = tempfile.mkstemp(prefix=".extract-", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as stream:
            stream.write(content)
        if force:
            os.replace(temporary, path)
        else:
            os.link(temporary, path)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def extract(docx_path, out_md, *, force=False):
    if os.path.exists(out_md) and not force:
        print(f"✗ 输出文件已存在，拒绝覆盖：{out_md}（请指定新的 -o 路径）", file=sys.stderr)
        return 1
    try:
        z = zipfile.ZipFile(docx_path)
        doc = ET.fromstring(z.read("word/document.xml"))
    except (OSError, zipfile.BadZipFile, KeyError, ET.ParseError) as e:
        print(f"✗ 不是合法 docx：{e}", file=sys.stderr)
        return 1

    try:
        heading_of = load_styles(z)
        media_of = load_rels(z)
        body = doc.find(f"{W}body")
        if body is None:
            raise ValueError("缺少 document body")
        # Reject content we cannot place faithfully before creating any output.
        for index, block in enumerate(body, 1):
            if block.tag not in {f"{W}p", f"{W}tbl", f"{W}sectPr"}:
                raise ValueError(f"正文第 {index} 块含未支持结构 {block.tag.rsplit('}', 1)[-1]}")
            if block.find(f".//{W}txbxContent") is not None or block.find(f".//{W}pict") is not None:
                raise ValueError(f"正文第 {index} 块含文本框或旧式图片，须先转换该结构")
            if block.tag == f"{W}tbl":
                for cell in block.findall(f"{W}tr/{W}tc"):
                    if any(child.tag not in {f"{W}tcPr", f"{W}p"} for child in cell):
                        raise ValueError(f"正文第 {index} 块的表格含嵌套或未支持单元格结构")
        media_bytes = {}
        for index, blip in enumerate(body.iter(f"{A}blip"), 1):
            rid = blip.get(f"{R}embed")
            source = media_of.get(rid)
            if source is None:
                raise ValueError(f"正文图片第 {index} 处关系无法解析：{rid or blip.get(f'{R}link') or '无关系 ID'}")
            try:
                media_bytes[source] = z.read(source)
            except KeyError as error:
                raise ValueError(f"正文图片第 {index} 处资源缺失：{rid} -> {source}") from error
    except (KeyError, zipfile.BadZipFile, ET.ParseError, ValueError) as e:
        print(f"✗ DOCX 结构或媒体无法完整读取：{e}", file=sys.stderr)
        return 1
    finally:
        z.close()
    out_dir = os.path.dirname(os.path.abspath(out_md)) or "."
    img_dir = os.path.join(out_dir, "images")
    lines, img_n, skipped = [], 0, 0
    images_pending = {}

    def image_link(blip):
        nonlocal img_n
        data = media_bytes[media_of[blip.get(f"{R}embed")]]
        filename = image_filename(data)
        images_pending[filename] = data
        img_n += 1  # occurrences, not distinct assets
        return f"![](images/{filename})"


    for el in body:
        tag = el.tag
        if tag == f"{W}tbl":
            # 表格 → Markdown 表格，保住行列结构（合并单元格按普通格处理）
            rows = []
            row_cell_counts = []
            for tr in el.findall(f"{W}tr"):
                cells = ["<br>".join(para_text(p, table_cell=True, image_link=image_link).strip(" \t\r\n")
                                     for p in tc.findall(f"{W}p"))
                         .replace("|", "\\|") or " "
                         for tc in tr.findall(f"{W}tc")]
                row_cell_counts.append(len(cells))
                rows.append("| " + " | ".join(cells) + " |")
            if rows:
                lines.append(rows[0])
                ncols = row_cell_counts[0]
                lines.append("|" + "---|" * ncols)
                lines.extend(rows[1:])
                lines.append("")
                skipped += 1  # 计数改为"转换的表格数"
            continue
        if tag != f"{W}p":
            continue
        p = el
        text = para_text(p, image_link=image_link).strip(" \t\r\n")
        if not text:
            continue
        ppr = p.find(f"{W}pPr")
        style_el = ppr.find(f"{W}pStyle") if ppr is not None else None
        sid = style_el.get(f"{W}val") if style_el is not None else ""
        lvl = heading_of.get(sid)
        # 列表识别：直接编号(numPr) 或 列表类段落样式（List Bullet/Number/Paragraph/中文"列表"）
        is_list = (ppr is not None and ppr.find(f"{W}numPr") is not None) \
            or bool(re.search(r"list|列表", sid or "", re.I))
        if lvl:
            text_clean = re.sub(r"^\*\*(.*)\*\*$", r"\1", text)  # 标题不需要再加粗
            lines.append("#" * min(lvl + 0, 6) + " " + text_clean)
        elif is_list:
            lines.append("- " + text)
        else:
            lines.append(text)
        lines.append("")

    if img_n != sum(1 for _ in body.iter(f"{A}blip")):
        print("✗ 存在未支持位置的图片，未生成不完整输出；请检查源文档结构", file=sys.stderr)
        return 1
    md = "\n".join(lines).rstrip() + "\n"
    created_images = []
    image_dir_existed = os.path.isdir(img_dir)

    def rollback_created_images():
        for path in created_images:
            try:
                os.unlink(path)
            except FileNotFoundError:
                pass
        if not image_dir_existed:
            try:
                os.rmdir(img_dir)
            except OSError:
                pass

    try:
        if images_pending:
            os.makedirs(img_dir, exist_ok=True)
        for fname, image_data in images_pending.items():
            target, created = create_or_reuse_image(img_dir, fname, image_data)
            if created:
                created_images.append(target)
        create_markdown(out_md, md, force=force)
    except FileExistsError:
        rollback_created_images()
        print(f"✗ 输出文件已存在，拒绝覆盖：{out_md}（请指定新的 -o 路径）", file=sys.stderr)
        return 1
    except OSError as e:
        rollback_created_images()
        print(f"✗ 无法安全创建输出文件：{out_md}：{e}", file=sys.stderr)
        return 1
    print(f"✓ {os.path.basename(docx_path)} → {out_md}")
    print(f"  段落 {sum(1 for l in lines if l and not l.startswith(('#','-','![')))} · "
          f"标题 {sum(1 for l in lines if l.startswith('#'))} · "
          f"列表 {sum(1 for l in lines if l.startswith('- '))} · 图片 {img_n}"
          + (f" · 表格 {skipped}（已转 Markdown 表格）" if skipped else ""))
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("docx")
    ap.add_argument("-o", "--out", help="输出 md 路径（默认同名 .md）")
    ap.add_argument("--force", action="store_true", help="显式替换已有 Markdown 输出；解包图片仍不会被覆盖")
    args = ap.parse_args()
    if not os.path.isfile(args.docx):
        print(f"✗ 文件不存在: {args.docx}", file=sys.stderr)
        sys.exit(1)
    out = args.out or re.sub(r"\.docx$", "", args.docx, flags=re.I) + ".md"
    sys.exit(extract(args.docx, out, force=args.force))


if __name__ == "__main__":
    main()
