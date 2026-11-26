#!/usr/bin/env python3
"""Search checked local SFX assets and optionally use the official Freesound API."""

from __future__ import annotations

import argparse
import datetime as _datetime
from email.message import Message
import hashlib
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from urllib.error import URLError
from urllib.parse import quote, urlencode, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener
import zipfile


SCHEMA_VERSION = 1
PROBE_UNAVAILABLE_EXIT = 8
FREESOUND_API = "https://freesound.org/apiv2/"
MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024
SKILL_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INDEX = SKILL_ROOT / "assets" / "audio" / "index.json"

# Structured CLI filters accept exact labels and these explicit positive aliases only.
# Keep free-text query matching separate; do not infer semantics from substrings.
ACTION_ALIASES = {
    "land": "landing", "landing": "landing", "落地": "landing",
    "contact": "contact", "接触": "contact",
    "impact": "impact", "撞击": "impact",
    "tap": "tap", "tapping": "tap", "轻触": "tap",
    "click": "click", "clicking": "click", "点击": "click",
    "confirm": "confirm", "confirmation": "confirm", "确认": "confirm",
    "interface": "interface",
    "latch": "latch", "latching": "latch", "门闩": "latch",
    "close": "close", "closing": "close", "关闭": "close",
    "closure": "closure", "闭合": "closure",
    "turn": "turn", "turning": "turn",
    "flip": "flip", "flipping": "flip", "翻页": "flip", "翻书": "flip",
    "page": "page", "书页": "page",
    "move": "move", "moving": "move", "移动": "move",
    "shift": "shift", "shifting": "shift",
    "fabric": "fabric",
    "place": "place", "placing": "place", "放置": "place", "安放": "place",
    "settle": "settle", "settling": "settle",
    "slide": "slide", "sliding": "slide", "滑动": "slide",
    "footstep": "footstep", "脚步": "footstep",
    "step": "step", "踩踏": "step",
    "walk": "walk", "walking": "walk", "行走": "walk",
    "reveal": "reveal", "揭示": "reveal",
    "appear": "appear", "appearance": "appear", "出现": "appear",
    "pop": "pop", "弹出": "pop",
    "transition": "transition", "转场": "transition",
    "toggle": "toggle", "切换": "toggle",
    "scroll": "scroll", "滚动": "scroll",
}
MATERIAL_ALIASES = {
    "wood": "wood", "wooden": "wood", "wood floor": "wood", "wood-floor": "wood",
    "木": "wood", "木质": "wood", "木头": "wood", "木地板": "wood",
    "metal": "metal", "metallic": "metal", "metal surface": "metal",
    "金属": "metal", "金属表面": "metal",
    "cloth": "cloth", "fabric": "cloth", "布": "cloth", "布料": "cloth", "衣料": "cloth",
    "card": "card", "扑克牌": "card", "卡片": "card",
    "book/page": "book/page", "book": "book/page", "page": "book/page", "paper": "book/page",
    "书页": "book/page", "纸页": "book/page", "纸张": "book/page",
    "soft-contact": "soft-contact", "soft contact": "soft-contact", "soft": "soft-contact",
    "软接触": "soft-contact", "柔软接触": "soft-contact",
    "glass": "glass", "glass surface": "glass", "玻璃": "glass",
    "plate": "plate", "metal plate": "plate",
    "tin": "tin", "tin surface": "tin",
    "carpet": "carpet", "地毯": "carpet",
    "concrete": "concrete", "水泥": "concrete", "混凝土": "concrete",
    "grass": "grass", "草地": "grass",
    "snow": "snow", "雪地": "snow",
    "firm-surface": "firm-surface", "firm surface": "firm-surface",
    "hard-surface": "hard-surface", "hard surface": "hard-surface",
}
MUSIC_USE_CASES = {
    "narration-bed-light-advance",
    "lively-explanation",
    "rhythm-demonstration-collage",
    "tense-reveal",
    "no-voice-chapter-showcase",
    "closing-resolution",
}
APPLICABILITY_USE_CASES = MUSIC_USE_CASES | {"all"}


def applicability_exclusions(asset, file_sha256, requested_use_case, source_start, source_end):
    """Match durable negative feedback by original bytes, canonical use, and overlapping source range."""
    exclusions = asset.get("applicabilityExclusions", [])
    if not isinstance(exclusions, list):
        return [{"status": "invalid", "reason": "applicabilityExclusions must be an array"}]
    matches = []
    for record in exclusions:
        if not isinstance(record, dict):
            matches.append({"status": "invalid", "reason": "an applicability exclusion is not an object"})
            continue
        recorded_hash = record.get("fileSha256")
        if not isinstance(recorded_hash, str) or not re.fullmatch(r"[a-f0-9]{64}", recorded_hash, flags=re.I):
            matches.append({"status": "invalid", "reason": "an applicability exclusion lacks a valid source hash"})
            continue
        if recorded_hash.casefold() != str(file_sha256 or "").casefold():
            continue
        source_range = record.get("sourceRange")
        try:
            excluded_start = float(source_range["inSec"])
            excluded_end = float(source_range["outSec"])
        except (TypeError, KeyError, ValueError):
            matches.append({"status": "invalid", "reason": "an applicability exclusion has an invalid source range"})
            continue
        if (not math.isfinite(excluded_start) or not math.isfinite(excluded_end)
                or excluded_start < 0 or excluded_end <= excluded_start):
            matches.append({"status": "invalid", "reason": "an applicability exclusion has an invalid source range"})
            continue
        if source_start is None or source_end is None:
            overlaps = True
        else:
            overlaps = source_start < excluded_end and excluded_start < source_end
        if not overlaps:
            continue
        use_case = record.get("useCase")
        if use_case not in APPLICABILITY_USE_CASES:
            matches.append({"status": "invalid", "reason": "an applicability exclusion has an unsupported useCase"})
            continue
        if use_case == "all":
            matches.append({"status": "excluded", "reason": record.get("reason"), "useCase": use_case,
                            "sourceRange": source_range, "recordedAtUtc": record.get("recordedAtUtc")})
        elif requested_use_case is None:
            matches.append({"status": "context-required", "reason": record.get("reason"), "useCase": use_case,
                            "sourceRange": source_range, "recordedAtUtc": record.get("recordedAtUtc")})
        elif requested_use_case == use_case:
            matches.append({"status": "excluded", "reason": record.get("reason"), "useCase": use_case,
                            "sourceRange": source_range, "recordedAtUtc": record.get("recordedAtUtc")})
    return matches


def applicability_exclusions_for_hash(assets, file_sha256, requested_use_case, source_start, source_end):
    """Aggregate scoped negative feedback from every indexed ID for the same original bytes."""
    digest = str(file_sha256 or "").casefold()
    if not re.fullmatch(r"[a-f0-9]{64}", digest):
        return []
    matches = []
    for asset in assets:
        if not isinstance(asset, dict) or str(asset.get("sha256", "")).casefold() != digest:
            continue
        for row in applicability_exclusions(asset, digest, requested_use_case, source_start, source_end):
            matches.append({**row, "recordedOnAssetId": asset.get("id")})
    return matches


def digest_file(path):
    value = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def json_result(operation, status, **fields):
    result = {"schemaVersion": SCHEMA_VERSION, "operation": operation, "status": status}
    result.update(fields)
    return result


def write_result(result, exit_code=0):
    sys.stdout.write(json.dumps(result, ensure_ascii=False, sort_keys=True) + "\n")
    return exit_code


def arrangement_source(args, operation):
    """Use Arrangement's local, multi-provider source library from Motion's existing CLI."""
    work_root = Path(args.work_root).expanduser().absolute().resolve()
    if not work_root.is_dir():
        return json_result(operation, "work_root_missing", workRoot=str(work_root)), 2
    script = SKILL_ROOT.parent / "laohu-arrangement" / "scripts" / "laohu-sound.py"
    if script.is_symlink() or not script.is_file():
        return json_result(operation, "dependency_missing", error="Arrangement local source library is unavailable"), 2
    cache_dir = Path(args.cache_dir).expanduser() if args.cache_dir else work_root / ".cache" / "sound"
    tmp_dir = Path(args.tmp_dir).expanduser() if args.tmp_dir else work_root / ".cache" / "tmp" / "sound"
    cache_dir = cache_dir if cache_dir.is_absolute() else work_root / cache_dir
    tmp_dir = tmp_dir if tmp_dir.is_absolute() else work_root / tmp_dir
    local_python = cache_dir / "venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    configured_python = args.python or os.environ.get("LAOHU_SOUND_PYTHON")
    python = configured_python or (str(local_python) if local_python.is_file() else "python3.12")
    child_env = os.environ.copy()
    if not child_env.get("SSL_CERT_FILE"):
        try:
            cert_result = subprocess.run(
                [python, "-c", "import certifi;print(certifi.where())"],
                check=False, capture_output=True, text=True,
            )
            cert_bundle = Path(cert_result.stdout.strip()).expanduser() if cert_result.returncode == 0 else None
            if cert_bundle and cert_bundle.is_file():
                child_env["SSL_CERT_FILE"] = str(cert_bundle.resolve())
        except OSError:
            pass
    command = [python, str(script), "--work-root", str(work_root),
               "--cache-dir", str(cache_dir.absolute()), "--tmp-dir", str(tmp_dir.absolute())]
    if args.ffmpeg:
        command.extend(["--ffmpeg", args.ffmpeg])
    if args.ffprobe:
        command.extend(["--ffprobe", args.ffprobe])
    if operation == "source-search":
        command.extend(["search", "--query", args.query, "--providers", args.providers,
                        "--role", args.role, "--limit", str(args.limit), "--pages", str(args.pages)])
        for name, value in (("--action", args.action), ("--material", args.material),
                            ("--min-duration-sec", args.min_duration_sec),
                            ("--max-duration-sec", args.max_duration_sec),
                            ("--freesound-license", args.freesound_license), ("--pack", args.pack),
                            ("--use-case", getattr(args, "use_case", None)),
                            ("--track-type", (getattr(args, "track_type", None)
                                               if getattr(args, "track_type", "any") != "any" else None)),
                            ("--source-in-sec", getattr(args, "source_in_sec", None)),
                            ("--source-out-sec", getattr(args, "source_out_sec", None)),
                            ("--voice-context", getattr(args, "voice_context", None)),
                            ("--visual-context", getattr(args, "visual_context", None)),
                            ("--pixabay-playlist", getattr(args, "pixabay_playlist", None))):
            if value is not None and value != "":
                command.extend([name, str(value)])
    else:
        command.append("get")
        for key in args.key:
            command.extend(["--key", key])
        command.extend(["--out-dir", args.out_dir])
    try:
        completed = subprocess.run(command, check=False, capture_output=True, text=True, env=child_env)
    except OSError as error:
        return json_result(operation, "dependency_missing", error=str(error), command=command), 2
    try:
        result = json.loads(completed.stdout)
    except (ValueError, TypeError):
        return json_result(operation, "provider_cli_invalid_json", returnCode=completed.returncode,
                           stderr=completed.stderr[-4000:], stdout=completed.stdout[-4000:], command=command), 3
    if not isinstance(result, dict) or result.get("schemaVersion") != 1:
        return json_result(operation, "provider_cli_invalid_schema", returnCode=completed.returncode,
                           result=result, command=command), 3
    return result, completed.returncode


def path_inside(parent, child):
    try:
        Path(child).resolve().relative_to(Path(parent).resolve())
        return True
    except ValueError:
        return False


def work_and_cache(args):
    work_root = Path(args.work_root).absolute().resolve()
    if not work_root.is_dir():
        raise ValueError("work root is not an existing directory")
    cache_arg = getattr(args, "cache_dir", None)
    if cache_arg:
        cache_root = Path(cache_arg)
        if not cache_root.is_absolute():
            cache_root = work_root / cache_root
    else:
        cache_root = (
            work_root
            / ".cache"
            / "validation"
            / "laohu-arrangement-sfx"
            / _datetime.date.today().isoformat()
        )
    cache_root = cache_root.absolute().resolve()
    allowed_cache_root = (work_root / ".cache").resolve()
    if not path_inside(work_root, allowed_cache_root):
        raise ValueError("project .cache must resolve inside the explicit work project")
    if not path_inside(allowed_cache_root, cache_root):
        raise ValueError("cache must remain inside the explicit work project's .cache directory")
    cache_root.mkdir(parents=True, exist_ok=True)
    return work_root, cache_root


def resolve_work_path(work_root, raw, default=None):
    if raw is None:
        return Path(default).absolute().resolve()
    candidate = Path(raw)
    if not candidate.is_absolute():
        candidate = work_root / candidate
    candidate = candidate.absolute().resolve()
    if not path_inside(work_root, candidate):
        raise ValueError("input/output paths must remain inside the explicit work project")
    return candidate


def tokenize(value):
    return [part.casefold() for part in re.findall(r"[\w]+", value, flags=re.UNICODE) if part.strip()]


