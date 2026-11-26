#!/usr/bin/env python3
"""Create GlyphAnatomy input from one explicitly licensed local font glyph.

The outline/contour algorithm is adapted from Renoise's MIT-licensed
scripts/glyph_outline.py at commit 3d82d8df22a4e4d942c317fb13264d4a8eb046a6.
This local CLI adds dependency setup, path/license declarations, and strict
font/codepoint/axis gates. It never downloads a font or claims to verify rights.
"""
import argparse
import hashlib
import importlib.metadata
import importlib.util
import json
import math
import os
import platform
import ssl
import subprocess
import sys
import tempfile
import venv
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_ROOT = SCRIPT_DIR.parent
REQUIREMENTS = SCRIPT_DIR / "glyph-outline-requirements.txt"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def resolve_existing(path_value: str, label: str) -> Path:
    try:
        path = Path(path_value).expanduser().resolve(strict=True)
    except OSError as error:
        raise ValueError(f"{label} must resolve to an existing local file: {error}") from error
    if not path.is_file():
        raise ValueError(f"{label} must be a regular local file")
    if path.stat().st_size == 0:
        raise ValueError(f"{label} must not be empty")
    return path


def resolve_work_root(path_value: str) -> Path:
    try:
        root = Path(path_value).expanduser().resolve(strict=True)
    except OSError as error:
        raise ValueError(f"--work-root must already exist: {error}") from error
    if not root.is_dir():
        raise ValueError("--work-root must be an existing directory")
    return root


def is_within(root: Path, candidate: Path) -> bool:
    try:
        candidate.relative_to(root)
        return True
    except ValueError:
        return False


def relative_or_label(root: Path, path: Path) -> str:
    if is_within(root, path):
        return path.relative_to(root).as_posix()
    if is_within(SKILL_ROOT, path):
        return "skill/" + path.relative_to(SKILL_ROOT).as_posix()
    return "external-local-file/" + path.name


def managed_runtime_path(work_root: Path) -> Path:
    requirements_hash = sha256_file(REQUIREMENTS)[:12]
    return work_root / ".cache" / "tmp" / "laohu-glyph-outline" / f"py{sys.version_info.major}.{sys.version_info.minor}-{requirements_hash}"


def print_json(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True))


def check_dependencies() -> tuple[bool, dict]:
    details = {}
    missing = []
    for distribution, module_name in (("fonttools", "fontTools"), ("Brotli", "brotli")):
        try:
            version = importlib.metadata.version(distribution)
            present = importlib.util.find_spec(module_name) is not None
        except importlib.metadata.PackageNotFoundError:
            version = None
            present = False
        details[distribution] = {"version": version, "importable": present}
        if not present:
            missing.append(distribution)
    return not missing, {"packages": details, "missing": missing}


def doctor(_args: argparse.Namespace) -> int:
    ok, details = check_dependencies()
    print_json({"schemaVersion": 1, "status": "ready" if ok else "dependency_missing", **details})
    return 0 if ok else 2


def setup(args: argparse.Namespace) -> int:
    work_root = resolve_work_root(args.work_root)
    runtime = managed_runtime_path(work_root)
    runtime.parent.mkdir(parents=True, exist_ok=True)
    python = runtime / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not python.exists():
        venv.EnvBuilder(with_pip=True, clear=False, symlinks=os.name != "nt").create(runtime)

    cache_dir = work_root / ".cache" / "tmp" / "python-pip"
    cache_dir.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["PIP_CACHE_DIR"] = str(cache_dir)
    env["PIP_DISABLE_PIP_VERSION_CHECK"] = "1"
    # Some macOS Python framework builds lack their default CA bundle path.
    # Use an existing OS trust store when available; never disable certificate checks.
    candidates = [ssl.get_default_verify_paths().cafile, "/etc/ssl/cert.pem", "/opt/homebrew/etc/openssl@3/cert.pem"]
    ca_file = next((Path(value) for value in candidates if value and Path(value).is_file()), None)
    command = [str(python), "-m", "pip", "install", "--no-input", "--requirement", str(REQUIREMENTS)]
    if ca_file:
        command.extend(["--cert", str(ca_file)])
    result = subprocess.run(command, cwd=work_root, env=env, text=True)
    if result.returncode != 0:
        print_json({"schemaVersion": 1, "status": "setup_failed", "runtimeRoot": runtime.relative_to(work_root).as_posix(), "exitCode": result.returncode})
        return result.returncode
    print_json({
        "schemaVersion": 1,
        "status": "ready",
        "runtimeRoot": runtime.relative_to(work_root).as_posix(),
        "python": python.relative_to(work_root).as_posix(),
        "requirementsSha256": sha256_file(REQUIREMENTS),
        "networkUsed": True,
        "globalInstall": False,
    })
    return 0


