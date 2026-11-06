#!/usr/bin/env python3
"""Plan or create a reference-library container without changing works paths."""

from __future__ import annotations

import argparse
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
PROJECT_ROOT = SKILL.parents[2]
LAYOUTS = SKILL / "references/library-layouts.json"


def _workspace_api():
    spec = importlib.util.spec_from_file_location("archive_workspace", SKILL / "scripts/workspace.py")
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load archive workspace helpers")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _layouts():
    return json.loads(LAYOUTS.read_text(encoding="utf-8"))["reference_libraries"]


def _verified_root(root: str | Path) -> Path:
    path = Path(root).expanduser()
    if not path.is_absolute() or ".." in path.parts:
        raise ValueError("Use an absolute project root without parent traversal")
    current = Path(path.anchor)
    for part in path.parts[1:]:
        current = current / part
        if current.is_symlink():
            raise ValueError(f"Refusing a symbolic link in project root: {current}")
    path = path.resolve(strict=True)
    if not (path / "AGENTS.md").is_file() or not (path / ".agents/skills").is_dir():
        raise ValueError("Root must be the verified Laohu project")
    return path


def library_workspace(root: str | Path, library: str, *, write: bool = False,
                      reuse: bool = False) -> dict:
    layouts = _layouts()
    if library not in layouts:
        raise ValueError("Unknown reference library; read references/library-layouts.json")
    project = _verified_root(root)
    relative = layouts[library]["path"]
    target = project / relative
    result = _workspace_api().prepare_target(target, write=write, reuse=reuse)
    return dict(result, library=library, layout=relative, owner=layouts[library]["owner"])


def explicit_library_workspace(path: str | Path, *, location_confirmed: bool,
                               write: bool = False, reuse: bool = False) -> dict:
    if not location_confirmed:
        raise ValueError("Confirm the reference-library location before using an external path")
    result = _workspace_api().prepare_target(path, write=write, reuse=reuse)
    return dict(result, library="external", layout="user-confirmed path")


def _ensure_task_inside(root: Path) -> None:
    task = Path.cwd().resolve()
    probe = subprocess.run(["git", "-C", str(task), "rev-parse", "--show-toplevel"],
                           capture_output=True, text=True)
    nested_other_repo = probe.returncode == 0 and Path(probe.stdout.strip()).resolve() != root
    if nested_other_repo or (task != root and root not in task.parents):
        raise ValueError("Outside the Laohu project: select and confirm an external --library-root")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--library", help="A key from references/library-layouts.json")
    parser.add_argument("--root", type=Path, default=PROJECT_ROOT,
                        help="Verified current project root; defaults to this repository")
    parser.add_argument("--library-root", type=Path,
                        help="Exact external library container selected under runtime rules")
    parser.add_argument("--location-confirmed", action="store_true",
                        help="The user has specified or accepted --library-root")
    parser.add_argument("--write", action="store_true", help="Create the planned container")
    parser.add_argument("--reuse", action="store_true", help="Reuse only the same confirmed library")
    args = parser.parse_args(argv)
    try:
        if args.library_root is not None:
            if args.library:
                raise ValueError("Use --library or --library-root, not both")
            result = explicit_library_workspace(args.library_root,
                                                location_confirmed=args.location_confirmed,
                                                write=args.write, reuse=args.reuse)
        else:
            if args.location_confirmed:
                raise ValueError("--location-confirmed only applies to --library-root")
            if not args.library:
                raise ValueError("Provide --library from references/library-layouts.json")
            root = _verified_root(args.root)
            _ensure_task_inside(root)
            result = library_workspace(root, args.library, write=args.write, reuse=args.reuse)
    except (OSError, ValueError, RuntimeError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