def inspect_audio(path, ffprobe="ffprobe", expected_codec=None):
    target = Path(path)
    if not target.is_file() or target.is_symlink() or target.stat().st_size == 0:
        return None, "audio file is missing, empty, or not a regular file", "file_invalid"
    if Path(ffprobe).is_absolute():
        executable = str(Path(ffprobe))
        if not Path(executable).is_file():
            return None, "ffprobe executable is unavailable", "probe_unavailable"
    else:
        executable = shutil.which(ffprobe)
        if not executable:
            return None, "ffprobe executable is unavailable", "probe_unavailable"
    try:
        startup = subprocess.run(
            [executable, "-version"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return None, "ffprobe could not start: " + str(exc), "probe_unavailable"
    if startup.returncode != 0:
        detail = startup.stderr.strip() or startup.stdout.strip() or "non-zero version check exit"
        return None, "ffprobe could not start: " + detail, "probe_unavailable"
    try:
        completed = subprocess.run(
            [executable, "-v", "error", "-show_streams", "-show_format", "-of", "json", str(target)],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return None, "ffprobe could not inspect audio: " + str(exc), "probe_unavailable"
    if completed.returncode != 0:
        detail = completed.stderr.strip() or "non-zero exit"
        startup_markers = (
            "dyld", "image not found", "error while loading shared libraries",
            "cannot open shared object file", "failed to load shared library",
        )
        if any(marker in detail.casefold() for marker in startup_markers):
            return None, "ffprobe could not start: " + detail, "probe_unavailable"
        return None, "ffprobe rejected the file: " + detail, "file_invalid"
    try:
        probe = json.loads(completed.stdout)
        streams = [stream for stream in probe.get("streams", []) if stream.get("codec_type") == "audio"]
        duration = float(probe.get("format", {}).get("duration", "nan"))
    except (TypeError, ValueError, json.JSONDecodeError):
        return None, "ffprobe returned invalid metadata", "file_invalid"
    if not streams or not math.isfinite(duration) or duration <= 0:
        return None, "file has no measurable audio stream duration", "file_invalid"
    codec = streams[0].get("codec_name")
    if expected_codec and codec != expected_codec:
        return None, "download is not the expected MP3 audio preview", "file_invalid"
    return {
        "format": probe.get("format", {}).get("format_name"),
        "codec": codec,
        "durationSec": duration,
        "sampleRate": int(streams[0]["sample_rate"]) if str(streams[0].get("sample_rate", "")).isdigit() else None,
        "channels": streams[0].get("channels"),
        "sizeBytes": target.stat().st_size,
        "sha256": digest_file(target),
    }, None, None


class RegistrationFailure(Exception):
    def __init__(self, status, message, exit_code=4):
        super().__init__(message)
        self.status = status
        self.exit_code = exit_code


def registration_path(work_root, raw, label):
    if not isinstance(raw, str) or not raw.strip():
        raise RegistrationFailure("invalid_path", f"{label} path is required")
    candidate = Path(raw).expanduser()
    if not candidate.is_absolute():
        candidate = work_root / candidate
    if candidate.is_symlink():
        raise RegistrationFailure("invalid_path", f"{label} must not be a symlink")
    try:
        resolved = candidate.absolute().resolve()
    except (OSError, RuntimeError) as exc:
        raise RegistrationFailure("invalid_path", f"could not resolve {label}: {exc}") from exc
    if not path_inside(work_root, resolved):
        raise RegistrationFailure("path_escape", f"{label} resolves outside the explicit work project")
    if not resolved.is_file():
        raise RegistrationFailure("invalid_path", f"{label} is not an existing regular file")
    return resolved


def license_spec(license_id):
    if license_id == "CC0-1.0":
        return {
            "title": "CC0 1.0 Universal",
            "url": "https://creativecommons.org/publicdomain/zero/1.0/",
            "proofTokens": ("cc0", "publicdomain/zero/1.0"),
            "attribution": "Attribution is not required by CC0; source credit is retained for provenance.",
        }
    titles = {
        "1.0": "Creative Commons Attribution 1.0 Generic",
        "2.0": "Creative Commons Attribution 2.0 Generic",
        "2.5": "Creative Commons Attribution 2.5 Generic",
        "3.0": "Creative Commons Attribution 3.0 Unported",
        "4.0": "Creative Commons Attribution 4.0 International",
    }
    match = re.fullmatch(r"CC-BY-(1\.0|2\.0|2\.5|3\.0|4\.0)", license_id or "")
    if not match:
        return None
    version = match.group(1)
    return {
        "title": titles[version],
        "url": f"https://creativecommons.org/licenses/by/{version}/",
        "proofTokens": ("creative commons attribution", f"/licenses/by/{version}"),
        "attribution": "Attribution required: retain the creator, source page, exact license link, and note modifications when applicable.",
    }


def source_register(args):
    """Register one verified Arrangement get result into an existing audio asset index."""
    try:
        work_root = Path(args.work_root).expanduser().absolute().resolve()
        if not work_root.is_dir():
            raise RegistrationFailure("work_root_missing", "work root is not an existing directory")
        index_raw = args.index or "assets/audio/index.json"
        index_path = registration_path(work_root, str(index_raw), "asset index")
        if index_path.is_symlink():
            raise RegistrationFailure("invalid_path", "asset index must not be a symlink")
        index_dir = index_path.parent.resolve()
        try:
            original_index_bytes = index_path.read_bytes()
            document = json.loads(original_index_bytes.decode("utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise RegistrationFailure("index_error", f"could not read asset index JSON: {exc}") from exc
        if not isinstance(document, dict) or document.get("schemaVersion") != 1 or not isinstance(document.get("assets"), list):
            raise RegistrationFailure("index_error", "asset index must be a schemaVersion 1 object with an assets array")
        if any(not isinstance(item, dict) for item in document["assets"]):
            raise RegistrationFailure("index_error", "every indexed asset must be an object")

        asset_id = args.asset_id
        if not isinstance(asset_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]*", asset_id):
            raise RegistrationFailure("invalid_asset_id", "asset ID must use stable ASCII letters, digits, dot, underscore, colon, or dash")
        existing_ids = [item.get("id") for item in document["assets"]]
        if asset_id in existing_ids:
            raise RegistrationFailure("duplicate_id", f"asset ID already exists in the index: {asset_id}")
        if len(existing_ids) != len(set(value for value in existing_ids if isinstance(value, str))):
            raise RegistrationFailure("index_error", "asset index already contains duplicate string IDs")

        receipt_path = registration_path(work_root, args.source_get_receipt, "source-get receipt")
        receipt_bytes = receipt_path.read_bytes()
        try:
            receipt = json.loads(receipt_bytes.decode("utf-8"))
        except (UnicodeError, json.JSONDecodeError) as exc:
            raise RegistrationFailure("receipt_error", f"source-get receipt is not valid JSON: {exc}") from exc
        if not isinstance(receipt, dict) or receipt.get("schemaVersion") != 1 or not isinstance(receipt.get("results"), list):
            raise RegistrationFailure("receipt_error", "source-get receipt must be a schemaVersion 1 object with results")
        matching = [row for row in receipt["results"] if isinstance(row, dict) and row.get("key") == args.key]
        if len(matching) != 1:
            raise RegistrationFailure("receipt_error", "source-get receipt must contain exactly one result for the requested key")
        row = matching[0]
        if row.get("status") != "downloaded" or not isinstance(row.get("asset"), dict):
            raise RegistrationFailure("receipt_error", "requested provider result was not downloaded successfully")
        source_asset = row["asset"]
        if source_asset.get("key") != args.key:
            raise RegistrationFailure("receipt_error", "asset key does not match its enclosing source-get result")
        key_match = re.fullmatch(r"(mk|fs|px|kn):(.+)", args.key or "")
        if not key_match:
            raise RegistrationFailure("receipt_error", "source-get key is not a supported provider file key")
        provider_by_prefix = {"mk": "mixkit", "fs": "freesound", "px": "pixabay", "kn": "kenney"}
        prefix, provider_key = key_match.groups()
        provider = provider_by_prefix[prefix]
        if source_asset.get("provider") != provider:
            raise RegistrationFailure("receipt_error", "provider name does not match the source-get key prefix")
        if source_asset.get("reviewStatus") != "candidate-unreviewed":
            # Even a modified receipt cannot raise review status during registration.
            source_review_boundary = source_asset.get("reviewStatus")
        else:
            source_review_boundary = "candidate-unreviewed"

        source_file = registration_path(work_root, source_asset.get("path"), "downloaded audio file")
        expected_hash = source_asset.get("sha256")
        if not isinstance(expected_hash, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_hash, flags=re.IGNORECASE):
            raise RegistrationFailure("source_integrity_error", "source-get receipt lacks a valid SHA-256", 6)
        actual_hash = digest_file(source_file)
        if actual_hash.casefold() != expected_hash.casefold():
            raise RegistrationFailure("hash_mismatch", f"downloaded audio SHA-256 differs from source-get receipt: expected {expected_hash}, got {actual_hash}", 6)
        expected_bytes = source_asset.get("bytes")
        if isinstance(expected_bytes, int) and source_file.stat().st_size != expected_bytes:
            raise RegistrationFailure("size_mismatch", "downloaded audio byte size differs from source-get receipt", 6)
        if source_asset.get("sourcePageStatus") != "available":
            raise RegistrationFailure("source_unverified", "source-get receipt does not contain an available canonical source page", 5)
        source_page = source_asset.get("sourcePage")
        parsed_page = urlparse(source_page or "")
        allowed_hosts = {
            "mixkit": {"mixkit.co", "www.mixkit.co"},
            "freesound": {"freesound.org", "www.freesound.org"},
            "pixabay": {"pixabay.com", "www.pixabay.com"},
            "kenney": {"kenney.nl", "www.kenney.nl"},
        }
        if parsed_page.scheme != "https" or parsed_page.hostname not in allowed_hosts[provider]:
            raise RegistrationFailure("source_unverified", "source page must be HTTPS on the selected provider's canonical host", 5)

        relative_file = Path(args.file)
        if relative_file.is_absolute() or not relative_file.parts or any(part in {".", ".."} for part in relative_file.parts):
            raise RegistrationFailure("path_escape", "asset file must be a clean path relative to the asset index directory")
        target = index_dir / relative_file
        target_resolved = target.absolute().resolve()
        if not path_inside(work_root, target_resolved) or not path_inside(index_dir, target_resolved):
            raise RegistrationFailure("path_escape", "asset output resolves outside the asset index directory or work project")
        if target == index_path or target.is_symlink() or target.exists():
            raise RegistrationFailure("output_conflict", f"asset output already exists or aliases the index: {target}", 7)

        archive_path = None
        archive_hash = None
        pack_name = args.source_pack
        source_version = args.source_version
        original_path = None
        if provider == "kenney":
            slug = provider_key.split("/", 1)[0]
            if not re.fullmatch(r"[a-z0-9-]+", slug):
                raise RegistrationFailure("receipt_error", "Kenney key does not contain a valid pack slug")
            if not pack_name or re.sub(r"[^a-z0-9]+", "-", pack_name.casefold()).strip("-") != slug:
                raise RegistrationFailure("source_unverified", "Kenney pack name must identify the package in the provider key", 5)
            source_version = source_version.strip() if isinstance(source_version, str) and source_version.strip() else None
            archive_path = registration_path(work_root, args.source_archive, "source package archive")
            archive_hash = digest_file(archive_path)
            original_path = provider_key.split("/", 1)[1] if "/" in provider_key else None
        elif args.source_archive:
            archive_path = registration_path(work_root, args.source_archive, "source package archive")
            archive_hash = digest_file(archive_path)

        license_proof = None
        license_proof_relative = None
        license_evidence_project_relative = None
        license_proof_hash = None
        license_data = license_spec(args.license_id)
        if not license_data:
            return json_result(
                "source-register", "rights_unverified",
                registered=False, assetIndex=str(index_path), sourceGetReceiptSha256=hashlib.sha256(receipt_bytes).hexdigest(),
                candidate={"id": asset_id, "sourceFile": source_file.relative_to(work_root).as_posix(),
                           "proposedFile": relative_file.as_posix(), "sha256": actual_hash,
                           "sourcePage": source_page, "reviewStatus": "candidate-unreviewed"},
                error="license is missing or is not a supported exact CC0 1.0 / CC BY version; no formal index asset was written",
            ), 5
        if provider != "kenney":
            license_info = source_asset.get("license") if isinstance(source_asset.get("license"), dict) else {}
            provider_label = str(license_info.get("providerLabel", "")).casefold()
            expected_label = "cc0" if args.license_id == "CC0-1.0" else "attribution"
            if expected_label not in provider_label:
                return json_result(
                    "source-register", "rights_unverified",
                    registered=False, assetIndex=str(index_path), sourceGetReceiptSha256=hashlib.sha256(receipt_bytes).hexdigest(),
                    candidate={"id": asset_id, "sourceFile": source_file.relative_to(work_root).as_posix(),
                               "proposedFile": relative_file.as_posix(), "sha256": actual_hash,
                               "sourcePage": source_page, "reviewStatus": "candidate-unreviewed"},
                    error="provider license label does not match the exact declared license; no formal index asset was written",
                ), 5
        if not args.license_proof:
            return json_result(
                "source-register", "rights_unverified",
                registered=False, assetIndex=str(index_path), sourceGetReceiptSha256=hashlib.sha256(receipt_bytes).hexdigest(),
                candidate={"id": asset_id, "sourceFile": source_file.relative_to(work_root).as_posix(),
                           "proposedFile": relative_file.as_posix(), "sha256": actual_hash,
                           "sourcePage": source_page, "reviewStatus": "candidate-unreviewed"},
                error="license evidence is missing; no formal index asset was written",
            ), 5
        license_proof = registration_path(work_root, args.license_proof, "package license evidence")
        license_text = license_proof.read_text(encoding="utf-8", errors="replace").casefold()
        if any(token not in license_text for token in license_data["proofTokens"]):
            return json_result(
                "source-register", "rights_unverified",
                registered=False, assetIndex=str(index_path), sourceGetReceiptSha256=hashlib.sha256(receipt_bytes).hexdigest(),
                candidate={"id": asset_id, "sourceFile": source_file.relative_to(work_root).as_posix(),
                           "proposedFile": relative_file.as_posix(), "sha256": actual_hash,
                           "sourcePage": source_page, "reviewStatus": "candidate-unreviewed"},
                error="license evidence does not contain the exact declared license identifier and canonical license path; no formal index asset was written",
            ), 5
        license_evidence_project_relative = license_proof.relative_to(work_root).as_posix()
        if provider == "kenney":
            try:
                license_proof_relative = license_proof.relative_to(index_dir).as_posix()
            except ValueError as exc:
                raise RegistrationFailure("invalid_path", "Kenney package License.txt must remain within the asset index directory") from exc
        elif source_page.casefold() not in license_text or license_data["url"].casefold() not in license_text:
            return json_result(
                "source-register", "rights_unverified",
                registered=False, assetIndex=str(index_path), sourceGetReceiptSha256=hashlib.sha256(receipt_bytes).hexdigest(),
                candidate={"id": asset_id, "sourceFile": source_file.relative_to(work_root).as_posix(),
                           "proposedFile": relative_file.as_posix(), "sha256": actual_hash,
                           "sourcePage": source_page, "reviewStatus": "candidate-unreviewed"},
                error="individual source-page evidence must bind the selected file page and exact canonical license URL; no formal index asset was written",
            ), 5
        license_proof_hash = digest_file(license_proof)
        if provider == "kenney":
            try:
                with zipfile.ZipFile(archive_path) as package:
                    original_members = [name for name in package.namelist()
                                        if name.replace("\\", "/").lstrip("./") == original_path]
                    license_members = [name for name in package.namelist()
                                       if Path(name.replace("\\", "/")).name.casefold() == "license.txt"]
                    if len(original_members) != 1 or len(license_members) != 1:
                        raise RegistrationFailure("source_unverified", "Kenney archive must contain one exact source file and one package License.txt", 5)
                    archive_audio_hash = hashlib.sha256(package.read(original_members[0])).hexdigest()
                    archive_license_hash = hashlib.sha256(package.read(license_members[0])).hexdigest()
            except (OSError, zipfile.BadZipFile, RuntimeError) as exc:
                raise RegistrationFailure("source_unverified", f"Kenney package archive could not be verified: {exc}", 5) from exc
            if archive_audio_hash.casefold() != actual_hash.casefold():
                raise RegistrationFailure("hash_mismatch", "source-get bytes do not match the file at originalPath inside the package archive", 6)
            if archive_license_hash.casefold() != license_proof_hash.casefold():
                raise RegistrationFailure("rights_unverified", "preserved package License.txt differs from the license text in the source archive", 5)

        search_receipt_path = registration_path(work_root, args.source_search_receipt, "source-search receipt") if args.source_search_receipt else None
        search_receipt_hash = None
        if search_receipt_path:
            try:
                search_receipt = json.loads(search_receipt_path.read_text(encoding="utf-8"))
            except (OSError, UnicodeError, json.JSONDecodeError) as exc:
                raise RegistrationFailure("receipt_error", f"source-search receipt is not valid JSON: {exc}") from exc
            if not isinstance(search_receipt, dict) or search_receipt.get("schemaVersion") != 1 or not isinstance(search_receipt.get("results"), list):
                raise RegistrationFailure("receipt_error", "source-search receipt must be a schemaVersion 1 object with results")
            if not any(isinstance(item, dict) and item.get("key") == args.key for item in search_receipt["results"]):
                raise RegistrationFailure("source_unverified", "source-search receipt does not contain the selected provider key", 5)
            search_receipt_hash = digest_file(search_receipt_path)

        probe, probe_error, probe_status = inspect_audio(source_file, ffprobe=args.ffprobe)
        if probe is None:
            if probe_status == "file_invalid":
                raise RegistrationFailure("file_invalid", probe_error or "ffprobe rejected the audio file", 6)
            raise RegistrationFailure("probe_unavailable", probe_error or "audio file could not be technically probed", PROBE_UNAVAILABLE_EXIT)
        probe = {**probe, "method": Path(args.ffprobe).name or "ffprobe"}
        if probe["sha256"].casefold() != actual_hash.casefold():
            raise RegistrationFailure("hash_mismatch", "technical probe observed different source bytes", 6)

        tags = [value.strip() for value in (args.tag or []) if isinstance(value, str) and value.strip()]
        if not tags or len(tags) != len(set(tags)):
            raise RegistrationFailure("invalid_metadata", "at least one unique non-empty --tag is required")
        if not args.role or not args.material or not args.energy:
            raise RegistrationFailure("invalid_metadata", "role, material, and energy descriptions are required")
        author = args.author.strip() if isinstance(args.author, str) and args.author.strip() else source_asset.get("author")
        if not isinstance(author, str) or not author.strip():
            raise RegistrationFailure("source_unverified", "source author is missing; record a verified creator or package author", 5)

        if provider == "kenney":
            proof_basis = "Included package License.txt declares CC0 1.0; the canonical Kenney asset page identifies the package as Creative Commons CC0."
            redistribution_notes = "The package license allows personal and commercial use; attribution to Kenney or kenney.nl is optional and source credit is retained for provenance."
        else:
            proof_basis = f"The individual source page identifies the file under {license_data['title']}; its exact canonical license URL and source-page evidence are preserved in source.licenseEvidenceFile."
            redistribution_notes = license_data["attribution"]
        redistribution = {
            "status": "redistributable",
            "syncUse": "allowed",
            "basis": proof_basis,
            "notes": redistribution_notes,
        }
        if license_proof_relative and Path(license_proof_relative).suffix.casefold() == ".txt":
            redistribution["licenseTextFile"] = license_proof_relative
        receipt_hash = hashlib.sha256(receipt_bytes).hexdigest()
        source_record = {
            "provider": provider,
            "key": args.key,
            "pack": pack_name,
            "page": source_page,
            "version": source_version,
            "archiveSha256": archive_hash,
            "originalPath": original_path,
            "sourceGetReceiptSha256": receipt_hash,
            "sourceSearchReceiptSha256": search_receipt_hash,
            "downloadKind": source_asset.get("downloadKind"),
            "downloadUrl": source_asset.get("preview", {}).get("url") if isinstance(source_asset.get("preview"), dict) else None,
            "licenseTitle": license_data["title"],
            "licenseUrl": license_data["url"],
            "licenseEvidenceSha256": license_proof_hash,
            "receiptReviewStatus": source_review_boundary,
        }
        music_metadata = source_asset.get("musicMetadata")
        if provider != "kenney" and isinstance(music_metadata, dict):
            source_record["musicMetadataAtSearch"] = music_metadata
            source_record["communityAtSearch"] = source_asset.get("community")
            source_record["listingPage"] = source_asset.get("listingPage")
            source_record["rightsBoundaryAtSearch"] = source_asset.get("rightsBoundary")
        if archive_path is not None:
            source_record["archiveFile"] = archive_path.relative_to(work_root).as_posix()
        if provider != "kenney" and license_evidence_project_relative:
            source_record["licenseEvidenceFile"] = license_evidence_project_relative
        asset_entry = {
            "id": asset_id,
            "file": relative_file.as_posix(),
            "role": args.role.strip(),
            "tags": tags,
            "material": args.material.strip(),
            "energy": args.energy.strip(),
            "durationSec": probe["durationSec"],
            "sha256": actual_hash,
            "license": args.license_id,
            "licenseTitle": license_data["title"],
            "licenseUrl": license_data["url"],
            "redistribution": redistribution,
            "reviewStatus": "candidate-unreviewed",
            "author": author,
            "source": source_record,
            "probe": {key: value for key, value in probe.items() if key not in {"sha256", "sizeBytes"}},
        }
        if provider != "kenney" and isinstance(music_metadata, dict):
            asset_entry["musicMetadata"] = music_metadata

        document["assets"].append(asset_entry)
        serialized_index = (json.dumps(document, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        index_tmp = index_path.with_name(f".{index_path.name}.source-register-{os.getpid()}.tmp")
        if index_tmp.exists() or index_tmp.is_symlink():
            raise RegistrationFailure("output_conflict", f"staging index already exists: {index_tmp}", 7)
        target.parent.mkdir(parents=True, exist_ok=True)
        created_target = False
        staged_index = False
        try:
            descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
            created_target = True
            with os.fdopen(descriptor, "wb") as destination, source_file.open("rb") as source_stream:
                shutil.copyfileobj(source_stream, destination)
            if digest_file(target).casefold() != actual_hash.casefold():
                raise RegistrationFailure("hash_mismatch", "copied asset hash differs from the verified source file", 6)
            with index_tmp.open("xb") as staged:
                staged.write(serialized_index)
            staged_index = True
            if hashlib.sha256(index_path.read_bytes()).hexdigest() != hashlib.sha256(original_index_bytes).hexdigest():
                raise RegistrationFailure("index_changed", "asset index changed while registration was in progress", 7)
            os.replace(index_tmp, index_path)
            staged_index = False
        except Exception:
            if staged_index and index_tmp.exists():
                index_tmp.unlink()
            if created_target and target.exists():
                target.unlink()
            raise

        plan_fields = {key: asset_entry[key] for key in (
            "id", "file", "durationSec", "sha256", "license", "licenseTitle", "licenseUrl",
            "redistribution", "reviewStatus", "source",
        )}
        if "musicMetadata" in asset_entry:
            plan_fields["musicMetadata"] = asset_entry["musicMetadata"]
        return json_result(
            "source-register", "registered", registered=True,
            sourceGetReceipt=str(receipt_path.relative_to(work_root)),
            sourceGetReceiptSha256=receipt_hash,
            sourceSearchReceipt=str(search_receipt_path.relative_to(work_root)) if search_receipt_path else None,
            sourceSearchReceiptSha256=search_receipt_hash,
            sourceGetProbeStatus=source_asset.get("probe", {}).get("status") if isinstance(source_asset.get("probe"), dict) else None,
            registrationProbe=asset_entry["probe"],
            assetPath=target.relative_to(work_root).as_posix(),
            assetIndex=index_path.relative_to(work_root).as_posix(),
            asset=asset_entry,
            assetIndexFragment=plan_fields,
            reviewStatus="candidate-unreviewed",
            reviewBoundary="Registration verifies file identity, technical metadata, and license evidence; no listening review is recorded.",
        ), 0
    except RegistrationFailure as exc:
        return json_result("source-register", exc.status, registered=False, error=str(exc)), exc.exit_code
    except (OSError, ValueError, TypeError, KeyError) as exc:
        return json_result("source-register", "registration_error", registered=False, error=str(exc)), 7


def asset_fields(asset):
    fields = ["tags", "role", "material", "energy", "description", "title", "author", "source"]
    values = {}
    for key in fields:
        value = asset.get(key)
        if value is None:
            continue
        if isinstance(value, dict):
            values[key] = " ".join(str(v) for v in value.values())
        elif isinstance(value, (list, tuple)):
            values[key] = " ".join(str(v) for v in value)
        else:
            values[key] = str(value)
    return values


def relative_or_absolute(work_root, path):
    resolved = Path(path).resolve()
    try:
        return resolved.relative_to(work_root).as_posix()
    except ValueError:
        return str(resolved)


def rights_are_consumable(asset):
    license_id = asset.get("license")
    if not isinstance(license_id, str) or not license_id.strip() or license_id.strip().lower() in {"unknown", "none", "tbd"}:
        return False
    rights = asset.get("redistribution")
    if not isinstance(rights, dict):
        return False
    status_value = rights.get("status")
    if not isinstance(status_value, str) or not status_value.strip():
        return False
    status = status_value.lower()
    if status not in {"redistributable", "sync-only", "not-authorized-for-redistribution", "project-generated"}:
        return False

    basis = rights.get("basis")
    basis_is_truthy = basis is not None and basis is not False and basis != 0 and basis != ""
    evidence = basis if basis_is_truthy else rights.get("notes")
    if not isinstance(evidence, str) or not evidence.strip():
        return False

    sync_value = rights.get("syncUse")
    sync = sync_value.lower() if isinstance(sync_value, str) else None
    if sync_value is not None and sync not in {"allowed", "prohibited", "unknown"}:
        return False
    if sync in {"prohibited", "unknown"}:
        return False
    if status == "not-authorized-for-redistribution" and sync != "allowed":
        return False
    return True


def review_reuse_status(asset, sha256, requested_scope, duration_sec):
    record = asset.get("reviewRecord")
    if not isinstance(record, dict):
        return "missing-record"
    recorded_hash = record.get("fileSha256")
    if not isinstance(recorded_hash, str) or recorded_hash.lower() != sha256.lower():
        return "file-hash-mismatch"
    recorded_scope = record.get("applicableScope")
    if not isinstance(requested_scope, str) or not requested_scope.strip():
        return "scope-not-provided"
    if not isinstance(recorded_scope, str) or " ".join(recorded_scope.split()).casefold() != " ".join(requested_scope.split()).casefold():
        return "scope-mismatch"
    source_range = record.get("sourceRange")
    if not isinstance(source_range, dict):
        return "source-range-missing"
    try:
        start = float(source_range["inSec"])
        end = float(source_range["outSec"])
    except (KeyError, TypeError, ValueError):
        return "source-range-invalid"
    if not math.isfinite(duration_sec) or duration_sec <= 0 or not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start or end > duration_sec + 0.001:
        return "source-range-invalid"
    if start > 0.001 or end < duration_sec - 0.001:
        return "review-range-does-not-cover-file"
    reviewer = record.get("reviewer")
    if not isinstance(reviewer, str) or not reviewer.strip() or reviewer.strip().casefold() in {
        "unknown", "n/a", "na", "none", "tbd", "todo", "reviewer", "human", "待填写", "未知",
    }:
        return "reviewer-missing"
    if record.get("reviewerType") != "human" or record.get("listeningConfirmed") is not True:
        return "human-listening-confirmation-missing"
    if not isinstance(record.get("conclusion"), str) or record["conclusion"].strip().casefold() != "pass":
        return "review-conclusion-not-pass"
    return "reused-exact-scope-and-file-hash"


def local_search(args):
    work_root, _ = work_and_cache(args)
    explicit_asset_id = getattr(args, "asset_id", None)
    requested_use_case = getattr(args, "use_case", None)
    if requested_use_case is not None and requested_use_case not in APPLICABILITY_USE_CASES - {"all"}:
        return json_result("local-search", "invalid_use_case", query=args.query, assetId=explicit_asset_id, results=[]), 2
    requested_source_in = getattr(args, "source_in_sec", None)
    requested_source_out = getattr(args, "source_out_sec", None)
    if (requested_source_in is None) != (requested_source_out is None):
        return json_result("local-search", "invalid_source_range", query=args.query, assetId=explicit_asset_id, results=[],
                           errors=["provide both --source-in-sec and --source-out-sec"]), 2
    if requested_source_in is not None and (
        not math.isfinite(requested_source_in) or not math.isfinite(requested_source_out)
        or requested_source_in < 0 or requested_source_out <= requested_source_in
    ):
        return json_result("local-search", "invalid_source_range", query=args.query, assetId=explicit_asset_id, results=[],
                           errors=["source range must be finite, non-negative, and increasing"]), 2
    if explicit_asset_id is not None and (not isinstance(explicit_asset_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]*", explicit_asset_id)):
        return json_result("local-search", "invalid_asset_id", query=args.query, assetId=explicit_asset_id, results=[]), 2
    if explicit_asset_id and args.query:
        return json_result("local-search", "invalid_request", query=args.query, assetId=explicit_asset_id, results=[], errors=["use either --asset-id or --query, not both"]), 2
    query_terms = tokenize(args.query or "")
    if not query_terms and not explicit_asset_id:
        return json_result("local-search", "invalid_query", query=args.query, results=[]), 2
    paths = [Path(p) for p in args.index] if args.index else [DEFAULT_INDEX]
    project_index = work_root / "assets" / "audio" / "index.json"
    if project_index.exists() and all(project_index.resolve() != p.resolve() for p in paths):
        paths.append(project_index)
    results, errors = [], []
    for index_path in paths:
        if not index_path.is_absolute():
            index_path = work_root / index_path
        index_path = index_path.absolute().resolve()
        try:
            document = json.loads(index_path.read_text(encoding="utf-8"))
            if not isinstance(document, dict):
                raise ValueError("asset index must be a JSON object")
            if document.get("schemaVersion") != 1 or not isinstance(document.get("assets"), list):
                raise ValueError("asset index must use schemaVersion 1 and an assets array")
            if any(not isinstance(asset, dict) for asset in document["assets"]):
                raise ValueError("every indexed asset must be an object")
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            errors.append({"index": str(index_path), "error": str(exc)})
            continue
        index_root = index_path.parent.resolve()
        for asset in document["assets"]:
            if explicit_asset_id and asset.get("id") != explicit_asset_id:
                continue
            values = asset_fields(asset)
            matches = [{"term": explicit_asset_id, "field": "id", "match": "exact"}] if explicit_asset_id else []
            if not explicit_asset_id:
                for token in query_terms:
                    for field, value in values.items():
                        if token in value.casefold():
                            matches.append({"term": token, "field": field})
            if not matches:
                continue
            raw_file = asset.get("file")
            if not isinstance(raw_file, str) or not raw_file:
                results.append({"assetId": asset.get("id"), "status": "file_invalid", "matches": matches, "error": "file path missing"})
                continue
            file_path = Path(raw_file)
            if not file_path.is_absolute():
                file_path = index_root / file_path
            file_path = file_path.absolute().resolve()
            if not path_inside(index_root, file_path):
                results.append({"assetId": asset.get("id"), "status": "file_invalid", "matches": matches, "error": "indexed path escapes its index directory"})
                continue
            inspected, error, inspect_status = inspect_audio(file_path, args.ffprobe)
            if error:
                results.append({"assetId": asset.get("id"), "status": inspect_status, "matches": matches, "file": relative_or_absolute(work_root, file_path), "error": error})
                continue
            expected = str(asset.get("sha256", "")).lower()
            if expected and expected != inspected["sha256"].lower():
                results.append({"assetId": asset.get("id"), "status": "file_invalid", "matches": matches, "file": relative_or_absolute(work_root, file_path), "error": "SHA-256 does not match the index"})
                continue
            normalized = dict(asset)
            normalized["file"] = relative_or_absolute(work_root, file_path)
            normalized["durationSec"] = inspected["durationSec"]
            normalized["sha256"] = inspected["sha256"]
            source_start = requested_source_in if requested_source_in is not None else 0.0
            source_end = requested_source_out if requested_source_out is not None else inspected["durationSec"]
            if source_start < 0 or source_end <= source_start or source_end > inspected["durationSec"] + 0.001:
                results.append({"assetId": asset.get("id"), "status": "invalid_source_range",
                                "matches": matches, "file": relative_or_absolute(work_root, file_path),
                                "error": "requested source range is outside the probed file"})
                continue
            negative_feedback = applicability_exclusions_for_hash(
                document["assets"], inspected["sha256"], requested_use_case, source_start, source_end,
            )
            blocking_feedback = [row for row in negative_feedback if row["status"] in {"excluded", "context-required", "invalid"}]
            review = normalized.get("reviewRecord")
            review_reuse = "not-ready-status"
            if normalized.get("reviewStatus") == "ready":
                review_reuse = review_reuse_status(normalized, inspected["sha256"], getattr(args, "review_scope", None), inspected["durationSec"])
                if review_reuse != "reused-exact-scope-and-file-hash":
                    normalized["reviewStatus"] = "candidate-unreviewed"
            item = {
                "assetId": asset.get("id"),
                "status": "candidate",
                "file": relative_or_absolute(work_root, file_path),
                "format": inspected["format"],
                "durationSec": inspected["durationSec"],
                "sha256": inspected["sha256"],
                "license": asset.get("license"),
                "redistribution": asset.get("redistribution"),
                "reviewStatus": normalized.get("reviewStatus", "candidate-unreviewed"),
                "source": asset.get("source"),
                "musicMetadata": asset.get("musicMetadata"),
                "communityAtSearch": (asset.get("source") or {}).get("communityAtSearch") if isinstance(asset.get("source"), dict) else None,
                "communityFeedback": (asset.get("source") or {}).get("communityFeedback") if isinstance(asset.get("source"), dict) else None,
                "matches": matches,
                "reviewRecord": review,
                "reviewReuseStatus": review_reuse,
                "useCase": requested_use_case,
                "sourceRange": {"inSec": source_start, "outSec": source_end},
                "applicabilityFeedback": negative_feedback,
                "audioPlanAsset": normalized if not (index_path == DEFAULT_INDEX.resolve()) else None,
            }
            if blocking_feedback:
                item["status"] = "applicability_excluded"
                item["error"] = "human negative applicability feedback matches this file hash, source range, or use case; technical preview cannot override it"
                item["audioPlanAsset"] = None
            elif not rights_are_consumable(normalized):
                item["status"] = "rights_unverified"
                item["error"] = "license or sync/redistribution boundary is missing or unresolved"
                item["audioPlanAsset"] = None
            results.append(item)
    row_states = {item.get("status") for item in results}
    if "probe_unavailable" in row_states:
        status, code = "probe_unavailable", PROBE_UNAVAILABLE_EXIT
    elif "applicability_excluded" in row_states:
        status, code = "applicability_excluded", 0
    elif "candidate" in row_states:
        status, code = "ok", 0
    elif "rights_unverified" in row_states:
        status, code = "rights_unverified", 5
    elif "file_invalid" in row_states:
        status, code = "file_invalid", 6
    elif errors:
        status, code = "index_error", 4
    else:
        status, code = "empty", 0
    return json_result("local-search", status, query=args.query, assetId=explicit_asset_id,
                       filters={"useCase": requested_use_case,
                                "sourceRange": {"inSec": requested_source_in, "outSec": requested_source_out}},
                       results=results, errors=errors), code


def local_review(args):
    """Return an explicitly confirmed listening review to the canonical local audio index."""
    operation = "local-review"
    try:
        work_root = Path(args.work_root).expanduser().absolute().resolve()
        if not work_root.is_dir():
            raise RegistrationFailure("work_root_missing", "work root is not an existing directory")
        reviewer_type = args.reviewer_type
        if reviewer_type == "human" and not args.confirm_listened:
            raise RegistrationFailure("listening_confirmation_required", "a human listening review requires --confirm-listened", 2)
        if reviewer_type != "human" and args.confirm_listened:
            raise RegistrationFailure("invalid_reviewer_type", "model/agent feedback cannot claim a human listening confirmation", 2)
        if not isinstance(args.asset_id, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]*", args.asset_id):
            raise RegistrationFailure("invalid_asset_id", "asset ID must use stable ASCII letters, digits, dot, underscore, colon, or dash", 2)
        scope = " ".join((args.scope or "").split())
        if not scope:
            raise RegistrationFailure("invalid_review", "--scope must describe the listening context", 2)
        reviewer = " ".join((args.reviewer or "").split())
        if not reviewer or reviewer.casefold() in {"unknown", "n/a", "na", "none", "tbd", "todo", "reviewer", "human", "待填写", "未知"}:
            raise RegistrationFailure("reviewer_missing", "--reviewer must identify the actual reviewer; placeholders are not accepted", 2)
        conclusion = (args.conclusion or "").strip().casefold()
        if conclusion not in {"pass", "conditional", "fail"}:
            raise RegistrationFailure("invalid_review", "--conclusion must be pass, conditional, or fail", 2)
        use_case = getattr(args, "use_case", None)
        if args.full_file:
            if args.in_sec is not None or args.out_sec is not None:
                raise RegistrationFailure("invalid_review_range", "use --full-file or an explicit --in-sec/--out-sec pair, not both", 2)
            start, end = 0.0, None
        else:
            start, end = args.in_sec, args.out_sec
            if start is None or end is None or not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start:
                raise RegistrationFailure("invalid_review_range", "review source range requires finite, non-negative, increasing --in-sec/--out-sec values or --full-file", 2)
        if args.notes is not None and not isinstance(args.notes, str):
            raise RegistrationFailure("invalid_review", "--notes must be text when supplied", 2)

        index_path = registration_path(work_root, args.index or "assets/audio/index.json", "asset index")
        try:
            original_index_bytes = index_path.read_bytes()
            document = json.loads(original_index_bytes.decode("utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise RegistrationFailure("index_error", f"could not read asset index JSON: {exc}") from exc
        if not isinstance(document, dict) or document.get("schemaVersion") != 1 or not isinstance(document.get("assets"), list):
            raise RegistrationFailure("index_error", "asset index must be a schemaVersion 1 object with an assets array")
        matches = [asset for asset in document["assets"] if isinstance(asset, dict) and asset.get("id") == args.asset_id]
        if len(matches) != 1:
            raise RegistrationFailure("asset_not_unique", f"asset ID must appear exactly once in the selected index: {args.asset_id}")
        asset = matches[0]
        asset_role = str(asset.get("role", "")).casefold()
        is_music_asset = asset_role.startswith("music")
        if conclusion in {"conditional", "fail"}:
            if is_music_asset and use_case not in APPLICABILITY_USE_CASES:
                raise RegistrationFailure("applicability_scope_required", "music fail/conditional feedback requires one canonical music --use-case; use all only when the rejection applies across every music use", 2)
            if not is_music_asset and use_case not in (None, "all"):
                raise RegistrationFailure("invalid_applicability_scope", "SFX uses --scope for its recorded event context; only explicit --use-case all creates a source-wide block", 2)
        if getattr(args, "resolve_use_case_exclusions", False) and (
            reviewer_type != "human" or conclusion != "pass" or use_case not in APPLICABILITY_USE_CASES
        ):
            raise RegistrationFailure("invalid_applicability_resolution", "resolving music exclusions requires a human-confirmed pass and an explicit canonical --use-case", 2)
        raw_file = asset.get("file")
        if not isinstance(raw_file, str) or not raw_file:
            raise RegistrationFailure("file_invalid", "indexed asset file path is missing")
        file_path = Path(raw_file)
        if not file_path.is_absolute():
            file_path = index_path.parent / file_path
        if file_path.is_symlink():
            raise RegistrationFailure("file_invalid", "indexed asset file must not be a symlink")
        try:
            file_path = file_path.absolute().resolve()
        except (OSError, RuntimeError) as exc:
            raise RegistrationFailure("file_invalid", f"indexed asset path cannot be resolved: {exc}") from exc
        if not path_inside(index_path.parent.resolve(), file_path) or not file_path.is_file() or file_path.is_symlink():
            raise RegistrationFailure("file_invalid", "indexed asset must be a regular file within its audio index directory")
        inspected, probe_error, probe_status = inspect_audio(file_path, args.ffprobe)
        if inspected is None:
            raise RegistrationFailure(probe_status or "probe_unavailable", probe_error or "indexed asset could not be probed", PROBE_UNAVAILABLE_EXIT if probe_status == "probe_unavailable" else 6)
        actual_sha = inspected["sha256"]
        expected_sha = str(asset.get("sha256", "")).casefold()
        if not re.fullmatch(r"[a-f0-9]{64}", expected_sha) or actual_sha.casefold() != expected_sha:
            raise RegistrationFailure("hash_mismatch", "actual asset hash does not match the current index; no listening review was recorded", 6)
        duration = inspected["durationSec"]
        if args.full_file:
            end = duration
        if end > duration + 0.001:
            raise RegistrationFailure("invalid_review_range", "review source range extends beyond the probed asset duration", 2)
        full_file = start <= 0.001 and end >= duration - 0.001
        old_record = asset.get("reviewRecord")
        if old_record is not None:
            history = asset.setdefault("reviewHistory", [])
            if not isinstance(history, list):
                raise RegistrationFailure("index_error", "existing reviewHistory must be an array")
            if not isinstance(old_record, dict):
                raise RegistrationFailure("index_error", "existing reviewRecord must be an object before it can be replaced")
            history.append(old_record)
        record = {
            "fileSha256": actual_sha,
            "applicableScope": scope,
            "sourceRange": {"inSec": start, "outSec": end},
            "reviewer": reviewer,
            "reviewerType": reviewer_type,
            "conclusion": conclusion,
            "listeningConfirmed": reviewer_type == "human" and args.confirm_listened,
            "recordedAtUtc": _datetime.datetime.now(_datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        if args.notes:
            record["notes"] = args.notes.strip()
        asset["reviewRecord"] = record
        exclusions_recorded = 0
        if conclusion in {"conditional", "fail"}:
            reason = args.notes.strip() if isinstance(args.notes, str) and args.notes.strip() else scope
            if reviewer_type == "human" and (is_music_asset or use_case == "all"):
                exclusions = asset.setdefault("applicabilityExclusions", [])
                if not isinstance(exclusions, list):
                    raise RegistrationFailure("index_error", "existing applicabilityExclusions must be an array")
                exclusions.append({
                    "fileSha256": actual_sha,
                    "sourceRange": {"inSec": start, "outSec": end},
                    "useCase": use_case,
                    "conclusion": conclusion,
                    "reason": reason,
                    "reviewer": reviewer,
                    "reviewerType": "human",
                    "recordedAtUtc": record["recordedAtUtc"],
                })
                exclusions_recorded = 1
            else:
                feedback = asset.setdefault("applicabilityFeedback", [])
                if not isinstance(feedback, list):
                    raise RegistrationFailure("index_error", "existing applicabilityFeedback must be an array")
                feedback.append({
                    "fileSha256": actual_sha,
                    "sourceRange": {"inSec": start, "outSec": end},
                    "useCase": use_case,
                    "applicabilityScope": scope,
                    "conclusion": conclusion,
                    "reason": reason,
                    "reviewer": reviewer,
                    "reviewerType": reviewer_type,
                    "recordedAtUtc": record["recordedAtUtc"],
                    "humanDecisionRequired": reviewer_type != "human",
                    "enforcement": "feedback-only-without-canonical-music-use-case" if not is_music_asset and use_case is None else "human-decision-required",
                })
        resolved_exclusions = []
        if getattr(args, "resolve_use_case_exclusions", False):
            exclusions = asset.get("applicabilityExclusions", [])
            if not isinstance(exclusions, list):
                raise RegistrationFailure("index_error", "existing applicabilityExclusions must be an array")
            retained = []
            for exclusion in exclusions:
                if not isinstance(exclusion, dict):
                    retained.append(exclusion)
                    continue
                try:
                    exclusion_start = float(exclusion.get("sourceRange", {}).get("inSec"))
                    exclusion_end = float(exclusion.get("sourceRange", {}).get("outSec"))
                except (TypeError, ValueError):
                    retained.append(exclusion)
                    continue
                exact_use = use_case == "all" or exclusion.get("useCase") == use_case
                covered = start <= exclusion_start and end >= exclusion_end
                same_file = str(exclusion.get("fileSha256", "")).casefold() == actual_sha.casefold()
                if same_file and exact_use and covered:
                    resolved_exclusions.append({**exclusion, "resolvedAtUtc": record["recordedAtUtc"],
                                                "resolvedBy": reviewer, "resolutionReviewScope": scope})
                else:
                    retained.append(exclusion)
            history = asset.setdefault("applicabilityFeedbackHistory", [])
            if not isinstance(history, list):
                raise RegistrationFailure("index_error", "existing applicabilityFeedbackHistory must be an array")
            history.extend(resolved_exclusions)
            asset["applicabilityExclusions"] = retained
        asset["reviewStatus"] = "ready" if conclusion == "pass" and full_file and reviewer_type == "human" and args.confirm_listened else "candidate-unreviewed"
        index_tmp = index_path.with_name(f".{index_path.name}.local-review-{os.getpid()}.tmp")
        try:
            with index_tmp.open("xb") as staged:
                staged.write((json.dumps(document, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
            if hashlib.sha256(index_path.read_bytes()).hexdigest() != hashlib.sha256(original_index_bytes).hexdigest():
                raise RegistrationFailure("index_changed", "audio index changed while review was being recorded", 7)
            os.replace(index_tmp, index_path)
        finally:
            if index_tmp.exists():
                index_tmp.unlink()
        return json_result(
            operation, "recorded", assetId=args.asset_id, assetIndex=index_path.relative_to(work_root).as_posix(),
            fileSha256=actual_sha, durationSec=duration, reviewRecord=record,
            reviewStatus=asset["reviewStatus"], fullFileRange=full_file,
            applicabilityExclusionsRecorded=exclusions_recorded,
            applicabilityExclusionsResolved=len(resolved_exclusions),
            boundary="Human-confirmed conclusions record the caller's listening assertion, not independent proof; model/agent feedback never marks an asset ready or claims listening. Human fail/conditional feedback is a separate hash/range/use-case exclusion checked by local search and audio-plan execution.",
        ), 0
    except RegistrationFailure as exc:
        return json_result(operation, exc.status, recorded=False, error=str(exc)), exc.exit_code
    except (OSError, ValueError, TypeError, KeyError) as exc:
        return json_result(operation, "review_error", recorded=False, error=str(exc)), 7


def _candidate_group_indexes(args, work_root):
    paths = []
    for raw in (args.index or [DEFAULT_INDEX]):
        path = Path(raw)
        if not path.is_absolute():
            path = work_root / path
        paths.append(path)
    project_index = work_root / "assets" / "audio" / "index.json"
    if project_index.exists() and all(project_index.resolve() != p.resolve() for p in paths):
        paths.append(project_index)
    return paths


def _group_text_values(group):
    values = []
    for key in ("id", "purpose", "keywords", "applicability", "useCase", "voiceContext", "visualContext"):
        value = group.get(key)
        if isinstance(value, dict):
            values.extend(str(item) for item in value.values())
        elif isinstance(value, (list, tuple)):
            values.extend(str(item) for item in value)
        elif value is not None:
            values.append(str(value))
    if isinstance(group.get("candidates"), list):
        candidates = group["candidates"]
    else:
        candidates = [group.get("default", {})] + group.get("alternatives", [])
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        for key in ("assetId", "when", "actions", "materials", "intensities"):
            value = candidate.get(key)
            if isinstance(value, (list, tuple)):
                values.extend(str(item) for item in value)
            elif value is not None:
                values.append(str(value))
    return " ".join(values).casefold()


def _normalize_condition(value, aliases):
    if not isinstance(value, str):
        return None
    return aliases.get(value.casefold().strip())


def _filter_candidate_group(candidate, asset, args):
    matches, exclusions, uncertainties = [], [], []

    action = getattr(args, "action", None)
    if action:
        allowed = set()
        for value in candidate.get("actions", []):
            normalized = _normalize_condition(value, ACTION_ALIASES)
            if normalized is not None:
                allowed.add(normalized)
        supplied = _normalize_condition(action, ACTION_ALIASES)
        if not allowed:
            uncertainties.append("source index declares no action terms for this candidate")
        elif supplied is None:
            uncertainties.append("action is not an exact known value or positive alias; no semantic match inferred")
        elif supplied in allowed:
            matches.append("action exactly matches a declared value or positive alias")
        else:
            exclusions.append("action does not match candidate condition: " + ", ".join(sorted(allowed)))

    material = getattr(args, "material", None)
    if material:
        allowed = set()
        for value in candidate.get("materials", []):
            normalized = _normalize_condition(value, MATERIAL_ALIASES)
            if normalized is not None:
                allowed.add(normalized)
        supplied = _normalize_condition(material, MATERIAL_ALIASES)
        if not allowed:
            uncertainties.append("source index declares no material match for this candidate")
        elif supplied is None:
            uncertainties.append("material is not an exact known value or positive alias; no semantic match inferred")
        elif supplied in allowed:
            matches.append("material exactly matches a declared value or positive alias")
        else:
            exclusions.append("material does not match candidate condition: " + ", ".join(sorted(allowed)))

    intensity = getattr(args, "intensity", None)
    if intensity:
        allowed = [str(value).casefold() for value in candidate.get("intensities", [])]
        supplied = intensity.casefold().strip()
        if not allowed:
            uncertainties.append("source index declares no intensity match for this candidate")
        elif supplied in allowed:
            matches.append("intensity matches candidate condition")
        else:
            exclusions.append("intensity does not match candidate condition: " + ", ".join(allowed))

    maximum = getattr(args, "max_source_duration_sec", None)
    duration = asset.get("durationSec")
    if maximum is not None:
        if isinstance(duration, (int, float)) and duration <= maximum:
            matches.append("indexed source duration is within requested maximum")
        elif isinstance(duration, (int, float)):
            exclusions.append("indexed source duration exceeds requested maximum")
        else:
            uncertainties.append("source duration is missing from the index")

    duty = getattr(args, "duty", None)
    if duty:
        matches.append("group is indexed for the requested sound duty")

    if not (action or material or intensity or maximum is not None or duty):
        uncertainties.append("no action/material/intensity/duration filters supplied")

    status = "excluded" if exclusions else ("unconfirmed" if uncertainties else "matched")
    return {
        "status": status,
        "matchReasons": matches,
        "exclusionReasons": exclusions,
        "uncertainties": uncertainties,
    }


def local_groups(args):
    work_root = Path(args.work_root).absolute().resolve()
    if not work_root.is_dir():
        raise ValueError("work root is not an existing directory")
    maximum = getattr(args, "max_source_duration_sec", None)
    if maximum is not None and (not math.isfinite(maximum) or maximum <= 0):
        raise ValueError("max source duration must be a positive finite number")
    paths = _candidate_group_indexes(args, work_root)
    query_terms = tokenize(args.query or "")
    results, errors, discovered_ids = [], [], set()
    explicit_id = getattr(args, "group_id", None)
    explicit_duty = getattr(args, "duty", None)
    if explicit_id and explicit_duty:
        raise ValueError("--group-id and --duty cannot be used together")
    discovered_duties = set()

    for index_path in paths:
        if not index_path.is_absolute():
            index_path = work_root / index_path
        index_path = index_path.absolute().resolve()
        try:
            document = json.loads(index_path.read_text(encoding="utf-8"))
            if not isinstance(document, dict):
                raise ValueError("asset index must be a JSON object")
            if document.get("schemaVersion") != 1 or not isinstance(document.get("assets"), list):
                raise ValueError("asset index must use schemaVersion 1 and an assets array")
            groups = document.get("candidateGroups", [])
            if not isinstance(groups, list):
                raise ValueError("candidateGroups must be an array when present")
            assets = {}
            for asset in document["assets"]:
                if not isinstance(asset, dict):
                    raise ValueError("every indexed asset must be an object")
                asset_id = asset.get("id")
                if not isinstance(asset_id, str) or not asset_id:
                    raise ValueError("every indexed asset must have a non-empty id")
                if asset_id in assets:
                    raise ValueError("duplicate asset id in audio index: " + asset_id)
                assets[asset_id] = asset
            seen = set()
            for group in groups:
                if not isinstance(group, dict) or not isinstance(group.get("id"), str) or not group["id"].strip():
                    raise ValueError("every candidate group must have a non-empty id")
                group_id = group["id"]
                if group_id in seen:
                    raise ValueError("duplicate candidate group id in audio index: " + group_id)
                seen.add(group_id)
                discovered_ids.add(group_id)
                duty = group.get("duty")
                if duty is not None:
                    if (not isinstance(duty, dict) or not isinstance(duty.get("id"), str) or not duty["id"].strip()
                            or not isinstance(duty.get("eligibleRoles"), list)
                            or not duty["eligibleRoles"]
                            or any(not isinstance(role, str) or not role.strip() for role in duty["eligibleRoles"])):
                        raise ValueError("candidate group duty requires an ID and non-empty eligibleRoles: " + group_id)
                    discovered_duties.add(duty["id"])
                if "candidates" in group:
                    if "default" in group or "alternatives" in group:
                        raise ValueError("flat candidate groups cannot also declare default/alternatives: " + group_id)
                    if group.get("selectionPolicy") != "parallel-unranked-candidates" or group.get("defaultSelectionAllowed") is not False:
                        raise ValueError("flat candidate groups must explicitly disable default selection: " + group_id)
                    candidates_value = group.get("candidates")
                    if not isinstance(candidates_value, list) or not candidates_value:
                        raise ValueError("flat candidate group candidates must be a non-empty array: " + group_id)
                    candidates = [("candidate", value) for value in candidates_value]
                else:
                    if not isinstance(group.get("default"), dict) or not isinstance(group.get("default", {}).get("assetId"), str):
                        raise ValueError("candidate group requires a default assetId or flat candidates array: " + group_id)
                    alternatives = group.get("alternatives", [])
                    if not isinstance(alternatives, list):
                        raise ValueError("candidate group alternatives must be an array: " + group_id)
                    candidates = [("default", group["default"])] + [("alternative", value) for value in alternatives]
                for _kind, candidate in candidates:
                    asset_id = candidate.get("assetId") if isinstance(candidate, dict) else None
                    if asset_id not in assets:
                        raise ValueError("candidate group references missing assetId {}: {}".format(asset_id, group_id))
        except (OSError, ValueError, json.JSONDecodeError, TypeError) as exc:
            errors.append({"index": str(index_path), "error": str(exc)})
            continue

        for group in groups:
            group_id = group["id"]
            if explicit_id and group_id != explicit_id:
                continue
            group_duty = group.get("duty") or {}
            if explicit_duty and group_duty.get("id") != explicit_duty:
                continue
            text = _group_text_values(group)
            query_matches = [{"term": token} for token in query_terms if token in text]
            if query_terms and not query_matches and not explicit_duty:
                continue
            if isinstance(group.get("candidates"), list):
                all_candidates = [("candidate", value) for value in group["candidates"]]
            else:
                all_candidates = [("default", group["default"])] + [("alternative", value) for value in group.get("alternatives", [])]
            candidate_rows = []
            requested_use_case = getattr(args, "use_case", None)
            group_use_case = group.get("useCase")
            for kind, candidate in all_candidates:
                asset = assets[candidate["assetId"]]
                review_record = asset.get("reviewRecord")
                duration_value = asset.get("durationSec")
                reviewed_range = review_record.get("sourceRange") if isinstance(review_record, dict) else None
                review_start = reviewed_range.get("inSec") if isinstance(reviewed_range, dict) else None
                review_end = reviewed_range.get("outSec") if isinstance(reviewed_range, dict) else None
                human_full_review = (
                    asset.get("reviewStatus") == "ready"
                    and isinstance(review_record, dict)
                    and review_record.get("reviewerType") == "human"
                    and review_record.get("listeningConfirmed") is True
                    and review_record.get("conclusion") == "pass"
                    and str(review_record.get("fileSha256", "")).casefold() == str(asset.get("sha256", "")).casefold()
                    and isinstance(review_start, (int, float)) and not isinstance(review_start, bool) and math.isfinite(review_start)
                    and isinstance(review_end, (int, float)) and not isinstance(review_end, bool) and math.isfinite(review_end)
                    and isinstance(duration_value, (int, float))
                    and review_start <= 0.001
                    and review_end >= duration_value - 0.001
                )
                default_allowed = (
                    False if kind == "candidate" else
                    kind != "default" or group.get("selectionPolicy") != "no-unreviewed-default" or human_full_review
                )
                output_kind = kind if default_allowed else "candidate"
                fit = _filter_candidate_group(candidate, asset, args)
                applicable_use_case = requested_use_case or group_use_case
                if requested_use_case and group_use_case and requested_use_case != group_use_case:
                    fit["exclusionReasons"].append("group use case does not match the current canonical music duty")
                    fit["status"] = "excluded"
                duration = asset.get("durationSec")
                negative_feedback = applicability_exclusions_for_hash(
                    assets.values(), asset.get("sha256"), applicable_use_case, 0.0,
                    duration if isinstance(duration, (int, float)) else None,
                )
                blocking_feedback = [row for row in negative_feedback if row["status"] in {"excluded", "context-required", "invalid"}]
                if blocking_feedback:
                    fit["exclusionReasons"].append("human negative applicability feedback matches this file hash, source range, or use case")
                    fit["status"] = "excluded"
                eligible_roles = group_duty.get("eligibleRoles", [])
                role_eligible = not group_duty or asset.get("role") in eligible_roles
                if group_duty and not role_eligible:
                    fit["exclusionReasons"].append("asset role is not eligible for this sound duty")
                    fit["status"] = "excluded"
                candidate_rows.append({
                    "kind": output_kind,
                    "assetId": candidate["assetId"],
                    "when": candidate.get("when"),
                    "actions": candidate.get("actions", []),
                    "materials": candidate.get("materials", []),
                    "intensities": candidate.get("intensities", []),
                    "role": asset.get("role"),
                    "dutyRoleEligible": role_eligible,
                    "indexedMaterial": asset.get("material"),
                    "indexedEnergy": asset.get("energy"),
                    "durationSec": asset.get("durationSec"),
                    "reviewStatus": asset.get("reviewStatus"),
                    "useCase": group_use_case,
                    "musicMetadata": asset.get("musicMetadata"),
                    "communityAtSearch": (asset.get("source") or {}).get("communityAtSearch") if isinstance(asset.get("source"), dict) else None,
                    "communityFeedback": (asset.get("source") or {}).get("communityFeedback") if isinstance(asset.get("source"), dict) else None,
                    "defaultSelectionAllowed": default_allowed,
                    "applicabilityFeedback": negative_feedback,
                    **fit,
                })
            referenced_ids = {candidate.get("assetId") for _kind, candidate in all_candidates}
            if explicit_duty and group_duty:
                for asset_id, asset in assets.items():
                    if asset_id in referenced_ids or asset.get("role") not in group_duty.get("eligibleRoles", []):
                        continue
                    guidance = asset.get("selectionGuidance")
                    use_for = guidance.get("useFor", []) if isinstance(guidance, dict) else []
                    candidate_rows.append({
                        "kind": "registered-role-candidate",
                        "assetId": asset_id,
                        "when": " ".join(str(value) for value in use_for) if isinstance(use_for, list) else None,
                        "actions": [], "materials": [], "intensities": [],
                        "role": asset.get("role"),
                        "dutyRoleEligible": True,
                        "indexedMaterial": asset.get("material"),
                        "indexedEnergy": asset.get("energy"),
                        "durationSec": asset.get("durationSec"),
                        "reviewStatus": asset.get("reviewStatus"),
                        "useCase": group_use_case,
                        "musicMetadata": asset.get("musicMetadata"),
                        "communityAtSearch": (asset.get("source") or {}).get("communityAtSearch") if isinstance(asset.get("source"), dict) else None,
                        "communityFeedback": (asset.get("source") or {}).get("communityFeedback") if isinstance(asset.get("source"), dict) else None,
                        "applicabilityFeedback": applicability_exclusions_for_hash(
                            assets.values(), asset.get("sha256"), requested_use_case or group_use_case, 0.0,
                            asset.get("durationSec") if isinstance(asset.get("durationSec"), (int, float)) else None,
                        ),
                        "status": "unconfirmed",
                        "matchReasons": [], "exclusionReasons": [],
                        "uncertainties": ["registered asset role is eligible for this duty but this asset is not assigned explicit action/material/intensity conditions"],
                    })
            status = "matched" if any(row["status"] == "matched" for row in candidate_rows) else (
                "unconfirmed" if any(row["status"] == "unconfirmed" for row in candidate_rows) else "no_matching_candidate"
            )
            role_eligible_rows = [row for row in candidate_rows if row["dutyRoleEligible"]]
            matched_rows = [row for row in role_eligible_rows if row["status"] == "matched"]
            unconfirmed_rows = [row for row in role_eligible_rows if row["status"] == "unconfirmed"]
            if not group_duty:
                duty_coverage = None
            elif not role_eligible_rows:
                duty_coverage = {
                    "status": "gap-no-role-eligible-candidate", "indexedCandidateCount": 0,
                    "nextAction": "Search a free finished source for this duty, get the selected file, then use source-register to add it to this same audio index.",
                }
            elif matched_rows:
                duty_coverage = {
                    "status": "candidate-needs-file-license-and-listening-check", "indexedCandidateCount": len(role_eligible_rows),
                    "matchingMetadataCount": len(matched_rows),
                    "nextAction": "Run local-search for an exact asset ID; verify the actual file, hash, license, and full listening fit before use.",
                }
            elif unconfirmed_rows:
                duty_coverage = {
                    "status": "candidate-needs-event-condition", "indexedCandidateCount": len(role_eligible_rows),
                    "matchingMetadataCount": 0,
                    "nextAction": "For role-only registrations, compare the asset's indexed use/avoid guidance with the current task; run local-search and audition the full candidate in context. Role eligibility alone is not acoustic fit.",
                }
            else:
                duty_coverage = {
                    "status": "gap-no-candidate-passed-event-filters", "indexedCandidateCount": len(role_eligible_rows),
                    "matchingMetadataCount": 0,
                    "nextAction": "Search a free finished source for this duty, get the selected file, then use source-register to add it to this same audio index.",
                }
            results.append({
                "groupId": group_id,
                "duty": group_duty or None,
                "index": relative_or_absolute(work_root, index_path),
                "purpose": group.get("purpose"),
                "applicability": group.get("applicability"),
                "excludeWhen": group.get("excludeWhen", []),
                "useCase": group_use_case,
                "voiceContext": group.get("voiceContext"),
                "visualContext": group.get("visualContext"),
                "selectionPolicy": group.get("selectionPolicy"),
                "candidateOrderBasis": group.get("candidateOrderBasis"),
                "defaultSelectionAllowed": (
                    False if isinstance(group.get("candidates"), list)
                    else next((row["defaultSelectionAllowed"] for row in candidate_rows
                               if row.get("kind") in {"default", "candidate"}
                               and row.get("assetId") == group["default"]["assetId"]), True)
                ),
                "queryMatches": query_matches,
                "status": status,
                "dutyCoverage": duty_coverage,
                "candidates": candidate_rows,
                "basis": document.get(
                    "candidateGroupBasis",
                    "Candidate group metadata narrows search only; it does not establish listening suitability or review readiness.",
                ),
            })

    if explicit_id and explicit_id not in discovered_ids:
        if errors:
            return json_result("local-groups", "index_error", groupId=explicit_id, results=[], errors=errors), 4
        return json_result("local-groups", "unknown_group", groupId=explicit_id, results=[], errors=[]), 4
    if explicit_duty and explicit_duty not in discovered_duties:
        gap = {
            "dutyId": explicit_duty,
            "status": "gap-duty-not-indexed",
            "indexedCandidateCount": 0,
            "nextAction": "Derive source-search terms from the current task and event context; select and verify a free finished source, then use source-register to add it in this same audio index.",
        }
        return json_result("local-groups", "gap", duty=gap, query=args.query, results=[], errors=errors), 0
    if errors and not results:
        return json_result("local-groups", "index_error", results=results, errors=errors), 4
    status = "ok" if results else ("index_error" if errors else "empty")
    return json_result("local-groups", status, query=args.query, filters={
        "duty": explicit_duty,
        "action": getattr(args, "action", None),
        "material": getattr(args, "material", None),
        "intensity": getattr(args, "intensity", None),
        "maxSourceDurationSec": getattr(args, "max_source_duration_sec", None),
    }, results=results, errors=errors), 0 if status in {"ok", "empty"} else 4


def page_url(author, sound_id):
    return "https://freesound.org/people/{}/sounds/{}/".format(
        quote(str(author or ""), safe=""), quote(str(sound_id), safe="")
    )


def service_configuration(args, needs_oauth=False):
    problems = []
    service_use = getattr(args, "service_use", None)
    approval = getattr(args, "commercial_approval_reference", None)
    api_token = os.environ.get("FREESOUND_API_TOKEN", "").strip()
    oauth_token = os.environ.get("FREESOUND_OAUTH_ACCESS_TOKEN", "").strip()
    if service_use not in {"non-commercial", "commercial-approved"}:
        problems.append({
            "status": "service_use_unconfirmed",
            "error": "pass --service-use non-commercial only when this use is non-commercial; commercial API use requires Freesound approval",
        })
    elif service_use == "commercial-approved" and not (isinstance(approval, str) and approval.strip()):
        problems.append({
            "status": "commercial_approval_missing",
            "error": "commercial-approved use requires --commercial-approval-reference for the case-by-case approval",
        })
    if not api_token and not needs_oauth:
        problems.append({"status": "api_credentials_missing", "error": "FREESOUND_API_TOKEN is not configured"})
    if needs_oauth and not oauth_token:
        problems.append({"status": "oauth_credentials_missing", "error": "FREESOUND_OAUTH_ACCESS_TOKEN is required for original downloads"})
    return {
        "problems": problems,
        "apiToken": api_token,
        "oauthToken": oauth_token,
        "serviceUse": service_use,
        "approvalReference": approval.strip() if isinstance(approval, str) and approval.strip() else None,
    }


def configuration_failure(operation, errors, query=None, keys=None):
    row = {"status": "configuration_required", "errors": errors}
    if query is not None:
        row["query"] = query
    if keys is not None:
        row["keys"] = list(keys)
    return json_result(operation, "configuration_required", results=[row]), 2


FREESOUND_HOSTS = {"freesound.org", "www.freesound.org", "cdn.freesound.org"}


def approved_freesound_url(value):
    if not isinstance(value, str):
        return False
    parsed = urlparse(value)
    try:
        port = parsed.port
    except ValueError:
        return False
    return (
        parsed.scheme.lower() == "https"
        and parsed.hostname is not None
        and parsed.hostname.lower() in FREESOUND_HOSTS
        and port in (None, 443)
        and parsed.username is None
        and parsed.password is None
        and not parsed.fragment
    )


def request_origin(value):
    parsed = urlparse(value)
    return parsed.scheme.lower(), parsed.hostname.lower(), parsed.port or 443


class ApprovedFreesoundRedirectHandler(HTTPRedirectHandler):
    """Allow bounded HTTPS redirects only within Freesound's approved hosts."""

    def __init__(self):
        super().__init__()
        self.max_redirections = 6
        self.max_repeats = 3

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # This runs before urllib issues the redirected request. Check the full
        # destination here because validating response.geturl() is too late to
        # protect Authorization headers from an untrusted redirect target.
        if not approved_freesound_url(newurl):
            raise URLError("refusing redirect outside approved HTTPS Freesound/CDN hosts")
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if redirected is None:
            return None
        if request_origin(req.full_url) != request_origin(redirected.full_url):
            for header_map in (redirected.headers, redirected.unredirected_hdrs):
                for name in list(header_map):
                    if name.casefold() in {"authorization", "proxy-authorization"}:
                        del header_map[name]
        return redirected


def safe_urlopen(request, timeout):
    if not approved_freesound_url(request.full_url):
        raise ValueError("request URL is outside approved HTTPS Freesound/CDN hosts")
    opener = build_opener(ApprovedFreesoundRedirectHandler())
    return opener.open(request, timeout=timeout)


def api_request(url, token, auth_scheme="Token", max_bytes=MAX_DOWNLOAD_BYTES):
    if not approved_freesound_url(url):
        raise ValueError("request URL is outside approved HTTPS Freesound/CDN hosts")
    request_path = urlparse(url).path
    accept = "audio/*,application/octet-stream" if request_path.endswith("/download/") else "application/json" if request_path.startswith("/apiv2/") else "*/*"
    request_headers = {
        "User-Agent": "laohu-arrangement-sfx/1",
        "Accept": accept,
    }
    if token:
        request_headers["Authorization"] = auth_scheme + " " + token
    request = Request(url, headers=request_headers)
    with safe_urlopen(request, timeout=30) as response:
        data = response.read(max_bytes + 1)
        if len(data) > max_bytes:
            raise ValueError("Freesound response exceeds the configured size limit")
        headers = getattr(response, "headers", {})
        final_url = response.geturl() if hasattr(response, "geturl") else url
    return data, final_url, headers


def api_json(url, token):
    data, _final_url, _headers = api_request(url, token, "Token", max_bytes=8 * 1024 * 1024)
    try:
        document = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Freesound API returned invalid JSON") from exc
    if not isinstance(document, dict) or not isinstance(document.get("results"), list):
        raise ValueError("Freesound API response did not contain a sound results list")
    return document


def normalize_search_result(row):
    if not isinstance(row, dict):
        return None
    try:
        sound_id = int(row.get("id"))
    except (TypeError, ValueError):
        return None
    if sound_id < 1:
        return None
    username = row.get("username")
    previews = row.get("previews") if isinstance(row.get("previews"), dict) else {}
    source_page = page_url(username, sound_id)
    return {
        "key": "fs:" + str(sound_id),
        "id": sound_id,
        "title": str(row.get("name") or ""),
        "author": str(username or ""),
        "description": str(row.get("description") or ""),
        "tags": row.get("tags") if isinstance(row.get("tags"), list) else [],
        "durationSec": row.get("duration") if isinstance(row.get("duration"), (int, float)) else None,
        "licenseLabel": str(row.get("license") or ""),
        "candidatePage": source_page,
        "canonicalStatus": "constructed-from-official-API-username-and-id",
        "previewUrl": previews.get("preview-hq-mp3") or previews.get("preview-lq-mp3"),
        "previews": previews,
        "originalDownloadUri": row.get("download"),
        "downloads": row.get("num_downloads"),
        "rating": row.get("avg_rating"),
        "ratingCount": row.get("num_ratings"),
        "licenseDetailStatus": "manual-exact-single-file-license-check-required",
        "rightsStatus": "unverified-until-manual-exact-license-url-is-recorded",
    }


def api_cache_path(cache_root):
    return cache_root / "freesound-api-index.json"


def read_api_cache(cache_root):
    cache_path = api_cache_path(cache_root)
    if not cache_path.is_file():
        return {"schemaVersion": 1, "sounds": {}}
    try:
        document = json.loads(cache_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"schemaVersion": 1, "sounds": {}}
    if document.get("schemaVersion") != 1 or not isinstance(document.get("sounds"), dict):
        return {"schemaVersion": 1, "sounds": {}}
    return document


def freesound_search(args):
    work_root, cache_root = work_and_cache(args)
    config = service_configuration(args)
    if config["problems"]:
        return configuration_failure("freesound-search", config["problems"], query=args.query)
    if not 1 <= args.limit <= 150 or args.page < 1 or not 1 <= args.pages <= 10:
        return json_result("freesound-search", "invalid_request", query=args.query, results=[{
            "status": "invalid_request", "error": "--limit must be 1..150, --page >= 1, and --pages must be 1..10",
        }]), 2
    sort = {
        "relevance": "score", "downloads": "downloads_desc",
        "rating": "rating_desc", "short": "duration_asc",
    }[args.sort]
    rows, page_states, errors = [], {}, []
    for page in range(args.page, args.page + args.pages):
        query = urlencode({
            "query": args.query,
            "sort": sort,
            "page": page,
            "page_size": min(150, max(15, args.limit)),
            "fields": "id,name,tags,description,duration,username,license,previews,download,num_downloads,avg_rating,num_ratings",
        })
        url = FREESOUND_API + "search/?" + query
        try:
            document = api_json(url, config["apiToken"])
        except (OSError, TimeoutError, ValueError) as exc:
            errors.append({"page": page, "error": str(exc)})
            page_states[str(page)] = "request_error"
            break
        page_states[str(page)] = "results" if document["results"] else "empty"
        rows.extend(document["results"])
        if not document.get("next"):
            break
    cache = read_api_cache(cache_root)
    results, seen = [], set()
    for row in rows:
        normalized = normalize_search_result(row)
        if normalized is None or normalized["key"] in seen:
            continue
        seen.add(normalized["key"])
        label = normalized["licenseLabel"]
        allowed_label = classify_api_license_label(args.license, label)
        normalized["licenseFilterMatch"] = allowed_label
        normalized["status"] = "candidate" if allowed_label else "rights_unverified"
        if not allowed_label:
            normalized["error"] = "API license label is outside the requested filter or is not a supported label"
        results.append(normalized)
        cache["sounds"][normalized["key"]] = normalized
        if len(results) >= args.limit:
            break
    cache_path = api_cache_path(cache_root)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    if errors:
        status, code = "network_error", 3
    elif not results:
        status, code = "empty", 0
    elif any(row["status"] == "candidate" for row in results):
        status, code = "ok", 0
    else:
        status, code = "rights_unverified", 5
    return json_result(
        "freesound-search", status, query=args.query, licenseFilter=args.license,
        pageStates=page_states, results=results, errors=errors,
        serviceUse=config["serviceUse"], commercialApprovalReference=config["approvalReference"],
        cacheIndex=relative_or_absolute(work_root, cache_path),
        licenseBoundary="The API exposes a broad license label, not the exact per-file license URL. No HTML page scraping is used; verify the individual sound page manually before making an audio-plan asset.",
    ), code


def classify_api_license_label(requested, label):
    if requested == "cc0":
        return label == "Creative Commons 0"
    if requested == "by":
        return label in {"Attribution", "Creative Commons 0"}
    return requested == "any" and label in {"Attribution", "Creative Commons 0", "Attribution NonCommercial"}


def classify_license_filter(requested, license_id):
    if requested == "cc0":
        return license_id == "CC0-1.0"
    if requested == "by":
        return license_id == "CC0-1.0" or bool(re.fullmatch(r"CC-BY-(?:1\.0|2\.0|2\.5|3\.0|4\.0)", license_id or ""))
    return requested == "any" and (
        license_id == "CC0-1.0" or bool(re.fullmatch(r"CC-BY-(?:1\.0|2\.0|2\.5|3\.0|4\.0)", license_id or ""))
    )


def copy_without_overwrite(source, destination):
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        if destination.is_symlink() or not destination.is_file():
            return False, "output path already exists and is not a regular file"
        if digest_file(destination) == digest_file(source):
            return True, "existing identical file reused"
        return False, "output file exists with different content; choose a new path"
    try:
        with Path(source).open("rb") as src, destination.open("xb") as dst:
            shutil.copyfileobj(src, dst)
    except FileExistsError:
        return False, "output file appeared during write; refusing to replace it"
    return True, "copied after validation"


def parse_manual_license_url(label, license_url, verified_by):
    if not isinstance(verified_by, str) or not verified_by.strip() or verified_by.strip().casefold() in {
        "unknown", "n/a", "na", "none", "tbd", "todo", "reviewer", "human",
    }:
        return None, "rights_verified_by must identify the person who checked the individual sound page"
    if not isinstance(license_url, str) or not license_url.strip():
        return None, "an exact per-file Creative Commons license URL is required"
    parsed = urlparse(license_url.strip())
    if parsed.scheme != "https" or parsed.hostname not in {"creativecommons.org", "www.creativecommons.org"}:
        return None, "license URL must be an HTTPS Creative Commons canonical URL"
    license_path = parsed.path.lower().rstrip("/") + "/"
    if license_path == "/publicdomain/zero/1.0/":
        record = {
            "id": "CC0-1.0", "title": "CC0 1.0 Universal", "version": "1.0",
            "url": "https://creativecommons.org/publicdomain/zero/1.0/",
            "attribution": "Attribution is not required by CC0; retain source credit for provenance.",
        }
        if label != "Creative Commons 0":
            return None, "manual CC0 URL does not match the API license label"
        return record, None
    match = re.fullmatch(r"/licenses/by/(1\.0|2\.0|2\.5|3\.0|4\.0)/", license_path)
    if match:
        if label != "Attribution":
            return None, "manual CC BY URL does not match the API license label"
        version = match.group(1)
        titles = {
            "1.0": "Creative Commons Attribution 1.0 Generic",
            "2.0": "Creative Commons Attribution 2.0 Generic",
            "2.5": "Creative Commons Attribution 2.5 Generic",
            "3.0": "Creative Commons Attribution 3.0 Unported",
            "4.0": "Creative Commons Attribution 4.0 International",
        }
        canonical = "https://creativecommons.org/licenses/by/{}/".format(version)
        return {
            "id": "CC-BY-" + version, "title": titles[version], "version": version,
            "url": canonical,
            "attribution": "Attribution required: retain the creator, source page, exact license link, and note modifications when applicable.",
        }, None
    return None, "only exact CC0 1.0 and CC BY 1.0/2.0/2.5/3.0/4.0 licenses are supported for audio-plan assets"


def audio_plan_asset(work_root, key, detail, target, inspected, license_record, file_kind, verified_by):
    if license_record["id"] == "CC0-1.0":
        recommended_credit = '"{}" by {}, Freesound: {} ({}: {}). Attribution is not required by CC0.'.format(
            detail["title"], detail["author"], detail["sourcePage"], license_record["title"], license_record["url"],
        )
    else:
        recommended_credit = '"{}" by {}, Freesound: {}, licensed under {} ({}). Describe modifications where required.'.format(
            detail["title"], detail["author"], detail["sourcePage"], license_record["title"], license_record["url"],
        )
    return {
        "id": "freesound-" + key.partition(":")[2],
        "file": relative_or_absolute(work_root, target),
        "durationSec": inspected["durationSec"],
        "sha256": inspected["sha256"],
        "author": detail["author"],
        "license": license_record["id"],
        "licenseTitle": license_record["title"],
        "licenseUrl": license_record["url"],
        "attribution": license_record["attribution"],
        "redistribution": {
            "status": "redistributable", "syncUse": "allowed",
            "basis": "Per-file license URL manually checked by {}: {}. This applies to the source sound and this retrieved file.".format(verified_by.strip(), license_record["url"]),
            "notes": license_record["attribution"],
        },
        "reviewStatus": "candidate-unreviewed",
        "source": {
            "page": detail["sourcePage"], "soundTitle": detail["title"], "author": detail["author"],
            "version": license_record["id"], "licenseTitle": license_record["title"],
            "licenseUrl": license_record["url"], "attribution": license_record["attribution"],
            "recommendedCredit": recommended_credit, "fileKind": file_kind,
            "licenseVerifiedBy": verified_by.strip(),
        },
    }


def safe_api_sound_url(value, require_api_path=False):
    if not approved_freesound_url(value):
        return False
    parsed = urlparse(value)
    if require_api_path and not re.fullmatch(r"/apiv2/sounds/[1-9][0-9]*/download/", parsed.path):
        return False
    return True


def response_extension(headers, final_url, kind):
    if kind == "preview":
        return ".mp3"
    disposition = ""
    if hasattr(headers, "get"):
        disposition = headers.get("Content-Disposition", "") or ""
    message = Message()
    if disposition:
        message["content-disposition"] = disposition
        filename = message.get_filename()
        if filename:
            suffix = Path(filename).suffix.lower()
            if re.fullmatch(r"\.[a-z0-9]{1,8}", suffix):
                return suffix
    suffix = Path(urlparse(final_url).path).suffix.lower()
    return suffix if re.fullmatch(r"\.[a-z0-9]{1,8}", suffix) else ".audio"


def external_download(args):
    work_root, cache_root = work_and_cache(args)
    if len(set(args.key)) != len(args.key):
        return json_result("download", "invalid_request", results=[{"status": "invalid_request", "error": "duplicate --key values are not allowed"}]), 2
    if args.kind not in {"preview", "original"}:
        return json_result("download", "invalid_request", results=[{"status": "invalid_request", "error": "--kind must be preview or original"}]), 2
    config = service_configuration(args, needs_oauth=args.kind == "original")
    if config["problems"]:
        return configuration_failure("download", config["problems"], keys=args.key)
    cache = read_api_cache(cache_root)
    invalid = [key for key in args.key if not re.fullmatch(r"fs:[1-9][0-9]*", key)]
    missing = [key for key in args.key if key not in cache["sounds"]]
    if invalid or missing:
        details = []
        if invalid:
            details.append({"status": "invalid_key", "error": "keys must use fs:<numeric-id>", "keys": invalid})
        if missing:
            details.append({"status": "search_required", "error": "search the exact key first so official API metadata is cached", "keys": missing})
        return json_result("download", "invalid_request", results=details), 4
    out_dir = resolve_work_path(work_root, args.out_dir, default=cache_root / "downloads")
    if not path_inside(work_root, out_dir):
        return json_result("download", "invalid_output", results=[{"status": "invalid_output", "error": "output directory must remain inside the explicit work project"}]), 2
    stage = cache_root / "downloads"
    stage.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)
    final_rows = []
    for key in args.key:
        entry = cache["sounds"][key]
        sound_id = int(key.partition(":")[2])
        if args.kind == "preview":
            download_url = entry.get("previewUrl")
            auth_scheme = None
            token = None
            if not safe_api_sound_url(download_url):
                final_rows.append({"key": key, "status": "configuration_error", "error": "cached official API metadata has no allowed HTTPS preview URL"})
                continue
        else:
            download_url = FREESOUND_API + "sounds/{}/download/".format(sound_id)
            auth_scheme, token = "Bearer", config["oauthToken"]
        try:
            data, final_url, headers = api_request(
                download_url, token, auth_scheme or "Token", max_bytes=MAX_DOWNLOAD_BYTES,
            )
            if not safe_api_sound_url(final_url):
                raise ValueError("Freesound redirected the audio request outside the approved host allowlist")
        except (OSError, TimeoutError, ValueError) as exc:
            final_rows.append({"key": key, "status": "network_error", "error": str(exc)})
            continue
        suffix = response_extension(headers, final_url, args.kind)
        staged = stage / ("fs_{}-{}{}".format(sound_id, args.kind, suffix))
        try:
            with staged.open("xb") as stream:
                stream.write(data)
        except FileExistsError:
            if digest_file(staged) != hashlib.sha256(data).hexdigest():
                final_rows.append({"key": key, "status": "output_conflict", "error": "staging file already exists with different bytes"})
                continue
        inspected, error, inspect_status = inspect_audio(staged, args.ffprobe, expected_codec="mp3" if args.kind == "preview" else None)
        if error:
            final_rows.append({"key": key, "status": inspect_status, "error": error})
            continue
        target = out_dir / staged.name
        copied, copy_note = copy_without_overwrite(staged, target)
        if not copied:
            final_rows.append({"key": key, "status": "output_conflict", "error": copy_note})
            continue
        verified, verify_error, verify_status = inspect_audio(target, args.ffprobe, expected_codec="mp3" if args.kind == "preview" else None)
        if verify_error or verified["sha256"] != inspected["sha256"]:
            final_rows.append({"key": key, "status": verify_status or "file_invalid", "error": verify_error or "copied output hash differs from downloaded bytes"})
            continue
        page = entry.get("candidatePage") or page_url(entry.get("author"), sound_id)
        detail = {"sourcePage": page, "author": entry.get("author"), "title": entry.get("title")}
        license_record, rights_error = parse_manual_license_url(entry.get("licenseLabel"), args.verified_license_url, args.rights_verified_by)
        if license_record and not classify_license_filter(args.license, license_record["id"]):
            license_record, rights_error = None, "manual per-file license does not match the requested --license filter"
        file_kind = "Freesound high-quality MP3 preview; not the uploader's original file" if args.kind == "preview" else "uploader original downloaded through the OAuth2-only API endpoint"
        row = {
            "key": key, "title": entry.get("title"), "description": entry.get("description"),
            "author": entry.get("author"), "file": relative_or_absolute(work_root, target),
            "format": verified["format"], "codec": verified["codec"], "durationSec": verified["durationSec"],
            "sizeBytes": verified["sizeBytes"], "sha256": verified["sha256"], "sourcePage": page,
            "licenseLabel": entry.get("licenseLabel"), "sourceRange": {"inSec": 0.0, "outSec": verified["durationSec"]},
            "hitTimeSec": None, "hitTimeBasis": "pending-listening; duration and download start are not a human-confirmed hit point",
            "downloadKind": args.kind, "downloadDisposition": copy_note,
            "audioPlanAsset": None,
        }
        if rights_error:
            row.update({"status": "rights_unverified", "error": rights_error})
        else:
            row["audioPlanAsset"] = audio_plan_asset(work_root, key, detail, target, verified, license_record, file_kind, args.rights_verified_by)
            row.update({
                "status": "candidate-unreviewed", "license": license_record["id"], "licenseTitle": license_record["title"],
                "licenseUrl": license_record["url"], "attribution": license_record["attribution"],
                "redistribution": row["audioPlanAsset"]["redistribution"],
            })
        final_rows.append(row)
    states = {row.get("status") for row in final_rows}
    if "network_error" in states:
        status, code = "network_error", 3
    elif "probe_unavailable" in states:
        status, code = "probe_unavailable", PROBE_UNAVAILABLE_EXIT
    elif "file_invalid" in states:
        status, code = "file_invalid", 6
    elif "rights_unverified" in states:
        status, code = "rights_unverified", 5
    elif "output_conflict" in states:
        status, code = "partial_download", 7
    elif states == {"candidate-unreviewed"}:
        status, code = "ok", 0
    else:
        status, code = "download_error", 7
    return json_result(
        "download", status, results=final_rows,
        serviceUse=config["serviceUse"], commercialApprovalReference=config["approvalReference"],
        cacheIndex=relative_or_absolute(work_root, api_cache_path(cache_root)),
        rightsBoundary="API license labels do not provide exact per-file license versions. Only a manually verified supported license URL creates an audio-plan asset; download status remains candidate-unreviewed until a separate full-file listening review.",
    ), code

def parser():
    root = argparse.ArgumentParser(description=__doc__)
    commands = root.add_subparsers(dest="command", required=True)
    groups = commands.add_parser("local-groups", help="filter local SFX candidate groups without claiming listening suitability")
    groups.add_argument("--query", help="optional action/material search terms")
    groups.add_argument("--group-id", help="show one exact candidate group; unknown IDs fail explicitly")
    groups.add_argument("--duty", help="check one exact indexed sound responsibility; a missing duty returns an external-source gap route")
    groups.add_argument("--action", help="current event action for candidate-condition filtering")
    groups.add_argument("--material", help="current contact material for candidate-condition filtering")
    groups.add_argument("--intensity", help="current event intensity label for candidate-condition filtering")
    groups.add_argument("--max-source-duration-sec", type=float, help="coarse maximum indexed source duration")
    groups.add_argument("--use-case", choices=tuple(sorted(MUSIC_USE_CASES)), help="canonical music context used for negative-feedback filtering")
    groups.add_argument("--work-root", default=".")
    groups.add_argument("--index", action="append", help="audio index.json; may be repeated")
    groups.set_defaults(handler=local_groups)
    local = commands.add_parser("local-search", help="match checked local audio indices before external search")
    local.add_argument("--query", help="search indexed audio metadata; use --asset-id for one exact indexed record")
    local.add_argument("--asset-id", help="check exactly one stable asset ID without token-based results from other assets")
    local.add_argument("--work-root", default=".")
    local.add_argument("--review-scope", help="exact current event applicability scope; required to reuse an indexed ready review")
    local.add_argument("--use-case", choices=tuple(sorted(MUSIC_USE_CASES)), help="canonical music use context for source-range-specific negative feedback")
    local.add_argument("--source-in-sec", type=float)
    local.add_argument("--source-out-sec", type=float)
    local.add_argument("--index", action="append", help="audio index.json; may be repeated")
    local.add_argument("--ffprobe", default="ffprobe")
    local.set_defaults(handler=local_search)
    review = commands.add_parser("local-review", help="record a human-confirmed source review in the same indexed asset record")
    review.add_argument("--asset-id", required=True)
    review.add_argument("--scope", required=True, help="listening context and intended use")
    review.add_argument("--in-sec", type=float, help="start of the actually auditioned source range")
    review.add_argument("--out-sec", type=float, help="end of the actually auditioned source range")
    review.add_argument("--full-file", action="store_true", help="record that the whole probed file was auditioned")
    review.add_argument("--reviewer", required=True, help="actual reviewer identifier; placeholders are rejected")
    review.add_argument("--reviewer-type", required=True, choices=("human", "model", "agent"),
                        help="human is required for confirmed listening or a hard applicability exclusion")
    review.add_argument("--use-case", choices=tuple(sorted(APPLICABILITY_USE_CASES)),
                        help="canonical applicability scope for fail/conditional feedback; use all only for a source-wide rejection")
    review.add_argument("--resolve-use-case-exclusions", action="store_true",
                        help="on a human pass, explicitly clear matching source-range/use-case exclusions and retain them in history")
    review.add_argument("--conclusion", required=True, choices=("pass", "conditional", "fail"))
    review.add_argument("--notes", help="observed listening evidence or limitation")
    review.add_argument("--confirm-listened", action="store_true", help="assert that a person auditioned this exact file and range")
    review.add_argument("--work-root", default=".")
    review.add_argument("--index", default="assets/audio/index.json")
    review.add_argument("--ffprobe", default=os.environ.get("LAOHU_FFPROBE") or os.environ.get("MOTION_FFPROBE") or "ffprobe")
    review.set_defaults(handler=local_review)
    search = commands.add_parser("freesound-search", help="search through the official Freesound API")
    search.add_argument("--query", required=True)
    search.add_argument("--license", choices=("cc0", "by", "any"), default="by")
    search.add_argument("--sort", choices=("relevance", "downloads", "rating", "short"), default="relevance")
    search.add_argument("--limit", type=int, default=8)
    search.add_argument("--page", type=int, default=1)
    search.add_argument("--pages", type=int, default=2)
    search.add_argument("--work-root", default=".")
    search.add_argument("--cache-dir")
    search.add_argument("--service-use", choices=("non-commercial", "commercial-approved"), help="confirm permitted service use for this request")
    search.add_argument("--commercial-approval-reference", help="case-by-case Freesound approval reference for commercial API use")
    search.set_defaults(handler=freesound_search)
    download = commands.add_parser("download", help="retrieve a cached Freesound preview or OAuth2 original")
    download.add_argument("--key", action="append", required=True, help="selected Freesound key, e.g. fs:464302; repeatable")
    download.add_argument("--license", choices=("cc0", "by", "any"), default="by")
    download.add_argument("--kind", choices=("preview", "original"), default="preview", help="preview is not the uploader's original; original requires OAuth2")
    download.add_argument("--verified-license-url", help="exact per-file license URL manually checked from the individual sound page")
    download.add_argument("--rights-verified-by", help="person who checked the individual sound page and license")
    download.add_argument("--work-root", default=".")
    download.add_argument("--cache-dir")
    download.add_argument("--out-dir")
    download.add_argument("--ffprobe", default="ffprobe")
    download.add_argument("--service-use", choices=("non-commercial", "commercial-approved"), help="confirm permitted service use for this request")
    download.add_argument("--commercial-approval-reference", help="case-by-case Freesound approval reference for commercial API use")
    download.set_defaults(handler=external_download)
    source_search = commands.add_parser("source-search", help="search Arrangement's local Mixkit, Freesound, Pixabay and Kenney providers")
    source_search.add_argument("--query", required=True)
    source_search.add_argument("--action", help="event action used before popularity ranking")
    source_search.add_argument("--material", help="contact material used before popularity ranking")
    source_search.add_argument("--min-duration-sec", type=float)
    source_search.add_argument("--max-duration-sec", type=float)
    source_search.add_argument("--providers", default="mixkit,freesound,pixabay")
    source_search.add_argument("--role", choices=("general", "ui", "music"), default="general")
    source_search.add_argument("--use-case", choices=tuple(sorted(MUSIC_USE_CASES)))
    source_search.add_argument("--track-type", choices=("any", "fulltrack", "loop", "cue"), default="any")
    source_search.add_argument("--source-in-sec", type=float)
    source_search.add_argument("--source-out-sec", type=float)
    source_search.add_argument("--voice-context", choices=("narration-present", "dialog-present", "no-voice", "unknown"))
    source_search.add_argument("--visual-context")
    source_search.add_argument("--pixabay-playlist", help="curated Pixabay music playlist slug")
    source_search.add_argument("--pack", help="search or fetch one named coherent Kenney pack")
    source_search.add_argument("--freesound-license", choices=("cc0", "by", "any"), default="any")
    source_search.add_argument("--limit", type=int, default=12)
    source_search.add_argument("--pages", type=int, default=3)
    source_search.add_argument("--work-root", default=".")
    source_search.add_argument("--cache-dir")
    source_search.add_argument("--tmp-dir")
    source_search.add_argument("--python", help="Python executable for Arrangement source library (defaults to LAOHU_SOUND_PYTHON or python3.12)")
    source_search.add_argument("--ffmpeg")
    source_search.add_argument("--ffprobe")
    source_search.set_defaults(handler=lambda args: arrangement_source(args, "source-search"))
    source_get = commands.add_parser("source-get", help="download selected provider candidates through Arrangement's local source library")
    source_get.add_argument("--key", action="append", required=True)
    source_get.add_argument("--out-dir", default="assets/audio/sfx")
    source_get.add_argument("--work-root", default=".")
    source_get.add_argument("--cache-dir")
    source_get.add_argument("--tmp-dir")
    source_get.add_argument("--python", help="Python executable for Arrangement source library (defaults to LAOHU_SOUND_PYTHON or python3.12)")
    source_get.add_argument("--ffmpeg")
    source_get.add_argument("--ffprobe")
    source_get.set_defaults(handler=lambda args: arrangement_source(args, "source-get"))
    register = commands.add_parser("source-register", help="verify and register one Arrangement source-get file as a candidate in an existing audio index")
    register.add_argument("--source-get-receipt", required=True)
    register.add_argument("--source-search-receipt")
    register.add_argument("--key", required=True, help="exact provider file key from the source-get receipt")
    register.add_argument("--asset-id", required=True, help="stable asset ID that does not already exist in the index")
    register.add_argument("--index", default="assets/audio/index.json", help="existing schemaVersion 1 project audio index")
    register.add_argument("--file", required=True, help="new path relative to the asset index directory; existing outputs are rejected")
    register.add_argument("--role", required=True)
    register.add_argument("--material", required=True)
    register.add_argument("--energy", required=True)
    register.add_argument("--tag", action="append", required=True)
    register.add_argument("--author", help="verified creator/package author; source receipt author is used if present")
    register.add_argument("--source-pack", help="human-readable package name, required for Kenney pack files")
    register.add_argument("--source-version", help="source package version when explicitly documented")
    register.add_argument("--source-archive", help="source package archive used to verify originalPath and License.txt")
    register.add_argument("--license-id", help="exact supported license ID: CC0-1.0 or CC-BY-1.0/2.0/2.5/3.0/4.0")
    register.add_argument("--license-proof", help="preserved package License.txt path inside the project")
    register.add_argument("--work-root", default=".")
    register.add_argument(
        "--ffprobe",
        default=os.environ.get("LAOHU_FFPROBE") or os.environ.get("MOTION_FFPROBE") or "ffprobe",
        help="working ffprobe executable; also accepts LAOHU_FFPROBE or MOTION_FFPROBE",
    )
    register.set_defaults(handler=source_register)
    return root


def main(argv=None):
    args = parser().parse_args(argv)
    try:
        if getattr(args, "query", None) is not None and not args.query.strip():
            raise ValueError("query must contain an action or material term")
        result, code = args.handler(args)
    except (OSError, TimeoutError) as exc:
        result, code = json_result(args.command, "network_error", error=str(exc)), 3
    except (ValueError, TypeError, KeyError) as exc:
        text = str(exc)
        status = "upstream_hash_error" if "hash mismatch" in text else "invalid_request"
        result, code = json_result(args.command, status, error=text), 4
    return write_result(result, code)


if __name__ == "__main__":
    raise SystemExit(main())