def glyph_data(font_path: Path, char: str, wght: float | None) -> tuple[dict, dict]:
    try:
        from fontTools.pens.recordingPen import DecomposingRecordingPen
        from fontTools.pens.svgPathPen import SVGPathPen
        from fontTools.ttLib import TTFont
    except ModuleNotFoundError as error:
        raise ValueError("dependencies are missing; run the explicit setup command in the project .cache") from error

    if len(char) != 1:
        raise ValueError("char must be exactly one Unicode scalar; this extractor does not segment grapheme clusters")
    if wght is not None and not math.isfinite(wght):
        raise ValueError("--wght must be finite")

    try:
        font = TTFont(str(font_path), lazy=False)
    except Exception as error:
        raise ValueError(f"fontTools could not parse the local font: {error}") from error

    axis_record = {"requested": wght, "applied": False, "tag": None}
    if "fvar" in font:
        axes = {axis.axisTag: axis for axis in font["fvar"].axes}
        axis = axes.get("wght")
        if axis is None:
            raise ValueError("variable font has no wght axis; choose a font with wght or use a static font")
        selected_weight = 400.0 if wght is None else wght
        if not (math.isfinite(selected_weight) and axis.minValue <= selected_weight <= axis.maxValue):
            raise ValueError(f"wght {selected_weight:g} is outside this font's supported range [{axis.minValue:g}, {axis.maxValue:g}]")
        from fontTools.varLib import instancer
        try:
            font = instancer.instantiateVariableFont(font, {"wght": selected_weight})
        except Exception as error:
            raise ValueError(f"fontTools could not instantiate the requested wght axis: {error}") from error
        axis_record = {"requested": wght, "applied": selected_weight, "tag": "wght", "minimum": axis.minValue, "maximum": axis.maxValue}
    elif wght is not None:
        raise ValueError("--wght was supplied for a static font; select a variable font with a wght axis")

    cmap = font.getBestCmap() or {}
    codepoint = ord(char)
    gname = cmap.get(codepoint)
    if not gname:
        raise ValueError(f"font cmap does not contain U+{codepoint:04X} ({char})")

    gs = font.getGlyphSet()
    svg = SVGPathPen(gs)
    gs[gname].draw(svg)

    contours = []
    if "glyf" in font:
        glyf = font["glyf"]
        glyph = glyf[gname]
        coords, ends, flags = glyph.getCoordinates(glyf)
        start = 0
        for end in ends:
            contours.append([[int(coords[index][0]), int(coords[index][1]), int(flags[index] & 1)] for index in range(start, end + 1)])
            start = end + 1
    else:  # CFF: retain on-curve and control points from the drawing commands.
        rec = DecomposingRecordingPen(gs)
        gs[gname].draw(rec)
        cur = []
        for op, pts in rec.value:
            if op == "moveTo":
                cur = [[*map(int, pts[0]), 1]]
            elif op in ("lineTo", "curveTo", "qCurveTo"):
                cur += [[*map(int, point), 0] for point in pts[:-1]] + [[*map(int, pts[-1]), 1]]
            elif op in ("closePath", "endPath") and cur:
                contours.append(cur)
                cur = []

    os2 = font["OS/2"]
    hhea = font["hhea"]
    result = {
        "char": char,
        "font": font["name"].getDebugName(1),
        "upm": font["head"].unitsPerEm,
        "ascender": hhea.ascent,
        "descender": hhea.descent,
        "xHeight": getattr(os2, "sxHeight", 0),
        "capHeight": getattr(os2, "sCapHeight", 0),
        "advance": font["hmtx"][gname][0],
        "d": svg.getCommands(),
        "contours": contours,
    }
    details = {
        "glyphName": gname,
        "codepoint": f"U+{codepoint:04X}",
        "axis": axis_record,
        "contourCount": len(contours),
        "pointCount": sum(len(contour) for contour in contours),
    }
    font.close()
    return result, details


