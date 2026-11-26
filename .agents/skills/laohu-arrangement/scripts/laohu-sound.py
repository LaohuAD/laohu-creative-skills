#!/usr/bin/env python3
"""Local source SFX discovery and procedural audio tools for Arrangement."""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from typing import Any


sys.dont_write_bytecode = True

SKILL_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = SKILL_DIR.parents[2]
SOUND_DIR = Path(__file__).resolve().parent / "sound"
DEFAULT_SOUND_CACHE = Path(".cache") / "sound"
DEFAULT_SOUND_TMP = Path(".cache") / "tmp" / "sound"
sys.path.insert(0, str(SOUND_DIR.parent))
MUSIC_USE_CASES = (
    "narration-bed-light-advance",
    "lively-explanation",
    "rhythm-demonstration-collage",
    "tense-reveal",
    "no-voice-chapter-showcase",
    "closing-resolution",
)
MUSIC_VOICE_CONTEXTS = ("narration-present", "dialog-present", "no-voice", "unknown")
MUSIC_USE_CASE_EVIDENCE_TERMS = {
    "narration-bed-light-advance": {"light", "soft", "subtle", "gentle", "underscore", "background", "piano", "bed"},
    "lively-explanation": {"upbeat", "playful", "fun", "bright", "cheerful", "groove", "energetic", "funky"},
    "rhythm-demonstration-collage": {"rhythm", "rhythmic", "groove", "funk", "beat", "drums", "loop", "tempo", "percussion"},
    "tense-reveal": {"suspense", "suspenseful", "tense", "tension", "reveal", "revealing", "dramatic", "orchestral", "mystery", "cinematic"},
    "no-voice-chapter-showcase": {"showcase", "chapter", "cinematic", "wonder", "awe", "instrumental", "score", "orchestral"},
    "closing-resolution": {"ending", "outro", "closing", "resolution", "calm", "hopeful", "gentle", "final", "piano", "cadence"},
}
MUSIC_CONTEXT_STOP_WORDS = {
    "the", "and", "with", "from", "under", "over", "during", "into", "for", "while",
    "this", "that", "your", "current", "scene", "sequence", "music", "voice", "narration",
    "dialog", "present", "picture", "visual", "there", "then", "than", "where",
}


def _tokens(value: str) -> list[str]:
    return [part.casefold() for part in re.findall(r"[\w-]+", value, flags=re.UNICODE) if len(part) > 1]


def _duration_sec(value: str | None) -> float | None:
    if not value:
        return None
    text = value.strip().casefold()
    if text.endswith("s"):
        text = text[:-1]
    try:
        if ":" in text:
            total = 0.0
            for part in text.split(":"):
                total = total * 60 + float(part)
            return total
        return float(text)
    except ValueError:
        return None


def _provider_stats(row: dict[str, Any]) -> dict[str, Any]:
    stats: dict[str, Any] = {}
    for name in ("downloads", "likes"):
        value = row.get(name)
        if value is not None:
            stats[name] = value
    raw_stats = row.get("stats", "")
    if isinstance(raw_stats, dict):
        for name in ("downloads", "likes", "rating", "votes", "plays"):
            value = raw_stats.get(name)
            if isinstance(value, (int, float)):
                stats[name] = value
        return stats
    if not isinstance(raw_stats, str):
        raw_stats = ""
    likes = re.search(r"♥(\d+)", raw_stats)
    if likes and "likes" not in stats:
        stats["likes"] = int(likes.group(1))
    match = re.search(r"★([\d.]+)\((\d+)\)", raw_stats)
    if match:
        stats["rating"] = float(match.group(1))
        stats["votes"] = int(match.group(2))
    downloads = re.search(r"↓(\d+)", raw_stats)
    if downloads and "downloads" not in stats:
        stats["downloads"] = int(downloads.group(1))
    return stats


def _semantic_scores(row: dict[str, Any], query: str, action: str, material: str) -> tuple[int, int, int]:
    words = set(_tokens(f"{row.get('title', '')} {row.get('desc', '')}"))
    action_words = set(_tokens(action))
    material_words = set(_tokens(material))
    query_words = set(_tokens(query))
    return (len(action_words & words), len(material_words & words), len(query_words & words))


def _status_for_exception(error: BaseException) -> tuple[str, str]:
    if isinstance(error, (ImportError, ModuleNotFoundError)):
        return "dependency_missing", str(error)
    if isinstance(error, (OSError, TimeoutError, ConnectionError)):
        return "network_error", str(error)
    return "failed", f"{type(error).__name__}: {error}"


def _capture_provider(library: Any, name: str, query: str, pages: int, limit: int,
                      license_filter: str, pack: str | None = None, role: str = "general",
                      pixabay_playlist: str | None = None) -> list[dict[str, Any]]:
    captured: list[dict[str, Any]] = []
    old_show = library.show

    def collect(rows: list[dict[str, Any]], args: Any, lic: bool = False, hint: str = "") -> None:
        old_show(rows, args, lic=lic, hint=hint)
        captured.extend(rows)

    library.show = collect
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            if name == "mixkit":
                from types import SimpleNamespace
                if role == "music":
                    library.mixkit_music(SimpleNamespace(query=query, n=limit, urls=False))
                else:
                    library.mixkit(SimpleNamespace(keyword=query, n=limit, urls=False))
            elif name == "freesound":
                from types import SimpleNamespace
                library.freesound(SimpleNamespace(query=query, sort="relevance", license=license_filter,
                                                  n=limit, urls=False, page=1, pages=pages, role=role))
            elif name == "pixabay":
                if importlib.util.find_spec("curl_cffi") is None:
                    raise ModuleNotFoundError("Pixabay requires curl_cffi in the isolated cache venv; run `laohu-sound.py setup pixabay`.")
                from types import SimpleNamespace
                if role == "music":
                    library.pixabay_music(SimpleNamespace(query=query, n=limit, urls=False, page=1,
                                                          pages=pages, playlist=pixabay_playlist))
                else:
                    library.pixabay(SimpleNamespace(query=query, n=limit, urls=False, page=1, pages=pages))
            else:
                raise ValueError(f"unsupported row provider: {name}")
    finally:
        library.show = old_show
    return captured


def _kenney_catalog(library: Any) -> list[str]:
    from types import SimpleNamespace
    output = io.StringIO()
    with contextlib.redirect_stdout(output):
        library.kenney(SimpleNamespace(pack=None))
    text = output.getvalue().strip()
    return text.split() if text else []


