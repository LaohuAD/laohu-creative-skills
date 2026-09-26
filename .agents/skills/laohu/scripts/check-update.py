#!/usr/bin/env python3
"""Check the official manifest; never install or execute remote content."""

import argparse
import json
import os
import re
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

VERSION_RE = re.compile(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)")
DETAILS_URL = "https://github.com/LaohuAD/laohu-creative-skills/blob/main/CHANGELOG.md"
UPDATE_URL = "https://raw.githubusercontent.com/LaohuAD/laohu-creative-skills/main/UPDATE.json"
TTL = 86400
LIMIT = 16384


def version_tuple(value):
    if not isinstance(value, str) or not VERSION_RE.fullmatch(value):
        raise ValueError("version must be MAJOR.MINOR.PATCH without leading zeros")
    return tuple(map(int, value.split(".")))


def validate_manifest(data):
    if not isinstance(data, dict):
        raise ValueError("manifest must be an object")
    version_tuple(data.get("version"))
    notice = data.get("notice")
    if (not isinstance(notice, str) or not 1 <= len(notice) <= 160
            or notice != notice.strip() or any(ord(c) < 32 or ord(c) == 127 for c in notice)):
        raise ValueError("notice must be a single line of 1-160 characters")
    if data.get("details_url") != DETAILS_URL:
        raise ValueError("details_url must point to the official changelog")
    return {key: data[key] for key in ("version", "notice", "details_url")}


def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".update-", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def fetch_remote():
    with urllib.request.urlopen(UPDATE_URL, timeout=5) as response:
        payload = response.read(LIMIT + 1)
    if len(payload) > LIMIT:
        raise ValueError("manifest is too large")
    return json.loads(payload.decode("utf-8"))


def check(local, cache_dir, *, force=False, offline=False, now=None, fetch=fetch_remote):
    local = validate_manifest(local)
    if offline:
        return {"status": "offline", "local_version": local["version"]}
    if cache_dir is None:
        return {"status": "skipped", "reason": "no same-disk cache directory configured"}
    now = time.time() if now is None else now
    cache = Path(cache_dir) / "check.json"
    if not force:
        try:
            state = json.loads(cache.read_text(encoding="utf-8"))
            elapsed = now - state["checked_at"]
            if state.get("local_version") == local["version"] and 0 <= elapsed < TTL:
                return {"status": "cached", "local_version": local["version"]}
        except (OSError, ValueError, TypeError, KeyError, AttributeError):
            pass
    # Record attempts, including failures, so offline use does not retry each turn.
    try:
        atomic_json(cache, {"checked_at": now, "local_version": local["version"]})
    except OSError:
        return {"status": "unavailable", "reason": "cache is not writable"}
    try:
        remote = validate_manifest(fetch())
    except Exception:
        return {"status": "unavailable", "reason": "network or remote manifest unavailable"}
    status = "newer" if version_tuple(remote["version"]) > version_tuple(local["version"]) else "not_newer"
    return {"status": status, "local_version": local["version"], "remote": remote}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path)
    parser.add_argument("--force", action="store_true", help="Explicitly bypass the daily cache")
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--json", action="store_true", help="Report cached/unavailable states as well")
    args = parser.parse_args()
    skill = Path(__file__).resolve().parents[1]
    cache_dir = args.cache_dir
    if cache_dir is None and os.environ.get("LAOHU_CACHE_DIR"):
        cache_dir = Path(os.environ["LAOHU_CACHE_DIR"])
    project = skill.parent.parent.parent
    if cache_dir is None and (project / "VERSION").is_file() and skill.parent.name == "skills" and skill.parent.parent.name == ".agents":
        cache_dir = project / ".cache" / "laohu-update"
    try:
        local = json.loads((skill / "references" / "release.json").read_text(encoding="utf-8"))
        result = check(local, cache_dir, force=args.force,
                       offline=args.offline or os.environ.get("LAOHU_UPDATE_CHECK") == "0")
    except (OSError, ValueError, TypeError):
        result = {"status": "unavailable", "reason": "local release metadata unavailable"}
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif result["status"] == "newer":
        remote = result["remote"]
        print(f"老胡造梦技能 v{remote['version']}：{remote['notice']} 输入 /laohu-update 更新，或查看 {DETAILS_URL}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
