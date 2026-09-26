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
        self.put("laohu-test-part-detail", "Updated capability")
        self.assertEqual(self.catalog()["skills"][0]["description"], "Updated capability")
        path.parent.rename(self.root / "laohu-test-renamed")
        self.assertEqual(self.catalog()["skills"], [])
        self.put("laohu-test-renamed")
        self.assertEqual(self.catalog()["skills"][0]["name"], "laohu-test-renamed")
        (self.root / "laohu-test-renamed" / "SKILL.md").unlink()
        self.assertEqual(self.catalog()["skills"], [])

    def test_parent_is_optional_and_nearest_existing(self):
        for name in ("laohu-lyrics", "laohu-lyrics-rhyme", "laohu-lyrics-rhyme-check"):
            self.put(name)
        items = {item["name"]: item for item in self.catalog()["skills"]}
        self.assertEqual(items["laohu-lyrics-rhyme-check"]["parent"], "laohu-lyrics-rhyme")
        self.assertEqual(items["laohu-lyrics-rhyme"]["parent"], "laohu-lyrics")

    def test_exclude_root_other_names_and_nested_resources(self):
        self.put("laohu")
        self.put("dbs-test")
        self.put("laohu-test")
        nested = self.root / "laohu-test" / "references" / "laohu-hidden"
        nested.mkdir(parents=True)
        (nested / "SKILL.md").write_text("not an entry", encoding="utf-8")
        (self.root / "laohu-empty").mkdir()
        self.assertEqual([item["name"] for item in self.catalog()["skills"]], ["laohu-test"])
        self.assertEqual(self.catalog()["unavailable"][0]["directory"], "laohu-empty")

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