def _canonical_row(provider: str, row: dict[str, Any], query: str, action: str, material: str,
                   min_duration: float | None, max_duration: float | None,
                   provider_priority: int, provider_rank: int,
                   music_context: dict[str, Any] | None = None) -> dict[str, Any]:
    duration = _duration_sec(row.get("dur"))
    duration_fit: int | None = None
    if duration is not None and (min_duration is not None or max_duration is not None):
        duration_fit = int((min_duration is None or duration >= min_duration)
                           and (max_duration is None or duration <= max_duration))
    a_score, m_score, q_score = _semantic_scores(row, query, action, material)
    stats = _provider_stats(row)
    result = {
        "key": row["key"],
        "provider": provider,
        "title": row.get("title", ""),
        "duration": {"label": row.get("dur") or None, "seconds": duration},
        "author": row.get("author") or None,
        "sourcePage": row.get("page"),
        "preview": {"url": row.get("preview") or None, "localPath": None},
        "downloadUrl": row.get("url") or None,
        "license": {
            "providerLabel": row.get("license") or "unknown",
            "exactVersionVerified": False,
            "licenseUrl": None,
            "verification": "manual_source_page_verification_required",
        },
        "stats": stats,
        "providerNativeRank": provider_rank,
        "providerRankBasis": row.get("providerRankBasis", {
            "freesound": "Freesound relevance pages locally sorted by downloads; provider-local ordering is not compared across providers or treated as listening quality",
            "pixabay": "Pixabay sound-effects results locally sorted by track likes; provider-local counts are not compared across providers",
            "mixkit": "source-native page order; provider popularity metric unavailable",
        }.get(provider, "not ranked by popularity")),
        "description": row.get("desc") or None,
        "fit": {
            "actionTokenHits": a_score,
            "materialTokenHits": m_score,
            "queryTokenHits": q_score,
            "durationWithinRequestedRange": duration_fit,
            "basis": "exact title/description token overlap; human confirms action, material, and sound fit",
        },
        "_sort": (a_score, m_score, q_score, duration_fit if duration_fit is not None else -1,
                  -provider_priority, -provider_rank),
    }
    if isinstance(row.get("musicMetadata"), dict):
        result["musicMetadata"] = row["musicMetadata"]
        result["sourceTags"] = row.get("tags", []) if isinstance(row.get("tags"), list) else []
        context = music_context or {}
        result["musicContext"] = {
            **context,
            "requestedTrackType": context.get("trackType", "any"),
            "requestedSourceRangeSec": {
                "inSec": context.get("sourceInSec"),
                "outSec": context.get("sourceOutSec"),
                "status": "requested-unverified" if context.get("sourceInSec") is not None
                or context.get("sourceOutSec") is not None else "not-selected",
            },
            "applicabilityStatus": "unconfirmed-by-listening",
            "voiceAndVisualContextAre": "selection context only; metadata cannot prove acoustic fit or voice intelligibility",
        }
    if isinstance(row.get("community"), dict):
        result["community"] = row["community"]
    if isinstance(row.get("rights"), dict):
        result["rights"] = row["rights"]
    if row.get("listingPage"):
        result["listingPage"] = row["listingPage"]
    return result


