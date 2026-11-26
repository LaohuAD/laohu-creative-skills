#!/usr/bin/env python3
"""Audit or regenerate the Motion font inventory from local font bytes."""
import argparse
import json
import os
import re
from collections import defaultdict
from hashlib import sha256
from itertools import groupby
from pathlib import Path

skill = Path('.agents/skills/laohu-motion')
root = skill / 'assets/typography'
runtime = skill / 'templates/runtime'
openmotion = skill / 'assets/motion-library/openmotion'
ext = {'.ttf', '.otf', '.woff', '.woff2'}


def discover_fonts():
    groups = defaultdict(list)
    for directory in (root / 'vendor', runtime, openmotion):
        for path in sorted(directory.rglob('*')):
            if path.is_file() and path.suffix.lower() in ext and {'node_modules', '.cache'}.isdisjoint(path.parts):
                groups[sha256(path.read_bytes()).hexdigest()].append(path)
    return groups


def norm(name):
    return re.sub(r'[^a-z0-9]', '', name.lower())

def ranges(codepoints):
    result = []
    for _, group in groupby(enumerate(sorted(codepoints)), key=lambda item: item[1]-item[0]):
        first = last = next(group)[1]
        for _, last in group:
            pass
        result.append(f'{first:X}-{last:X}' if last != first else f'{first:X}')
    return ' '.join(result)

licenses_by_root = {
    'laohu-effects': 'licenses/OFL.txt',
    'laohu-native-clips': 'lib/fonts/OFL.txt',
    'native-presentation': 'fonts/OFL.txt',
}
style_info = {
    'Noto Sans SC': ('中文黑体', ['思源黑体', '简体中文', '阅读字'], '线条平直、笔画粗细相近；实际字重可做标签、说明和展示层级。'),
    'Source Han Sans CN VF': ('中文黑体', ['思源黑体 CN', '思源黑体', '简体中文', '字幕'], '本地字幕运行时所用的静态 Bold，笔画厚度适合有明确分量的文字。小尺寸需实排。'),
    'Noto Serif SC': ('中文宋体', ['思源宋体', '简体中文', '展示字', '出版', '衬线'], '有明显横细竖粗和笔端起伏。可比较短结论、书页、叙述转折；小字和运动中的细画需看实际帧。'),
    'LXGW WenKai': ('中文书写', ['霞鹜文楷', '霞鶩文楷', '楷体', '手写', '人物笔记', '板书'], '有楷书式笔形和转折，可比较人物笔记、批注与书写展示。密排或短窗须验证读速。'),
    'ZCOOL KuaiLe': ('中文展示', ['站酷快乐体', '短促反应', '漫画'], '字形有圆面、不规则轮廓和明显个性，适合比较少字的表情反应。'),
    'JetBrains Mono': ('等宽字', ['数字', '时间码', '操作演示', '代码'], '等宽拉丁字符，便于对比数字和代码的变化；与中文混排须量真实基线与字面。'),
    'Geist Mono': ('等宽字', ['数字', '时间码', '操作演示', '代码'], '同宽拉丁字符，适合观察代码、数值和小标签的对齐。'),
    'Orbitron': ('拉丁展示', ['数字', '显示器', '科技', '几何'], '较硬朗的几何轮廓，适合比较具有仪器界面依据的少量大号拉丁字和数字。'),
    'Anton': ('拉丁展示', ['窄体', '黑体', '短标题', '动词'], '字面紧凑、笔画份量大；适合在窄空间试短标题。'),
    'Bangers': ('拉丁展示', ['漫画', '拟声', '反应'], '倾斜与粗笔轮廓可供短促反应或拟声字比较。'),
    'Caveat': ('拉丁书写', ['手写', '批注', '笔记'], '拉丁手写笔画，可供批注或来自人物的笔记比较。'),
}
serif = {'Noto Serif Display', 'Playfair Display', 'Gelasio', 'Libre Baskerville', 'EB Garamond', 'CMU Serif'}
formats = {'.ttf': 'truetype', '.otf': 'opentype', '.woff': 'woff', '.woff2': 'woff2'}

def source_kind(path):
    if path.is_relative_to(root):
        return 'shared-vendor'
    if path.is_relative_to(runtime):
        return path.relative_to(runtime).parts[0]
    return 'openmotion'

