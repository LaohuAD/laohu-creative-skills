"""Offline regression tests; all fixtures stay on the project filesystem."""

import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import check_project as checker
import release

UPDATE = checker.release_api(ROOT)


def manifest(version="0.1.0"):
    return {"version": version, "notice": "A useful update", "details_url": UPDATE.DETAILS_URL}


class ProjectTests(unittest.TestCase):
    def readme(self, extra=""):
        return ("# Fixture\n\n| Command | Purpose |\n| --- | --- |\n"
                "| /laohu | Main entry |\n| /laohu-update | Update |\n" + extra)

    def setUp(self):
        (ROOT / "tmp").mkdir(exist_ok=True)
        temporary = tempfile.TemporaryDirectory(prefix="maintenance fixture-中文 ", dir=ROOT / "tmp")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        for name in ("AGENTS.md", "LICENSE", ".gitignore", "README.md", "README.en.md",
                     "README.ja.md", "README.ko.md", "README.zh-TW.md"):
            (self.root / name).write_text(self.readme(), encoding="utf-8")
        (self.root / "docs").mkdir()
        (self.root / "docs/runtime.md").write_text("# Runtime fixture\n")
        for script in ("list-skills.py", "check-update.py"):
            target = self.root / checker.SKILLS / "laohu/scripts" / script
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / checker.SKILLS / "laohu/scripts" / script, target)
        for name in ("laohu", "laohu-update"):
            self.entry(name)
        (self.root / "VERSION").write_text("0.1.0\n", encoding="utf-8")
        (self.root / "CHANGELOG.md").write_text("# Versions\n\n## 0.1.0\n\n- Initial\n", encoding="utf-8")
        for path in (self.root / "UPDATE.json", self.root / checker.PACKAGE):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(manifest()), encoding="utf-8")

    def entry(self, name):
        path = self.root / checker.SKILLS / name / "SKILL.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"---\nname: {name}\ndescription: Use when needed\n---\n# Task\nRead `{{SKILL_DIR}}/../../../docs/runtime.md`.\n", encoding="utf-8")
        ui = path.parent / "agents/openai.yaml"
        ui.parent.mkdir(exist_ok=True)
        ui.write_text(f'interface:\n  display_name: "{name} | 测试助手"\n'
                      '  short_description: "A focused helper for this test task"\n'
                      f'  default_prompt: "Use ${name} for this task."\n', encoding="utf-8")
        if name not in {"laohu", "laohu-update"}:
            for readme_name in ("README.md", "README.en.md", "README.ja.md", "README.ko.md", "README.zh-TW.md"):
                readme = self.root / readme_name
                if f"| /{name} |" not in readme.read_text(encoding="utf-8"):
                    with readme.open("a", encoding="utf-8") as handle:
                        handle.write(f"| /{name} | Test entry |\n")
        return path

    def test_executable_eval_requires_actual_materials(self):
        data = {"cases": [{"id": "write", "execution_mode": "write", "prompt": "preserve exceptions"}]}
        self.assertTrue(checker.evaluation_material_errors(data))
        case = data["cases"][0]
        case.update(fixture_setup={"files": {"target.md": "Original text"}}, input_files=["target.md"])
        self.assertEqual(checker.evaluation_material_errors(data), [])
        case["input_files"] = ["missing.md"]
        self.assertTrue(checker.evaluation_material_errors(data))
        case["fixture_setup"]["files"]["../outside"] = "bad"
        self.assertTrue(any("invalid fixture" in e for e in checker.evaluation_material_errors(data)))
        self.assertEqual(checker.evaluation_material_errors({"cases": [{"prompt": "Which skill?"}]}), [])

    def test_distinct_fixtures_are_distinct_inputs(self):
        first = {"id": "a", "prompt": "edit", "fixture_setup": {"files": {"a.md": "one"}}}
        second = {"id": "b", "prompt": "edit", "fixture_setup": {"files": {"a.md": "two"}}}
        self.assertEqual(checker.duplicate_eval_cases({"cases": [first, second]}), [])

    def test_missing_ui_metadata_fails(self):
        path = self.entry("laohu-test")
        (path.parent / "agents/openai.yaml").unlink()
        self.assertTrue(any("openai.yaml" in e for e in checker.check_project(self.root)["errors"]))

    def test_ui_prompt_must_match_exact_skill_name(self):
        path = self.entry("laohu-test").parent / "agents/openai.yaml"
        path.write_text(path.read_text().replace("$laohu-test", "$laohu-test-other"))
        self.assertTrue(any("default_prompt" in e for e in checker.check_project(self.root)["errors"]))

    def test_ui_display_name_requires_exact_prefix_and_chinese_name(self):
        path = self.entry("laohu-test").parent / "agents/openai.yaml"
        original = path.read_text()
        for bad in ('"Other | 测试助手"', '"laohu-test | "', '"laohu-test | English"',
                    '"laohu-test laohu-test | 测试助手"'):
            with self.subTest(bad=bad):
                path.write_text(original.replace('"laohu-test | 测试助手"', bad))
                self.assertTrue(any("display_name" in e for e in checker.check_project(self.root)["errors"]))
        path.write_text(original)

    def test_ui_short_description_and_required_fields(self):
        path = self.entry("laohu-test").parent / "agents/openai.yaml"
        original = path.read_text()
        path.write_text(original.replace("A focused helper for this test task", "short"))
        self.assertTrue(any("25-64" in e for e in checker.check_project(self.root)["errors"]))
        path.write_text("\n".join(line for line in original.splitlines()
                                     if not line.startswith("  display_name:")) + "\n")
        self.assertTrue(any("display_name" in e for e in checker.check_project(self.root)["errors"]))

    def test_ui_other_settings_are_preserved(self):
        path = self.entry("laohu-test").parent / "agents/openai.yaml"
        text = path.read_text() + 'policy:\n  allow_implicit_invocation: true\n'
        path.write_text(text)
        self.assertTrue(checker.check_project(self.root)["ok"])
        self.assertEqual(path.read_text(), text)

    def test_empty_reservations_and_user_assets_are_not_errors(self):
        (self.root / checker.SKILLS / "laohu-future").mkdir()
        private = self.root / "knowledge" / "private.json"
        private.parent.mkdir()
        private.write_text("invalid JSON is outside scope", encoding="utf-8")
        report = checker.check_project(self.root)
        self.assertTrue(report["ok"], report["errors"])
        self.assertEqual(report["reserved"], ["laohu-future"])

    def test_nonempty_missing_entry_is_error(self):
        path = self.root / checker.SKILLS / "laohu-incomplete" / "references"
        path.mkdir(parents=True)
        self.assertFalse(checker.check_project(self.root)["ok"])

    def test_malformed_and_mismatched_metadata(self):
        path = self.entry("laohu-test")
        path.write_text("---\nname: laohu-other\ndescription: test\n---\n# Task\n", encoding="utf-8")
        self.assertTrue(any("mismatch" in e for e in checker.check_project(self.root)["errors"]))

    def test_nested_skill_is_error(self):
        path = self.root / checker.SKILLS / "laohu" / "laohu-inner" / "SKILL.md"
        path.parent.mkdir()
        path.write_text("# Wrong place", encoding="utf-8")
        self.assertTrue(any("nested Skill" in e for e in checker.check_project(self.root)["errors"]))

    def test_markdown_links_ignore_code_but_catch_missing_files(self):
        text = self.readme('`[example](missing.md)`\n```md\n[x](missing.md)\n'
                           '[placeholder]({SKILL_DIR}/missing.md) [absolute](/Users/example/file.md)\n'
                           '```\n[real](LICENSE)\n')
        (self.root / "README.md").write_text(text, encoding="utf-8")
        self.assertTrue(checker.check_project(self.root)["ok"])
        with (self.root / "README.md").open("a", encoding="utf-8") as handle:
            handle.write("[broken](missing.md)\n")
        self.assertTrue(any("broken Markdown" in e for e in checker.check_project(self.root)["errors"]))

    def test_unexpanded_path_placeholder_in_markdown_link_fails(self):
        path = self.entry("laohu-test")
        with path.open("a", encoding="utf-8") as handle:
            handle.write("\n[placeholder]({SKILL_DIR}/../../../docs/runtime.md)\n")
            handle.write("[encoded placeholder](%7BSKILL_DIR%7D/../../../docs/runtime.md)\n")
            handle.write("`[inline example]({PROJECT_ROOT}/missing.md)`\n")
        errors = checker.check_project(self.root)["errors"]
        self.assertEqual(sum("unexpanded path placeholder" in error for error in errors), 2, errors)

    def test_markdown_absolute_local_targets_fail(self):
        targets = (
            "/Users/example/file.md",
            "%2FUsers%2Fexample%2Ffile.md",
            "C:/Users/example/file.md",
            r"C:\Users\example\file.md",
            r"\\server\share\file.md",
            "file:///Users/example/file.md",
            "file:///C:/Users/example/file.md",
        )
        readme = self.root / "README.md"
        existing_absolute = (self.root / "LICENSE").resolve()
        readme.write_text(self.readme(f"[existing absolute](<{existing_absolute}>)\n"), encoding="utf-8")
        errors = checker.check_project(self.root)["errors"]
        self.assertTrue(any("absolute local file link" in error for error in errors), errors)
        for target in targets:
            with self.subTest(target=target):
                readme.write_text(self.readme(f"[local]({target})\n"), encoding="utf-8")
                errors = checker.check_project(self.root)["errors"]
                self.assertTrue(any("absolute local file link" in error for error in errors),
                                (target, errors))

    def test_relative_links_resolve_from_source_and_decode_urls_under_unicode_space_root(self):
        self.assertIn(" ", str(self.root))
        self.assertTrue(any("\u4e00" <= char <= "\u9fff" for char in str(self.root)))
        target = self.root / "docs" / "中文 文件.md"
        target.write_text("# Chinese file\n", encoding="utf-8")
        path = self.entry("laohu-test")
        same_skill = path.parent / "references" / "local.md"
        same_skill.parent.mkdir()
        same_skill.write_text("# Local reference\n\n[entry](../SKILL.md)\n", encoding="utf-8")
        with path.open("a", encoding="utf-8") as handle:
            handle.write("\n[reference](references/local.md)\n")
            handle.write("[cross-directory](../../../docs/%E4%B8%AD%E6%96%87%20%E6%96%87%E4%BB%B6.md#section)\n")
            handle.write("[external](https://example.com/{resource}) [anchor](#section)\n")
        report = checker.check_project(self.root)
        self.assertTrue(report["ok"], report["errors"])

    def test_json_python_and_unknown_readme_command_fail(self):
        (self.root / "bad.json").write_text("{", encoding="utf-8")
        (self.root / "bad.py").write_text("def fail(:", encoding="utf-8")
        (self.root / "README.md").write_text(self.readme("| /laohu-nonexistent | test |\n"), encoding="utf-8")
        self.assertEqual(len(checker.check_project(self.root)["errors"]), 3)

    def test_readme_catalog_must_cover_formal_entries_but_not_reservations(self):
        self.entry("laohu-test")
        for readme_name in ("README.md", "README.en.md", "README.ja.md", "README.ko.md", "README.zh-TW.md"):
            path = self.root / readme_name
            path.write_text("\n".join(line for line in path.read_text(encoding="utf-8").splitlines()
                                         if "| /laohu-test |" not in line) + "\n", encoding="utf-8")
        report = checker.check_project(self.root)
        self.assertTrue(any("README capability table omits" in e for e in report["errors"]))
        for name in ("README.md", "README.en.md", "README.ja.md", "README.ko.md", "README.zh-TW.md"):
            path = self.root / name
            path.write_text(path.read_text() + "| /laohu-test | Test |\n", encoding="utf-8")
        (self.root / checker.SKILLS / "laohu-future").mkdir()
        report = checker.check_project(self.root)
        self.assertTrue(report["ok"], report["errors"])
        self.assertEqual(report["reserved"], ["laohu-future"])

    def test_duplicate_eval_input_rejects_only_same_prompt_context_and_files(self):
        path = self.root / checker.SKILLS / "laohu/evals/evals.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        first = {"id": "first", "prompt": "do this", "context": "A", "input_files": ["a.md"]}
        second = {"id": "second", "prompt": "do this", "context": "A", "input_files": ["a.md"]}
        path.write_text(json.dumps({"cases": [first, second]}), encoding="utf-8")
        report = checker.check_project(self.root)
        self.assertTrue(any("duplicate evaluation input" in e for e in report["errors"]))
        second["context"] = "B"
        path.write_text(json.dumps({"cases": [first, second]}), encoding="utf-8")
        self.assertFalse(any("duplicate evaluation input" in e for e in checker.check_project(self.root)["errors"]))

    def test_version_drift_is_error(self):
        (self.root / "VERSION").write_text("0.2.0\n", encoding="utf-8")
        self.assertTrue(any("inconsistent" in e for e in checker.check_project(self.root)["errors"]))

    def test_release_preview_does_not_write(self):
        before = {p: p.read_bytes() for p in checker.project_files(self.root)}
        result = release.prepare(self.root, "0.1.1", "Improved checks", "- Fix a real defect")
        self.assertFalse(result["written"])
        self.assertTrue(all(p.read_bytes() == data for p, data in before.items()))

    def test_release_write_syncs_and_keeps_history(self):
        release.prepare(self.root, "0.1.1", "Improved checks", "- Fix a real defect", write=True)
        self.assertTrue(checker.check_project(self.root)["ok"])
        self.assertEqual((self.root / "VERSION").read_text().strip(), "0.1.1")
        self.assertIn("## 0.1.0", (self.root / "CHANGELOG.md").read_text())

    def test_release_rejects_downgrade_and_duplicate(self):
        for version in ("0.0.9", "0.1.0", "01.1.0", "1.0.0-beta"):
            with self.subTest(version=version), self.assertRaises(ValueError):
                release.prepare(self.root, version, "A notice", "- Change", write=True)

    def test_release_rolls_back_postcheck_failure(self):
        before = {p: p.read_bytes() for p in checker.project_files(self.root)}
        with self.assertRaises(ValueError):
            release.prepare(self.root, "0.1.1", "A notice", "- [bad](missing.md)", write=True)
        self.assertTrue(all(p.read_bytes() == data for p, data in before.items()))

    def test_release_rolls_back_partial_write_failure(self):
        before = {p: p.read_bytes() for p in checker.project_files(self.root)}
        original = release.write_file
        count = 0

        def fail_once(path, data):
            nonlocal count
            count += 1
            if count == 2:
                raise OSError("simulated write failure")
            original(path, data)

        with patch.object(release, "write_file", side_effect=fail_once), self.assertRaises(OSError):
            release.prepare(self.root, "0.1.1", "A notice", "- Change", write=True)
        self.assertTrue(all(p.read_bytes() == data for p, data in before.items()))