def _music_context_fit(row: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    """Expose structured request/source evidence without scoring or asserting acoustic fit."""
    metadata = row.get("musicMetadata", {})
    title = row.get("title", "")
    description = row.get("description") or ""
    tags = row.get("sourceTags", [])
    source_text = " ".join(str(value) for value in [title, description, *(tags if isinstance(tags, list) else [])]
                           if value is not None)
    source_words = set(_tokens(source_text))
    use_case = context.get("useCase")
    use_case_terms = MUSIC_USE_CASE_EVIDENCE_TERMS.get(use_case, set())
    use_case_matches = sorted(source_words & use_case_terms)
    visual_context = context.get("visualContext")
    visual_terms = {word for word in _tokens(visual_context or "") if word not in MUSIC_CONTEXT_STOP_WORDS}
    visual_matches = sorted(source_words & visual_terms)

    voice_value = metadata.get("voice", {}).get("value") if isinstance(metadata, dict) else None
    voice_context = context.get("voiceContext")
    if voice_context in {"narration-present", "dialog-present"}:
        if voice_value == "instrumental":
            voice_status = "source-claim-instrumental; audition-required"
        elif voice_value == "vocal-present":
            voice_status = "source-claim-vocal-present; check-masking-by-audition"
        else:
            voice_status = "unknown-source-voice; audition-required"
    elif voice_context == "no-voice":
        voice_status = "no-dialogue-mask-context; source-vocal-claim-still-needs-audition"
    elif voice_context == "unknown":
        voice_status = "unknown-context"
    else:
        voice_status = "not-requested"

    requested_in = context.get("sourceInSec")
    requested_out = context.get("sourceOutSec")
    duration = row.get("duration", {}).get("seconds")
    range_requested = requested_in is not None or requested_out is not None
    range_status = "not-requested"
    if range_requested:
        range_status = ("duration-covers-requested-range" if isinstance(duration, (int, float))
                        and (requested_in is None or requested_in < duration)
                        and (requested_out is None or requested_out <= duration)
                        else "duration-unknown")

    track_type = metadata.get("trackType", {}).get("value") if isinstance(metadata, dict) else None
    track_type_requested = context.get("trackType", "any")
    return {
        "trackTypeEvidence": {
            "requested": track_type_requested,
            "sourceClaim": track_type,
            "status": "source-claim-matches-request" if track_type_requested != "any" and track_type == track_type_requested
            else "not-filtered" if track_type_requested == "any" else "source-claim-not-confirmed",
            "basis": "provider page text; an explicit type request filters out unknown or different claims",
        },
        "useCaseEvidence": {
            "requested": use_case,
            "status": "source-text-overlap" if use_case_matches else ("no-source-text-overlap" if use_case else "not-requested"),
            "matchingSourceTerms": use_case_matches,
            "basis": "title/description/source-tag text only; no acoustic or editorial fit is inferred",
        },
        "sourceRangeEvidence": {"status": range_status, "requestedInSec": requested_in,
                                "requestedOutSec": requested_out, "sourceDurationSec": duration},
        "voiceContextEvidence": {"requested": voice_context, "sourceVoiceClaim": voice_value,
                                 "status": voice_status,
                                 "basis": "source claim is only a cue for audition; it does not verify speech intelligibility"},
        "visualContextEvidence": {
            "requested": visual_context,
            "status": "source-text-overlap" if visual_matches else ("no-source-text-overlap" if visual_context else "not-requested"),
            "matchingSourceTerms": visual_matches,
            "basis": "title/description/source-tag text only; visual and narrative timing still require human selection",
        },
        "candidateBasis": "returned by the selected provider for the music query; requested track type/range filters have been applied",
        "selectionBoundary": "text overlap and voice source claims explain why to inspect a candidate; they do not rank acoustic or editorial suitability",
    }


def _search(args: argparse.Namespace, cache_dir: Path) -> dict[str, Any]:
    from sound import library

    library.CACHE = cache_dir.resolve()
    library.INDEX = library.CACHE / "index.json"
    library.VENV = library.CACHE / "venv"
    query = getattr(args, "query", "") or ""
    providers = [part.strip().casefold() for part in args.providers.split(",") if part.strip()]
    unknown = []
    if args.role == "ui":
        providers = ["kenney", *(provider for provider in providers if provider != "kenney")]
    elif args.role == "music":
        unknown.extend(["kenney is not a finished-music provider"] if "kenney" in providers else [])
        providers = [provider for provider in providers if provider != "kenney"]
    unknown.extend(name for name in providers if name not in {"mixkit", "freesound", "pixabay", "kenney"})
    page_size = 15 if "freesound" in providers else 20
    candidate_limit = max(args.limit * 4, args.pages * page_size)
    minimum = args.min_duration_sec
    maximum = args.max_duration_sec
    response: dict[str, Any] = {
        "schemaVersion": 1,
        "status": "success",
        "executionMode": "live-network",
        "query": query,
        "role": args.role,
        "musicContext": ({
            "useCase": getattr(args, "use_case", None),
            "trackType": getattr(args, "track_type", "any"),
            "sourceRangeSec": {"inSec": getattr(args, "source_in_sec", None),
                               "outSec": getattr(args, "source_out_sec", None)},
            "voiceContext": getattr(args, "voice_context", None),
            "visualContext": getattr(args, "visual_context", None),
            "applicabilityStatus": "search-context-only; selected range and listening in edit remain required",
        } if args.role == "music" else None),
        "providerSearchOrder": providers,
        "ranking": (["exact requested track type", "requested source-range duration compatibility", "selected provider order", "provider-native result order"]
                    if args.role == "music" else
                    ["action token fit", "material token fit", "query token fit", "requested duration fit", "selected provider order", "provider-native result order"]),
        "results": [],
        "providers": {},
        "commands": {"search": sys.argv},
    }
    if unknown:
        response.update({"status": "invalid_provider", "networkAttempted": False,
                         "networkStatus": "not_attempted", "errors": [f"unknown provider(s): {', '.join(unknown)}"]})
        return response
    if args.pack and not re.fullmatch(r"[a-z0-9-]+", args.pack):
        response.update({"status": "invalid_pack", "networkAttempted": False,
                         "networkStatus": "not_attempted", "errors": ["Kenney pack must be a lowercase alphanumeric slug with hyphens"]})
        return response
    if args.role == "music":
        if not query and not getattr(args, "pixabay_playlist", None):
            response.update({"status": "invalid_music_context", "networkAttempted": False,
                             "networkStatus": "not_attempted", "errors": ["music search requires --query or --pixabay-playlist"]})
            return response
        source_in = getattr(args, "source_in_sec", None)
        source_out = getattr(args, "source_out_sec", None)
        if source_in is not None and (not isinstance(source_in, (int, float)) or source_in < 0):
            response.update({"status": "invalid_music_context", "networkAttempted": False,
                             "networkStatus": "not_attempted", "errors": ["source-in must be a non-negative number"]})
            return response
        if source_out is not None and (not isinstance(source_out, (int, float)) or source_out <= 0
                                       or (source_in is not None and source_out <= source_in)):
            response.update({"status": "invalid_music_context", "networkAttempted": False,
                             "networkStatus": "not_attempted", "errors": ["source-out must be positive and greater than source-in"]})
            return response
    music_context = {
        "useCase": getattr(args, "use_case", None),
        "trackType": getattr(args, "track_type", "any"),
        "sourceInSec": getattr(args, "source_in_sec", None),
        "sourceOutSec": getattr(args, "source_out_sec", None),
        "voiceContext": getattr(args, "voice_context", None),
        "visualContext": getattr(args, "visual_context", None),
    }
    errors: list[str] = []
    attempted = 0
    rows_all: list[dict[str, Any]] = []
    for name in providers:
        record: dict[str, Any] = {"status": "not_attempted", "networkAttempted": False,
                                  "networkStatus": "not_attempted", "resultCount": 0}
        response["providers"][name] = record
        try:
            if name == "kenney":
                if args.pack:
                    from types import SimpleNamespace
                    pack_dir = library.CACHE / "kenney" / args.pack
                    if not pack_dir.exists():
                        attempted += 1
                        record["networkAttempted"] = True
                    with contextlib.redirect_stdout(io.StringIO()):
                        library.kenney(SimpleNamespace(pack=args.pack))
                    files = sorted(p for p in pack_dir.rglob("*") if p.is_file() and p.suffix.lower() in (".ogg", ".wav", ".mp3"))
                    for path in files:
                        rel = path.relative_to(library.CACHE / "kenney").as_posix()
                        rows_all.append({
                            "key": f"kn:{rel}", "provider": "kenney", "title": path.stem,
                            "duration": {"label": None, "seconds": None}, "author": None,
                            "sourcePage": f"https://kenney.nl/assets/{args.pack}",
                            "preview": {"url": None, "localPath": str(path)}, "downloadUrl": None,
                            "license": {"providerLabel": "Kenney pack", "exactVersionVerified": False,
                                         "licenseUrl": None, "verification": "manual_pack_license_verification_required"},
                            "stats": {}, "providerNativeRank": None,
                            "providerRankBasis": "not ranked by popularity; inspect the coherent pack",
                            "description": None,
                            "fit": {"actionTokenHits": 0, "materialTokenHits": 0, "queryTokenHits": 0,
                                     "durationWithinRequestedRange": None, "basis": "coherent asset pack; preview files before selection"},
                            "_sort": (0, 0, 0, -1, 0, 0),
                        })
                    record["status"] = "success" if files else "empty"
                    record["resultCount"] = len(files)
                else:
                    attempted += 1
                    record["networkAttempted"] = True
                    packs = _kenney_catalog(library)
                    terms = set(_tokens(f"{query} {args.action} {args.material}"))
                    # UI is an explicit coherence route; common interface terms help surface pack names.
                    if args.role == "ui":
                        terms.update({"ui", "interface", "button", "click", "menu", "digital", "game"})
                    scored = sorted(((len(terms & set(_tokens(pack.replace("-", " ")))), pack) for pack in packs),
                                    key=lambda item: (-item[0], item[1]))
                    chosen = [pack for score, pack in scored if score > 0][:args.limit]
                    for score, pack in scored:
                        if pack not in chosen:
                            continue
                        rows_all.append({
                            "key": f"kenney_pack:{pack}", "provider": "kenney", "type": "pack",
                            "title": pack.replace("-", " "), "pack": pack,
                            "duration": {"label": None, "seconds": None}, "author": "Kenney",
                            "sourcePage": f"https://kenney.nl/assets/{pack}",
                            "preview": {"url": None, "localPath": None}, "downloadUrl": None,
                            "license": {"providerLabel": "Kenney pack", "exactVersionVerified": False,
                                         "licenseUrl": None, "verification": "manual_pack_license_verification_required"},
                            "stats": {}, "providerNativeRank": None,
                            "providerRankBasis": "not ranked by popularity; inspect the coherent pack",
                            "description": "Coherent pack candidate; inspect pack contents and license before use.",
                            "fit": {"actionTokenHits": 0, "materialTokenHits": 0, "queryTokenHits": score,
                                     "durationWithinRequestedRange": None, "basis": "pack-name token overlap only"},
                            "_sort": (0, 0, score, -1, 0),
                        })
                    record["status"] = "success" if packs else "empty"
                    record["resultCount"] = len(chosen)
            else:
                if name == "pixabay" and importlib.util.find_spec("curl_cffi") is None:
                    raise ModuleNotFoundError("Pixabay requires curl_cffi in the isolated cache venv; run `laohu-sound.py setup pixabay`.")
                attempted += 1
                record["networkAttempted"] = True
                raw = _capture_provider(library, name, query, args.pages, candidate_limit,
                                        args.freesound_license, role=args.role,
                                        pixabay_playlist=getattr(args, "pixabay_playlist", None))
                priority = providers.index(name)
                rows = [_canonical_row(name, row, query, args.action, args.material, minimum, maximum,
                                       priority, index + 1,
                                       music_context if args.role == "music" else None)
                        for index, row in enumerate(raw)]
                if args.role == "music":
                    requested_type = music_context["trackType"]
                    if requested_type in {"fulltrack", "loop", "cue"}:
                        rows = [row for row in rows
                                if row.get("musicMetadata", {}).get("trackType", {}).get("value") == requested_type]
                    requested_in, requested_out = music_context["sourceInSec"], music_context["sourceOutSec"]
                    if requested_in is not None or requested_out is not None:
                        rows = [row for row in rows if (
                            row["duration"]["seconds"] is not None
                            and (requested_in is None or requested_in < row["duration"]["seconds"])
                            and (requested_out is None or requested_out <= row["duration"]["seconds"])
                        )]
                    for row in rows:
                        row["musicFit"] = _music_context_fit(row, music_context)
                if minimum is not None or maximum is not None:
                    rows = [row for row in rows if row["duration"]["seconds"] is None
                            or row["fit"]["durationWithinRequestedRange"] == 1]
                rows_all.extend(rows)
                record["status"] = "success" if rows else "empty"
                record["resultCount"] = len(rows)
        except (Exception, SystemExit) as exc:
            status, message = _status_for_exception(exc)
            record["status"] = status
            record["error"] = message
            if record["networkAttempted"]:
                record["networkStatus"] = "error"
            errors.append(f"{name}: {message}")
        else:
            if record["networkAttempted"]:
                record["networkStatus"] = "success"
    rows_all.sort(key=lambda row: row["_sort"], reverse=True)
    if args.role == "ui" and args.limit > 0:
        limited = []
        first_kenney_route = next((row for row in rows_all if row["provider"] == "kenney"), None)
        if first_kenney_route:
            limited.append(first_kenney_route)
        for name in providers:
            if name == "kenney":
                continue
            first_for_provider = next((row for row in rows_all if row["provider"] == name), None)
            if first_for_provider and len(limited) < args.limit:
                limited.append(first_for_provider)
        for row in rows_all:
            if len(limited) >= args.limit:
                break
            if row not in limited:
                limited.append(row)
        limited.sort(key=lambda row: row["_sort"], reverse=True)
    else:
        limited = rows_all[:args.limit]
    for row in limited:
        row.pop("_sort", None)
    response["results"] = limited
    if attempted == 0:
        response["networkStatus"] = "not_attempted"
        statuses = [response["providers"][provider]["status"] for provider in providers]
        if any(status == "failed" for status in statuses):
            response["status"] = "failed"
            response["errors"] = errors
        else:
            response["status"] = "success" if any(status == "success" for status in statuses) else \
                "empty" if any(status == "empty" for status in statuses) else "dependency_missing"
    elif errors:
        response["networkStatus"] = "partial" if any(response["providers"][p]["status"] in ("success", "empty") for p in providers) else "error"
        response["status"] = "partial" if response["networkStatus"] == "partial" else "network_error"
        response["errors"] = errors
    else:
        response["networkStatus"] = "success"
        response["status"] = "success" if rows_all else "empty"
    response["networkAttempted"] = attempted > 0
    return response


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _path_is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _resolved_cache_paths(work_root: Path, cache_value: str | Path | None,
                          tmp_value: str | Path | None) -> tuple[Path, Path]:
    """Resolve cache paths through existing symlinks before any directory is created."""
    root = work_root.expanduser().resolve()
    try:
        cache_root = (root / ".cache").resolve()
        if not _path_is_within(cache_root, root):
            raise ValueError("workRoot/.cache resolves outside --work-root")
        cache_input = Path(cache_value).expanduser() if cache_value else root / DEFAULT_SOUND_CACHE
        tmp_input = Path(tmp_value).expanduser() if tmp_value else root / DEFAULT_SOUND_TMP
        cache_dir = cache_input.resolve()
        tmp_dir = tmp_input.resolve()
    except (OSError, RuntimeError) as exc:
        raise ValueError(f"could not resolve project cache paths: {type(exc).__name__}: {exc}") from exc
    if not _path_is_within(cache_dir, cache_root):
        raise ValueError("--cache-dir resolves outside the workRoot .cache directory")
    if not _path_is_within(tmp_dir, cache_root):
        raise ValueError("--tmp-dir resolves outside the workRoot .cache directory")
    return cache_dir, tmp_dir


def _parse_download_key(key: Any) -> tuple[str, str] | None:
    """Accept only the provider key forms returned by search and cached Kenney listings."""
    if not isinstance(key, str) or len(key) > 2048 or key.count(":") != 1:
        return None
    try:
        os.fsencode(key)
    except UnicodeError:
        return None
    src, ref = key.split(":", 1)
    if src in {"mk", "fs", "px"}:
        return (src, ref) if re.fullmatch(r"[0-9]{1,20}", ref) else None
    if src != "kn" or not ref or "\\" in ref or ":" in ref or "\x00" in ref:
        return None
    parts = ref.split("/")
    if len(parts) < 2 or any(part in ("", ".", "..") for part in parts):
        return None
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,99}", parts[0]):
        return None
    forbidden = set('<>:"|?*\\')
    for part in parts[1:]:
        if part.endswith((" ", ".")) or any(ord(char) < 32 or char in forbidden for char in part):
            return None
        if len(os.fsencode(part)) > 255:
            return None
    if not Path(parts[-1]).suffix or len(os.fsencode("kn_" + ref.replace("/", "_"))) > 240:
        return None
    return src, ref