def paired_license(path, family):
    kind = source_kind(path)
    if kind in licenses_by_root:
        return runtime / kind / licenses_by_root[kind]
    if kind != 'openmotion':
        return path.parent / 'OFL.txt'
    allowed = {norm(family)}
    if family == 'Geist Mono':
        allowed.add('geist')
    for folder in (path.parent, path.parent.parent, path.parent.parent / 'licenses', path.parent.parent.parent / 'licenses'):
        if not folder.is_dir() or folder == openmotion:
            continue
        for candidate in sorted(folder.glob('*.txt')):
            stem = norm(candidate.stem)
            if 'ofl' not in stem:
                continue
            if stem.replace('ofl', '') in allowed:
                return candidate
            if stem == 'ofl' and any(name in norm(candidate.read_text(encoding='utf-8-sig').splitlines()[0])
                                     for name in allowed):
                return candidate
    return None

def build_catalog(previous_catalog):
    try:
        from fontTools.ttLib import TTFont
    except ImportError as error:
        raise SystemExit("Maintenance requires fontTools with WOFF2 support. The resource CLI has no such dependency.") from error
    previous_by_hash = {row["copies"][0]["file"]["sha256"]: row for row in previous_catalog["entries"]}
    vendor = root / 'vendor'
    manifests = json.loads((vendor / 'sources.json').read_text(encoding='utf-8'))
    for name, record in manifests.items():
        path = vendor / name
        for asset, key in ((path, 'sha256'), (path.parent / 'OFL.txt', 'licenseSha256')):
            if not asset.is_file() or sha256(asset.read_bytes()).hexdigest() != record[key]:
                raise ValueError(f"Vendored asset differs from the recorded release: {asset}")
    entries = []
    seen = set()
    for digest, copies in discover_fonts().items():
        path = copies[0]
        record = manifests.get(path.relative_to(vendor).as_posix()) if path.is_relative_to(vendor) else None
        font = TTFont(path, lazy=True)
        family = font['name'].getBestFamilyName()
        if family == 'Noto Serif SC ExtraLight':
            family = 'Noto Serif SC'
        face = font['name'].getBestSubFamilyName()
        style = 'italic' if (font['OS/2'].fsSelection & 1) or 'Italic' in face else 'normal'
        weight = font['OS/2'].usWeightClass
        axes = [{"tag": ax.axisTag, "min": ax.minValue, "default": ax.defaultValue, "max": ax.maxValue}
                for ax in font['fvar'].axes] if 'fvar' in font else []
        weight_axis = next((ax for ax in axes if ax['tag'] == 'wght'), {'min': weight, 'max': weight})
        cmap = {number for number,glyph in font.getBestCmap().items() if glyph != '.notdef'}
        sequences = defaultdict(set)
        for table in font['cmap'].tables:
            if table.format == 14:
                for selector, pairs in table.uvsDict.items():
                    sequences[selector].update(number for number, glyph in pairs
                                               if (glyph is None and number in cmap) or glyph not in (None, '.notdef'))
        identifier = re.sub(r'[^a-z0-9]+', '-', family.lower()).strip('-')
        identifier += '-variable' if axes else ('-regular' if weight == 400 else '-bold' if weight == 700 else f'-{weight}')
        if style == 'italic':
            identifier += '-italic'
        special = {
            'SourceHanSansCN-700.ttf': 'source-han-sans-cn-bold',
            'NotoSerifSC-sub.woff': 'noto-serif-sc-subset',
            'LXGWWenKai-500.woff': 'lxgw-wenkai-medium-subset',
            'cmunrm.woff': 'cmu-serif-roman',
        }
        identifier = special.get(path.name, identifier)
        if path.name.startswith('NotoSansSC-') and path.suffix == '.woff':
            identifier = f'noto-sans-sc-{weight}-subset'
        if path.is_relative_to(openmotion):
            identifier += f'-openmotion-{digest[:8]}'
        previous = previous_by_hash.get(digest)
        identifier = previous["id"] if previous else "font:" + identifier
        if record:
            identifier = record['id']
        if identifier in seen:
            raise ValueError(f"Font ID collision {identifier}: {path}")
        seen.add(identifier)
        if record:
            category, labels, summary = record['category'], [record['label'], *record['aliases']], record['summary']
        elif family in style_info:
            category, labels, summary = style_info[family]
        elif family in serif:
            category, labels, summary = ('拉丁衬线', ['衬线', '拉丁排印', '短标题'], '对照笔端衬线与笔画对比，检验短标题和阅读字的层级。')
        else:
            category, labels, summary = ('拉丁无衬线', ['无衬线', '拉丁排印', '阅读字', '层级'], '观察实际字重、字宽与字腔，按短标题或阅读任务用原句试排。')
        coverage_scope = '发行文件'
        if 'subset' in identifier or 'latin' in path.name:
            coverage_scope = '子集'
        elif path.is_relative_to(openmotion):
            coverage_scope = '来源示例文件'
        script_samples = {'汉字': '中国人', '拉丁': 'AaZz', '数字': '09', '希腊': 'ΑαΩω', '西里尔': 'ЖЯжя', '假名': 'あア'}
        scripts = [kind for kind, sample in script_samples.items() if all(ord(char) in cmap for char in sample)]
        sources = []
        for item in copies:
            notice = paired_license(item, family)
            file_format = 'opentype' if item.suffix.lower() in ('.ttf', '.otf') and font.sfntVersion == 'OTTO' else formats[item.suffix.lower()]
            sources.append({
                'source': source_kind(item),
                'file': {'path': item.as_posix(), 'sha256': digest, 'format': file_format},
                'license': {
                    'id': 'OFL-1.1',
                    'path': notice.as_posix(),
                    'sha256': sha256(notice.read_bytes()).hexdigest(),
                } if notice is not None and notice.is_file() and b'SIL OPEN FONT LICENSE' in notice.read_bytes() else None,
            })
        if previous:
            # Keep the indexed locations for optional local packs that were not installed.
            current_copies = {copy["file"]["path"]: copy for copy in sources}
            ordered_copies = []
            for copy in previous["copies"]:
                relative = copy["file"]["path"]
                if relative in current_copies:
                    ordered_copies.append(current_copies.pop(relative))
                elif copy["source"] == "openmotion" and not Path(relative).is_file():
                    ordered_copies.append(copy)
            sources = ordered_copies + list(current_copies.values())
        copyright = font['name'].getDebugName(0)
        entry = {
            'id': identifier,
            'sourceType': 'font',
            'name': f'{family} · {face if not axes else "Variable"}',
            'family': family,
            'category': category,
            'summary': summary,
            'aliases': labels,
            'style': style,
            'weight': {k: weight_axis[k] for k in ('min', 'max')},
            'axes': axes,
            'scripts': scripts,
            'coverageScope': coverage_scope,
            'glyphCount': len(cmap),
            'copyright': copyright,
            'copies': sources,
        }
        origin = {
            'font:noto-serif-sc-variable':'https://github.com/notofonts/noto-cjk/blob/985fa52c81c1d6692ccdd82bc3656e8fb932fd89/google-fonts/NotoSerifSC%5Bwght%5D.ttf',
            'font:lxgw-wenkai-regular':'https://github.com/lxgw/LxgwWenKai/releases/tag/v1.522',
        }
        if record:
            entry['displayName'] = record['label']
        upstream = record['upstream'] if record else origin.get(identifier) or (previous or {}).get("upstream")
        if upstream:
            entry["upstream"] = upstream
        entry['cmap'] = ranges(cmap)
        if sequences:
            entry['variationSequences'] = {f'{k:X}': ranges(v) for k,v in sorted(sequences.items())}
        entries.append(entry)
        font.close()
    for row in previous_catalog["entries"]:
        if row["id"] not in seen and all(copy["source"] == "openmotion" and not Path(copy["file"]["path"]).is_file()
                                          for copy in row["copies"]):
            entries.append(row)
    return {"schema": "laohu.motion.typography-fonts/1", "entries": sorted(entries, key=lambda row: row["id"])}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="apply the regenerated inventory")
    args = parser.parse_args()
    os.chdir(Path(__file__).resolve().parents[4])
    target = root / "fonts.json"
    previous = json.loads(target.read_text(encoding="utf-8")) if target.is_file() else {"entries": []}
    rebuilt = build_catalog(previous)
    prior_by_id = {row["id"]: row for row in previous["entries"]}
    rebuilt_by_id = {row["id"]: row for row in rebuilt["entries"]}
    changed = sorted(key for key in set(prior_by_id) | set(rebuilt_by_id) if prior_by_id.get(key) != rebuilt_by_id.get(key))
    if changed and args.write:
        target.write_text(json.dumps(rebuilt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    absent = [copy["file"]["path"] for row in rebuilt["entries"] for copy in row["copies"]
              if not Path(copy["file"]["path"]).is_file()]
    print(json.dumps({"assetCount": len(rebuilt["entries"]), "changed": changed, "optionalFilesAbsent": absent,
                      "written": bool(changed and args.write)}, ensure_ascii=False))
    return int(bool(changed and not args.write))


if __name__ == "__main__":
    raise SystemExit(main())
