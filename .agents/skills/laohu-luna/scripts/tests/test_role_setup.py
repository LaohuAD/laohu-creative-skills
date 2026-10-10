#!/usr/bin/env python3
"""Isolated safety tests for the laohu-luna role deployment helper."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SKILL_DIR = Path(__file__).resolve().parents[2]
SCRIPT = SKILL_DIR / "scripts" / "role-setup.py"
SOURCE = SKILL_DIR / "agents" / "luna-worker.toml"
ROLE_NAME = "laohu_luna_worker"
TARGET_NAME = f"{ROLE_NAME}.toml"


def run_tool(agents_dir: Path, *args: str) -> tuple[subprocess.CompletedProcess[str], dict[str, object]]:
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--agents-dir", str(agents_dir), *args],
        check=False,
        text=True,
        capture_output=True,
        timeout=15,
    )
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise AssertionError(f"tool did not emit JSON: {result.stdout!r}; stderr={result.stderr!r}") from exc
    return result, payload


class RoleSetupTests(unittest.TestCase):
    def test_preview_and_default_install_are_read_only_then_write_exact_file(self) -> None:
        with tempfile.TemporaryDirectory(prefix="laohu-role-preview-") as temp:
            agents = Path(temp) / "home" / "agents"
            result, plan = run_tool(agents, "preview", "install")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse(agents.exists())
            self.assertFalse(plan["wrote"])

            result, plan = run_tool(agents, "install")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse(agents.exists())
            self.assertFalse(plan["wrote"])

            result, installed = run_tool(agents, "install", "--write")
            self.assertEqual(result.returncode, 0, result.stderr)
            target = agents / TARGET_NAME
            self.assertEqual(target.read_bytes(), SOURCE.read_bytes())
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            self.assertEqual(installed["status"], "installed_current")

            first_stat = target.stat()
            result, again = run_tool(agents, "install", "--write")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(again["action"], "already_installed")
            self.assertFalse(again["wrote"])
            self.assertEqual(target.stat().st_ino, first_stat.st_ino)

    def test_alias_file_with_same_role_name_blocks_install(self) -> None:
        with tempfile.TemporaryDirectory(prefix="laohu-role-alias-") as temp:
            agents = Path(temp) / "agents"
            agents.mkdir()
            alias = agents / "personal-worker.toml"
            alias.write_bytes(SOURCE.read_bytes())
            original = alias.read_bytes()

            result, state = run_tool(agents, "install", "--write")
            self.assertEqual(result.returncode, 3)
            self.assertEqual(state["status"], "role_name_conflict")
            self.assertEqual(state["duplicate_role_files"], [str(alias)])
            self.assertEqual(alias.read_bytes(), original)
            self.assertFalse((agents / TARGET_NAME).exists())

    def test_parent_symlink_is_rejected_without_writing_through_it(self) -> None:
        with tempfile.TemporaryDirectory(prefix="laohu-role-parent-link-") as temp:
            base = Path(temp)
            real_home = base / "real-home"
            real_home.mkdir()
            home_link = base / "home-link"
            home_link.symlink_to(real_home, target_is_directory=True)
            agents = home_link / "agents"

            result, state = run_tool(agents, "status")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(state["status"], "agents_parent_symlink")
            self.assertEqual(Path(state["symlink_component"]), home_link)

            result, state = run_tool(agents, "install", "--write")
            self.assertEqual(result.returncode, 3)
            self.assertEqual(state["status"], "agents_parent_symlink")
            self.assertFalse((real_home / "agents").exists())

    def test_non_directory_parent_is_reported_without_crashing(self) -> None:
        with tempfile.TemporaryDirectory(prefix="laohu-role-blocked-parent-") as temp:
            blocker = Path(temp) / "not-a-directory"
            blocker.write_text("preserve\n", encoding="utf-8")
            agents = blocker / "agents"
            result, state = run_tool(agents, "install", "--write")
            self.assertEqual(result.returncode, 3)
            self.assertEqual(state["status"], "agents_directory_conflict")
            self.assertEqual(blocker.read_text(encoding="utf-8"), "preserve\n")

    def test_agents_directory_symlink_is_refused(self) -> None:
        with tempfile.TemporaryDirectory(prefix="laohu-role-dir-link-") as temp:
            base = Path(temp)
            real_agents = base / "real-agents"
            real_agents.mkdir()
            agents = base / "agents"
            agents.symlink_to(real_agents, target_is_directory=True)

            result, state = run_tool(agents, "install", "--write")
            self.assertEqual(result.returncode, 3)
            self.assertEqual(state["status"], "agents_directory_symlink")
            self.assertEqual(list(real_agents.iterdir()), [])

    def test_target_symlink_is_preserved(self) -> None:
        with tempfile.TemporaryDirectory(prefix="laohu-role-target-link-") as temp:
            base = Path(temp)
            agents = base / "agents"
            agents.mkdir()
            external = base / "outside.toml"
            external.write_text("user data\n", encoding="utf-8")
            target = agents / TARGET_NAME
            target.symlink_to(external)

            result, state = run_tool(agents, "install", "--write")
            self.assertEqual(result.returncode, 3)
            self.assertEqual(state["status"], "target_symlink_conflict")
            self.assertTrue(target.is_symlink())
            self.assertEqual(external.read_text(encoding="utf-8"), "user data\n")

    def test_remove_makes_verified_backup_and_removes_only_exact_copy(self) -> None:
        with tempfile.TemporaryDirectory(prefix="laohu-role-remove-") as temp:
            base = Path(temp)
            agents = base / "agents"
            backup_base = base / "restore"
            result, _ = run_tool(agents, "install", "--write")
            self.assertEqual(result.returncode, 0, result.stderr)
            target = agents / TARGET_NAME

            result, plan = run_tool(agents, "remove", "--backup-dir", str(backup_base))
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse(plan["wrote"])
            self.assertTrue(target.exists())
            self.assertFalse(backup_base.exists())

            result, removed = run_tool(agents, "remove", "--write", "--backup-dir", str(backup_base))
            self.assertEqual(result.returncode, 0, result.stderr)
            backup = Path(removed["backup_path"])
            self.assertEqual(backup.read_bytes(), SOURCE.read_bytes())
            self.assertEqual(hashlib.sha256(backup.read_bytes()).hexdigest(), removed["source_sha256"])
            self.assertFalse(target.exists())

    def test_modified_target_is_never_removed_or_backed_up_as_current_source(self) -> None:
        with tempfile.TemporaryDirectory(prefix="laohu-role-modified-") as temp:
            base = Path(temp)
            agents = base / "agents"
            result, _ = run_tool(agents, "install", "--write")
            self.assertEqual(result.returncode, 0, result.stderr)
            target = agents / TARGET_NAME
            target.write_bytes(SOURCE.read_bytes() + b"# local edit\n")
            modified = target.read_bytes()
            backup_base = base / "restore"

            result, state = run_tool(agents, "remove", "--write", "--backup-dir", str(backup_base))
            self.assertEqual(result.returncode, 3)
            self.assertEqual(state["status"], "target_content_conflict")
            self.assertEqual(target.read_bytes(), modified)
            self.assertFalse(backup_base.exists())

    def test_source_parser_rejects_invalid_or_incomplete_role_config(self) -> None:
        spec = importlib.util.spec_from_file_location("laohu_role_setup_under_test", SCRIPT)
        self.assertIsNotNone(spec)
        module = importlib.util.module_from_spec(spec)
        assert spec.loader is not None
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory(prefix="laohu-role-invalid-source-") as temp:
            source = Path(temp) / "source.toml"
            module.SOURCE = source

            source.write_text('name = "laohu_luna_worker"\ninvalid = [\n', encoding="utf-8")
            _, state, _, _ = module.source_info()
            self.assertEqual(state, "source_invalid_toml")

            source.write_text('name = "laohu_luna_worker"\nmodel = "gpt-6-luna"\n', encoding="utf-8")
            _, state, error, _ = module.source_info()
            self.assertEqual(state, "source_missing_required_field")
            self.assertIn("model_reasoning_effort", error)


if __name__ == "__main__":
    unittest.main()