def _normalize_tool_path(value: str | None, command: str) -> str | None:
    if not value:
        return shutil.which(command)
    found = shutil.which(value)
    if found:
        return str(Path(found).expanduser().resolve())
    return str(Path(value).expanduser().resolve())


def _media_tool_paths(args: argparse.Namespace) -> tuple[str | None, str | None]:
    ffmpeg_setting = args.ffmpeg or os.environ.get("LAOHU_FFMPEG") or os.environ.get("MOTION_FFMPEG")
    ffmpeg = _normalize_tool_path(ffmpeg_setting, "ffmpeg")
    ffprobe_setting = args.ffprobe or os.environ.get("LAOHU_FFPROBE") or os.environ.get("MOTION_FFPROBE")
    if not ffprobe_setting and ffmpeg:
        sibling_ffprobe = Path(ffmpeg).with_name("ffprobe")
        if sibling_ffprobe.is_file():
            ffprobe_setting = str(sibling_ffprobe)
    ffprobe = _normalize_tool_path(ffprobe_setting, "ffprobe")
    return ffmpeg, ffprobe


def _probe_audio(path: Path, ffprobe: str | None = None) -> dict[str, Any]:
    ffprobe = ffprobe or shutil.which("ffprobe")
    if not ffprobe:
        return {"status": "unavailable", "reason": "ffprobe_not_found"}
    command = [ffprobe, "-v", "error", "-select_streams", "a:0", "-show_entries",
               "stream=codec_name,sample_rate,channels,channel_layout,duration", "-show_entries",
               "format=format_name,duration", "-of", "json", str(path)]
    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True, timeout=30)
        payload = json.loads(result.stdout)
        streams = payload.get("streams") or []
        if not streams:
            return {"status": "invalid", "reason": "no_audio_stream"}
        stream = streams[0]
        duration = stream.get("duration") or (payload.get("format") or {}).get("duration")
        duration_sec = float(duration) if duration is not None else None
        return {"status": "success", "codec": stream.get("codec_name"),
                "sampleRate": int(stream["sample_rate"]) if stream.get("sample_rate") else None,
                "channels": int(stream["channels"]) if stream.get("channels") else None,
                "channelLayout": stream.get("channel_layout"), "durationSec": duration_sec,
                "container": (payload.get("format") or {}).get("format_name")}
    except (OSError, subprocess.SubprocessError, ValueError, json.JSONDecodeError) as exc:
        return {"status": "unavailable", "reason": f"{type(exc).__name__}: {exc}"}


def _expected_download_path(library: Any, out_dir: Path, key: str) -> Path | None:
    parsed = _parse_download_key(key)
    if parsed is None:
        return None
    src, ref = parsed
    if src == "kn":
        return out_dir / f"kn_{ref.replace('/', '_')}"
    row = library.load_index().get(key)
    if not row and src == "mk":
        row = {"title": "", "url": f"https://assets.mixkit.co/active_storage/sfx/{ref}/{ref}.wav"}
    if not row:
        return None
    title = row.get("title", "")
    url = row.get("url")
    if not isinstance(title, str) or not isinstance(url, str) or not url:
        return None
    slug = re.sub(r"[^\w]+", "-", title).strip("-")[:40]
    suffix = Path(__import__("urllib.parse", fromlist=["urlparse"]).urlparse(url).path).suffix
    filename = f"{src}_{ref}{'_' + slug if slug else ''}{suffix}"
    if filename.endswith((" ", ".")) or any(ord(char) < 32 or char in '<>:"|?*\\' for char in filename):
        return None
    try:
        if len(os.fsencode(filename)) > 255:
            return None
    except UnicodeError:
        return None
    return out_dir / filename


