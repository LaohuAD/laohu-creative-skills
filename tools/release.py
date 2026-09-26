#!/usr/bin/env python3
"""Prepare local release metadata; default is a preview, never a Git publish."""

import argparse
import json
import os
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
from check_project import PACKAGE, ROOT, check_project, release_api


def write_file(path, content):
    fd, temp = tempfile.mkstemp(prefix=".release-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(content)
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def prepare(root, version, notice, notes, write=False):
    report = check_project(root)
    if not report["ok"]:
        raise ValueError("fix project checks first:\n" + "\n".join(report["errors"]))
    api = release_api(root)
    version = version.removeprefix("v")
    current = (root / "VERSION").read_text(encoding="utf-8").strip()
    if api.version_tuple(version) <= api.version_tuple(current):
        raise ValueError("new version must be greater than current VERSION")
    manifest = api.validate_manifest({"version": version, "notice": notice, "details_url": api.DETAILS_URL})
    if not notes.strip() or any(line.startswith("#") for line in notes.splitlines()):
        raise ValueError("notes must contain text or bullets without heading lines")
    changelog = (root / "CHANGELOG.md").read_text(encoding="utf-8")
    intro, rest = changelog.split("\n## ", 1)
    rendered = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    changes = {
        root / "VERSION": (version + "\n").encode(),
        root / "UPDATE.json": rendered.encode(),
        root / PACKAGE: rendered.encode(),
        root / "CHANGELOG.md": (intro + f"\n## {version}\n\n{notes.strip()}\n\n## " + rest).encode(),
    }
    before = {path: path.read_bytes() for path in changes}
    if write:
        written = []
        try:
            for path, content in changes.items():
                if path.is_symlink() or path.read_bytes() != before[path]:
                    raise ValueError(f"file changed during release preparation: {path.name}")
                write_file(path, content)
                written.append(path)
            report = check_project(root)
            if not report["ok"]:
                raise ValueError("post-write check failed: " + "; ".join(report["errors"]))
        except Exception:
            for path in reversed(written):
                # Never overwrite edits made by another writer after our write.
                if path.read_bytes() == changes[path]:
                    write_file(path, before[path])
            raise
    return {"from": current, "to": version, "written": write,
            "files": [str(path.relative_to(root)) for path in changes], "notice": notice, "notes": notes}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["prepare"])
    parser.add_argument("version")
    parser.add_argument("--notice", required=True)
    parser.add_argument("--notes-file", required=True, type=Path)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--root", type=Path, default=ROOT)
    args = parser.parse_args()
    try:
        result = prepare(args.root.resolve(), args.version, args.notice,
                         args.notes_file.read_text(encoding="utf-8"), args.write)
    except (OSError, ValueError) as error:
        print(f"Release preparation failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
