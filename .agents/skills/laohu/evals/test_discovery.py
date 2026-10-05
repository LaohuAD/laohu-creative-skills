"""Exercise live discovery in disposable fixtures beside this Skill."""

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
SKILL = Path(__file__).resolve().parents[1]
SCRIPT = SKILL / "scripts" / "list-skills.py"
spec = importlib.util.spec_from_file_location("discovery", SCRIPT)
discovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(discovery)


class DiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix=".discovery-", dir=SKILL / "evals")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def put(self, name, description="Use when a task needs this capability."):
        path = self.root / name / "SKILL.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"---\nname: {name}\ndescription: {description}\n---\n# Workflow\n", encoding="utf-8")
        return path

    def catalog(self):
        return discovery.discover(self.root)

    def test_add_update_rename_remove_without_registry(self):
        self.assertEqual(self.catalog()["skills"], [])
        path = self.put("laohu-test-part-detail")
        item = self.catalog()["skills"][0]
        self.assertEqual(item["level"], 4)
        self.assertIsNone(item["parent"])
        self.assertEqual(item["deployment"], "public")
        self.put("laohu-test-part-detail", "Updated capability")
        self.assertEqual(self.catalog()["skills"][0]["description"], "Updated capability")
        path.parent.rename(self.root / "laohu-test-renamed")
        self.assertEqual(self.catalog()["skills"], [])
        self.put("laohu-test-renamed")
        self.assertEqual(self.catalog()["skills"][0]["name"], "laohu-test-renamed")
        (self.root / "laohu-test-renamed" / "SKILL.md").unlink()
        self.assertEqual(self.catalog()["skills"], [])

    def test_live_add_update_rename_remove_with_display_manifest(self):
        self.put("laohu-anchor")
        order_file = self.root / "display-order.json"
        order_file.write_text(json.dumps({"items": [{
            "command": "/laohu", "label": "Root", "children": [
                {"command": "/laohu-anchor", "label": "Anchor"},
            ],
        }]}), encoding="utf-8")

        def names():
            return [item["name"] for item in discovery.discover(self.root, order_file=order_file)["skills"]]

        self.assertEqual(names(), ["laohu-anchor"])
        self.put("laohu-new-capability")
        self.assertEqual(names(), ["laohu-anchor", "laohu-new-capability"])
        self.put("laohu-new-capability", "Updated capability description")
        result = discovery.discover(self.root, order_file=order_file)
        self.assertEqual(result["skills"][1]["description"], "Updated capability description")
        (self.root / "laohu-new-capability").rename(self.root / "laohu-renamed")
        self.assertEqual(names(), ["laohu-anchor"])
        self.put("laohu-renamed")
        self.assertEqual(names(), ["laohu-anchor", "laohu-renamed"])
        (self.root / "laohu-renamed" / "SKILL.md").unlink()
        self.assertEqual(names(), ["laohu-anchor"])

    def test_public_deployment_is_independent_of_name_hierarchy(self):
        for name in ("laohu-htmlshow", "laohu-htmlshow-gzh", "laohu-htmlshow-gzh-layout"):
            self.put(name)
        items = {item["name"]: item for item in self.catalog()["skills"]}
        self.assertEqual(items["laohu-htmlshow"]["level"], 2)
        self.assertEqual(items["laohu-htmlshow-gzh"]["level"], 3)
        self.assertEqual(items["laohu-htmlshow-gzh-layout"]["level"], 4)
        self.assertIsNone(items["laohu-htmlshow"]["parent"])
        self.assertEqual(items["laohu-htmlshow-gzh"]["parent"], "laohu-htmlshow")
        self.assertEqual(items["laohu-htmlshow-gzh-layout"]["parent"], "laohu-htmlshow-gzh")
        self.assertTrue(all(item["deployment"] == "public" for item in items.values()))
        self.assertTrue(all(Path(item["path"]).parent.parent == self.root for item in items.values()))

    def test_manifest_orders_known_entries_and_appends_unknowns_under_their_parent(self):
        names = (
            "laohu-audit", "laohu-htmlshow", "laohu-htmlshow-gzh",
            "laohu-htmlshow-preview", "laohu-htmlshow-gzh-copy",
            "laohu-update", "laohu-extra",
        )
        for name in names:
            self.put(name)
        order_file = self.root / "display-order.json"
        order_file.write_text(json.dumps({"items": [{
            "command": "/laohu", "label": "Root", "children": [
                {"command": "/laohu-audit", "label": "Audit"},
                {"command": "/laohu-htmlshow", "label": "HTML", "children": [
                    {"command": "/laohu-htmlshow-gzh", "label": "WeChat"},
                ]},
                {"command": "/laohu-update", "label": "Update"},
            ],
        }]}), encoding="utf-8")
        result = discovery.discover(self.root, order_file=order_file)
        self.assertEqual([item["name"] for item in result["skills"]], [
            "laohu-audit", "laohu-htmlshow", "laohu-htmlshow-gzh",
            "laohu-htmlshow-gzh-copy", "laohu-htmlshow-preview",
            "laohu-update", "laohu-extra",
        ])
        self.assertEqual(result["skills"][2]["parent"], "laohu-htmlshow")
        self.assertEqual(result["skills"][3]["parent"], "laohu-htmlshow-gzh")

    def test_display_order_rejects_duplicate_commands(self):
        order_file = self.root / "display-order.json"
        order_file.write_text(json.dumps({"items": [{
            "command": "/laohu", "label": "Root", "children": [
                {"command": "/laohu-audit", "label": "Audit"},
                {"command": "/laohu-audit", "label": "Duplicate"},
            ],
        }]}), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "duplicate display order command"):
            discovery.read_display_order(order_file)

    def test_display_order_child_must_follow_its_skill_parent(self):
        order_file = self.root / "display-order.json"
        order_file.write_text(json.dumps({"items": [{
            "command": "/laohu", "label": "Root", "children": [
                {"command": "/laohu-assets", "label": "Assets", "children": [
                    {"command": "/laohu-htmlshow-gzh", "label": "Misplaced child"},
                ]},
            ],
        }]}), encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "outside parent"):
            discovery.read_display_order(order_file)

    def test_exclude_root_other_names_and_nested_resources(self):
        self.put("laohu")
        self.put("dbs-test")
        self.put("laohu-test")
        private = self.root / "laohu-private"
        private.mkdir()
        (private / ".local-only").write_text("private", encoding="utf-8")
        self.put("laohu-private")
        nested = self.root / "laohu-test" / "references" / "laohu-hidden"
        nested.mkdir(parents=True)
        (nested / "SKILL.md").write_text("not an entry", encoding="utf-8")
        (self.root / "laohu-empty").mkdir()
        self.assertEqual([item["name"] for item in self.catalog()["skills"]], ["laohu-test"])
        self.assertEqual(self.catalog()["reserved"], ["laohu-empty"])
        self.assertEqual(self.catalog()["unavailable"], [])

    def test_only_explicit_headings_only_documents_are_scaffolds(self):
        parent = self.root / "laohu-assets"
        parent.mkdir()
        skill = parent / "SKILL.md"
        skill.write_text("# 资产创作（框架待填充）\n\n## 输入\n\n### 输出\n", encoding="utf-8")
        self.assertTrue(discovery.is_skill_scaffold(skill))
        result = self.catalog()
        self.assertEqual(result["skills"], [])
        self.assertEqual([item["directory"] for item in result["scaffolds"]], ["laohu-assets"])

        for content in (
            "# 资产创作\n\n## 输入\n",
            "# 资产创作（框架待填充）\n\n仍有正文\n",
            "# 资产创作（框架待填充）\n\n    # 缩进代码块\n",
            "# 资产创作（框架待填充）\n\n# 第二个一级标题\n",
        ):
            with self.subTest(content=content):
                skill.write_text(content, encoding="utf-8")
                self.assertFalse(discovery.is_skill_scaffold(skill))
                self.assertEqual(self.catalog()["scaffolds"], [])
                self.assertEqual(len(self.catalog()["unavailable"]), 1)

    def test_identity_metadata_scaffold_is_reserved_and_malformed_drafts_rejected(self):
        path = self.root / "laohu-metadata-draft" / "SKILL.md"
        path.parent.mkdir()
        valid = ("---\nname: laohu-metadata-draft\ndescription: A draft identity only\n---\n"
                 "# 标题框架（框架待填充）\n\n## 职责\n")
        path.write_text(valid, encoding="utf-8")
        self.assertTrue(discovery.is_skill_scaffold(path))
        result = self.catalog()
        self.assertEqual(result["skills"], [])
        self.assertEqual([item["directory"] for item in result["scaffolds"]], ["laohu-metadata-draft"])
        self.assertEqual(result["unavailable"], [])

        invalid = (
            valid.replace("description: A draft identity only", "description: A draft identity only\nversion: 1"),
            valid.replace("name: laohu-metadata-draft", "name: laohu-other"),
            valid.replace("description: A draft identity only", "description: A draft identity only\nname: laohu-metadata-draft"),
            valid.replace("## 职责", "正文不能出现在框架草案中\n\n## 职责"),
            valid.replace("# 标题框架（框架待填充）", "前置正文\n\n# 标题框架（框架待填充）"),
            valid.replace("# 标题框架（框架待填充）", "<!-- 前置注释 -->\n\n# 标题框架（框架待填充）"),
        )
        for content in invalid:
            with self.subTest(content=content):
                path.write_text(content, encoding="utf-8")
                self.assertFalse(discovery.is_skill_scaffold(path))
                result = self.catalog()
                self.assertEqual(result["skills"], [])
                self.assertEqual(result["scaffolds"], [])
                self.assertEqual(len(result["unavailable"]), 1)
                self.assertIn("invalid Skill scaffold", result["unavailable"][0]["reason"])

    def test_valid_deployed_child_is_not_a_public_catalog_entry(self):
        self.put("laohu-assets")
        child = self.root / "laohu-assets" / "skills" / "laohu-person"
        (child / "SKILL.md").parent.mkdir(parents=True)
        (child / "SKILL.md").write_text(
            "---\nname: laohu-person\ndescription: A deployed configuration\n---\n# Person\n",
            encoding="utf-8")
        items = self.catalog()["skills"]
        self.assertEqual([item["name"] for item in items], ["laohu-assets"])
        self.assertEqual(items[0]["level"], 2)
        self.assertEqual(items[0]["deployment"], "public")

    def test_bad_metadata_is_reported_without_hiding_valid_skills(self):
        self.put("laohu-good")
        variants = ["no frontmatter", "---\nname: laohu-bad\n---\n# Body",
                    "---\nname: laohu-bad\ndescription: test\nname: laohu-other\n---\n# Body",
                    "---\nname: laohu-bad\ndescription: test\n---\n",
                    "---\nname: laohu-bad\ndescription: [not, text]\n---\n# Body"]
        path = self.put("laohu-bad")
        for content in variants:
            with self.subTest(content=content):
                path.write_text(content, encoding="utf-8")
                self.assertEqual(len(self.catalog()["skills"]), 1)
                self.assertEqual(len(self.catalog()["unavailable"]), 1)

    def test_scalar_forms(self):
        samples = [('"Use: a # mark" # comment', "Use: a # mark"),
                   ("'User''s input'", "User's input"),
                   (">-\n  First line\n  second line", "First line second line"),
                   ("|\n  First line\n  second line", "First line\nsecond line"),
                   ("Plain text # comment", "Plain text")]
        for text, expected in samples:
            with self.subTest(text=text):
                self.put("laohu-test", text)
                self.assertEqual(self.catalog()["skills"][0]["description"], expected)

    def test_symlinks_and_broken_links(self):
        source = self.root / "source"
        source.mkdir()
        (source / "SKILL.md").write_text("---\nname: laohu-linked\ndescription: Linked capability\n---\n# Body\n", encoding="utf-8")
        (self.root / "laohu-linked").symlink_to(source, target_is_directory=True)
        (self.root / "laohu-broken").symlink_to(self.root / "missing", target_is_directory=True)
        self.assertEqual(self.catalog()["skills"][0]["path"], str(source / "SKILL.md"))
        self.assertEqual(self.catalog()["unavailable"][0]["directory"], "laohu-broken")

    def test_cli_from_other_cwd_and_missing_root(self):
        self.put("laohu-test")
        env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
        result = subprocess.run([sys.executable, str(SCRIPT), "--root", str(self.root)],
                                cwd=self.root, env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(len(json.loads(result.stdout)["skills"]), 1)
        result = subprocess.run([sys.executable, str(SCRIPT), "--root", str(self.root / "missing")],
                                env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 2)
        self.assertIn("error", json.loads(result.stderr))

    def test_relocated_collection_uses_its_own_siblings(self):
        script = self.root / "laohu" / "scripts" / "list-skills.py"
        script.parent.mkdir(parents=True)
        script.write_bytes(SCRIPT.read_bytes())
        self.put("laohu-new-task")
        result = subprocess.run([sys.executable, str(script)], cwd=SKILL,
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        data = json.loads(result.stdout)
        self.assertEqual(data["root"], str(self.root.resolve()))
        self.assertEqual([item["name"] for item in data["skills"]], ["laohu-new-task"])


if __name__ == "__main__":
    unittest.main()