def _validate_download_destinations(library: Any, work_root: Path, cache_dir: Path,
                                    out_dir: Path, keys: list[str]) -> tuple[dict[str, Path], tuple[str, str] | None]:
    expected = {key: _expected_download_path(library, out_dir, key) for key in keys}
    unknown = [key for key, path in expected.items() if path is None]
    if unknown:
        return {}, ("unknown_key", f"unknown provider keys: {', '.join(unknown)}")

    kenney_root = cache_dir / "kenney"
    try:
        resolved_kenney_root = kenney_root.resolve()
        if not _path_is_within(resolved_kenney_root, cache_dir):
            return {}, ("path_outside_project_cache", "Kenney cache root resolves outside --cache-dir")
    except (OSError, RuntimeError) as exc:
        return {}, ("invalid_path", f"could not resolve Kenney cache root: {type(exc).__name__}: {exc}")
    for key in keys:
        src, ref = _parse_download_key(key)  # Key grammar is checked before importing this helper's module.
        if src == "kn":
            try:
                source = (kenney_root / ref).resolve()
            except (OSError, RuntimeError) as exc:
                return {}, ("invalid_path", f"could not resolve cached source for {key}: {type(exc).__name__}: {exc}")
            if not _path_is_within(source, resolved_kenney_root) or not _path_is_within(source, work_root):
                return {}, ("path_outside_work_root", f"cached source for {key} resolves outside the project Kenney cache")
            if not source.is_file():
                return {}, ("unknown_key", f"{key}: asset is not present in the cached Kenney pack")

    reserved_paths: dict[Path, str] = {}
    for key, path in expected.items():
        assert path is not None
        try:
            actual_path = path.resolve()
        except (OSError, RuntimeError) as exc:
            return {}, ("invalid_path", f"could not resolve output for {key}: {type(exc).__name__}: {exc}")
        if not _path_is_within(actual_path, work_root) or actual_path.parent != out_dir:
            return {}, ("path_outside_work_root", f"resolved output for {key} is outside --work-root or --out-dir")
        if path.is_symlink():
            return {}, ("output_conflict", f"output path is a symlink: {path}")
        previous = reserved_paths.get(actual_path)
        if previous:
            return {}, ("output_path_collision", f"{key} and {previous} resolve to the same output path")
        reserved_paths[actual_path] = key
        if path.exists():
            return {}, ("output_conflict", f"output already exists: {path}")

        src, _ = _parse_download_key(key)
        if src != "kn":
            tmp_path = path.with_suffix(path.suffix + ".part")
            try:
                actual_tmp = tmp_path.resolve()
            except (OSError, RuntimeError) as exc:
                return {}, ("invalid_path", f"could not resolve download intermediate for {key}: {type(exc).__name__}: {exc}")
            if not _path_is_within(actual_tmp, work_root) or actual_tmp.parent != out_dir:
                return {}, ("path_outside_work_root", f"download intermediate for {key} resolves outside --work-root or --out-dir")
            if tmp_path.is_symlink():
                return {}, ("output_conflict", f"download intermediate is a symlink: {tmp_path}")
            previous = reserved_paths.get(actual_tmp)
            if previous:
                return {}, ("output_path_collision", f"intermediate for {key} collides with an output for {previous}")
            reserved_paths[actual_tmp] = f"{key} intermediate"
            if tmp_path.exists():
                return {}, ("output_conflict", f"download intermediate already exists: {tmp_path}")
    if out_dir.exists() and not out_dir.is_dir():
        return {}, ("invalid_path", f"--out-dir exists but is not a directory: {out_dir}")
    return {key: path for key, path in expected.items() if path is not None}, None


def _download(args: argparse.Namespace, work_root: Path, cache_dir: Path,
              ffprobe: str | None = None) -> dict[str, Any]:
    response: dict[str, Any] = {
        "schemaVersion": 1, "status": "success", "executionMode": "live-network",
        "networkAttempted": False, "networkStatus": "not_attempted", "results": [], "commands": {"get": sys.argv},
    }

    def reject(status: str, *messages: str) -> dict[str, Any]:
        return {**response, "status": status, "errors": list(messages)}

    work_root = work_root.expanduser().resolve()
    try:
        cache_dir, _ = _resolved_cache_paths(work_root, cache_dir, None)
        out_arg = Path(args.out_dir).expanduser()
        out_dir = (work_root / out_arg).resolve() if not out_arg.is_absolute() else out_arg.resolve()
    except (OSError, RuntimeError, ValueError) as exc:
        return reject("invalid_path", f"could not resolve get paths: {type(exc).__name__}: {exc}")
    if not _path_is_within(out_dir, work_root):
        return reject("path_outside_work_root", "--out-dir resolves outside --work-root")
    if any(_parse_download_key(key) is None for key in args.key):
        invalid = [str(key) for key in args.key if _parse_download_key(key) is None]
        return reject("invalid_key", f"unsupported or malformed provider key: {', '.join(invalid)}")
    if len(set(args.key)) != len(args.key):
        return reject("invalid_key", "duplicate provider keys are not allowed in one get request")

    from sound import library

    library.CACHE = cache_dir
    library.INDEX = library.CACHE / "index.json"
    library.VENV = library.CACHE / "venv"
    if any(key.startswith("px:") for key in args.key) and importlib.util.find_spec("curl_cffi") is None:
        return reject("dependency_missing", "Pixabay download requires curl_cffi in the isolated cache venv; run `laohu-sound.py setup pixabay`.")
    selected_rows = library.load_index()
    for key in args.key:
        selected_row = selected_rows.get(key)
        if (isinstance(selected_row, dict)
                and selected_row.get("rights", {}).get("packageBoundary") == "work-cache-only"
                and not selected_row.get("url") and key.startswith(("mk:", "px:"))):
            selected_row, detail_error = library.resolve_selected_music_download(selected_row)
            if detail_error:
                response["networkAttempted"] = True
                response["networkStatus"] = "error"
                return reject("detail_resolution_failed", f"{key}: {detail_error}")
            selected_rows[key] = selected_row
            library.save_index([selected_row])
    expected, path_error = _validate_download_destinations(library, work_root, cache_dir, out_dir, args.key)
    if path_error:
        return reject(*path_error)

    out_dir.mkdir(parents=True, exist_ok=True)
    library_out = io.StringIO()
    response["networkAttempted"] = any(not key.startswith("kn:") for key in args.key)
    with contextlib.redirect_stdout(library_out):
        library.get(type("Args", (), {"out_dir": str(out_dir), "keys": args.key})())
    lines = library_out.getvalue().splitlines()
    errors: list[str] = []
    for key, path in expected.items():
        assert path is not None
        src, ref = _parse_download_key(key)  # Key grammar was checked above.
        try:
            actual_path = path.resolve()
        except (OSError, RuntimeError) as exc:
            errors.append(f"{key}: output path no longer resolves safely: {type(exc).__name__}: {exc}")
            response["results"].append({"key": key, "status": "unsafe_output_path", "error": errors[-1]})
            continue
        if not _path_is_within(actual_path, work_root) or actual_path.parent != out_dir:
            errors.append(f"{key}: output path no longer resolves inside --work-root/--out-dir")
            response["results"].append({"key": key, "status": "unsafe_output_path", "error": errors[-1]})
            continue
        row = library.load_index().get(key, {})
        matching = [line for line in lines if line.startswith(path.name) or line.startswith(f"FAIL {key}:")]
        if not actual_path.is_file() or any(line.startswith(f"FAIL {key}:") for line in matching):
            message = matching[-1] if matching else f"{key}: download produced no file"
            errors.append(message)
            response["results"].append({"key": key, "status": "download_error", "error": message})
            continue
        source_page = row.get("page")
        if src == "kn" and not source_page:
            source_page = f"https://kenney.nl/assets/{ref.split('/', 1)[0]}"
        license_label = row.get("license", "Kenney pack" if src == "kn" else "unknown")
        preview_url = row.get("preview")
        probe = _probe_audio(actual_path, ffprobe)
        asset = {
            "key": key,
            "provider": {"mk": "mixkit", "fs": "freesound", "px": "pixabay", "kn": "kenney"}.get(src, src),
            "title": row.get("title") or actual_path.stem,
            "path": actual_path.relative_to(work_root).as_posix(),
            "sha256": _sha256(actual_path),
            "bytes": actual_path.stat().st_size,
            "extension": actual_path.suffix.lower(),
            "sourceReportedDuration": {"label": row.get("dur") or None, "seconds": _duration_sec(row.get("dur"))},
            "duration": {"seconds": probe.get("durationSec") if probe.get("status") == "success" else None,
                         "method": "ffprobe" if probe.get("status") == "success" else "not_measured"},
            "probe": probe,
            "author": row.get("author") or None,
            "sourcePage": source_page,
            "sourcePageStatus": "available" if source_page else "not-present-in-source-search-result",
            "license": {"providerLabel": license_label, "exactVersionVerified": False,
                        "licenseUrl": None, "verification": "manual_source_page_verification_required"},
            "stats": _provider_stats(row),
            "musicMetadata": row.get("musicMetadata"),
            "community": row.get("community"),
            "rightsBoundary": row.get("rights"),
            "listingPage": row.get("listingPage"),
            "preview": {"url": preview_url, "localPath": path.relative_to(work_root.resolve()).as_posix()
                        if src == "kn" else None},
            "downloadKind": "cached-pack-file" if src == "kn" else "provider-preview-or-download-url",
            "reviewStatus": "candidate-unreviewed",
            "sourceHitpointSec": None,
            "clipOperations": [],
        }
        response["results"].append({"key": key, "status": "downloaded", "asset": asset})
    if errors:
        response["status"] = "partial" if len(errors) < len(args.key) else "download_error"
        response["errors"] = errors
    if response["networkAttempted"]:
        downloaded_network = any(result.get("status") == "downloaded"
                                 and not result["key"].startswith("kn:") for result in response["results"])
        failed_network = any(result.get("status") == "download_error"
                             and not result["key"].startswith("kn:") for result in response["results"])
        response["networkStatus"] = "partial" if downloaded_network and failed_network else \
            "error" if failed_network else "success"
    return response


