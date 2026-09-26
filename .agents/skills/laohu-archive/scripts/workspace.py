#!/usr/bin/env python3
"""Plan or create a work directory. Never overwrite, move, or rename content."""

import argparse
import json
import re
import sys
import subprocess
import unicodedata
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
ROOT = SKILL.parents[2]


def categories():
    return json.loads((SKILL / "references/categories.json").read_text(encoding="utf-8"))


def validate_name(name):
    if not name or name != name.strip() or name.endswith(".") or name in {".", ".."}:
        raise ValueError("Use a confirmed name without surrounding spaces or trailing dots")
    if any(c in '<>:"/\\|?*' or unicodedata.category(c).startswith("C") for c in name):
        raise ValueError("Work name contains a path separator, control or reserved character")
    if name.startswith(".") or re.fullmatch(r"(?i:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?", name):
        raise ValueError("Hidden and system-reserved work names are not allowed")
    if len(name.encode("utf-8")) > 240:
        raise ValueError("Work name is too long for a portable directory name")


def safe_directory(path):
    if path.is_symlink():
        raise ValueError(f"Refusing a symbolic link: {path}")
    if path.exists() and not path.is_dir():
        raise ValueError(f"A file occupies the directory path: {path}")


def prepare_target(target, *, write=False, reuse=False):
    target = Path(target).expanduser()
    if not target.is_absolute() or ".." in target.parts:
        raise ValueError("Use an absolute confirmed path without parent traversal")
    validate_name(target.name)
    for path in reversed((target, *target.parents)):
        safe_directory(path)
    parent, name = target.parent, target.name
    if parent.exists():
        normalized = unicodedata.normalize("NFC", name).casefold()
        for existing in parent.iterdir():
            if unicodedata.normalize("NFC", existing.name).casefold() == normalized and existing.name != name:
                raise ValueError(f"A case/Unicode-equivalent name already exists: {existing.name}")
    exists = target.exists()
    if exists and not reuse:
        raise ValueError("Directory exists; confirm the same work before using --reuse")
    if reuse and not exists:
        raise ValueError("Cannot reuse a missing work directory")
    status = "reused" if exists else "planned"
    if write and not exists:
        missing = []
        path = target
        while not path.exists():
            missing.append(path)
            path = path.parent
        created = []
        try:
            for path in reversed(missing):
                safe_directory(path)
                path.mkdir(exist_ok=False)
                created.append(path)
        except OSError:
            for path in reversed(created):
                path.rmdir()
            raise
        status = "created"
    return {"work_dir": str(target), "status": status}


def workspace(root, category, name, *, write=False, reuse=False):
    root = Path(root).expanduser().resolve(strict=True)
    if not (root / "AGENTS.md").is_file() or not (root / ".agents/skills").is_dir():
        raise ValueError("Root must be the verified Laohu project; use --work-dir for a confirmed external location")
    if category not in categories():
        raise ValueError("Unknown category; read references/categories.json")
    validate_name(name)
    result = prepare_target(root / "works" / category / name, write=write, reuse=reuse)
    return dict(result, name=name, category=category)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--category")
    parser.add_argument("--name")
    parser.add_argument("--work-dir", type=Path, help="Exact work directory explicitly chosen by the user")
    parser.add_argument("--location-confirmed", action="store_true", help="User has specified or accepted this external location")
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--reuse", action="store_true", help="Only after confirming this is the same work")
    args = parser.parse_args()
    try:
        if args.work_dir is not None:
            if not args.location_confirmed:
                raise ValueError("Confirm the external save location before using --work-dir")
            if args.category or args.name:
                raise ValueError("--work-dir is an exact path; do not combine it with --category or --name")
            result = prepare_target(args.work_dir, write=args.write, reuse=args.reuse)
        else:
            if not args.category or not args.name:
                raise ValueError("Provide --category and --name, or a confirmed --work-dir")
            # Default source-relative writing is safe only in this repository's task environment.
            task = Path.cwd().resolve()
            root = args.root.expanduser().resolve(strict=True)
            probe = subprocess.run(["git", "-C", str(task), "rev-parse", "--show-toplevel"], capture_output=True, text=True)
            nested_other_repo = probe.returncode == 0 and Path(probe.stdout.strip()).resolve() != root
            if nested_other_repo or (task != root and root not in task.parents):
                raise ValueError("Outside the Laohu project: choose and confirm --work-dir before saving")
            result = workspace(args.root, args.category, args.name, write=args.write, reuse=args.reuse)
    except (OSError, ValueError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
