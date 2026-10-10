#!/usr/bin/env python3
"""Safely preview, install, inspect, or remove the laohu-luna Codex role."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import shutil
import stat
import tempfile
from pathlib import Path
from typing import Any

try:
    import tomllib
except ModuleNotFoundError:  # Python 3.10 and older may have tomli preinstalled.
    try:
        import tomli as tomllib  # type: ignore[no-redef]
    except ModuleNotFoundError:
        tomllib = None  # type: ignore[assignment]


SKILL_DIR = Path(__file__).resolve().parent.parent
SOURCE = SKILL_DIR / "agents" / "luna-worker.toml"
ROLE_NAME = "laohu_luna_worker"
TARGET_NAME = f"{ROLE_NAME}.toml"
REQUIRED_FIELDS = ("name", "model", "model_reasoning_effort", "developer_instructions")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def default_agents_dir() -> Path:
    codex_home = os.environ.get("CODEX_HOME")
    base = Path(codex_home).expanduser() if codex_home else Path.home() / ".codex"
    return base / "agents"


def absolute_path(path: Path) -> Path:
    """Normalize `..` without resolving symlinks, so each link stays detectable."""
    return Path(os.path.abspath(path.expanduser()))


def path_kind(path: Path) -> str:
    try:
        mode = path.lstat().st_mode
    except FileNotFoundError:
        return "missing"
    except NotADirectoryError:
        return "blocked"
    if stat.S_ISLNK(mode):
        return "symlink"
    if stat.S_ISREG(mode):
        return "file"
    if stat.S_ISDIR(mode):
        return "directory"
    return "other"


def first_symlink_component(path: Path) -> Path | None:
    current = absolute_path(path)
    chain: list[Path] = []
    while True:
        chain.append(current)
        if current.parent == current:
            break
        current = current.parent
    for component in reversed(chain):
        try:
            if stat.S_ISLNK(component.lstat().st_mode):
                return component
        except FileNotFoundError:
            continue
        except NotADirectoryError:
            return None
    return None


def parse_toml(data: bytes) -> dict[str, Any]:
    if tomllib is None:
        raise RuntimeError("Python 3.11+ is required, or install tomli in the selected Python environment")
    parsed = tomllib.loads(data.decode("utf-8"))
    if not isinstance(parsed, dict):
        raise ValueError("top-level TOML document must be a table")
    return parsed


def source_info() -> tuple[bytes | None, str, str, dict[str, Any] | None]:
    try:
        data = SOURCE.read_bytes()
    except OSError as exc:
        return None, "source_missing", str(exc), None
    try:
        config = parse_toml(data)
    except (RuntimeError, UnicodeDecodeError, ValueError) as exc:
        return data, "source_invalid_toml", str(exc), None
    for field in REQUIRED_FIELDS:
        if not isinstance(config.get(field), str) or not config[field].strip():
            return data, "source_missing_required_field", f"TOML field {field!r} must be a non-empty string", config
    if config["name"] != ROLE_NAME:
        return data, "source_name_mismatch", f"expected name = {ROLE_NAME!r}", config
    return data, "ok", "", config


def duplicate_role_names(agents_dir: Path) -> list[str]:
    """Return other valid role files that declare the same top-level name."""
    duplicates: list[str] = []
    try:
        candidates = sorted(agents_dir.glob("*.toml"))
    except OSError:
        return duplicates
    target = agents_dir / TARGET_NAME
    for candidate in candidates:
        if candidate == target:
            continue
        try:
            config = parse_toml(candidate.read_bytes())
        except (OSError, RuntimeError, UnicodeDecodeError, ValueError):
            # An unreadable or invalid role file cannot be loaded as a valid
            # role; it is not treated as a duplicate.
            continue
        if config.get("name") == ROLE_NAME:
            duplicates.append(str(candidate))
    return duplicates


def inspect(agents_dir: Path) -> dict[str, Any]:
    agents_dir = absolute_path(agents_dir)
    data, source_state, source_error, _ = source_info()
    target = agents_dir / TARGET_NAME
    result: dict[str, Any] = {
        "source": str(SOURCE),
        "source_state": source_state,
        "source_error": source_error,
        "source_sha256": sha256(data) if data is not None else "",
        "agents_dir": str(agents_dir),
        "agents_dir_kind": path_kind(agents_dir),
        "target": str(target),
        "target_kind": "not_checked",
        "target_sha256": "",
        "matches_source": False,
        "status": "source_error" if source_state != "ok" else "not_installed",
    }
    if source_state != "ok":
        return result
    if result["agents_dir_kind"] == "symlink":
        result["status"] = "agents_directory_symlink"
        result["detail"] = "Refusing to write through a linked global agents directory."
        return result
    linked_component = first_symlink_component(agents_dir)
    if linked_component is not None:
        result["status"] = "agents_parent_symlink"
        result["symlink_component"] = str(linked_component)
        result["detail"] = "Refusing to read or write through a symlink in a parent of the agents directory."
        return result
    if result["agents_dir_kind"] not in {"missing", "directory"}:
        result["status"] = "agents_directory_conflict"
        result["detail"] = "The global agents path exists but is not a regular directory."
        return result
    if result["agents_dir_kind"] == "missing":
        result["target_kind"] = "missing"
        return result

    duplicates = duplicate_role_names(agents_dir)
    result["duplicate_role_files"] = duplicates
    if duplicates:
        result["status"] = "role_name_conflict"
        result["detail"] = "Another role file already declares this role name; it is preserved."
        return result

    result["target_kind"] = path_kind(target)
    if result["target_kind"] == "missing":
        return result
    if result["target_kind"] == "symlink":
        result["status"] = "target_symlink_conflict"
        result["detail"] = "The target is a symlink; it is preserved and never followed or replaced."
        return result
    if result["target_kind"] != "file":
        result["status"] = "target_type_conflict"
        result["detail"] = "The target exists but is not an ordinary file."
        return result
    try:
        target_data = target.read_bytes()
    except OSError as exc:
        result["status"] = "target_read_error"
        result["detail"] = str(exc)
        return result
    target_hash = sha256(target_data)
    result["target_sha256"] = target_hash
    result["matches_source"] = target_hash == result["source_sha256"]
    result["status"] = "installed_current" if result["matches_source"] else "target_content_conflict"
    if not result["matches_source"]:
        result["detail"] = "The installed target differs from the current Skill source; it is preserved."
    return result


def emit(payload: dict[str, Any], exit_code: int = 0) -> int:
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return exit_code


def preview_install(agents_dir: Path, *, write: bool) -> int:
    state = inspect(agents_dir)
    status = state["status"]
    if status == "installed_current":
        state.update({"operation": "install", "action": "already_installed", "wrote": False})
        return emit(state)
    if status not in {"not_installed"}:
        state.update({"operation": "install", "action": "conflict_preserved", "wrote": False})
        return emit(state, 3)

    state.update({
        "operation": "install",
        "action": "create_agents_directory_and_install" if state["agents_dir_kind"] == "missing" else "install_new_file",
        "wrote": False,
        "target_mode": "0600",
    })
    if not write:
        return emit(state)

    data, source_state, source_error, _ = source_info()
    if source_state != "ok" or data is None:
        state.update({"status": source_state, "detail": source_error, "action": "aborted", "wrote": False})
        return emit(state, 2)
    try:
        if first_symlink_component(agents_dir) is not None:
            state.update({"status": "agents_path_symlink_conflict", "action": "aborted", "wrote": False})
            return emit(state, 3)
        if not agents_dir.exists():
            agents_dir.mkdir(parents=True, mode=0o700)
        # Recheck all path components and competing role names immediately
        # before writing; never write through a linked path or duplicate role.
        preflight = inspect(agents_dir)
        if preflight["status"] != "not_installed":
            preflight.update({"operation": "install", "action": "conflict_preserved", "wrote": False})
            return emit(preflight, 3)
        if path_kind(agents_dir) != "directory":
            state.update({"status": "agents_directory_changed", "action": "aborted", "wrote": False})
            return emit(state, 3)
        fd, temp_name = tempfile.mkstemp(prefix=".laohu-luna-worker-", dir=str(agents_dir))
        temp = Path(temp_name)
        try:
            with os.fdopen(fd, "wb") as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.chmod(temp, 0o600)
            try:
                os.link(temp, agents_dir / TARGET_NAME)
            except FileExistsError:
                state = inspect(agents_dir)
                state.update({"operation": "install", "action": "conflict_preserved", "wrote": False})
                return emit(state, 3)
        finally:
            try:
                temp.unlink()
            except FileNotFoundError:
                pass
        installed = inspect(agents_dir)
        if installed["status"] != "installed_current":
            installed.update({"operation": "install", "action": "verification_failed_preserved", "wrote": True})
            return emit(installed, 4)
        installed.update({"operation": "install", "action": "installed", "wrote": True, "target_mode": "0600"})
        return emit(installed)
    except OSError as exc:
        state.update({"status": "install_error", "detail": str(exc), "action": "aborted", "wrote": False})
        return emit(state, 2)


def backup_dir_for(args: argparse.Namespace) -> Path:
    if args.backup_dir:
        return Path(args.backup_dir).expanduser().absolute()
    return (Path.cwd() / ".cache" / "restore" / "laohu-luna-role-setup").absolute()


def preview_remove(agents_dir: Path, *, write: bool, backup_base: Path) -> int:
    agents_dir = absolute_path(agents_dir)
    backup_base = absolute_path(backup_base)
    state = inspect(agents_dir)
    if state["status"] == "not_installed":
        state.update({"operation": "remove", "action": "already_absent", "wrote": False})
        return emit(state)
    if state["status"] != "installed_current":
        state.update({"operation": "remove", "action": "modified_or_conflicting_target_preserved", "wrote": False})
        return emit(state, 3)
    target = Path(state["target"])
    try:
        rel = target.absolute().relative_to(agents_dir.absolute())
        if backup_base == agents_dir.absolute() or agents_dir.absolute() in backup_base.parents:
            state.update({"operation": "remove", "status": "unsafe_backup_path", "detail": "Backup directory must not be inside the global agents directory.", "action": "aborted", "wrote": False})
            return emit(state, 3)
        linked_backup_component = first_symlink_component(backup_base)
        if linked_backup_component is not None:
            state.update({"operation": "remove", "status": "unsafe_backup_path", "detail": f"Backup path contains a symlink: {linked_backup_component}", "action": "aborted", "wrote": False})
            return emit(state, 3)
        current_stat = target.lstat()
        state.update({
            "operation": "remove",
            "action": "backup_then_remove_exact_copy",
            "wrote": False,
            "backup_directory": str(backup_base),
            "backup_filename": rel.name,
            "backup_required": True,
            "target_identity": {"device": current_stat.st_dev, "inode": current_stat.st_ino, "size": current_stat.st_size},
        })
        if not write:
            return emit(state)

        stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup_dir = backup_base / stamp
        suffix = 1
        while backup_dir.exists():
            backup_dir = backup_base / f"{stamp}-{suffix:02d}"
            suffix += 1
        backup_dir.mkdir(parents=True, mode=0o700)
        backup = backup_dir / target.name
        shutil.copy2(target, backup, follow_symlinks=False)
        expected = state["source_sha256"]
        if sha256(backup.read_bytes()) != expected:
            state.update({"operation": "remove", "status": "backup_verification_failed", "backup_path": str(backup), "action": "target_preserved", "wrote": False})
            return emit(state, 4)

        # Refuse removal if another process touched or replaced the target while
        # the backup was being made.
        after_stat = target.lstat()
        if (after_stat.st_dev, after_stat.st_ino, after_stat.st_size) != (current_stat.st_dev, current_stat.st_ino, current_stat.st_size):
            state.update({"operation": "remove", "status": "target_changed_during_backup", "backup_path": str(backup), "action": "target_preserved", "wrote": False})
            return emit(state, 3)
        if path_kind(target) != "file" or sha256(target.read_bytes()) != expected:
            state.update({"operation": "remove", "status": "target_changed_during_backup", "backup_path": str(backup), "action": "target_preserved", "wrote": False})
            return emit(state, 3)
        target.unlink()
        state.update({"operation": "remove", "status": "removed", "action": "removed_after_verified_backup", "backup_path": str(backup), "wrote": True})
        return emit(state)
    except OSError as exc:
        state.update({"operation": "remove", "status": "remove_error", "detail": str(exc), "action": "target_preserved_if_present", "wrote": False})
        return emit(state, 2)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--agents-dir", help="isolated agents directory; defaults to CODEX_HOME/agents or ~/.codex/agents")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status", help="read role source and target hashes without changing files")
    preview = sub.add_parser("preview", help="show a read-only install or removal plan")
    preview.add_argument("operation", choices=("install", "remove"))
    install = sub.add_parser("install", help="preview by default; add --write to create the standalone role file")
    install.add_argument("--write", action="store_true", help="explicitly write the role file after conflict checks")
    remove = sub.add_parser("remove", help="preview by default; add --write to back up and remove an unchanged role file")
    remove.add_argument("--write", action="store_true", help="explicitly back up and remove the unchanged role file")
    remove.add_argument("--backup-dir", help="project-local recovery directory; defaults to .cache/restore/laohu-luna-role-setup")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    agents_dir = absolute_path(Path(args.agents_dir)) if args.agents_dir else absolute_path(default_agents_dir())
    if args.command == "status":
        return emit({"operation": "status", **inspect(agents_dir)})
    if args.command == "preview":
        if args.operation == "install":
            return preview_install(agents_dir, write=False)
        return preview_remove(agents_dir, write=False, backup_base=(Path.cwd() / ".cache" / "restore" / "laohu-luna-role-setup").absolute())
    if args.command == "install":
        return preview_install(agents_dir, write=args.write)
    if args.command == "remove":
        return preview_remove(agents_dir, write=args.write, backup_base=backup_dir_for(args))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