def _doctor(work_root: Path, cache_dir: Path, tmp_dir: Path,
            ffmpeg: str | None = None, ffprobe: str | None = None) -> dict[str, Any]:
    modules = ("numpy", "mido", "pedalboard", "soundfile", "scipy", "pyloudnorm", "matplotlib", "curl_cffi")
    present = {name: importlib.util.find_spec(name) is not None for name in modules}
    local_pixabay_python = cache_dir / "venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not present["curl_cffi"] and local_pixabay_python.exists():
        result = subprocess.run([str(local_pixabay_python), "-c", "import curl_cffi"], check=False,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        present["curl_cffi"] = result.returncode == 0
    local_procedural_python = cache_dir / "procedural-venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    local_procedural_ready = False
    if local_procedural_python.exists():
        check_code = "import importlib.util,json; print(json.dumps({n: importlib.util.find_spec(n) is not None for n in " + repr(modules[:7]) + "}))"
        check = subprocess.run([str(local_procedural_python), "-c", check_code], check=False,
                               capture_output=True, text=True)
        if check.returncode == 0:
            try:
                local_modules = json.loads(check.stdout)
                local_procedural_ready = all(local_modules.values())
            except json.JSONDecodeError:
                local_procedural_ready = False
    ffmpeg = ffmpeg or shutil.which("ffmpeg")
    ffprobe = ffprobe or shutil.which("ffprobe")

    def executable_report(path: str | None) -> dict[str, Any]:
        if not path:
            return {"path": None, "status": "missing"}
        try:
            result = subprocess.run([path, "-version"], check=False, capture_output=True,
                                    text=True, timeout=10)
            if result.returncode == 0:
                first_line = next((line.strip() for line in result.stdout.splitlines() if line.strip()), None)
                return {"path": path, "status": "ready", "version": first_line}
            error = (result.stderr or result.stdout or f"exit code {result.returncode}").strip()
            return {"path": path, "status": "unavailable", "error": error[-400:]}
        except (OSError, subprocess.SubprocessError) as exc:
            return {"path": path, "status": "unavailable", "error": f"{type(exc).__name__}: {exc}"}

    procedure_missing = [name for name in modules[:7] if not present[name]]
    plugin_report: list[str] = []
    if not procedure_missing:
        try:
            from sound import backend
            with contextlib.redirect_stdout(io.StringIO()) as stream:
                backend.doctor()
            plugin_report = stream.getvalue().splitlines()
        except Exception as exc:
            plugin_report = [f"plugin doctor failed: {type(exc).__name__}: {exc}"]
    return {
        "schemaVersion": 1,
        "status": "success",
        "python": {"executable": sys.executable, "version": sys.version.split()[0]},
        "paths": {"workRoot": str(work_root), "cache": str(cache_dir), "tmp": str(tmp_dir)},
        "dependencies": {
            "proceduralAudio": {"status": "ready" if not procedure_missing else "ready_in_local_venv" if local_procedural_ready else "setup_required",
                                "missing": [] if local_procedural_ready else procedure_missing,
                                "localPython": str(local_procedural_python) if local_procedural_ready else None},
            "pixabay": {"status": "ready" if present["curl_cffi"] else "setup_required", "missing": [] if present["curl_cffi"] else ["curl_cffi"]},
            "libraryProviders": {"status": "stdlib_ready"},
        },
        "executables": {"ffmpeg": executable_report(ffmpeg), "ffprobe": executable_report(ffprobe)},
        "pluginSetup": {
            "status": "needs_probe" if not procedure_missing else "blocked_by_python_dependencies",
            "checks": plugin_report,
            "note": "Surge XT and sfizz VST3 plugins and sound libraries are optional; missing resources block only their render branch.",
        },
        "commands": {"doctor": sys.argv},
    }


def _setup(args: argparse.Namespace, work_root: Path, cache_dir: Path, tmp_dir: Path) -> dict[str, Any]:
    if args.kind == "pixabay":
        venv = cache_dir / "venv"
        install_target: list[str] = ["curl_cffi"]
        requirements: Path | None = None
    else:
        venv = cache_dir / "procedural-venv"
        install_target = ["-r", str(SOUND_DIR / "requirements.txt")]
        requirements = SOUND_DIR / "requirements.txt"
    python_cmd = args.python or sys.executable
    resolved_python = shutil.which(python_cmd) or (str(Path(python_cmd).expanduser().resolve()) if Path(python_cmd).expanduser().exists() else None)
    if not resolved_python:
        return {"schemaVersion": 1, "status": "python_not_found", "branch": args.kind, "requestedPython": python_cmd}
    try:
        version_text = subprocess.check_output([resolved_python, "--version"], text=True, stderr=subprocess.STDOUT).strip()
        venv.parent.mkdir(parents=True, exist_ok=True)
        tmp_dir.mkdir(parents=True, exist_ok=True)
        env = {**os.environ, "TMPDIR": str(tmp_dir), "PIP_CACHE_DIR": str(cache_dir / "pip-cache")}
        env["LAOHU_SOUND_TMPDIR"] = str(tmp_dir)
        env["LAOHU_SOUND_CACHE_DIR"] = str(cache_dir)
        if not (venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python")).exists():
            subprocess.run([resolved_python, "-m", "venv", str(venv)], check=True, env=env)
        vpython = venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        subprocess.run([str(vpython), "-m", "pip", "install", "--disable-pip-version-check", *install_target],
                       check=True, env=env)
        return {"schemaVersion": 1, "status": "success", "branch": args.kind,
                "requestedPython": version_text, "venv": str(venv),
                "requirements": str(requirements) if requirements else ["curl_cffi"],
                "pipCache": str(cache_dir / "pip-cache"), "tmp": str(tmp_dir)}
    except (OSError, subprocess.CalledProcessError) as exc:
        return {"schemaVersion": 1, "status": "setup_failed", "branch": args.kind,
                "venv": str(venv), "error": f"{type(exc).__name__}: {exc}",
                "note": "No system/global Python packages were installed; the incomplete local venv remains for inspection."}


def _load_kit():
    try:
        from sound import kit
        return kit, None
    except (ImportError, ModuleNotFoundError) as exc:
        return None, f"{exc}. Run `laohu-sound.py setup procedural --python python3.12` using a source-supported Python runtime."


def _audio_command(args: argparse.Namespace, work_root: Path) -> dict[str, Any]:
    kit, missing = _load_kit()
    if kit is None:
        return {"schemaVersion": 1, "status": "dependency_missing", "error": missing,
                "branch": args.command}
    output = io.StringIO()
    try:
        with contextlib.redirect_stdout(output):
            if args.command == "find":
                paths = kit.lm.find_sounds(args.query, args.kind)
                results = [{"spec": kit.spec_of(path), "path": str(path)} for path in paths]
                return {"schemaVersion": 1, "status": "success", "query": args.query,
                        "kind": args.kind, "results": results, "count": len(results)}
            if args.command == "probe":
                kit.probe(args.spec, args.notes or [60], args.length)
                return {"schemaVersion": 1, "status": "success", "spec": args.spec,
                        "notes": args.notes or [60], "report": output.getvalue().strip()}
            if args.command == "sfzmap":
                kit.sfzmap(args.spec)
                return {"schemaVersion": 1, "status": "success", "spec": args.spec,
                        "report": output.getvalue().strip()}
            if args.command == "check":
                kit.check(args.wav, args.bpm, args.png)
                return {"schemaVersion": 1, "status": "success", "wav": str(Path(args.wav).resolve()),
                        "report": output.getvalue().strip()}
            if args.command == "render":
                spec_path = Path(args.spec).expanduser().resolve()
                spec = json.loads(spec_path.read_text(encoding="utf-8"))
                if not isinstance(spec, dict) or not isinstance(spec.get("instrument"), str):
                    raise ValueError("render spec must contain an instrument string")
                notes = spec.get("notes")
                if not isinstance(notes, list) or not notes:
                    raise ValueError("render spec must contain a non-empty notes array")
                checked_notes = []
                for note in notes:
                    if not isinstance(note, list) or len(note) != 4:
                        raise ValueError("each note must be [midi, startSec, durationSec, velocity]")
                    checked_notes.append(tuple(note))
                plugin = kit.load(spec["instrument"])
                audio = kit.render(plugin, checked_notes, tail=float(spec.get("tail", 2.0)))
                out = Path(args.output).expanduser().resolve()
                try:
                    out.relative_to(work_root.resolve())
                except ValueError as exc:
                    raise ValueError("--output must remain inside --work-root") from exc
                if out.exists():
                    raise FileExistsError(f"output already exists: {out}")
                out.parent.mkdir(parents=True, exist_ok=True)
                kit.write(str(out), audio)
                return {"schemaVersion": 1, "status": "success", "instrument": spec["instrument"],
                        "output": out.relative_to(work_root.resolve()).as_posix(), "sha256": _sha256(out),
                        "sampleRate": kit.SR, "channels": int(audio.shape[0]),
                        "durationSec": audio.shape[1] / kit.SR,
                        "peak": float(abs(audio).max()), "reviewStatus": "candidate-unreviewed"}
    except Exception as exc:
        return {"schemaVersion": 1, "status": "failed", "branch": args.command,
                "error": f"{type(exc).__name__}: {exc}", "report": output.getvalue().strip()}
    return {"schemaVersion": 1, "status": "unsupported_command", "branch": args.command}


def _json_print(value: dict[str, Any]) -> None:
    print(json.dumps(value, ensure_ascii=False, sort_keys=True))


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--work-root", default=str(PROJECT_ROOT), help="authorized work project root on the external drive")
    parser.add_argument("--cache-dir", help="work-project .cache path for source indexes, packs, and isolated dependencies")
    parser.add_argument("--tmp-dir", help="work-project .cache/tmp path used before importing the kit")
    parser.add_argument("--ffmpeg", help="working FFmpeg executable; also accepts LAOHU_FFMPEG or MOTION_FFMPEG")
    parser.add_argument("--ffprobe", help="working ffprobe executable; also accepts LAOHU_FFPROBE or MOTION_FFPROBE")
    commands = parser.add_subparsers(dest="command", required=True)
    doctor = commands.add_parser("doctor", help="check runtime, dependencies, plugins and media tools")
    doctor.set_defaults(command="doctor")
    setup = commands.add_parser("setup", help="install optional dependencies into a local project-cache venv only")
    setup.add_argument("kind", choices=("pixabay", "procedural"))
    setup.add_argument("--python", help="Python executable used to create this local venv")
    setup.set_defaults(command="setup")
    library = commands.add_parser("library", help="run the preserved upstream provider CLI")
    library.add_argument("arguments", nargs=argparse.REMAINDER)
    library.set_defaults(command="library")
    search = commands.add_parser("search", help="search source providers and return source metadata as JSON")
    search.add_argument("--query")
    search.add_argument("--providers", default="mixkit,freesound,pixabay", help="comma-separated provider list")
    search.add_argument("--role", choices=("general", "ui", "music"), default="general")
    search.add_argument("--pack", help="for Kenney, fetch and list this named coherent pack")
    search.add_argument("--action", default="")
    search.add_argument("--material", default="")
    search.add_argument("--min-duration-sec", type=float)
    search.add_argument("--max-duration-sec", type=float)
    search.add_argument("--use-case", choices=MUSIC_USE_CASES, help="current music duty context; metadata remains an unreviewed candidate")
    search.add_argument("--track-type", choices=("any", "fulltrack", "loop", "cue"), default="any")
    search.add_argument("--source-in-sec", type=float)
    search.add_argument("--source-out-sec", type=float)
    search.add_argument("--voice-context", choices=MUSIC_VOICE_CONTEXTS)
    search.add_argument("--visual-context", help="describe the current visual sequence; this is retained as context, not auto-scored")
    search.add_argument("--pixabay-playlist", help="Pixabay curated playlist slug, e.g. commercial-tutorials-and-vlogs-32697991")
    search.add_argument("--freesound-license", choices=("cc0", "by", "any"), default="any")
    search.add_argument("--limit", type=int, default=12)
    search.add_argument("--pages", type=int, default=3)
    search.set_defaults(command="search")
    get = commands.add_parser("get", help="download selected source candidates into the work project")
    get.add_argument("--key", action="append", required=True)
    get.add_argument("--out-dir", required=True, help="path inside --work-root")
    get.set_defaults(command="get")
    find = commands.add_parser("find", help="find installed Surge presets and SFZ instruments")
    find.add_argument("query", nargs="?", default="")
    find.add_argument("--kind", choices=("all", "surge", "sfz"), default="all")
    find.set_defaults(command="find")
    render = commands.add_parser("render", help="render notes from a source-preset JSON spec")
    render.add_argument("spec")
    render.add_argument("--output", required=True)
    render.set_defaults(command="render")
    probe = commands.add_parser("probe", help="probe one installed preset or SFZ instrument")
    probe.add_argument("spec")
    probe.add_argument("notes", nargs="*", type=int, default=[60])
    probe.add_argument("--length", type=float, default=2.0)
    probe.set_defaults(command="probe")
    sfzmap = commands.add_parser("sfzmap", help="map SFZ key/velocity regions to sample files")
    sfzmap.add_argument("spec")
    sfzmap.set_defaults(command="sfzmap")
    check = commands.add_parser("check", help="measure a rendered WAV using the source kit analyzer")
    check.add_argument("wav")
    check.add_argument("--bpm", type=float)
    check.add_argument("--png")
    check.set_defaults(command="check")
    return parser


def main(argv: list[str] | None = None) -> int:
    raw_args = list(argv if argv is not None else sys.argv[1:])
    parser = _parser()
    args = parser.parse_args(argv)
    work_root = Path(args.work_root).expanduser().resolve()
    if not work_root.is_dir():
        _json_print({"schemaVersion": 1, "status": "work_root_missing", "workRoot": str(work_root)})
        return 2
    try:
        cache_dir, tmp_dir = _resolved_cache_paths(work_root, args.cache_dir, args.tmp_dir)
    except ValueError as exc:
        _json_print({"schemaVersion": 1, "status": "path_outside_project_cache", "error": str(exc)})
        return 2

    get_request: tuple[Path, list[str]] | None = None
    if args.command == "get":
        get_request = (Path(args.out_dir).expanduser(), list(args.key))
    elif args.command == "library" and args.arguments and args.arguments[0] == "get":
        forwarded = list(args.arguments)
        if len(forwarded) < 3:
            _json_print({"schemaVersion": 1, "status": "invalid_key", "error": "library get requires an out-dir and at least one provider key"})
            return 2
        get_request = (Path(forwarded[1]).expanduser(), forwarded[2:])
    if get_request:
        out_arg, keys = get_request
        invalid = [key for key in keys if _parse_download_key(key) is None]
        if invalid:
            _json_print({"schemaVersion": 1, "status": "invalid_key",
                         "error": f"unsupported or malformed provider key: {', '.join(invalid)}"})
            return 2
        if len(set(keys)) != len(keys):
            _json_print({"schemaVersion": 1, "status": "invalid_key", "error": "duplicate provider keys are not allowed in one get request"})
            return 2
        try:
            out_dir = (work_root / out_arg).resolve() if not out_arg.is_absolute() else out_arg.resolve()
        except (OSError, RuntimeError) as exc:
            _json_print({"schemaVersion": 1, "status": "invalid_path",
                         "error": f"could not resolve get out-dir: {type(exc).__name__}: {exc}"})
            return 2
        if not _path_is_within(out_dir, work_root):
            _json_print({"schemaVersion": 1, "status": "path_outside_work_root", "argument": "get out-dir"})
            return 2
        from sound import library
        library.CACHE = cache_dir
        library.INDEX = cache_dir / "index.json"
        library.VENV = cache_dir / "venv"
        selected_rows = library.load_index()
        for key in keys:
            selected_row = selected_rows.get(key)
            if (isinstance(selected_row, dict)
                    and selected_row.get("rights", {}).get("packageBoundary") == "work-cache-only"
                    and not selected_row.get("url") and key.startswith(("mk:", "px:"))):
                selected_row, detail_error = library.resolve_selected_music_download(selected_row)
                if detail_error:
                    _json_print({"schemaVersion": 1, "status": "detail_resolution_failed",
                                 "error": f"{key}: {detail_error}",
                                 "networkAttempted": True, "networkStatus": "error"})
                    return 1
                selected_rows[key] = selected_row
                library.save_index([selected_row])
        _, path_error = _validate_download_destinations(library, work_root, cache_dir, out_dir, keys)
        if path_error:
            _json_print({"schemaVersion": 1, "status": path_error[0], "error": path_error[1],
                         "networkAttempted": False, "networkStatus": "not_attempted"})
            return 2
    cache_dir.mkdir(parents=True, exist_ok=True)
    tmp_dir.mkdir(parents=True, exist_ok=True)
    os.environ["LAOHU_SOUND_CACHE_DIR"] = str(cache_dir)
    os.environ["LAOHU_SOUND_TMPDIR"] = str(tmp_dir)
    os.environ["TMPDIR"] = str(tmp_dir)
    os.environ["PIP_CACHE_DIR"] = str(cache_dir / "pip-cache")
    os.environ.setdefault("SOUND_SAMPLE_DIR", str(work_root / "audio-assets"))
    ffmpeg_path, ffprobe_path = _media_tool_paths(args)
    if ffmpeg_path:
        os.environ["LAOHU_FFMPEG"] = ffmpeg_path
    else:
        os.environ.pop("LAOHU_FFMPEG", None)
    if ffprobe_path:
        os.environ["LAOHU_FFPROBE"] = ffprobe_path
    else:
        os.environ.pop("LAOHU_FFPROBE", None)
    tempfile.tempdir = None

    needs_procedural = args.command in ("doctor", "find", "render", "probe", "sfzmap", "check")
    needs_pixabay = args.command == "search" and "pixabay" in [p.strip().casefold() for p in args.providers.split(",")]
    needs_pixabay = needs_pixabay or (args.command == "get" and any(key.startswith("px:") for key in args.key))
    local_python = None
    required_modules: tuple[str, ...] = ()
    if needs_procedural:
        local_python = cache_dir / "procedural-venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        required_modules = ("numpy", "mido", "pedalboard", "soundfile", "scipy", "pyloudnorm", "matplotlib")
    elif needs_pixabay:
        local_python = cache_dir / "venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        required_modules = ("curl_cffi",)
    target_venv = local_python.parent.parent if local_python else None
    if local_python and local_python.exists() and target_venv and Path(sys.prefix).resolve() != target_venv.resolve():
        check_code = "import importlib.util,json; print(json.dumps({n: importlib.util.find_spec(n) is not None for n in " + repr(required_modules) + "}))"
        check = subprocess.run([str(local_python), "-c", check_code], check=False, capture_output=True, text=True)
        if check.returncode == 0:
            try:
                ready = all(json.loads(check.stdout).values())
            except json.JSONDecodeError:
                ready = False
            if ready:
                return subprocess.run([str(local_python), str(Path(__file__).resolve()), *raw_args],
                                      check=False, env=os.environ.copy()).returncode

    if args.command == "doctor":
        report = _doctor(work_root, cache_dir, tmp_dir, ffmpeg_path, ffprobe_path)
    elif args.command == "setup":
        report = _setup(args, work_root, cache_dir, tmp_dir)
    elif args.command == "library":
        script = SOUND_DIR / "library.py"
        forwarded = list(args.arguments)
        if forwarded and forwarded[0] == "get" and len(forwarded) >= 2:
            out_value = Path(forwarded[1]).expanduser()
            out_path = (work_root / out_value).resolve() if not out_value.is_absolute() else out_value.resolve()
            try:
                out_path.relative_to(work_root.resolve())
            except ValueError:
                _json_print({"schemaVersion": 1, "status": "path_outside_work_root", "argument": "library get out_dir"})
                return 2
            forwarded[1] = str(out_path)
        command = [sys.executable, str(script), *forwarded]
        return subprocess.run(command, check=False, env=os.environ.copy()).returncode
    elif args.command == "search":
        report = _search(args, cache_dir)
    elif args.command == "get":
        report = _download(args, work_root, cache_dir, ffprobe_path)
    else:
        report = _audio_command(args, work_root)
    _json_print(report)
    return 0 if report.get("status") in ("success", "empty") else 1


if __name__ == "__main__":
    raise SystemExit(main())
