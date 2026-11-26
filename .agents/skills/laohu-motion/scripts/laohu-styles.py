#!/usr/bin/env python3
"""Local retrieval and integrity checks for the indexed Motion style references.

The formal index binds each reviewed Chinese view to its original source and
line-located directory evidence. Full card text is read only for explicit
selection; ordinary catalog delivery contains no card bodies.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_ROOT = SCRIPT_DIR.parent
REPO_ROOT = SKILL_ROOT.parents[2]
STYLE_ROOT = SKILL_ROOT / "templates" / "styles"
DEFAULT_INDEX = STYLE_ROOT / "index.json"
RESOURCE_CATALOG = STYLE_ROOT / "catalog.json"
EFFECT_INDEX = STYLE_ROOT / "effects" / "index.json"
MOTION_INDEX = STYLE_ROOT / "motion" / "index.json"
OVERLAY_INDEX = STYLE_ROOT / "motion" / "presentation-patterns.json"
OPENMOTION_CATALOG = SKILL_ROOT / "assets" / "motion-library" / "openmotion" / "catalog.json"
TYPOGRAPHY_ROOT = SKILL_ROOT / "assets" / "typography"
LEGACY_MOTION_CATALOG = SKILL_ROOT / "templates" / "catalog.json"
SHOWREEL_RECIPES = SKILL_ROOT / "templates" / "runtime" / "laohu-showreel" / "references" / "recipes.md"
MOTION_SOURCES = {
    "openmotion": ("OpenMotion", "场景、镜头和动作参考；工程文件与预览在选中后核对。"),
    "atlas": ("视觉效果 Atlas", "按效果家族比较机制和适用条件；条目为知识参考。"),
    "motion-prompt": ("Motion Prompt", "本地 MIT Canvas 动作；接入时核对所选 pack、画幅、编号与依赖素材。"),
    "overlay": ("Overlay 表达能力", "按能力条目核对表达和实际本地 consumer；原组件受来源许可约束。"),
    "showreel-recipe": ("Showreel 动作配方", "原版配方可作为原生页面写法；已登记的旧 adapter 沿 MotionCore 或 Film 使用。"),
    "local-effect": ("旧局部动效与转场", "MotionCore 的绘制、强调和状态效果，以及 Film /1 的转场入口；以所选项的实际条件为准。"),
    "legacy-remotion": ("旧 Remotion 动效与镜头", "保留组件、示范条目和各自的 renderer 与前置条件，用于对应旧工程或作为取法参考。"),
    "effect-library": ("旧动效支撑库", "多文件依赖、源函数和加载顺序；由登记的 renderer 消费。"),
}
LEGACY_MOTION_SOURCES = ("showreel-recipe", "local-effect", "legacy-remotion", "effect-library")
EFFECT_CATEGORIES = {
    "path-drawing": "路径描绘", "target-emphasis": "目标强调", "relationship-mark": "关系标记",
    "staggered-appearance": "错峰显现", "opacity-transition": "淡入淡出", "mask-wipe": "遮罩擦除",
    "semantic-cut": "匹配剪辑", "camera-transition": "镜头推进与甩镜", "continuity-transition": "连续空间与共享元素",
    "material-transition": "材料转场", "impact-transition": "冲击切换", "spatial-transition": "推移转场",
    "coupled-network-explainer": "网络关系图解", "local-effect": "局部组件", "transition": "转场",
    "full-scene": "整段镜头", "source-adapted-full-scene": "来源改编镜头",
}
MOTION_RUNTIME = (SKILL_ROOT / "templates" / "runtime" / "motion-vocabulary").resolve()
HAN_OR_WORD = re.compile(r"[\u3400-\u9fff]+|[A-Za-z0-9]+")
STYLE_ID = re.compile(r"(?<![A-Za-z0-9])((?:original|new):[a-z0-9-]+|[A-Z]+\d+)(?![A-Za-z0-9])")
OPENMOTION_ID = re.compile(r"openmotion-[a-z0-9]+(?:-[a-z0-9]+)*")
RENDER_BACKENDS = {"canvas2d": "2D", "svg-dom": "SVG/DOM", "webgl-shader": "WebGL", "threejs": "Three.js"}

APPEARANCE_FIELDS = ("shape", "colorLighting", "typeLayout", "material", "composition", "infoOrganization")
STYLE_APPEARANCE_SECTIONS = {
    "shape": ("本质 / 不是什么", "辨识信号："),
    "colorLighting": ("配色",),
    "typeLayout": ("字体",),
    "material": ("材质与渲染",),
    "composition": ("镜头语法",),
    "infoOrganization": ("变化空间",),
}



def fail(message: str) -> None:
    raise ValueError(message)


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def canonical_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def load_index(path: Path = DEFAULT_INDEX) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("format") != "laohu.motion.style-library/1" or not isinstance(data.get("entries"), list):
        fail("INVALID_STYLE_INDEX")
    return data


def safe_local_file(relative: str) -> Path:
    base = STYLE_ROOT.resolve()
    candidate = (base / relative).resolve()
    protected_style_root = (SKILL_ROOT / "templates" / "runtime" / "laohu-showreel" / "references" / "styles").resolve()
    if candidate == base or base in candidate.parents:
        pass
    elif candidate.parent == protected_style_root and candidate.suffix.lower() == ".md":
        # The protected 43 original cards are indexed by reference; their canonical
        # bytes live in the vendored Showreel runtime, outside this index directory.
        pass
    else:
        fail("PATH_OUTSIDE_STYLE_LIBRARY")
    if not candidate.is_file():
        fail("MISSING_STYLE_FILE: " + relative)
    return candidate


def read_content(row: dict) -> str:
    path = safe_local_file(row["contentPath"])
    raw = path.read_bytes()
    if sha256(raw) != row.get("localSha256"):
        fail("STYLE_VERSION_CHANGED: " + row["id"])
    return raw.decode("utf-8-sig")


def safe_resource_file(relative: str) -> Path:
    """Resolve formal resource files without allowing paths into research cache."""
    candidate = (STYLE_ROOT / relative).resolve()
    if candidate == STYLE_ROOT.resolve() or STYLE_ROOT.resolve() in candidate.parents:
        pass
    elif candidate.parent == MOTION_RUNTIME and candidate.suffix == ".mjs":
        pass
    else:
        fail("RESOURCE_PATH_OUTSIDE_FORMAL_LIBRARY: " + relative)
    if not candidate.is_file():
        fail("MISSING_RESOURCE_FILE: " + relative)
    return candidate


def evidence_bound_appearance(row: dict, text: str) -> dict:
    """Build appearance fields only from their authored style-guide sections.

    Palette, type, and material details come from their matching sections. Shape,
    composition, and information organization use their named source sections,
    while exact lines already cited by the older visual/camera catalog are
    omitted to avoid sending the same evidence twice in L0.
    """
    lines = text.splitlines()
    table_header_lines: set[int] = set()
    for offset, line in enumerate(lines[:-1]):
        if not line.strip().startswith("|"):
            continue
        separator = lines[offset + 1].strip()
        if not separator.startswith("|"):
            continue
        cells = [cell.strip() for cell in separator.strip("|").split("|")]
        if cells and all(cell and set(cell) <= {"-", ":", " "} for cell in cells):
            table_header_lines.add(offset + 1)
    source_fields = row.get("catalog", {})
    catalog_lines = set()
    for field in source_fields.values():
        if not isinstance(field, dict):
            continue
        for proof in field.get("evidence", []):
            if isinstance(proof, dict) and isinstance(proof.get("lineStart"), int) and isinstance(proof.get("lineEnd"), int):
                catalog_lines.update(range(proof["lineStart"], proof["lineEnd"] + 1))

    sections: dict[str, list[tuple[int, str]]] = {}
    current_section = None
    for number, line in enumerate(lines, 1):
        heading = re.match(r"^(#{1,6})\s+(.+?)\s*$", line)
        if heading and len(heading.group(1)) == 2:
            current_section = heading.group(2).strip()
            sections.setdefault(current_section, [])
        elif current_section is not None:
            sections[current_section].append((number, line))

    def section_lines(prefix: str) -> list[tuple[int, str]]:
        return next((body for title, body in sections.items() if title.startswith(prefix)), [])

    def useful(line: str) -> bool:
        quote = line.strip()
        if not quote or re.match(r"^#{1,6}\s+", quote) or quote.startswith("```"):
            return False
        if set(quote) <= {"|", "-", ":", " "}:
            return False
        if quote.startswith("|"):
            header_cells = {
                "信号", "长什么样", "来源正文中的可见/可操作描述", "适配主题", "适合的主题",
                "镜头运动", "镜头变化", "运镜方式", "表达什么", "表达作用", "表达含义",
                "适合哪类内容", "可用于", "适用场景", "区域", "位置", "内容", "用途", "数值",
                "角色", "色值", "颜色", "字体", "尺寸", "尺寸（1080p）",
                "Signal", "Appearance", "Description", "Use", "Role", "Color", "Value", "Font", "Size",
            }
            cells = [cell.strip() for cell in quote.strip("|").split("|")]
            if cells and all(cell in header_cells for cell in cells):
                return False
        if quote.startswith("|") and any(header in quote for header in ("长什么样", "镜头运动", "表达什么", "适合哪类内容")):
            return False
        return True

    def proofs(candidates: list[tuple[int, str]], *, avoid_catalog: bool = False, limit: int | None = None) -> list[dict]:
        selected = []
        selected_lines = set()
        for number, line in candidates:
            quote = line.strip()
            if (not useful(line) or number in table_header_lines or number in selected_lines or number in appearance_lines
                    or (avoid_catalog and number in catalog_lines)):
                continue
            selected_lines.add(number)
            appearance_lines.add(number)
            selected.append({"sourcePath": row["contentPath"], "lineStart": number, "lineEnd": number, "quote": quote})
            if limit is not None and len(selected) >= limit:
                break
        return selected

    result = {}
    appearance_lines: set[int] = set()
    summary_omit_lines: set[int] = set()
    lighting_terms = re.compile(r"光源|光线|光照|照明|高光|反光|曝光|补光|受光|阴影|(?:^|[；，\s])光[：从]")
    lighting_implementation_terms = re.compile(
        r"射线|求交|float32|着色器|shader|函数|公式|坐标|矩阵|算法|像素|数据纹理|GTAO|ffmpeg|"
        r"ctx\.filter|透视摄影机|镜头|焦平面|焦点|扫描|高斯模糊|实现|后期处理",
        re.I,
    )
    material_terms = re.compile(r"roughness|metalness|sheen|Mesh(?:Standard|Physical)Material|粗糙度|次表面散射|材质|材料|纸张?|纸纤维|纸纹|底材|油墨|墨线|墨色|颜料|笔触|画布|纤维|涂层|涂料|漆面|金属|玻璃|木材|塑料|陶瓷|布料|织物|皮革|网点|印刷|材质贴图|纹理|表面反射|折射", re.I)
    material_visual_terms = re.compile(
        r"roughness|metalness|sheen|Mesh(?:Standard|Physical)Material|粗糙度|次表面散射|材质|"
        r"纸(?:张|面|纹|纤维|质|的厚度)|底材|油墨|墨线|墨色|颜料|笔触|画布|纤维|涂层|涂料|漆面|"
        r"金属|玻璃|木材|塑料|陶瓷|布料|织物|皮革|网点|印刷|材质贴图|纹理|表面反射|折射|"
        r"阴影|高光|光源|光照|颗粒|噪声|圆角|描边|边框|厚度|光晕|磨砂|亚克力|"
        r"发光|反光|光斑|切边|浮雕|压纹|Path2D|投影.{0,16}(?:模糊|偏移|阴影|影子)|"
        r"(?:模糊|偏移|阴影|影子).{0,16}投影",
        re.I,
    )
    material_specific_terms = re.compile(
        r"roughness|metalness|sheen|Mesh(?:Standard|Physical)Material|粗糙度|次表面散射|材质|"
        r"纸(?:张|纹|纤维|质)|底材|油墨|墨线|墨色|颜料|笔触|纤维|涂层|涂料|漆面|金属|玻璃|"
        r"木材|塑料|陶瓷|布料|织物|皮革|材质贴图|纹理|颗粒|噪声|纤维|印刷|表面反射|折射",
        re.I,
    )
    material_context_terms = re.compile(r"地图|州界|图表|数据卡|数字|来源标签|字体|字幕|标题|标签|文字|坐标|版式|位置|镜头|摄像机|影像署名")
    palette_example_note = re.compile(
        r"(?:下面的色值是示例|色值.{0,24}(?:是示例|为示例|看思路)|示例.{0,18}(?:只看思路|不要原样照抄|不照抄))",
        re.I,
    )
    font_terms = re.compile(
        r"字体|字重|字号|字距|字间距|等宽|衬线|无衬线|手写体|展示字|字体职责|字体角色|font|"
        r"Noto|Inter|Bangers|Cormorant|Manrope|Geist|Oswald|Barlow|IBM Plex|Source Serif|"
        r"Patrick Hand|Caveat|Fraunces|思源|霞鹜|站酷|OFL",
        re.I,
    )
    type_layout_terms = re.compile(r"单行|不换行|换行|左对齐|右对齐|居中|基线|行宽|字距|行距|字幕位置|标题位置")
    visible_form_terms = re.compile(r"轮廓|形态|形状|剪影|形变|分层|层叠|窗口|色块|平面|透视|几何|边缘|纸片|曲线|格子|分格|网格|粒子|按钮|控件|面板|框架|边框|路径|立体|体积|孔洞|切口|剪口|线迹|笔触|图案|纹样|造型|物件|重复结构|颗粒|厚度")
    non_shape_signal_terms = re.compile(r"BPM|节拍|节奏|切镜|转场|每次切|跨切点|时长|停留|阅读时间|字幕计时|计时|呈现顺序|信息顺序|事实的呈现|来源标签|证据上屏|静音观看|版式|标题|字幕|文字|字形|字块|字卡|字体|排版|图形|图像|影像|图表|数据|数字|镜头|构图|色|颜色|光|材质|表面|投影|阴影|信息|来源|证据")
    prefixes = {
        "shape": "来源列出的形态信号（按主题择用）：",
        "composition": "来源镜头语法（按画面择用）：",
        "infoOrganization": "来源给出的结构组织方案（按内容择用）：",
    }
    for dimension in APPEARANCE_FIELDS:
        matches: list[dict] = []
        summary_prefix = ""
        if dimension == "shape":
            essence_lines = section_lines("本质 / 不是什么")
            essence = [item for item in essence_lines if re.match(r"\s*[-*]\s*本质[：:]", item[1])]
            matches = proofs(essence, avoid_catalog=True, limit=1)
            if not matches:
                numbered_visual_essence = [
                    item for item in essence_lines
                    if re.match(r"\s*\d+[.)]\s+", item[1]) and visible_form_terms.search(item[1])
                ]
                matches = proofs(numbered_visual_essence, avoid_catalog=True, limit=2)
            signal_rows = [item for item in section_lines("辨识信号：") if item[1].strip().startswith("|")]
            if len(matches) < 2:
                visible_signal_rows = [
                    item for item in signal_rows
                    if visible_form_terms.search(item[1]) and not non_shape_signal_terms.search(item[1])
                ]
                matches.extend(proofs(visible_signal_rows, avoid_catalog=True, limit=2 - len(matches)))
        elif dimension in {"colorLighting", "typeLayout", "material"}:
            section = {"colorLighting": "配色", "typeLayout": "字体", "material": "材质与渲染"}[dimension]
            candidates = section_lines(section)
            if dimension == "colorLighting":
                example_notes = [item for item in candidates if palette_example_note.search(item[1])]
                if example_notes:
                    matches = proofs(example_notes, avoid_catalog=True)
                    summary_prefix = "来源标注为示例配色："
                    summary_omit_lines.update(item[0] for item in example_notes)
                candidates = [item for item in candidates if item not in example_notes]
                candidates = [
                    (number, re.sub(r"^\s*[-*]?\s*示例[（(][^：:]*[）)]\s*[：:]", "来源示例配色：", line))
                    for number, line in candidates
                ]
                material_lighting = [item for item in section_lines("材质与渲染")
                                     if (lighting_terms.search(item[1]) and not material_terms.search(item[1])
                                         and not lighting_implementation_terms.search(item[1]))]
                candidates = candidates + material_lighting
                matches.extend(proofs(candidates, avoid_catalog=True))
            elif dimension == "material":
                material_candidates = [
                    item for item in candidates
                    if material_visual_terms.search(item[1])
                    and (not item[1].strip().startswith("|") or material_specific_terms.search(item[1]))
                    and (not material_context_terms.search(item[1]) or material_specific_terms.search(item[1]))
                    and not lighting_implementation_terms.search(item[1])
                ]
                matches = proofs(material_candidates, avoid_catalog=True, limit=2)
            else:
                type_candidates = [
                    item for item in candidates
                    if item[1].strip().startswith("|") or font_terms.search(item[1]) or type_layout_terms.search(item[1])
                ]
                matches = proofs(type_candidates, avoid_catalog=True)
        elif dimension == "composition":
            camera_rows = [item for item in section_lines("镜头语法") if item[1].strip().startswith("|")]
            matches = proofs(camera_rows, avoid_catalog=True, limit=2)
        elif dimension == "infoOrganization":
            structure_lines = [item for item in section_lines("变化空间") if re.search(r"(?:^|\s)[-*]?\s*结构[：:]", item[1])]
            matches = proofs(structure_lines, avoid_catalog=True, limit=1)
        summary_parts = [item["quote"] for item in matches if item["lineStart"] not in summary_omit_lines]
        summary = "；".join(summary_parts) if summary_parts else None
        if summary and summary_prefix:
            summary = summary_prefix + summary
        if summary and dimension in prefixes:
            summary = prefixes[dimension] + summary
        result[dimension] = {"summary": summary, "evidence": matches}
    return result


PAGE_FORMAT = "laohu.motion.style-library-fulltext-page/1"
REVIEW_FORMAT = "laohu.motion.style-library-fulltext-review/1"
CURSOR_FORMAT = "laohu.motion.style-library-fulltext-cursor/1"
DEFAULT_PAGE_CHARACTERS = 12000
MAX_PAGE_CHARACTERS = 24000
CATALOG_FIELDS = ("visual", "actions", "cameraSpaceChange", "expressionEmotion", "fit", "limitations", "fusion")


def verified_style_text(row: dict) -> str:
    style_id = row["id"]
    status = row.get("translationStatus")
    source_reused = status == "reviewed-zh-source"
    if status not in {"translated-reviewed", "reviewed-zh-source"}:
        fail("STYLE_CATALOG_PENDING_TRANSLATION_REVIEW: " + style_id)
    if source_reused:
        if row.get("sourceSet") != "original" or row.get("contentPath") != row.get("sourcePath") or not re.fullmatch(r"\.\./runtime/laohu-showreel/references/styles/[a-z0-9-]+\.md", str(row.get("contentPath", ""))):
            fail("STYLE_CATALOG_SOURCE_REUSE_NOT_PROTECTED_ORIGINAL: 中文原卡复用只能指向受保护的 original 正文：" + style_id)
    elif not str(row.get("contentPath", "")).startswith("zh-CN/"):
        fail("STYLE_CATALOG_CONTENT_NOT_CHINESE_VIEW: 新译文必须使用 zh-CN 中文视图路径：" + style_id)
    hash_fields = ("sourceSha256", "translationSourceSha256", "localSha256", "translationSha256")
    if any(not re.fullmatch(r"[a-f0-9]{64}", str(row.get(field, ""))) for field in hash_fields) or not row.get("translationSourcePath"):
        fail("STYLE_SOURCE_VIEW_HASH_BINDING_INCOMPLETE: 正式索引的来源正文与中文内容哈希绑定不完整：" + style_id)
    if row.get("translationSha256") != row.get("localSha256"):
        fail("STYLE_TRANSLATION_MANIFEST_HASH_MISMATCH: 中文正文哈希与正式索引不一致：" + style_id)
    if not source_reused and row["contentPath"] != f"zh-CN/{Path(row['translationSourcePath']).stem}.md":
        fail("STYLE_CATALOG_CONTENT_PATH_NOT_CANONICAL: 中文译文路径与原卡名称不对应：" + style_id)
    text = read_content(row)
    source_path = (REPO_ROOT / row["translationSourcePath"]).resolve()
    if REPO_ROOT.resolve() not in source_path.parents or not source_path.is_file() or sha256(source_path.read_bytes()) != row["translationSourceSha256"]:
        fail("STYLE_TRANSLATION_SOURCE_STALE: 本地原文文件或哈希与正式索引不一致：" + style_id)
    if source_reused and source_path != safe_local_file(row["contentPath"]).resolve():
        fail("STYLE_CATALOG_SOURCE_REUSE_BYTES_NOT_CANONICAL: 复用正文必须与受保护原卡为同一文件：" + style_id)
    if row.get("sourceSet") == "original" and row["sourceSha256"] != row["translationSourceSha256"]:
        fail("STYLE_PROTECTED_ORIGINAL_SOURCE_HASH_MISMATCH: 受保护原卡来源哈希与本地原文哈希不一致：" + style_id)
    return text


def rich_catalog(index: dict, selected_ids: set[str] | None = None) -> dict:
    """Return only reviewed, evidence-bound Chinese directory fields, never card bodies."""
    rows = index["entries"]
    declared_count = index.get("coverage", {}).get("styleCount")
    if not isinstance(declared_count, int) or len(rows) != declared_count or len({row.get("id") for row in rows}) != len(rows):
        fail("STYLE_CATALOG_INDEX_COVERAGE_MISMATCH")
    counts = {name: sum(row.get("sourceSet") == name for row in rows) for name in {row.get("sourceSet") for row in rows}}
    declared_counts = index.get("coverage", {}).get("sourceSet")
    if not isinstance(declared_counts, dict) or counts != declared_counts or sum(counts.values()) != declared_count:
        fail("STYLE_CATALOG_SOURCE_SET_COUNTS_INVALID: " + json.dumps(counts, ensure_ascii=False))
    protected_count = index.get("source", {}).get("protectedRuntimeStyleCount")
    if "original" in counts and counts["original"] != protected_count:
        fail("STYLE_CATALOG_PROTECTED_SOURCE_COUNT_INVALID: " + json.dumps(counts, ensure_ascii=False))
    result = []
    pending = []
    for row in rows:
        style_id = row.get("id", "(missing id)")
        if selected_ids is not None and style_id not in selected_ids:
            continue
        status = row.get("translationStatus")
        if status not in {"translated-reviewed", "reviewed-zh-source"}:
            pending.append(style_id)
            continue
        text = verified_style_text(row)
        lines = text.splitlines()
        catalog = row.get("catalog")
        if not isinstance(catalog, dict) or set(catalog) != set(CATALOG_FIELDS):
            fail("STYLE_CATALOG_FIELDS_INVALID: " + style_id)
        checked = {}
        for field in CATALOG_FIELDS:
            item = catalog[field]
            if not isinstance(item, dict) or set(item) != {"summary", "evidence"}:
                fail(f"STYLE_CATALOG_ITEM_INVALID: {style_id}:{field}")
            summary, evidence = item["summary"], item["evidence"]
            if summary is not None and (not isinstance(summary, str) or not summary.strip()):
                fail(f"STYLE_CATALOG_SUMMARY_INVALID: {style_id}:{field}")
            if not isinstance(evidence, list) or (summary is not None and not evidence) or (summary is None and evidence):
                fail(f"STYLE_CATALOG_EVIDENCE_REQUIRED: {style_id}:{field}")
            checked_evidence = []
            for proof in evidence:
                if not isinstance(proof, dict) or set(proof) != {"sourcePath", "lineStart", "lineEnd", "quote"}:
                    fail(f"STYLE_CATALOG_EVIDENCE_INVALID: {style_id}:{field}")
                start, end, quote = proof["lineStart"], proof["lineEnd"], proof["quote"]
                if proof["sourcePath"] != row["contentPath"] or not isinstance(start, int) or not isinstance(end, int) or start < 1 or end < start or end > len(lines) or not isinstance(quote, str) or not quote.strip():
                    fail(f"STYLE_CATALOG_EVIDENCE_RANGE_INVALID: {style_id}:{field}")
                excerpt = "\n".join(lines[start - 1:end])
                if quote not in excerpt:
                    fail(f"STYLE_CATALOG_EVIDENCE_QUOTE_MISMATCH: {style_id}:{field}")
                checked_evidence.append({
                    "sourcePath": proof["sourcePath"],
                    "lineStart": proof["lineStart"],
                    "lineEnd": proof["lineEnd"],
                    "quote": proof["quote"],
                })
            checked[field] = {"summary": summary, "evidence": checked_evidence}
        appearance = evidence_bound_appearance(row, text)
        result.append({"id": style_id, "sourceSet": row["sourceSet"], "name": row["name"], "catalog": checked,
                       "appearance": appearance,
                       "fullTextEntry": f"node .agents/skills/laohu-motion/scripts/laohu-showreel.mjs input-candidate <project> --id {style_id}"})
    if pending:
        fail("STYLE_CATALOG_PENDING_TRANSLATION_REVIEW: 以下正式卡尚未完成核译，不能进入目录：" + ", ".join(pending))
    return {
        "format": "laohu.motion.style-rich-catalog/1",
        "entryCount": len(result),
        "sourceSets": counts,
        "contentPolicy": "目录摘要来自已核中文原卡或译文视图，并附精简行号证据；正式索引保留完整源绑定，只有明确选择候选后才输出全文。",
        "entries": result,
    }


def style_library_fingerprint(index: dict, index_path: Path) -> dict:
    rows = index["entries"]
    ids = [row["id"] for row in rows]
    declared_content = [[row["id"], row["contentPath"], row.get("localSha256")] for row in rows]
    return {
        "format": "laohu.motion.style-library-fingerprint/1",
        "sourceIndexSha256": index.get("source", {}).get("sourceIndexSha256"),
        "indexSha256": sha256(index_path.read_bytes()),
        "contentManifestSha256": sha256(canonical_json(declared_content).encode("utf-8")),
        "entryIdsSha256": sha256(canonical_json(ids).encode("utf-8")),
        "entryCount": len(rows),
    }


def encode_cursor(state: dict) -> str:
    raw = canonical_json(state).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def decode_cursor(value: str) -> dict:
    try:
        padded = value + ("=" * (-len(value) % 4))
        state = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
        fail("INVALID_STYLE_FULLTEXT_CURSOR: " + str(error))
    if not isinstance(state, dict) or state.get("format") != CURSOR_FORMAT:
        fail("INVALID_STYLE_FULLTEXT_CURSOR_FORMAT")
    return state


def _line_at(text: str, offset: int) -> int:
    return text.count("\n", 0, max(0, offset)) + 1


def _page_state(index: dict, index_path: Path, scope: str, query: str | None, page_characters: int, cursor: str | None) -> tuple[dict, list[dict]]:
    if page_characters < 1 or page_characters > MAX_PAGE_CHARACTERS:
        fail(f"--page-characters must be from 1 to {MAX_PAGE_CHARACTERS}")
    fingerprint = style_library_fingerprint(index, index_path)
    all_rows = index["entries"]
    if scope == "library":
        rows = all_rows
    else:
        rows = [choose(index, query or "")]

    if cursor:
        state = decode_cursor(cursor)
        if state.get("fingerprint") != fingerprint:
            fail("STYLE_LIBRARY_CHANGED_DURING_FULLTEXT_REVIEW: restart from the first page")
        if state.get("scope") != scope or state.get("query") != query:
            fail("STYLE_FULLTEXT_CURSOR_SCOPE_MISMATCH")
        if state.get("pageCharacters") != page_characters:
            fail("STYLE_FULLTEXT_CURSOR_PAGE_SIZE_MISMATCH")
        if not isinstance(state.get("rowIndex"), int) or not 0 <= state["rowIndex"] <= len(rows):
            fail("INVALID_STYLE_FULLTEXT_CURSOR_ROW")
        if not isinstance(state.get("charOffset"), int) or state["charOffset"] < 0:
            fail("INVALID_STYLE_FULLTEXT_CURSOR_OFFSET")
        if not isinstance(state.get("pageNumber"), int) or state["pageNumber"] < 1:
            fail("INVALID_STYLE_FULLTEXT_CURSOR_PAGE_NUMBER")
        if not isinstance(state.get("pageSequenceSha256"), str) or not re.fullmatch(r"[a-f0-9]{64}", state["pageSequenceSha256"]):
            fail("INVALID_STYLE_FULLTEXT_CURSOR_SEQUENCE_HASH")
        if not isinstance(state.get("missingIds"), list) or any(not isinstance(item, str) for item in state["missingIds"]):
            fail("INVALID_STYLE_FULLTEXT_CURSOR_MISSING_IDS")
        if state["rowIndex"] == len(rows):
            fail("STYLE_FULLTEXT_CURSOR_ALREADY_COMPLETE")
    else:
        state = {
            "format": CURSOR_FORMAT,
            "fingerprint": fingerprint,
            "scope": scope,
            "query": query,
            "pageCharacters": page_characters,
            "rowIndex": 0,
            "charOffset": 0,
            "pageNumber": 1,
            "pageSequenceSha256": "0" * 64,
            "missingIds": [],
        }
    return state, rows


def fulltext_page(index: dict, index_path: Path, *, scope: str = "library", query: str | None = None,
                  page_characters: int = DEFAULT_PAGE_CHARACTERS, cursor: str | None = None,
                  include_text: bool = True) -> dict:
    state, rows = _page_state(index, index_path, scope, query, page_characters, cursor)
    fingerprint = state["fingerprint"]
    row_index = state["rowIndex"]
    char_offset = state["charOffset"]
    page_number = state["pageNumber"]
    cumulative_missing = list(state["missingIds"])
    page_missing = []
    ids = []
    segments = []
    ranges = []
    used = 0

    while row_index < len(rows) and (used < page_characters or not ids):
        row = rows[row_index]
        row_id = row["id"]
        ids.append(row_id)
        try:
            content = read_content(row)
        except (ValueError, OSError, KeyError, UnicodeDecodeError) as error:
            page_missing.append(row_id)
            if not any(item["id"] == row_id for item in ranges):
                ranges.append({"id": row_id, "charStart": 0, "charEnd": 0, "totalCharacters": None,
                               "localSha256": row.get("localSha256"), "chunkSha256": None, "missingReason": str(error)})
            row_index += 1
            char_offset = 0
            continue

        total_characters = len(content)
        remaining = max(0, page_characters - used)
        end_offset = min(total_characters, char_offset + remaining)
        chunk = content[char_offset:end_offset]
        if total_characters == 0:
            end_offset = 0
        range_row = {
            "id": row_id,
            "path": row["contentPath"],
            "charStart": char_offset,
            "charEnd": end_offset,
            "totalCharacters": total_characters,
            "lineStart": _line_at(content, char_offset),
            "lineEnd": _line_at(content, max(char_offset, end_offset - 1)),
            "localSha256": row["localSha256"],
            "chunkSha256": sha256(chunk.encode("utf-8")),
            "completeEntry": end_offset == total_characters,
        }
        ranges.append(range_row)
        segment = dict(range_row)
        if include_text:
            segment["text"] = chunk
        segments.append(segment)
        used += len(chunk)
        if end_offset == total_characters:
            row_index += 1
            char_offset = 0
        else:
            char_offset = end_offset
            break

    cumulative_missing.extend(item for item in page_missing if item not in cumulative_missing)
    first_id = ids[0] if ids else None
    last_id = ids[-1] if ids else None
    id_range = {"first": first_id, "last": last_id}
    page_receipt = {
        "pageNumber": page_number,
        "idRange": id_range,
        "ids": ids,
        "textRanges": ranges,
        "missingIds": page_missing,
    }
    page_sequence = sha256((state["pageSequenceSha256"] + "\n" + canonical_json(page_receipt)).encode("utf-8"))
    has_next = row_index < len(rows)
    next_cursor = None
    if has_next:
        next_state = {
            **state,
            "rowIndex": row_index,
            "charOffset": char_offset,
            "pageNumber": page_number + 1,
            "pageSequenceSha256": page_sequence,
            "missingIds": cumulative_missing,
        }
        next_cursor = encode_cursor(next_state)

    complete = not has_next and not cumulative_missing
    review_receipt = None
    if not has_next and scope == "library":
        review_receipt = {
            "format": REVIEW_FORMAT,
            "scope": "full-library",
            "libraryFingerprint": fingerprint,
            "pageCharacters": page_characters,
            "pageCount": page_number,
            "pageSequenceSha256": page_sequence,
            "missingIds": cumulative_missing,
            "complete": complete,
        }

    result = {
        "format": PAGE_FORMAT,
        "libraryFingerprint": fingerprint,
        "scope": {"kind": scope, **({"query": query} if query is not None else {})},
        "page": {
            "number": page_number,
            "idRange": id_range,
            "ids": ids,
            "characterCount": used,
            "textRanges": ranges,
            "segments": segments,
            "missingIds": page_missing,
        },
        "nextCursor": next_cursor,
        "missingIds": cumulative_missing,
        "complete": complete,
    }
    if review_receipt is not None:
        result["reviewReceipt"] = review_receipt
    return result


def full_library_review_receipt(index: dict, index_path: Path, page_characters: int) -> dict:
    """Internal validator helper; public receipt delivery remains the final cursor page."""
    cursor = None
    result = None
    while result is None or result["nextCursor"] is not None:
        result = fulltext_page(index, index_path, page_characters=page_characters, cursor=cursor, include_text=False)
        cursor = result["nextCursor"]
    return result["reviewReceipt"]


def choose(index: dict, query: str, kind: str | None = None) -> dict:
    rows = [row for row in index["entries"] if kind is None or row.get("kind", "prompt") == kind]
    q = query.strip()
    exact = [row for row in rows if row["id"].casefold() == q.casefold()
             or row.get("contentPath") == q or row["name"].casefold() == q.casefold()]
    if not exact:
        exact = [row for row in rows if q.casefold() in row["name"].casefold()]
    if not exact:
        fail("STYLE_NOT_FOUND: " + q)
    if len(exact) != 1:
        fail("AMBIGUOUS_STYLE: " + json.dumps(
            [{key: row[key] for key in ("id", "name", "contentPath")} for row in exact],
            ensure_ascii=False))
    return exact[0]


def query_terms(query: str) -> list[str]:
    return [part.casefold() for part in HAN_OR_WORD.findall(query.strip()) if part]


def search(index: dict, query: str, category: str | None = None, limit: int = 12) -> list[dict]:
    terms = query_terms(query)
    if not terms:
        fail("EMPTY_STYLE_QUERY")
    hits = []
    for row in index["entries"]:
        if row.get("selectionEligible") is False:
            continue
        if category and category.casefold() not in row.get("category", "").casefold():
            continue
        metadata = row.get("metadata") or {}
        name_and_meta = " ".join([row["id"], row["name"], row.get("category", ""), *metadata.values()]).casefold()
        cached_terms = row.get("searchTerms", [])
        haystack = "\n".join([name_and_meta, " ".join(cached_terms).casefold()])
        score = sum(6 if term in name_and_meta else 1 if term in haystack else 0 for term in terms)
        if score:
            hits.append({key: value for key, value in row.items() if key not in ("searchTerms", "sourcePath", "sourceSha256")}
                         | {"lexicalScore": score})
    return sorted(hits, key=lambda row: (-row["lexicalScore"], row["contentPath"]))[:max(0, limit)]


def selection_queries(text: str, include_names: bool) -> list[str]:
    queries = list(dict.fromkeys(match.group(1) for match in STYLE_ID.finditer(text)))
    if include_names:
        for line in text.splitlines():
            line = line.strip().lstrip("-*0123456789.、) ").strip()
            if line and not line.startswith("#") and not STYLE_ID.search(line):
                queries.append(line)
    return list(dict.fromkeys(queries))


def overview_entry(row: dict) -> dict:
    route = row.get("route") or {}
    if route.get("kind") == "remotion-canvas-function" and route.get("callable") is True:
        capability = "callable-source-function"
    elif route.get("kind") == "source-placeholder":
        capability = "empty-source-placeholder-excluded-from-selection"
    elif route.get("kind") == "reference-style":
        capability = "non-callable-style-reference"
    else:
        capability = "full-prompt-reference"
    command_prefix = "node scripts/templates.mjs styles compatibility" if row.get("_compatibilityIndex") else "node scripts/templates.mjs styles"
    return {
        "id": row["id"],
        "name": row["name"],
        "category": row["category"],
        "kind": row.get("kind", "prompt"),
        "capability": capability,
        "selectionEligible": row.get("selectionEligible", True),
        "preview": {"path": row.get("previewPath"), "sourceSha256": row.get("previewSourceSha256"), "localSha256": row.get("previewLocalSha256")} if row.get("previewPath") else None,
        "resourceSummary": row.get("catalog"),
        "source": {"path": row.get("sourcePath"), "sha256": row.get("sourceSha256"), "contentPath": row.get("contentPath"), "localSha256": row.get("localSha256"), "lines": row.get("lines")},
        "licenseId": row.get("licenseId"),
        "dependencies": row.get("dependencies", []),
        "route": route,
        "nextStep": {
            "describe": f"{command_prefix} describe --query {row['id']}",
            "fulltext": f"{command_prefix} fulltext --query {row['id']}",
            "consumerNote": "Style references inform the native Showreel design and shot specification; they do not expose a renderer. Legacy callable functions appear only through the explicit compatibility index.",
        },
    }


def overview(index: dict, category: str | None = None) -> dict:
    rows = [row for row in index["entries"] if category is None or category.casefold() in row.get("category", "").casefold()]
    groups = {}
    for row in rows:
        groups.setdefault(row["category"], []).append(row)
    categories = []
    for name, members in sorted(groups.items()):
        categories.append({
            "category": name,
            "total": len(members),
            "withPreview": sum(bool(row.get("previewPath")) for row in members),
            "withoutPreview": sum(not bool(row.get("previewPath")) for row in members),
            "callableSourceFunctions": sum(row.get("route", {}).get("kind") == "remotion-canvas-function" and row.get("route", {}).get("callable") is True for row in members),
            "fullPromptReferences": sum(row.get("route", {}).get("kind") == "complete-production-prompt" for row in members),
            "emptySourcePlaceholders": sum(row.get("route", {}).get("kind") == "source-placeholder" for row in members),
            "entries": [overview_entry(row) for row in members],
        })
    return {
        "format": "laohu.motion.style-resource-overview/1",
        "source": index.get("source"),
        "contentPolicy": index.get("contentPolicy"),
        "licenses": index.get("licenses", []),
        "coverage": {
            "total": len(rows),
            "withPreview": sum(bool(row.get("previewPath")) for row in rows),
            "withoutPreview": sum(not bool(row.get("previewPath")) for row in rows),
            "categories": {item["category"]: item["total"] for item in categories},
            "callableSourceFunctions": sum(row.get("route", {}).get("kind") == "remotion-canvas-function" and row.get("route", {}).get("callable") is True for row in rows),
            "fullPromptReferences": sum(row.get("route", {}).get("kind") == "complete-production-prompt" for row in rows),
            "emptySourcePlaceholders": sum(row.get("route", {}).get("kind") == "source-placeholder" for row in rows),
        },
        "retrievalNote": "导览摘要必须来自已核译目录及可定位证据；未完成核译的字段不作推断。",
        "categories": categories,
    }


def _read_json_file(path: Path, label: str) -> dict:
    if not path.is_file():
        fail(f"MISSING_{label.upper().replace('-', '_')}: {path.relative_to(SKILL_ROOT)}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        fail(f"INVALID_{label.upper().replace('-', '_')}")
    return data


def _appearance_values(appearance: dict) -> dict:
    return {key: value for key, value in appearance.items() if key in APPEARANCE_FIELDS}


def style_preview_path(row: dict) -> str | None:
    if row.get("previewPath"):
        preview = safe_local_file(row["previewPath"])
        return preview.relative_to(REPO_ROOT).as_posix()
    return None


def _style_resource_rows(index: dict) -> tuple[list[dict], dict]:
    rich = rich_catalog(index)
    rich_by_id = {row["id"]: row for row in rich["entries"]}
    rows = []
    for row in index["entries"]:
        rich_row = rich_by_id[row["id"]]
        evidence = rich_row["catalog"]
        appearance = _appearance_values(rich_row["appearance"])
        visual_values = [item["summary"] for item in appearance.values() if item.get("summary")]
        rows.append({
            "id": row["id"], "source": "style-library", "sourceType": "style",
            "sourceSet": row["sourceSet"], "name": row["name"], "aliases": [row["id"], row["metadata"].get("look", "")],
            "category": row["metadata"].get("categoryLabel"), "renderBackend": row["metadata"].get("renderBackend"),
            "previewPath": style_preview_path(row),
            "summary": "；".join(dict.fromkeys(visual_values)) or row["metadata"].get("look", row["name"]),
            "appearance": appearance, "catalog": evidence,
            "useConditions": evidence["fit"].get("summary"), "limitations": evidence["limitations"].get("summary"),
            "combinations": evidence["fusion"].get("summary"),
            "producerMarkdown": row["contentPath"], "detailLines": None,
            "availability": "reference-style", "canExecute": False,
            "sourceUrl": None, "licenseId": row.get("licenseId"),
            "searchTerms": row.get("searchTerms", []),
        })
    return rows, rich


def build_resource_catalog(style_index: dict, style_index_path: Path) -> dict:
    styles, rich = _style_resource_rows(style_index)
    atlas = _read_json_file(EFFECT_INDEX, "atlas-effect-index")
    motion = _read_json_file(MOTION_INDEX, "motion-prompt-index")
    overlay = _read_json_file(OVERLAY_INDEX, "presentation-pattern-index")
    expected = {"atlas": 504, "motion": 240, "overlay": 20}
    for label, data in (("atlas", atlas), ("motion", motion), ("overlay", overlay)):
        if not isinstance(data.get("entries"), list) or len(data["entries"]) != expected[label]:
            fail(f"RESOURCE_CATALOG_{label.upper()}_COVERAGE_INVALID")
    atlas_families = atlas.get("families")
    atlas_entries = atlas["entries"]
    atlas_production_note = atlas.get("atlasProductionNoteZh")
    if not isinstance(atlas_families, list) or not atlas_families:
        fail("ATLAS_FAMILY_NAVIGATION_MISSING")
    if not isinstance(atlas_production_note, str) or not atlas_production_note.strip():
        fail("ATLAS_PRODUCTION_NOTE_MISSING")
    normalized_families = []
    for row in atlas_families:
        family = dict(row)
        family["key"] = family.get("key") or str(family.get("id", "")).removeprefix("atlas-family:")
        family["nameZh"] = family.get("nameZh") or family.get("name")
        family["summaryZh"] = family.get("summaryZh") or family.get("visualContributionZh") or family.get("principleZh")
        family["visualContributionZh"] = family.get("visualContributionZh") or family.get("summaryZh") or family.get("principleZh")
        family["principalDifferencesZh"] = (family.get("principalDifferencesZh")
                                               or family.get("alternativesZh") or family.get("distinctionZh"))
        family["useConditionsZh"] = family.get("useConditionsZh") or family.get("conditionsZh") or family.get("useInAnimationZh")
        normalized_families.append(family)
    atlas_families = normalized_families
    family_ids = [row.get("id") for row in atlas_families]
    resource_ids = [row.get("id") for row in atlas_entries]
    if len(family_ids) != len(set(family_ids)) or any(not str(item).startswith("atlas-family:") for item in family_ids):
        fail("ATLAS_FAMILY_STABLE_IDS_INVALID")
    if len(resource_ids) != len(set(resource_ids)) or any(not str(item).startswith("atlas:") for item in resource_ids):
        fail("ATLAS_RESOURCE_STABLE_IDS_INVALID")
    if set(family_ids) & set(resource_ids):
        fail("ATLAS_FAMILY_RESOURCE_ID_COLLISION")
    declared_slugs = {row.get("slug") for row in atlas_entries}
    if len(declared_slugs) != expected["atlas"] or any(not isinstance(slug, str) or not slug for slug in declared_slugs):
        fail("ATLAS_SLUG_COVERAGE_INVALID")
    mapped_ids = set()
    for family in atlas_families:
        members = family.get("memberIds")
        if (not isinstance(members, list) or len(members) != family.get("memberCount")
                or len(members) != len(set(members)) or not isinstance(family.get("nameZh"), str)
                or not family["nameZh"].strip() or not isinstance(family.get("summaryZh"), str)
                or not family["summaryZh"].strip() or not isinstance(family.get("principalDifferencesZh"), str)
                or not family["principalDifferencesZh"].strip() or not isinstance(family.get("useConditionsZh"), str)
                or not family["useConditionsZh"].strip()):
            fail("ATLAS_FAMILY_NAVIGATION_FIELDS_INVALID: " + str(family.get("id")))
        mapped_ids.update(members)
    if mapped_ids != set(resource_ids):
        fail("ATLAS_FAMILY_NAVIGATION_MEMBER_COVERAGE_INVALID")
    for row in atlas_entries:
        member_families = row.get("familyIds") or ([row["familyId"]] if row.get("familyId") else [])
        row["familyIds"] = member_families
        if (not isinstance(row.get("nameZh"), str) or not row["nameZh"].strip()
                or not isinstance(row.get("summaryZh"), str) or not row["summaryZh"].strip()
                or not member_families or any(family_id not in family_ids for family_id in member_families)):
            fail("ATLAS_RESOURCE_NAVIGATION_FIELDS_INVALID: " + str(row.get("id")))
        if row.get("availability") is None:
            row["availability"] = "knowledge-only-no-local-runtime"
        for family_id in member_families:
            family = next(item for item in atlas_families if item["id"] == family_id)
            if row["id"] not in family["memberIds"]:
                fail("ATLAS_RESOURCE_FAMILY_LINK_MISMATCH: " + str(row.get("id")))

    entries = list(styles)
    for row in atlas["entries"]:
        entries.append({
            "id": row["id"], "source": "visual-effects-atlas", "sourceType": "atlas",
            "name": row["nameZh"], "nameEn": row["nameEn"], "aliases": [row["slug"], row["nameEn"], *row.get("aliases", [])],
            "summary": row.get("summaryZh"), "familyIds": row.get("familyIds", []),
            "familyId": (row.get("familyIds") or [None])[0],
            "visualContribution": row.get("visualContributionZh"), "useConditions": row.get("useConditionsZh"),
            "limitations": row.get("limitationsZh"), "combinations": row.get("combinationsZh"),
            "producerMarkdown": row.get("detailPath"), "detailLines": row.get("detailLines"),
            "availability": row.get("availability", "knowledge-only-no-local-runtime"),
            "canExecute": False, "sourceUrl": row.get("sourceUrl"),
            "sourceStatus": row.get("sourceStatus") or row.get("knowledgeStatus"),
            "searchTerms": row.get("searchTerms", []),
        })
    for row in motion["entries"]:
        entries.append({
            "id": row["id"], "source": "motion-prompt", "sourceType": "motion-prompt",
            "name": row["nameZh"], "nameEn": row["nameEn"], "aliases": [row["globalId"], row["slug"], row["nameEn"], *row.get("tags", [])],
            "summary": row["meaningZh"], "category": row.get("categoryZh", row["category"]),
            "useConditions": row.get("askExampleZh"), "limitations": row.get("limitationsZh"),
            "producerMarkdown": f"motion/{row['detailPath']}", "detailLines": row.get("detailLines"),
            "sharedDetailLines": row.get("sharedDetailLines", []),
            "implementationPath": row["runtimePath"], "availability": row.get("availability"),
            "canExecute": True, "cycleSeconds": row["cycleSeconds"], "dimensions": row["dimensions"],
            "searchTerms": row.get("tags", []),
        })
    for row in overlay["entries"]:
        entries.append({
            "id": row["id"], "source": "overlay-studio-capabilities", "sourceType": "overlay",
            "name": row["name"], "nameEn": row["nameEn"], "aliases": [row["sourceId"], row["nameEn"]],
            "summary": row["summary"], "visualContribution": row["visualContribution"],
            "useConditions": row["useConditions"], "limitations": row.get("localDisposition", {}).get("summary"),
            "producerMarkdown": f"motion/{row['detailPath']}", "detailLines": row.get("detailLines"),
            "availability": row["availability"], "localDisposition": row.get("localDisposition"),
            "canExecute": row["availability"] == "implemented-local-consumer", "licenseId": row["licenseId"],
            "searchTerms": row.get("tags", []),
        })
    ids = [row["id"] for row in entries]
    if len(ids) != len(set(ids)):
        fail("RESOURCE_CATALOG_DUPLICATE_STABLE_ID")
    source_manifests = {
        "styles": sha256(style_index_path.read_bytes()),
        "atlas": sha256(EFFECT_INDEX.read_bytes()),
        "motion": sha256(MOTION_INDEX.read_bytes()),
        "overlay": sha256(OVERLAY_INDEX.read_bytes()),
    }
    return {
        "schema": "laohu.motion.unified-resource-catalog/1",
        "sourceManifests": source_manifests,
        "coverage": {"styles": len(styles), "atlas": len(atlas["entries"]), "motionPrompt": len(motion["entries"]),
                     "expressionCapabilities": len(overlay["entries"]), "total": len(entries)},
        "richStyles": rich["entries"], "atlasFamilies": atlas_families,
        "atlasResources": atlas["entries"], "atlasProductionNoteZh": atlas_production_note,
        "motionPromptItems": motion["entries"],
        "expressionCapabilities": overlay["entries"],
        "motionVocabulary": {"path": "motion/vocabulary.md", "sha256": sha256(safe_resource_file("motion/vocabulary.md").read_bytes()),
                             "content": safe_resource_file("motion/vocabulary.md").read_text(encoding="utf-8")},
        "entries": entries,
    }


def load_resource_catalog(style_index_path: Path = DEFAULT_INDEX) -> dict:
    data = _read_json_file(RESOURCE_CATALOG, "unified-resource-catalog")
    if data.get("schema") != "laohu.motion.unified-resource-catalog/1" or not isinstance(data.get("entries"), list):
        fail("INVALID_UNIFIED_RESOURCE_CATALOG")
    expected = data.get("sourceManifests")
    current = {
        "styles": sha256(style_index_path.read_bytes()),
        "atlas": sha256(EFFECT_INDEX.read_bytes()),
        "motion": sha256(MOTION_INDEX.read_bytes()),
        "overlay": sha256(OVERLAY_INDEX.read_bytes()),
    }
    if expected != current:
        fail("UNIFIED_RESOURCE_CATALOG_STALE: run build-resource-catalog")
    return data


def load_openmotion_catalog() -> dict | None:
    """Read the optional project index without touching any candidate files."""
    try:
        catalog = json.loads(OPENMOTION_CATALOG.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    if not isinstance(catalog, dict) or not isinstance(catalog.get("entries"), list):
        fail("INVALID_OPENMOTION_CATALOG: entries")
    revision = catalog.get("sourceRevision")
    if not isinstance(revision, str) or not revision.strip():
        fail("INVALID_OPENMOTION_CATALOG: sourceRevision")
    descriptions = catalog.get("categoryDescriptions", {})
    if not isinstance(descriptions, dict) or any(not isinstance(text, str) or not text.strip() for text in descriptions.values()):
        fail("INVALID_OPENMOTION_CATALOG: categoryDescriptions")
    ids = set()
    for row in catalog["entries"]:
        resource_id = row.get("id") if isinstance(row, dict) else None
        if not isinstance(resource_id, str) or not OPENMOTION_ID.fullmatch(resource_id) or resource_id in ids:
            fail(f"INVALID_OPENMOTION_ID: {resource_id}")
        ids.add(resource_id)
        for key in ("title", "summary", "category", "guide"):
            if not isinstance(row.get(key), str) or not row[key].strip():
                fail(f"INVALID_OPENMOTION_ENTRY: {resource_id}.{key}")
        if not isinstance(row.get("tags"), list) or any(not isinstance(tag, str) or not tag.strip() for tag in row["tags"]):
            fail(f"INVALID_OPENMOTION_ENTRY: {resource_id}.tags")
        if not isinstance(row.get("hasProjectFiles"), bool):
            fail(f"INVALID_OPENMOTION_ENTRY: {resource_id}.hasProjectFiles")
    return catalog


def openmotion_categories(entries: list[dict], descriptions: dict[str, str]) -> list[dict]:
    counts = Counter(row["category"] for row in entries)
    tags = {category: Counter() for category in counts}
    for row in entries:
        category = row["category"]
        tags[category].update(set(row["tags"]) - {category})
    categories = []
    for category, count in sorted(counts.items()):
        common = sorted(tags[category], key=lambda tag: (-tags[category][tag], tag))[:4]
        description = descriptions.get(category) or ("常见标签：" + "、".join(common) if common else None)
        categories.append({"category": category, "memberCount": count, "description": description})
    return categories


def openmotion_summary(row: dict) -> dict:
    return {**{key: row[key] for key in ("id", "title", "summary", "category", "tags", "hasProjectFiles")},
            "name": row["title"], "sourceType": "openmotion",
            "availability": "local-project-files" if row["hasProjectFiles"] else "reference-only"}


def find_openmotion_entry(resource_id: str) -> tuple[dict, str]:
    catalog = load_openmotion_catalog()
    if catalog is None:
        fail("OPENMOTION_CATALOG_NOT_FOUND: " + OPENMOTION_CATALOG.relative_to(REPO_ROOT).as_posix())
    row = next((item for item in catalog["entries"] if item["id"] == resource_id.casefold()), None)
    if row is None:
        fail("RESOURCE_NOT_FOUND: " + resource_id)
    return row, catalog["sourceRevision"]


def openmotion_relative_path(value: str, resource_id: str) -> Path:
    if not isinstance(value, str) or "\\" in value or ":" in value:
        fail("INVALID_OPENMOTION_PATH: " + resource_id)
    relative = Path(value)
    if relative.is_absolute() or not relative.parts or ".." in relative.parts:
        fail("INVALID_OPENMOTION_PATH: " + resource_id)
    return OPENMOTION_CATALOG.parent / relative


def openmotion_metadata(row: dict, revision: str) -> dict:
    locations = {}
    for field, key in (("guide", "producerMarkdown"), ("preview", "previewPath"),
                       ("contactSheet", "contactSheetPath"), ("source", "implementationPath")):
        value = row.get(field)
        if value is None or value == "":
            continue
        locations[key] = openmotion_relative_path(value, row["id"]).relative_to(REPO_ROOT).as_posix()
    if row.get("contactSheet"):
        locations["sampleTimesSeconds"] = row["sampleTimesSeconds"]
    if row.get("originalPreview"):
        locations["originalPreview"] = row["originalPreview"]
    return {**openmotion_summary(row), **locations, "sourceSet": "openmotion", "sourceRevision": revision}


def openmotion_implementation(row: dict, revision: str, member: str = "index.html") -> dict:
    resource_id = row["id"]
    if not row["hasProjectFiles"]:
        fail("RESOURCE_L3_UNAVAILABLE: " + resource_id)
    package = OPENMOTION_CATALOG.parent.resolve()
    relative = (Path(row["source"]) / member).as_posix()
    project = openmotion_relative_path(row["source"], resource_id).resolve()
    candidate = openmotion_relative_path(relative, resource_id).resolve()
    if (package not in project.parents or project not in candidate.parents or not candidate.is_file()
            or candidate.suffix.lower() not in {".html", ".css", ".js", ".mjs", ".ts", ".jsx", ".tsx", ".json"}):
        fail("OPENMOTION_IMPLEMENTATION_MEMBER_UNAVAILABLE: " + relative)
    pinned = next((line.split("  ", 1)[0] for line in (package / "SHA256SUMS").read_text(encoding="utf-8").splitlines()
                   if line.endswith("  " + relative)), None)
    content = candidate.read_bytes()
    if pinned != sha256(content):
        fail("OPENMOTION_IMPLEMENTATION_MEMBER_HASH_MISMATCH: " + relative)
    return resource_body(resource_id, "L3", candidate.relative_to(REPO_ROOT).as_posix(), content.decode("utf-8"),
                         sourceRevision=revision, implementationPath=project.relative_to(REPO_ROOT).as_posix(),
                         rightsReference=(package / "SOURCES.md").relative_to(REPO_ROOT).as_posix())


def legacy_motion_records() -> list[tuple[str, str, dict]]:
    try:
        catalog = json.loads(LEGACY_MOTION_CATALOG.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return []
    return [
        *((("showreel-recipe" if row.get("sourceRef", {}).get("sourceId") == "garden-motion-showreel" else "local-effect"),
           "effect", row) for row in catalog["effects"]),
        *(("legacy-remotion", "template", row) for row in catalog["templates"]
          if row.get("renderer") == "video-shotcraft-remotion"),
        *(("effect-library", "effect-library", row) for row in catalog["effectLibraries"]),
    ]


def legacy_motion_summary(source: str, row: dict) -> dict:
    recipe = row.get("sourceMethod") or {}
    name = re.sub(r"^\d+\.\s+", "", recipe.get("heading", "")) or row["name"]
    category = row.get("family") or row.get("component", {}).get("kind") or "支撑依赖"
    if source == "showreel-recipe":
        category = "原版动作配方"
    category = EFFECT_CATEGORIES.get(category, category)
    summary = recipe.get("adaptation") or row.get("variant") or row.get("fixedMechanism") or row.get("intent") or ""
    return {"id": row["id"], "name": name, "sourceType": source, "category": category, "summary": summary,
            "aliases": row.get("aliases", []), "tags": row.get("intents", row.get("category", [])),
            "availability": row["availability"], "renderer": row.get("renderer")}


def motion_search_rows(catalog: dict, openmotion: dict | None, sources=MOTION_SOURCES) -> list[dict]:
    family_names = {row["id"]: row["nameZh"] for row in catalog["atlasFamilies"]}
    rows = []
    for row in catalog["entries"]:
        if row["sourceType"] not in sources:
            continue
        if row["sourceType"] == "atlas":
            rows.append({**row, "category": family_names[row["familyId"]]})
        elif row["sourceType"] == "overlay":
            rows.append({**row, "category": "表达方式"})
        elif row["sourceType"] == "motion-prompt":
            rows.append(row)
    if openmotion is not None:
        rows.extend(openmotion_summary(row) for row in openmotion["entries"])
    if any(source in sources for source in LEGACY_MOTION_SOURCES):
        rows.extend(legacy_motion_summary(source, row) for source, _, row in legacy_motion_records() if source in sources)
    return rows


def motion_source_groups(rows: list[dict], catalogue: dict, openmotion: dict | None, sources=MOTION_SOURCES) -> list[dict]:
    descriptions = {row["nameZh"]: row["summaryZh"] for row in catalogue["atlasFamilies"]}
    groups = []
    for source in sources:
        title, description = MOTION_SOURCES[source]
        members = [row for row in rows if row["sourceType"] == source]
        if source == "openmotion":
            categories = openmotion_categories(openmotion["entries"], openmotion.get("categoryDescriptions", {})) if openmotion else []
        else:
            counts = Counter(row["category"] for row in members)
            categories = [{"category": category, "memberCount": count, "description": descriptions.get(category)}
                          for category, count in sorted(counts.items())]
        groups.append({"source": source, "title": title, "description": description, "memberCount": len(members),
                       "categories": categories, "byAvailability": dict(Counter(row["availability"] for row in members))})
    return groups


def typography_rows() -> tuple[list[dict], list[dict]]:
    fonts = _read_json_file(TYPOGRAPHY_ROOT / "fonts.json", "font catalogue")
    uses = _read_json_file(TYPOGRAPHY_ROOT / "uses.json", "typography use cases")
    if (fonts.get("schema") != "laohu.motion.typography-fonts/1"
            or uses.get("schema") != "laohu.motion.typography-uses/1"
            or not isinstance(fonts.get("entries"), list) or not isinstance(uses.get("entries"), list)):
        fail("INVALID_TYPOGRAPHY_CATALOG")
    return fonts["entries"], uses["entries"]


def typography_file(relative: str) -> Path:
    local = Path(relative)
    resolved = (REPO_ROOT / local).resolve()
    if local.is_absolute() or ".." in local.parts or SKILL_ROOT not in resolved.parents:
        fail("TYPOGRAPHY_PATH_OUTSIDE_SKILL: " + relative)
    return resolved


def typography_availability(row: dict, verify_hash: bool = True) -> tuple[str, dict | None, dict | None]:
    """Resolve one present copy of an indexed font and its corresponding notice."""
    base = None
    for copy in row["copies"]:
        file = copy["file"]
        source = typography_file(file["path"])
        if not source.is_file() or (verify_hash and sha256(source.read_bytes()) != file["sha256"]):
            continue
        if base is None:
            base = file
        license = copy["license"]
        if not license:
            continue
        notice = typography_file(license["path"])
        if notice.is_file() and (not verify_hash or sha256(notice.read_bytes()) == license["sha256"]):
            return "local-font", file, license
    return ("license-unverified", base, None) if base else ("font-file-unavailable", None, None)


def font_codepoints(ranges: str) -> set[int]:
    covered = set()
    for token in ranges.split():
        start, _, end = token.partition("-")
        covered.update(range(int(start, 16), int(end or start, 16) + 1))
    return covered


def typography_coverage(row: dict, sample: str) -> dict:
    covered = font_codepoints(row["cmap"])
    missing = {}
    previous = None
    for character in sample:
        number = ord(character)
        if character in "\r\n\t":
            previous = None
            continue
        selector = 0xFE00 <= number <= 0xFE0F or 0xE0100 <= number <= 0xE01EF
        if selector:
            sequences = row.get("variationSequences", {}).get(f"{number:X}", "")
            supported = previous in font_codepoints(sequences)
        else:
            supported = number in covered
        if not supported:
            item = {"character": character, "codePoint": f"U+{number:04X}"}
            if selector:
                item["precedingCharacter"] = chr(previous) if previous is not None else None
            missing.setdefault((character, previous if selector else None), item)
        previous = number
    return {"supported": not missing, "missing": list(missing.values())}


def typography_detail(row: dict, sample: str | None = None, *, verify_hash: bool = True) -> dict:
    if row["sourceType"] == "type-use":
        return {**row, "availability": "method-reference"}
    availability, file, license = typography_availability(row, verify_hash)
    detail = {key: value for key, value in row.items() if key not in {"cmap", "variationSequences", "copies"}}
    detail.update(availability=availability, file=file, license=license)
    if verify_hash:
        detail["copies"] = row["copies"]
    if sample is not None:
        detail["coverage"] = typography_coverage(row, sample)
    return detail


def typography_summary(rows: tuple[list[dict], list[dict]]) -> dict:
    fonts, uses = rows
    return {
        "assetCount": len(fonts),
        "useCount": len(uses),
        "guide": "从本句的观看任务、字形特点和实际用字查询。用法条目说明成立条件和可比较的动作，字体条目给出字重和可核对的本地文件。",
        "search": "resource-search --source fonts --query <表达任务或字族> --text <本片实际显示字符串>",
    }


def typography_overview(rows: tuple[list[dict], list[dict]]) -> dict:
    fonts, uses = rows
    fields = ("id", "name", "category", "summary", "sourceType", "availability", "family", "weight", "scripts", "coverageScope")
    return {
        "schema": "laohu.motion.typography-overview/1",
        "scope": "fonts",
        **typography_summary(rows),
        "fonts": [{key: detail[key] for key in fields if key in detail}
                  for row in fonts if (detail := typography_detail(row, verify_hash=False))],
        "uses": [{key: detail[key] for key in (*fields, "fontIds") if key in detail}
                 for row in uses if (detail := typography_detail(row))],
    }


def typography_score(query: str, row: dict) -> int:
    terms = query_terms(query)
    title = " ".join((row["name"], row.get("family", ""), row["id"], *row.get("aliases", []))).casefold()
    context = json.dumps({key: row[key] for key in ("summary", "category", "tags", "conditions", "layout", "motion", "limitations", "scripts", "coverageScope") if key in row},
                         ensure_ascii=False).casefold()
    score = 0
    for term in terms:
        if term in title:
            score += 7
        elif term in context:
            score += 4
        elif re.fullmatch(r"[\u3400-\u9fff]{3,}", term):
            # Chinese long phrases can contain several criteria without spaces.
            for part in {term[i:i+2] for i in range(len(term) - 1)}:
                score += 2 if part in title else int(part in context)
    return score


def typography_search(rows: tuple[list[dict], list[dict]], query: str, limit: int,
                      category: str | None, sample: str | None) -> list[dict]:
    has_terms = bool(query_terms(query))
    if not has_terms and not category and not sample:
        fail("EMPTY_RESOURCE_QUERY")
    fonts, uses = rows
    method_scores = {row["id"]: typography_score(query, row) for row in uses}
    linked_fonts = {}
    for row in uses:
        score = method_scores[row["id"]]
        if score:
            for font_id in row["fontIds"]:
                linked_fonts.setdefault(font_id, []).append((score, row["id"]))

    hits = []
    for row in (*fonts, *uses):
        if category and category.strip().casefold() != row["category"].casefold():
            continue
        resource_id = row["id"]
        linked = sorted(linked_fonts.get(resource_id, []), key=lambda hit: (-hit[0], hit[1]))
        score = method_scores.get(resource_id, 0) if row["sourceType"] == "type-use" else typography_score(query, row)
        if has_terms and not (score or linked):
            continue
        detail = typography_detail(row, sample, verify_hash=False)
        detail["lexicalScore"] = score
        if linked:
            detail["relatedUses"] = [use_id for _, use_id in linked]
        related_score = round(linked[0][0] / 2) if linked else 0
        hits.append((detail, score + related_score))

    def order(hit: tuple[dict, int]) -> tuple:
        detail, score = hit
        actionable = (detail["availability"] == "local-font" and detail.get("coverage", {}).get("supported", True)
                      or detail["sourceType"] == "type-use")
        return not actionable, -score, detail.get("coverageScope") == "子集", detail["id"]

    return [detail for detail, _ in sorted(hits, key=order)[:max(0, limit)]]


def typography_get(resource_id: str, sample: str | None = None) -> dict:
    fonts, uses = typography_rows()
    for row in (*fonts, *uses):
        if row["id"] == resource_id.casefold():
            return typography_detail(row, sample, verify_hash=True)
    fail("RESOURCE_NOT_FOUND: " + resource_id)


def typography_fulltext(resource_id: str, level: str) -> dict:
    if level != "L2":
        fail("RESOURCE_L3_UNAVAILABLE: " + resource_id)
    row = typography_get(resource_id)
    name = "fonts.json" if row["sourceType"] == "font" else "uses.json"
    relative = (TYPOGRAPHY_ROOT / name).relative_to(REPO_ROOT).as_posix()
    content = json.dumps(row, ensure_ascii=False, indent=2) + "\n"
    return resource_body(row["id"], level, relative, content)


def compact_prose(text: str) -> str:
    return " ".join(text.split()).removeprefix("一句话：").rstrip("。")


def resource_global_map(style_index: dict) -> dict:
    """Project only the local indexes needed for the first design decision."""
    style_groups = {}
    style_ids = set()
    for row in style_index["entries"]:
        resource_id = row["id"]
        if resource_id in style_ids or not re.fullmatch(r"(?:new|original):[a-z0-9-]+", resource_id):
            fail("INVALID_GLOBAL_MAP_STYLE_ID: " + resource_id)
        if row.get("translationStatus") not in {"translated-reviewed", "reviewed-zh-source"}:
            fail("STYLE_CATALOG_PENDING_TRANSLATION_REVIEW: " + resource_id)
        style_ids.add(resource_id)
        meta = row["metadata"]
        category, backend = meta["categoryLabel"], meta["renderBackend"]
        if not category or backend not in RENDER_BACKENDS:
            fail("INVALID_GLOBAL_MAP_STYLE_METADATA: " + resource_id)
        name = row["name"].removesuffix(f"（{resource_id.split(':', 1)[1]}）")
        style_groups.setdefault(category, []).append({
            "id": resource_id, "name": name, "look": compact_prose(meta.get("lookZh") or meta["look"]),
            "fit": compact_prose(meta["fit"]), "renderBackend": backend,
        })
    if not style_ids or len(style_ids) != style_index["coverage"]["styleCount"]:
        fail("GLOBAL_MAP_STYLE_COVERAGE_INVALID")

    atlas = _read_json_file(EFFECT_INDEX, "atlas-effect-index")
    member_ids = {row["id"] for row in atlas["entries"]}
    families = []
    family_ids, covered_members = set(), set()
    for row in atlas["families"]:
        family_id, members = row["id"], set(row["memberIds"])
        if (family_id in family_ids or not family_id.startswith("atlas-family:")
                or row["memberCount"] != len(members) or len(row["memberIds"]) != len(members)):
            fail("GLOBAL_MAP_ATLAS_FAMILY_INVALID: " + family_id)
        family_ids.add(family_id)
        covered_members.update(members)
        families.append({"id": family_id, "name": row["nameZh"], "memberCount": len(members),
                         "mechanism": compact_prose(row["visualContributionZh"].split("。", 1)[0]),
                         "useConditions": compact_prose(row["useConditionsZh"].split("。", 1)[0])})
    if (len(families) != atlas["coverage"]["families"] or len(member_ids) != atlas["coverage"]["total"]
            or len(atlas["entries"]) != len(member_ids) or covered_members != member_ids):
        fail("GLOBAL_MAP_ATLAS_COVERAGE_INVALID")

    motion_index = _read_json_file(MOTION_INDEX, "motion-prompt-index")
    overlay_index = _read_json_file(OVERLAY_INDEX, "presentation-pattern-index")
    motion, overlay = motion_index["entries"], overlay_index["entries"]
    if len(motion) != motion_index["coverage"]["elements"] or len({row["id"] for row in motion}) != len(motion):
        fail("GLOBAL_MAP_MOTION_PROMPT_COVERAGE_INVALID")
    if len(overlay) != overlay_index["count"] or len({row["id"] for row in overlay}) != len(overlay):
        fail("GLOBAL_MAP_OVERLAY_COVERAGE_INVALID")
    categories = {}
    for row in motion:
        categories.setdefault(row["categoryZh"], []).append(row["nameZh"])

    openmotion = load_openmotion_catalog()
    open_rows = openmotion["entries"] if openmotion else []
    fonts, uses = typography_rows()
    legacy = [legacy_motion_summary(source, row) for source, _, row in legacy_motion_records()]
    vocabulary = safe_resource_file("motion/vocabulary.md").read_text(encoding="utf-8")
    return {
        "schema": "laohu.motion.global-map/1",
        "coverage": {"styles": len(style_ids), "atlasFamilies": len(families), "atlasMembers": len(member_ids),
                     "motionPromptItems": len(motion), "openMotionItems": len(open_rows), "overlay": len(overlay),
                     "fonts": len(fonts), "typeUses": len(uses)},
        "styleCategories": [{"category": category, "styles": rows} for category, rows in style_groups.items()],
        "atlasFamilies": families,
        "atlasProductionNote": atlas["atlasProductionNoteZh"],
        "motionPromptCategories": [{"category": category, "memberCount": len(names), "examples": names[:3]}
                                   for category, names in categories.items()],
        "openMotionCategories": openmotion_categories(open_rows, (openmotion or {}).get("categoryDescriptions", {})),
        "openMotionInstalled": openmotion is not None,
        "overlay": [{"id": row["id"], "name": row["name"], "summary": compact_prose(row["summary"])} for row in overlay],
        "typography": {"fontCategories": dict(Counter(row["category"] for row in fonts)),
                       "useCategories": dict(Counter(row["category"] for row in uses))},
        "otherMotionSources": motion_source_groups(legacy, {"atlasFamilies": []}, None, LEGACY_MOTION_SOURCES),
        "motionVocabulary": vocabulary,
    }


def global_map_text(data: dict) -> str:
    coverage = data["coverage"]
    lines = ["# 动画资源全局星图（L0）", "",
             "按本片需要解决的观看问题，使用 resource-category 展开类别或 resource-compare --ids 批量比较。"
             "拟采用项用 input-candidate 读完整 L2，进入实现时按需查 L3。",
             f"\n## 风格（{coverage['styles']} 项）",
             "每行依次为稳定 ID、名称、可见效果、适用任务、建议实现路线。风格可能混用后端，采用时按正文、素材和实际实现核验。"]
    for group in data["styleCategories"]:
        lines.append(f"\n### {group['category']}（{len(group['styles'])} 项）")
        for row in group["styles"]:
            lines.append(f"- {row['id']} | {row['name']} | {row['look']} | {row['fit']} | {RENDER_BACKENDS[row['renderBackend']]}")
    lines.extend([f"\n## Atlas（{coverage['atlasFamilies']} 个家族，{coverage['atlasMembers']} 项）",
                  "展开家族用 resource-category --source atlas --category <家族ID>。",
                  data["atlasProductionNote"]])
    for row in data["atlasFamilies"]:
        lines.append(f"- {row['id']} | {row['name']}（{row['memberCount']}）| {row['mechanism']}。{row['useConditions']}。")
    lines.append(f"\n## Motion Prompt（{coverage['motionPromptItems']} 项）")
    for row in data["motionPromptCategories"]:
        lines.append(f"- {row['category']}（{row['memberCount']}）| {'、'.join(row['examples'])}")
    lines.append(f"\n## OpenMotion（{coverage['openMotionItems']} 项）")
    if not data["openMotionInstalled"]:
        lines.append("本地可选资料包缺失。")
    for row in data["openMotionCategories"]:
        lines.append(f"- {row['category']}（{row['memberCount']}）| {row['description'] or ''}")
    lines.append(f"\n## Overlay 表达能力（{coverage['overlay']} 项）")
    for row in data["overlay"]:
        lines.append(f"- {row['id']} | {row['name']} | {row['summary']}")
    lines.append(f"\n## 字体与排印（{coverage['fonts']} 份字形资产，{coverage['typeUses']} 种用法）")
    for label, key in (("字体", "fontCategories"), ("排印用法", "useCategories")):
        categories = '、'.join(f"{name} {count}" for name, count in sorted(data["typography"][key].items()))
        lines.append(f"- {label} | {categories}")
    lines.append("按原句用 resource-search --source fonts --query <任务> --text <原句> 检查候选字形覆盖。")
    lines.append("\n## 原版配方和已有工程动效")
    for row in data["otherMotionSources"]:
        categories = '、'.join(f"{item['category']} {item['memberCount']}" for item in row["categories"])
        lines.append(f"- {row['source']} | {row['title']}（{row['memberCount']}）| {categories}")
    lines.append("\n## 共同动作语言\n" + data["motionVocabulary"].rstrip())
    return "\n".join(lines) + "\n"


def resource_overview(catalog: dict, scope: str = "all") -> dict:
    if scope == "fonts":
        return typography_overview(typography_rows())
    if scope not in {"all", "styles", "atlas", "motion", "overlay", "openmotion", "motion-library"}:
        fail("INVALID_RESOURCE_SCOPE: " + scope)
    openmotion = load_openmotion_catalog() if scope in {"all", "openmotion", "motion-library"} else None
    if scope == "motion-library":
        return {"schema": "laohu.motion.motion-library-overview/1", "scope": scope,
                "sources": motion_source_groups(motion_search_rows(catalog, openmotion), catalog, openmotion)}
    if scope == "openmotion":
        entries = openmotion["entries"] if openmotion else []
        return {"schema": "laohu.motion.resource-overview/1", "scope": scope, "coverage": {"openMotion": len(entries)},
                "openMotionCategories": openmotion_categories(entries, (openmotion or {}).get("categoryDescriptions", {}))}
    include = lambda name: scope == "all" or scope == name
    motion_l0_fields = (
        "id", "categoryZh", "nameZh", "meaningZh", "whenToUseZh", "askExampleZh",
        "runtimePath", "localNumber", "dimensions", "cycleSeconds", "availability", "assetsRequired",
    )
    overlay_l0_fields = (
        "id", "name", "nameEn", "summary", "visualContribution", "useConditions",
        "availability", "licenseId", "localDisposition",
    )
    rich_l0 = []
    for row in catalog["richStyles"]:
        rich_l0.append({key: row[key] for key in ("id", "sourceSet", "name")} | {
            field: {key: {"summary": value["summary"]} for key, value in row[field].items()}
            for field in ("catalog", "appearance")
        })
    motion_l0 = [{key: row[key] for key in motion_l0_fields if key in row} for row in catalog["motionPromptItems"]]
    overlay_l0 = []
    for row in catalog["expressionCapabilities"]:
        projected = {key: row[key] for key in overlay_l0_fields if key in row}
        disposition = projected.get("localDisposition")
        if isinstance(disposition, dict):
            projected["localDisposition"] = {key: disposition[key] for key in ("status", "summary") if key in disposition}
        overlay_l0.append(projected)
    result = {
        "schema": "laohu.motion.resource-overview/1", "scope": scope,
        "richStyles": rich_l0 if include("styles") else [],
        "atlasFamilies": catalog["atlasFamilies"] if include("atlas") else [],
        "atlasProductionNoteZh": catalog["atlasProductionNoteZh"] if include("atlas") else None,
        "motionPromptItems": motion_l0 if include("motion") else [],
        "expressionCapabilities": overlay_l0 if include("overlay") else [],
        "motionVocabulary": catalog["motionVocabulary"] if include("motion") else None,
        "coverage": {
            "richStyles": len(catalog["richStyles"]),
            "atlasFamilies": len(catalog["atlasFamilies"]),
            "atlasResources": len(catalog["atlasResources"]),
            "motionPromptItems": len(catalog["motionPromptItems"]),
            "expressionCapabilities": len(catalog["expressionCapabilities"]),
        },
    }
    if openmotion is not None:
        entries = openmotion["entries"]
        result["openMotionCategories"] = openmotion_categories(entries, openmotion.get("categoryDescriptions", {}))
    if scope == "all":
        result["typography"] = typography_summary(typography_rows())
        legacy = [legacy_motion_summary(source, row) for source, _, row in legacy_motion_records()]
        if legacy:
            result["legacyMotionSources"] = motion_source_groups(legacy, catalog, None, LEGACY_MOTION_SOURCES)
    return result


def resource_family(catalog: dict, family_id: str) -> dict:
    matches = [row for row in catalog["atlasFamilies"] if row.get("id", "").casefold() == family_id.casefold()]
    if len(matches) != 1:
        fail("ATLAS_FAMILY_NOT_FOUND: " + family_id)
    family = matches[0]
    family_id = family["id"]
    resources = [row for row in catalog["atlasResources"] if family_id in row.get("familyIds", [])]
    if len(resources) != family.get("memberCount") or {row["id"] for row in resources} != set(family.get("memberIds", [])):
        fail("ATLAS_FAMILY_MEMBER_COVERAGE_MISMATCH: " + family_id)
    l1_fields = (
        "id", "slug", "nameZh", "nameEn", "availability", "summaryZh", "visualContributionZh",
        "useConditionsZh", "limitationsZh", "combinationsZh", "familyIds", "familyId", "familyNameZh", "category",
        "visualDimensions", "detailPath", "detailLines", "sourceUrl", "sourceStatus", "sourceKind", "sourceDecade",
    )
    l1_resources = [{key: row[key] for key in l1_fields if key in row} for row in resources]
    return {"schema": "laohu.motion.resource-family/1", "family": family,
            "atlasProductionNoteZh": catalog["atlasProductionNoteZh"],
            "memberCount": len(l1_resources), "resources": l1_resources}


def resource_compare(catalog: dict, style_index: dict, ids: list[str]) -> dict:
    if not ids or any(not resource_id.strip() for resource_id in ids):
        fail("MISSING_RESOURCE_IDS: pass comma-separated stable IDs")
    ids = list(dict.fromkeys(resource_id.strip().casefold() for resource_id in ids))
    directory = {row["id"] for row in style_index["entries"]}
    style_ids = directory.intersection(ids)
    rich_styles = ({row["id"]: row for row in rich_catalog(style_index, style_ids)["entries"]} if style_ids else {})
    style_by_id = {row["id"]: row for row in style_index["entries"] if row["id"] in style_ids}
    prompt_by_id = {row["id"]: row for row in catalog["motionPromptItems"]}
    atlas_by_id = {row["id"]: row for row in catalog["atlasResources"]}
    om_catalog = load_openmotion_catalog() if any(resource_id.startswith("openmotion-") for resource_id in ids) else None
    om_by_id = {row["id"]: row for row in om_catalog["entries"]} if om_catalog else {}
    rows = []
    for resource_id in ids:
        if resource_id in om_by_id:
            rows.append(openmotion_metadata(om_by_id[resource_id], om_catalog["sourceRevision"]))
            continue
        row = resource_get(catalog, resource_id)
        if resource_id in rich_styles:
            indexed = style_by_id[resource_id]
            metadata = indexed["metadata"]
            row.update({"catalog": rich_styles[resource_id]["catalog"], "appearance": rich_styles[resource_id]["appearance"],
                        "category": metadata["categoryLabel"], "renderBackend": metadata["renderBackend"],
                        "previewPath": style_preview_path(indexed)})
        elif resource_id in prompt_by_id:
            prompt = prompt_by_id[resource_id]
            for key in ("whatHappensZh", "whenToUseZh", "askExampleZh", "assetsRequired", "assetPaths", "localNumber"):
                row[key] = prompt[key]
        elif resource_id in atlas_by_id:
            row["visualDimensions"] = atlas_by_id[resource_id].get("visualDimensions")
        rows.append(row)
    return {"schema": "laohu.motion.resource-comparison/1", "resources": rows, "memberCount": len(rows)}


def resource_category(catalog: dict, style_index: dict, source: str, category: str) -> dict:
    source = "style" if source in {"style", "styles"} else source
    category = category.strip().casefold()
    if not category:
        fail("MISSING_RESOURCE_CATEGORY")
    if source == "atlas":
        family = next((row for row in catalog["atlasFamilies"] if category in
                       {row["id"].casefold(), row["key"].casefold(), row["nameZh"].casefold()}), None)
        if family is None:
            fail("ATLAS_FAMILY_NOT_FOUND: " + category)
        return resource_family(catalog, family["id"])
    if source == "fonts":
        rows = [row for group in typography_rows() for row in group]
    elif source == "style":
        rows = [row for row in catalog["entries"] if row["sourceType"] == source]
    elif source in MOTION_SOURCES:
        openmotion = load_openmotion_catalog() if source == "openmotion" else None
        rows = motion_search_rows(catalog, openmotion, (source,))
    else:
        fail("INVALID_RESOURCE_SOURCE: " + source)
    ids = [row["id"] for row in rows if (row.get("category") or "").casefold() == category]
    if not ids:
        fail(f"RESOURCE_CATEGORY_NOT_FOUND: {source}:{category}")
    return {**resource_compare(catalog, style_index, ids), "source": source, "category": category}


def resource_search(catalog: dict, query: str, source: str = "all", limit: int = 20, category: str | None = None,
                    sample: str | None = None) -> list[dict]:
    if source == "fonts":
        return typography_search(typography_rows(), query, limit, category, sample)
    if sample is not None:
        fail("--text is supported by resource-search --source fonts")
    if source not in {"all", "style", "motion-library", *MOTION_SOURCES}:
        fail("INVALID_RESOURCE_SOURCE: " + source)
    category = (category or "").strip().casefold()
    terms = query_terms(query)
    if not terms and (query.strip() or not category):
        fail("EMPTY_RESOURCE_QUERY")
    openmotion = load_openmotion_catalog() if source in {"all", "openmotion", "motion-library"} else None
    sources = MOTION_SOURCES if source in {"all", "motion-library"} else (source,)
    rows = motion_search_rows(catalog, openmotion, sources)
    if source in {"all", "style"}:
        rows += [row for row in catalog["entries"] if row["sourceType"] == "style"]
    hits = []
    for row in rows:
        if source not in {"all", "motion-library"} and row.get("sourceType") != source:
            continue
        if category and category != (row.get("category") or "").casefold():
            continue
        haystack = "\n".join(str(value) for value in (
            row.get("id", ""), row.get("name", ""), row.get("nameEn", ""), row.get("summary", ""),
            row.get("visualContribution", ""), row.get("useConditions", ""), row.get("limitations", ""),
            row.get("category", ""), " ".join(row.get("aliases", [])), " ".join(row.get("searchTerms", [])),
            " ".join(row.get("tags", [])),
        )).casefold()
        score = sum((8 if term in row.get("id", "").casefold() else 0)
                    + (5 if term in (row.get("name", "") + " " + row.get("nameEn", "")).casefold() else 0)
                    + (2 if term in haystack else 0) for term in terms)
        if score or not terms:
            fields = (("id", "name", "title", "summary", "category", "tags", "sourceType", "availability",
                       "renderer", "hasProjectFiles") if source == "motion-library" or row["sourceType"] in LEGACY_MOTION_SOURCES
                      else [key for key in row if key != "searchTerms"])
            hits.append({key: row[key] for key in fields if key in row} | {"lexicalScore": score})
    return sorted(hits, key=lambda row: (-row["lexicalScore"], row["id"]))[:max(0, limit)]


def legacy_motion_record(resource_id: str) -> tuple[str, str, dict]:
    match = next((entry for entry in legacy_motion_records() if entry[2]["id"] == resource_id.casefold()), None)
    if match is None:
        fail("RESOURCE_NOT_FOUND: " + resource_id)
    return match


def legacy_motion_description(kind: str, resource_id: str) -> dict:
    cli = SCRIPT_DIR / "templates.mjs"
    try:
        result = subprocess.run(["node", str(cli), "describe", "--type", kind, "--query", resource_id, "--json"],
                                cwd=REPO_ROOT, capture_output=True, encoding="utf-8", timeout=15)
    except subprocess.TimeoutExpired:
        fail("LEGACY_MOTION_DETAIL_TIMEOUT: " + resource_id)
    if result.returncode != 0:
        fail("LEGACY_MOTION_DETAIL_UNAVAILABLE: " + (result.stderr or resource_id).splitlines()[0])
    description = json.loads(result.stdout)
    if description.get("originalRecord", {}).get("id") != resource_id:
        fail("LEGACY_MOTION_DETAIL_ID_MISMATCH: " + resource_id)
    return description


def legacy_detail_path(source: str, resource_id: str) -> str:
    if source == "showreel-recipe":
        return SHOWREEL_RECIPES.relative_to(REPO_ROOT).as_posix()
    return LEGACY_MOTION_CATALOG.relative_to(REPO_ROOT).as_posix() + "#" + resource_id


def local_implementation_path(relative: str | None) -> Path | None:
    if not relative:
        return None
    value = Path(relative)
    root_prefix = SKILL_ROOT.relative_to(REPO_ROOT)
    if value.is_absolute() or ".." in value.parts:
        return None
    target = ((REPO_ROOT if value.is_relative_to(root_prefix) else SKILL_ROOT) / value).resolve()
    if SKILL_ROOT not in target.parents or not target.is_file():
        return None
    return target


def local_runtime_modules(source_paths: list[str]) -> list[str]:
    if not source_paths:
        return []
    runtime = SKILL_ROOT / "templates/runtime"
    closure = runtime / "laohu-effects/closure.json"
    if not closure.is_file():
        return []
    manifest = json.loads(closure.read_bytes())
    modules = {item["sourcePath"]: item["localPath"] for item in manifest["modules"]}
    return [f"templates/runtime/{modules[key]}" for key in source_paths if key in modules]


def legacy_implementation_paths(source: str, row: dict) -> list[Path]:
    adapter = row.get("adapter", {})
    component = row.get("component", {})
    if source == "legacy-remotion":
        choices = [component.get("localPath"), adapter.get("localPath"), adapter.get("localImplementation", {}).get("path"),
                   row.get("derivedProvider", {}).get("entrypoint"), row.get("sourcePath")]
    elif source == "effect-library":
        choices = local_runtime_modules(list(reversed(row.get("loadOrder", []))))
    elif source == "showreel-recipe":
        choices = [adapter.get("path"), "templates/runtime/laohu-showreel/assets/starter/motion.js"]
    else:
        choices = [adapter.get("path"), *local_runtime_modules(row.get("sourceRef", {}).get("files", []))]
    return list(dict.fromkeys(target for value in choices if (target := local_implementation_path(value))))


def resource_body(resource_id: str, level: str, relative: str, content: str, **details) -> dict:
    raw = content.encode("utf-8")
    return {"id": resource_id, "level": level, "path": relative, "content": content,
            "sha256": sha256(raw), "bytes": len(raw), **details}


def read_motion_implementation(resource_id: str, paths: list[Path], **details) -> dict:
    if not paths:
        fail("RESOURCE_L3_UNAVAILABLE: " + resource_id + "；用 resource-get 核对登记的 consumer、依赖与可用条件。")
    relative = [item.relative_to(REPO_ROOT).as_posix() for item in paths]
    return resource_body(resource_id, "L3", relative[0], paths[0].read_bytes().decode("utf-8"),
                         implementationPaths=relative, **details)


def legacy_motion_fulltext(resource_id: str, level: str) -> dict:
    source, kind, row = legacy_motion_record(resource_id)
    resource_id = row["id"]
    if level == "L3":
        return read_motion_implementation(resource_id, legacy_implementation_paths(source, row),
                                          renderer=row.get("renderer"), availability=row["availability"])
    relative = legacy_detail_path(source, resource_id)
    description = legacy_motion_description(kind, resource_id)
    if source == "showreel-recipe":
        method = description["originalRecord"]["sourceMethod"]
        lines = SHOWREEL_RECIPES.read_bytes().decode("utf-8").splitlines(keepends=True)
        start, end = method["lineStart"], method["lineEnd"]
        if not 1 <= start <= end <= len(lines) or lines[start - 1].strip() != "## " + method["heading"]:
            fail("SHOWREEL_RECIPE_SECTION_MISMATCH: " + resource_id)
        return resource_body(resource_id, level, relative, "".join(lines[start - 1:end]),
                             sourceRanges=[{"start": start, "end": end, "kind": "item"}])
    title, boundary = MOTION_SOURCES[source]
    content = f"# {description['title']}\n\n{title}。{boundary}\n\n```json\n"
    content += json.dumps(description["originalRecord"], ensure_ascii=False, indent=2) + "\n```\n"
    return resource_body(resource_id, level, relative, content)


def resource_get(catalog: dict, resource_id: str, sample: str | None = None) -> dict:
    if resource_id.casefold().startswith(("font:", "type-use:")):
        return typography_get(resource_id, sample)
    if sample is not None:
        fail("--text is supported by resource-get with a font ID")
    if resource_id.casefold().startswith("openmotion-"):
        row, revision = find_openmotion_entry(resource_id)
        return openmotion_metadata(row, revision)
    matches = [row for row in catalog["entries"] if row["id"].casefold() == resource_id.casefold()]
    if not matches:
        source, kind, row = legacy_motion_record(resource_id)
        return {**legacy_motion_summary(source, row), "sourceSet": source,
                "producerMarkdown": legacy_detail_path(source, row["id"]),
                "description": legacy_motion_description(kind, row["id"])}
    if len(matches) > 1:
        fail("RESOURCE_NOT_FOUND: " + resource_id)
    result = {key: value for key, value in matches[0].items()
              if key not in {"detailLines", "sharedDetailLines", "searchTerms"}}
    # Keep the L2 receipt identity of styles from older projects. These are L1 navigation fields.
    if result.get("sourceType") == "style":
        for key in ("category", "renderBackend", "previewPath"):
            result.pop(key, None)
    if result.get("sourceType") == "atlas":
        result["atlasProductionNoteZh"] = catalog["atlasProductionNoteZh"]
    return result


def resource_fulltext(catalog: dict, resource_id: str, level: str, style_index: dict, member: str | None = None) -> dict:
    if level not in {"L2", "L3"}:
        fail("INVALID_RESOURCE_LEVEL: expected L2 or L3")
    if member is not None and (level != "L3" or not resource_id.casefold().startswith("openmotion-")):
        fail("--member applies only to OpenMotion L3 implementation files")
    if resource_id.casefold().startswith(("font:", "type-use:")):
        return typography_fulltext(resource_id, level)
    if resource_id.casefold().startswith("openmotion-"):
        row, revision = find_openmotion_entry(resource_id)
        if level == "L3":
            return openmotion_implementation(row, revision, member if member is not None else "index.html")
        guide = openmotion_relative_path(row["guide"], row["id"])
        actual = guide.resolve()
        if guide.suffix.lower() != ".md" or OPENMOTION_CATALOG.parent.resolve() not in actual.parents or not actual.is_file():
            fail("OPENMOTION_GUIDE_UNAVAILABLE: " + row["id"])
        body = actual.read_bytes()
        content = body.decode("utf-8")
        if not content.strip():
            fail("OPENMOTION_GUIDE_EMPTY: " + row["id"])
        return {"id": row["id"], "level": level, "path": guide.relative_to(REPO_ROOT).as_posix(),
                "sourceRevision": revision, "content": content, "sha256": sha256(body), "bytes": len(body)}
    row = next((item for item in catalog["entries"] if item["id"].casefold() == resource_id.casefold()), None)
    if not row:
        return legacy_motion_fulltext(resource_id, level)
    content = None
    relative = None
    if level == "L3":
        if row["sourceType"] == "overlay":
            disposition = row["localDisposition"]
            paths = [target for value in disposition.get("consumerPaths", []) if (target := local_implementation_path(value))]
            return read_motion_implementation(row["id"], paths, implementationScope=disposition)
        if row["sourceType"] != "motion-prompt" or not row.get("implementationPath"):
            fail("RESOURCE_L3_UNAVAILABLE: " + resource_id)
        relative = row["implementationPath"]
        content = safe_resource_file(relative).read_text(encoding="utf-8")
    elif row["sourceType"] == "style":
        source_row = next(item for item in style_index["entries"] if item["id"] == row["id"])
        content = verified_style_text(source_row)
        relative = source_row["contentPath"]
    else:
        relative = row.get("producerMarkdown")
        if not relative:
            fail("RESOURCE_L2_UNAVAILABLE: " + resource_id)
        path = safe_resource_file(relative)
        text = path.read_text(encoding="utf-8")
        bounds = row.get("detailLines") or {}
        start, end = bounds.get("start"), bounds.get("end")
        if not isinstance(start, int) or not isinstance(end, int) or start < 1 or end < start:
            fail("RESOURCE_DETAIL_BOUNDS_INVALID: " + resource_id)
        lines = text.splitlines(keepends=True)
        if end > len(lines):
            fail("RESOURCE_DETAIL_BOUNDS_OUT_OF_RANGE: " + resource_id)
        content = "".join(lines[start - 1:end])
        source_ranges = [{"start": start, "end": end, "kind": "item"}]
        if level == "L2" and row.get("sharedDetailLines"):
            shared_sections = []
            for shared in row["sharedDetailLines"]:
                shared_start, shared_end = shared.get("start"), shared.get("end")
                if (not isinstance(shared_start, int) or not isinstance(shared_end, int)
                        or shared_start < 1 or shared_end < shared_start):
                    fail("RESOURCE_SHARED_DETAIL_BOUNDS_INVALID: " + resource_id)
                if shared_end > len(lines):
                    fail("RESOURCE_SHARED_DETAIL_BOUNDS_OUT_OF_RANGE: " + resource_id)
                shared_sections.append("".join(lines[shared_start - 1:shared_end]))
                source_ranges.append({"start": shared_start, "end": shared_end, "kind": "shared"})
            content += "\n" + "\n".join(shared_sections)
        if level == "L2" and row["sourceType"] == "atlas":
            content += "\n\n**Atlas 条目适用范围：** " + catalog["atlasProductionNoteZh"] + "\n"
    raw = content.encode("utf-8")
    result = {"id": row["id"], "level": level, "path": relative, "content": content,
              "sha256": sha256(raw), "bytes": len(raw)}
    if level == "L2" and row.get("sharedDetailLines"):
        result["sourceRanges"] = source_ranges
    return result


def print_overview_text(data: dict) -> None:
    coverage = data["coverage"]
    print(f"视觉资源导览：{coverage['total']} 条；预览图 {coverage['withPreview']} 张；无预览图 {coverage['withoutPreview']} 条；可调用来源函数 {coverage['callableSourceFunctions']} 条；完整提示词参考 {coverage['fullPromptReferences']} 条；空来源占位 {coverage['emptySourcePlaceholders']} 条。")
    print(f"来源：{data.get('source', {}).get('repository')} @ {data.get('source', {}).get('commit')}")
    for group in data["categories"]:
        print(f"\n{group['category']}（{group['total']} 条；有图 {group['withPreview']}；无图 {group['withoutPreview']}；可调用函数 {group['callableSourceFunctions']}）")
        for row in group["entries"]:
            summary = row.get("resourceSummary") or {}
            image = "有预览" if row.get("preview") else "无预览"
            print(f"- {row['id']} {row['name']} [{row['capability']}；{image}]")
            for label, key in (("视觉", "visual"), ("动作", "actions"), ("镜头/空间/变化", "cameraSpaceChange"), ("表达与情绪", "expressionEmotion"), ("适用条件", "fit"), ("局限", "limitations"), ("融合关系", "fusion")):
                item = summary.get(key)
                if item and item.get("summary"):
                    refs = "；".join(f"{proof['sourcePath']}:{proof['lineStart']} “{proof['quote']}”" for proof in item.get("evidence", []))
                    print(f"  {label}：{item['summary']}{f'（{refs}）' if refs else ''}")
            print(f"  全文：{row['nextStep']['fulltext']}；许可：{row.get('licenseId')}；依赖：{json.dumps(row.get('dependencies', []), ensure_ascii=False)}")
            print(f"  继续：{row['nextStep']['describe']}")


def production_route(row_id: str, category: str, text: str, source_name: str, index: dict) -> dict:
    prompt_match = re.search(r"^## 风格提示词\s*\n([\s\S]*?)(?=^## |\Z)", text, re.M)
    if not source_name.strip() or not prompt_match or not prompt_match.group(1).strip():
        return {
            "kind": "source-placeholder",
            "callable": False,
            "eligible": False,
            "command": f"node scripts/templates.mjs styles fulltext --query {row_id}",
            "implementationNote": "The pinned source record is retained byte-for-byte, but its name/prompt is empty. It is excluded from automatic style search/selection and no creative content is inferred.",
        }
    if category == "A-G_代码样片":
        match = re.search(r"^```(?:js|javascript)?\s*\n([\s\S]*?)\n```", text, re.M)
        code = match.group(1) if match else ""
        has_draw = bool(re.search(r"\bS\." + re.escape(row_id) + r"\s*=", code))
        remotion_canvas = SKILL_ROOT / "templates/runtime/laohu-remotion/components/styles/code-canvas.tsx"
        if has_draw and remotion_canvas.is_file():
            shared = next((item for item in index.get("sharedSources", []) if item.get("localPath") == "code/_公共函数.js"), None)
            if not shared:
                fail("MISSING_A_G_SHARED_HELPER_MAPPING")
            return {
                "kind": "remotion-canvas-function",
                "callable": True,
                "renderer": "Remotion StyleCode composition",
                "componentPath": "templates/runtime/laohu-remotion/components/styles/code-canvas.tsx",
                "componentLocalSha256": sha256(remotion_canvas.read_bytes()),
                "command": f"node scripts/templates.mjs styles render --query {row_id} --text <material> --output <clip.mp4>",
                "sourceFunction": f"S.{row_id}",
                "sourceFunctionSha256": sha256(code.encode("utf-8")),
                "sharedHelperPath": shared["localPath"],
                "sharedHelperSha256": shared["localSha256"],
                "input": "user-supplied material is passed unchanged as PARENT; no demo text is inferred",
                "algorithmRewritten": False,
            }
        return {
            "kind": "complete-production-prompt",
            "callable": False,
            "renderer": "reference-only",
            "command": f"node scripts/templates.mjs styles fulltext --query {row_id}",
            "implementationNote": "The complete original prompt and any sample code remain available; the source does not define this entry's S.<ID> draw function, so direct Canvas execution is not claimed. Use the prompt only to compare actual registered local consumers and their exposed style controls.",
            "consumerBoundary": "A style prompt is reference-only, not a runtime renderer. It may influence a shot only through concrete controls consumed by an existing registered local component/template, action group, shot, media consumer, or callable style function. The prompt summary does not authorize creating a new Canvas/SVG/native/media/Three drawing implementation. If no registered consumer exposes the needed treatment, choose another existing consumer/material or leave that treatment unresolved.",
        }
    return {
        "kind": "complete-production-prompt",
        "callable": False,
        "renderer": "reference-only",
        "command": f"node scripts/templates.mjs styles fulltext --query {row_id}",
        "implementationNote": "The full local prompt, its declared look/fit/keywords, and its indexed preview are reference material, not an executable shot. Compare them only against actual registered local consumers and their exposed style controls; this route does not grant permission to redraw the scene from the prompt summary. No one-to-one executable renderer is claimed for this prompt.",
        "consumerBoundary": "A style prompt is reference-only, not a runtime renderer. It may influence a shot only through concrete controls consumed by an existing registered local component/template, action group, shot, media consumer, or callable style function. The prompt summary does not authorize creating a new Canvas/SVG/native/media/Three drawing implementation. If no registered consumer exposes the needed treatment, choose another existing consumer/material or leave that treatment unresolved.",
    }


def bind_literal_resource_args(argv: list[str]) -> list[str]:
    """Bind separated literal text to its option before argparse sees leading dashes."""
    bound = []
    rest = iter(argv)
    for arg in rest:
        if arg == "--":
            bound.extend((arg, *rest))
            break
        if arg in {"--query", "--text"}:
            value = next(rest, None)
            if value is not None:
                arg += "=" + value
        bound.append(arg)
    return bound


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("build", "list", "browse", "overview", "search", "get", "describe", "selection", "fulltext", "hash", "catalog",
                                              "build-resource-catalog", "resource-overview", "resource-family", "resource-compare",
                                              "resource-category", "resource-search", "resource-get", "resource-fulltext"))
    parser.add_argument("--query", default="")
    parser.add_argument("--text", help="check the actual Unicode characters against a font face")
    parser.add_argument("--id")
    parser.add_argument("--ids", help="comma-separated stable resource IDs for L1 comparison")
    parser.add_argument("--source", default="all")
    parser.add_argument("--scope", default="all")
    parser.add_argument("--level", default="L2")
    parser.add_argument("--member", help="read a specific local OpenMotion L3 source member")
    parser.add_argument("--library", action="store_true", help="read the complete original style library in resumable full-text pages")
    parser.add_argument("--cursor", help="continue from nextCursor returned by the previous fulltext page")
    parser.add_argument("--page-characters", type=int, help=f"page size in Unicode characters (default {DEFAULT_PAGE_CHARACTERS}; maximum {MAX_PAGE_CHARACTERS})")
    parser.add_argument("--category")
    parser.add_argument("--kind", choices=("prompt",))
    parser.add_argument("--limit", type=int, default=12)
    parser.add_argument("--selection-file")
    parser.add_argument("--names", action="store_true")
    parser.add_argument("--include-placeholders", action="store_true", help="include empty pinned source placeholders in list output")
    parser.add_argument("--json", action="store_true", help="emit JSON (the default for machine retrieval)")
    parser.add_argument("--index", default=str(DEFAULT_INDEX))
    args = parser.parse_args(bind_literal_resource_args(sys.argv[1:]))
    try:
        index_path = Path(args.index).resolve()
        if args.member is not None and args.command != "resource-fulltext":
            fail("--member applies only to resource-fulltext with OpenMotion L3")
        if args.command != "fulltext" and (args.library or args.cursor or args.page_characters is not None):
            fail("--library, --cursor, and --page-characters are supported only with fulltext")
        if args.command == "fulltext" and (args.library or args.cursor or args.page_characters is not None):
            index = load_index(index_path)
            page_characters = DEFAULT_PAGE_CHARACTERS if args.page_characters is None else args.page_characters
            if args.library and args.query:
                fail("--library and --query cannot be used together")
            if not args.library and not args.query:
                fail("paged fulltext requires either --library or --query <ID>")
            scope = "library" if args.library else "entry"
            page = fulltext_page(index, index_path, scope=scope, query=args.query or None,
                                 page_characters=page_characters, cursor=args.cursor)
            print(json.dumps(page, ensure_ascii=False, indent=2))
            return 0
        if args.command == "build":
            fail("CURATED_STYLE_INDEX_IS_PINNED: rebuild from reviewed source dispositions; this command cannot regenerate or overwrite index.json")
        if args.command == "build-resource-catalog":
            index = load_index(index_path)
            data = build_resource_catalog(index, index_path)
            RESOURCE_CATALOG.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(json.dumps({"schema": data["schema"], "path": "templates/styles/catalog.json", "coverage": data["coverage"],
                              "sha256": sha256(RESOURCE_CATALOG.read_bytes())}, ensure_ascii=False))
            return 0
        if args.text is not None and args.command not in {"resource-search", "resource-get"}:
            fail("--text is supported by resource-search --source fonts and resource-get with a font ID")
        if args.command == "resource-overview" and args.scope == "global-map":
            overview = resource_global_map(load_index(index_path))
            if args.json:
                print(json.dumps(overview, ensure_ascii=False, separators=(",", ":")))
            else:
                print(global_map_text(overview), end="")
            return 0
        typography_only = (
            (args.command == "resource-overview" and args.scope == "fonts")
            or (args.command == "resource-search" and args.source == "fonts")
            or (args.command in {"resource-get", "resource-fulltext"}
                and (args.id or "").casefold().startswith(("font:", "type-use:")))
        )
        if args.command.startswith("resource-"):
            index = {} if typography_only else load_index(index_path)
            catalog = {} if typography_only else load_resource_catalog(index_path)
            if args.command == "resource-overview":
                print(json.dumps(resource_overview(catalog, args.scope), ensure_ascii=False, separators=(",", ":")))
                return 0
            if args.command == "resource-family":
                if not args.id:
                    fail("MISSING_ATLAS_FAMILY_ID")
                print(json.dumps(resource_family(catalog, args.id), ensure_ascii=False, separators=(",", ":")))
                return 0
            if args.command in {"resource-compare", "resource-category"}:
                if args.command == "resource-compare":
                    payload = resource_compare(catalog, index, (args.ids or "").split(","))
                else:
                    payload = resource_category(catalog, index, args.source, args.category or "")
                print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
                return 0
            if args.command == "resource-search":
                if not args.query and not args.category and not (args.source == "fonts" and args.text):
                    fail("MISSING_RESOURCE_QUERY")
                try:
                    limit = int(args.limit)
                except (TypeError, ValueError):
                    fail("INVALID_RESOURCE_LIMIT")
                print(json.dumps(resource_search(catalog, args.query, args.source, limit, args.category, args.text), ensure_ascii=False, separators=(",", ":")))
                return 0
            if args.command == "resource-get":
                if not args.id:
                    fail("MISSING_RESOURCE_ID")
                print(json.dumps(resource_get(catalog, args.id, args.text), ensure_ascii=False, separators=(",", ":")))
                return 0
            if args.command == "resource-fulltext":
                if not args.id:
                    fail("MISSING_RESOURCE_ID")
                payload = resource_fulltext(catalog, args.id, args.level.upper(), index, args.member)
                print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
                return 0
        index = load_index(index_path)
        if args.command == "catalog":
            data = rich_catalog(index)
            print(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
            return 0
        if args.command == "list":
            rows = [row for row in index["entries"] if (args.include_placeholders or row.get("selectionEligible", True))
                    and (not args.category or args.category.casefold() in row.get("category", "").casefold())]
            rows = [{key: value for key, value in row.items() if key not in ("searchTerms", "sourcePath", "sourceSha256")}
                    for row in rows]
            print(json.dumps(rows, ensure_ascii=False, indent=2))
            return 0
        if args.command in ("browse", "overview"):
            if index_path.name == "compatibility-index.json":
                for row in index["entries"]:
                    row["_compatibilityIndex"] = True
            data = overview(index, args.category)
            if args.json:
                print(json.dumps(data, ensure_ascii=False, indent=2))
            else:
                print_overview_text(data)
            return 0
        if args.command == "search":
            rows = search(index, args.query, args.category, args.limit)
            if index_path.name == "compatibility-index.json":
                for row in rows:
                    row["compatibilityIndex"] = True
            print(json.dumps(rows, ensure_ascii=False, indent=2))
            return 0
        if args.command == "hash":
            rows = index["entries"] if not args.query else [choose(index, args.query, args.kind)]
            results = []
            for row in rows:
                content = safe_local_file(row["contentPath"]).read_bytes()
                expected = row.get("localSha256")
                results.append({"id": row["id"], "sourceSha256": row.get("sourceSha256"), "localSha256": sha256(content),
                                "matchesIndexedLocal": sha256(content) == expected,
                                "sourceMatchesLocal": row.get("sourceSha256") == sha256(content)})
            print(json.dumps({"count": len(results), "allLocalHashesMatch": all(row["matchesIndexedLocal"] for row in results),
                              "rows": results}, ensure_ascii=False, indent=2))
            return 0
        if args.command == "selection":
            if not args.selection_file:
                fail("MISSING_SELECTION_FILE")
            selection = Path(args.selection_file).read_text(encoding="utf-8-sig")
            queries = selection_queries(selection, args.names)
            if not queries:
                fail("NO_STYLE_IDS_IN_SELECTION")
            # Resolve all requested items before returning any content.
            rows = [choose(index, query, args.kind) for query in queries]
            unavailable = [row["id"] for row in rows if row.get("selectionEligible") is False]
            if unavailable:
                fail("STYLE_SELECTION_CONTAINS_EMPTY_SOURCE_PLACEHOLDERS: " + ", ".join(unavailable))
        else:
            if not args.query:
                fail("MISSING_STYLE_QUERY")
            rows = [choose(index, args.query, args.kind)]
        result = []
        for row in rows:
            content = read_content(row)
            item = {key: value for key, value in row.items() if key != "searchTerms"}
            if index_path.name == "compatibility-index.json":
                item["compatibilityIndex"] = True
            item["libraryVersion"] = index["source"]["sourceIndexSha256"]
            item["content"] = content
            if row.get("previewPath"):
                preview_path = safe_local_file(row["previewPath"])
                if sha256(preview_path.read_bytes()) != row.get("previewLocalSha256"):
                    fail("STYLE_PREVIEW_VERSION_CHANGED: " + row["id"])
            result.append(item)
        if args.command == "describe" and len(result) == 1:
            item = result[0]
            item["format"] = "laohu.motion.style-resource-description/1"
            item["resourceSummary"] = row.get("resourceSummary")
            item["sourceEvidence"] = {
                "path": row.get("sourcePath"),
                "sourceSha256": row.get("sourceSha256"),
                "localPath": row.get("contentPath"),
                "localSha256": row.get("localSha256"),
                "lines": row.get("lines"),
                "licenseId": row.get("licenseId"),
                "dependencies": row.get("dependencies", []),
                "previewPath": row.get("previewPath"),
                "previewSha256": row.get("previewSourceSha256"),
            }
            item["originalText"] = item.pop("content")
            item["nextStep"] = {
                "fulltext": f"node scripts/templates.mjs styles {'compatibility ' if index_path.name == 'compatibility-index.json' else ''}fulltext --query {row['id']}",
                "contextualConsumerSearch": f"node scripts/templates.mjs discover --query \"{row['metadata'].get('look', row.get('name', ''))} {row['metadata'].get('fit', '')}\" --json",
            }
            print(json.dumps(item, ensure_ascii=False, indent=2))
            return 0
        if args.command == "fulltext" and len(result) == 1:
            print(result[0]["content"], end="")
        else:
            print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (ValueError, OSError, KeyError, json.JSONDecodeError) as error:
        print(str(error), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