def export(args: argparse.Namespace) -> int:
    work_root = resolve_work_root(args.work_root)
    font_path = resolve_existing(args.font, "--font")
    license_path = resolve_existing(args.license_reference, "--license-reference")
    if len(args.license) > 240 or not args.license.strip():
        raise ValueError("--license must be a concise, non-empty caller-declared rights label")
    output_input = Path(args.output).expanduser()
    if output_input.is_absolute():
        output_candidate = output_input.resolve(strict=False)
    else:
        output_candidate = (work_root / output_input).resolve(strict=False)
    output_parent = output_candidate.parent.resolve(strict=True)
    output = output_parent / output_candidate.name
    if not is_within(work_root, output) or not output_parent.is_dir():
        raise ValueError("output must stay inside the existing --work-root directory tree")
    receipt = output.with_suffix(output.suffix + ".manifest.json")
    if output.exists() or receipt.exists():
        raise ValueError("output and receipt must be new paths; choose another path instead of overwriting")

    data, details = glyph_data(font_path, args.char, args.wght)
    encoded = (json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    font_digest = sha256_file(font_path)
    license_digest = sha256_file(license_path)
    output_digest = hashlib.sha256(encoded).hexdigest()
    manifest = {
        "schemaVersion": 1,
        "status": "exported",
        "generator": {"id": "laohu-glyph-outline", "pythonVersion": platform.python_version(), "fonttools": importlib.metadata.version("fonttools"), "Brotli": importlib.metadata.version("Brotli")},
        "font": {"path": relative_or_label(work_root, font_path), "sha256": font_digest, "bytes": font_path.stat().st_size, "family": data["font"]},
        "glyph": {"char": args.char, **details},
        "rights": {"status": "caller-declared", "label": args.license.strip(), "reference": relative_or_label(work_root, license_path), "referenceSha256": license_digest, "verifiedAgainstFont": False},
        "output": {"path": output.relative_to(work_root).as_posix(), "sha256": output_digest, "bytes": len(encoded), "consumer": "laohu-authored-shot / glyph-anatomy / parameters.glyph"},
    }
    manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    temporary_paths = []
    try:
        for target, payload in ((output, encoded), (receipt, manifest_bytes)):
            descriptor, temporary = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".tmp", dir=output_parent)
            temporary_path = Path(temporary)
            temporary_paths.append(temporary_path)
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(payload)
                stream.flush()
                os.fsync(stream.fileno())
        # Hard-link creation is atomic and fails if either destination exists.
        # The temporary and final paths share a directory, so no cross-volume copy occurs.
        created = []
        try:
            os.link(temporary_paths[0], output)
            created.append(output)
            os.link(temporary_paths[1], receipt)
            created.append(receipt)
        except Exception:
            for target in created:
                try:
                    target.unlink()
                except FileNotFoundError:
                    pass
            raise ValueError("output or receipt path already exists or cannot be committed without replacement")
    finally:
        for temporary_path in temporary_paths:
            try:
                temporary_path.unlink()
            except FileNotFoundError:
                pass

    print_json({"schemaVersion": 1, "status": "exported", "output": output.relative_to(work_root).as_posix(), "manifest": receipt.relative_to(work_root).as_posix(), "fontSha256": font_digest, "glyph": details, "rightsStatus": "caller-declared; license/font association not independently verified"})
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("doctor", help="check fontTools/Brotli in the active Python environment")
    setup_parser = commands.add_parser("setup", help="install pinned dependencies into this work root's .cache")
    setup_parser.add_argument("--work-root", required=True)
    export_parser = commands.add_parser("export", help="export one glyph from a local font and caller-declared license")
    export_parser.add_argument("--work-root", required=True)
    export_parser.add_argument("--font", required=True, help="path to a local TTF/OTF/WOFF/WOFF2 file")
    export_parser.add_argument("--license", required=True, help="caller-declared license/rights label")
    export_parser.add_argument("--license-reference", required=True, help="existing local license text or rights record")
    export_parser.add_argument("--wght", type=float, default=None, help="weight on a variable font's wght axis; defaults to 400 for variable fonts")
    export_parser.add_argument("char", help="exactly one Unicode scalar, such as 胡")
    export_parser.add_argument("output", help="new JSON file path within --work-root")
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        if args.command == "doctor":
            return doctor(args)
        if args.command == "setup":
            return setup(args)
        if args.command == "export":
            return export(args)
        parser.error("unknown command")
    except ValueError as error:
        print_json({"schemaVersion": 1, "status": "rejected", "reason": str(error)})
        return 2
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