class UpdateTests(unittest.TestCase):
    def setUp(self):
        (ROOT / "tmp").mkdir(exist_ok=True)
        temporary = tempfile.TemporaryDirectory(prefix="update-check-", dir=ROOT / "tmp")
        self.addCleanup(temporary.cleanup)
        self.cache = Path(temporary.name) / "cache"

    def test_numeric_comparison(self):
        self.assertGreater(UPDATE.version_tuple("0.10.0"), UPDATE.version_tuple("0.9.99"))
        for remote, status in (("0.1.1", "newer"), ("0.1.0", "not_newer"), ("0.0.9", "not_newer")):
            result = UPDATE.check(manifest(), self.cache, force=True, fetch=lambda: manifest(remote))
            self.assertEqual(result["status"], status)

    def test_offline_and_unconfigured_cache_do_not_fetch(self):
        fetch = Mock()
        self.assertEqual(UPDATE.check(manifest(), self.cache, offline=True, fetch=fetch)["status"], "offline")
        self.assertEqual(UPDATE.check(manifest(), None, fetch=fetch)["status"], "skipped")
        fetch.assert_not_called()
        self.assertFalse(self.cache.exists())

    def test_daily_cache_force_and_version_change(self):
        fetch = Mock(return_value=manifest("0.2.0"))
        UPDATE.check(manifest(), self.cache, now=100000, fetch=fetch)
        self.assertEqual(UPDATE.check(manifest(), self.cache, now=100001, fetch=fetch)["status"], "cached")
        self.assertEqual(fetch.call_count, 1)
        UPDATE.check(manifest(), self.cache, force=True, now=100002, fetch=fetch)
        UPDATE.check(manifest("0.1.1"), self.cache, now=100003, fetch=fetch)
        UPDATE.check(manifest("0.1.1"), self.cache, now=200000, fetch=fetch)
        self.assertEqual(fetch.call_count, 4)

    def test_network_failure_also_throttles(self):
        fetch = Mock(side_effect=OSError("offline"))
        self.assertEqual(UPDATE.check(manifest(), self.cache, now=100000, fetch=fetch)["status"], "unavailable")
        self.assertEqual(UPDATE.check(manifest(), self.cache, now=100001, fetch=fetch)["status"], "cached")
        self.assertEqual(fetch.call_count, 1)

    def test_invalid_remote_payloads_do_not_announce(self):
        payloads = [None, [], {}, dict(manifest(), version="x"),
                    dict(manifest(), notice="line\nbreak"), dict(manifest(), details_url="https://example.com")]
        for payload in payloads:
            with self.subTest(payload=payload):
                result = UPDATE.check(manifest(), self.cache, force=True, fetch=lambda: payload)
                self.assertEqual(result["status"], "unavailable")

    def test_corrupt_cache_can_recover(self):
        self.cache.mkdir()
        (self.cache / "check.json").write_text("[]", encoding="utf-8")
        result = UPDATE.check(manifest(), self.cache, fetch=lambda: manifest("0.2.0"))
        self.assertEqual(result["status"], "newer")


if __name__ == "__main__":
    unittest.main()
