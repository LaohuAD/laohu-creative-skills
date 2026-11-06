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
}


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
    if not isinstance(record.get("conclusion"), str) or record["conclusion"].strip().casefold() != "pass":
        return "review-conclusion-not-pass"
    return "reused-exact-scope-and-file-hash"


def local_search(args):
    work_root, _ = work_and_cache(args)
    query_terms = tokenize(args.query)
    if not query_terms:
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
            values = asset_fields(asset)
            matches = []
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
                "matches": matches,
                "reviewRecord": review,
                "reviewReuseStatus": review_reuse,
                "audioPlanAsset": normalized if not (index_path == DEFAULT_INDEX.resolve()) else None,
            }
            if not rights_are_consumable(normalized):
                item["status"] = "rights_unverified"
                item["error"] = "license or sync/redistribution boundary is missing or unresolved"
                item["audioPlanAsset"] = None
            results.append(item)
    row_states = {item.get("status") for item in results}
    if "probe_unavailable" in row_states:
        status, code = "probe_unavailable", PROBE_UNAVAILABLE_EXIT
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
    return json_result("local-search", status, query=args.query, results=results, errors=errors), code


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
    for key in ("id", "purpose", "keywords", "applicability"):
        value = group.get(key)
        if isinstance(value, dict):
            values.extend(str(item) for item in value.values())
        elif isinstance(value, (list, tuple)):
            values.extend(str(item) for item in value)
        elif value is not None:
            values.append(str(value))
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

    if not (action or material or intensity or maximum is not None):
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
                if not isinstance(group.get("default"), dict) or not isinstance(group.get("default", {}).get("assetId"), str):
                    raise ValueError("candidate group requires a default assetId: " + group_id)
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
            text = _group_text_values(group)
            query_matches = [{"term": token} for token in query_terms if token in text]
            if query_terms and not query_matches:
                continue
            all_candidates = [("default", group["default"])] + [("alternative", value) for value in group.get("alternatives", [])]
            candidate_rows = []
            for kind, candidate in all_candidates:
                asset = assets[candidate["assetId"]]
                fit = _filter_candidate_group(candidate, asset, args)
                candidate_rows.append({
                    "kind": kind,
                    "assetId": candidate["assetId"],
                    "when": candidate.get("when"),
                    "actions": candidate.get("actions", []),
                    "materials": candidate.get("materials", []),
                    "intensities": candidate.get("intensities", []),
                    "role": asset.get("role"),
                    "indexedMaterial": asset.get("material"),
                    "indexedEnergy": asset.get("energy"),
                    "durationSec": asset.get("durationSec"),
                    "reviewStatus": asset.get("reviewStatus"),
                    **fit,
                })
            status = "matched" if any(row["status"] == "matched" for row in candidate_rows) else (
                "unconfirmed" if any(row["status"] == "unconfirmed" for row in candidate_rows) else "no_matching_candidate"
            )
            results.append({
                "groupId": group_id,
                "index": relative_or_absolute(work_root, index_path),
                "purpose": group.get("purpose"),
                "applicability": group.get("applicability"),
                "excludeWhen": group.get("excludeWhen", []),
                "queryMatches": query_matches,
                "status": status,
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
    if errors and not results:
        return json_result("local-groups", "index_error", results=results, errors=errors), 4
    status = "ok" if results else ("index_error" if errors else "empty")
    return json_result("local-groups", status, query=args.query, filters={
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
    groups.add_argument("--action", help="current event action for candidate-condition filtering")
    groups.add_argument("--material", help="current contact material for candidate-condition filtering")
    groups.add_argument("--intensity", help="current event intensity label for candidate-condition filtering")
    groups.add_argument("--max-source-duration-sec", type=float, help="coarse maximum indexed source duration")
    groups.add_argument("--work-root", default=".")
    groups.add_argument("--index", action="append", help="audio index.json; may be repeated")
    groups.set_defaults(handler=local_groups)
    local = commands.add_parser("local-search", help="match checked local audio indices before external search")
    local.add_argument("--query", required=True)
    local.add_argument("--work-root", default=".")
    local.add_argument("--review-scope", help="exact current event applicability scope; required to reuse an indexed ready review")
    local.add_argument("--index", action="append", help="audio index.json; may be repeated")
    local.add_argument("--ffprobe", default="ffprobe")
    local.set_defaults(handler=local_search)
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
