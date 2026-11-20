import hashlib
import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[4]
SCRIPT_PATH = REPO_ROOT / ".agents/skills/laohu-motion/scripts/laohu-styles.py"
SPEC = importlib.util.spec_from_file_location("laohu_typography_resources_test", SCRIPT_PATH)
styles = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(styles)


class TypographyResourceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fonts, cls.uses = styles.typography_rows()

    def test_catalog_distinguishes_fonts_and_methods_and_references_existing_ids(self):
        index = styles.resource_overview({}, "fonts")
        self.assertEqual(len(index["fonts"]), len(self.fonts))
        self.assertEqual(len(index["uses"]), len(self.uses))
        fonts = {row["id"] for row in self.fonts}
        self.assertEqual(len(fonts), len(self.fonts))
        hashes = {row["copies"][0]["file"]["sha256"] for row in self.fonts}
        self.assertEqual(len(hashes), len(self.fonts))
        for row in index["uses"]:
            self.assertEqual(row["availability"], "method-reference")
            self.assertTrue(set(row["fontIds"]) <= fonts, row["id"])
        for row in self.fonts:
            self.assertEqual(len({copy["file"]["sha256"] for copy in row["copies"]}), 1, row["id"])
            self.assertEqual(len(styles.font_codepoints(row["cmap"])), row["glyphCount"], row["id"])

    def test_cli_get_checks_actual_words_and_resolves_pinned_licensed_bytes(self):
        sample = "--text=如果有一天"
        result = subprocess.run([sys.executable, "-B", str(SCRIPT_PATH), "resource-get",
                                 "--id", "font:noto-serif-sc-variable", sample],
                                cwd=REPO_ROOT, check=True, text=True, capture_output=True)
        face = json.loads(result.stdout)
        self.assertEqual(face["availability"], "local-font")
        self.assertEqual(face["coverage"], {"supported": True, "missing": []})
        self.assertEqual(face["weight"], {"min": 200, "max": 900})
        for key in ("file", "license"):
            descriptor = face[key]
            self.assertEqual(hashlib.sha256((REPO_ROOT / descriptor["path"]).read_bytes()).hexdigest(),
                             descriptor["sha256"])
        subset = styles.resource_get({}, "font:noto-serif-sc-subset", sample="如果有一天")
        self.assertEqual(subset["coverage"], {"supported": False, "missing": [{"character": "如", "codePoint": "U+5982"}]})

    def test_cli_preserves_dashes_in_font_text_and_query_values(self):
        def run(*args):
            return subprocess.run([sys.executable, "-B", str(SCRIPT_PATH), *args],
                                  cwd=REPO_ROOT, text=True, capture_output=True)

        get = ("resource-get", "--id", "font:jetbrains-mono-variable")
        for text_args in (("--text", "--test"), ("--text=--test",), ("--text", "--query")):
            with self.subTest(text_args=text_args):
                result = run(*get, *text_args)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(json.loads(result.stdout)["coverage"], {"supported": True, "missing": []})

        search = ("resource-search", "--source", "fonts")
        for query_args in (("--query", "--JetBrains"), ("--query=--JetBrains",)):
            with self.subTest(query_args=query_args):
                result = run(*search, *query_args, "--text", "--test猫")
                self.assertEqual(result.returncode, 0, result.stderr)
                face = next(row for row in json.loads(result.stdout) if row["id"] == "font:jetbrains-mono-variable")
                self.assertEqual(face["coverage"]["missing"], [{"character": "猫", "codePoint": "U+732B"}])

        for command, option in ((get, "--text"), (search, "--text"), (search, "--query")):
            with self.subTest(command=command, option=option):
                result = run(*command, option)
                self.assertEqual(result.returncode, 2)
                self.assertIn(f"argument {option}: expected one argument", result.stderr)

    def test_search_connects_an_expression_query_and_an_operation_query_to_different_options(self):
        question = styles.resource_search({}, "个人设问，反思", "fonts", sample="如果有一天")
        operation = styles.resource_search({}, "操作动画，指针，步骤标签", "fonts", sample="基础设施")
        self.assertEqual(question[0]["id"], "type-use:tentative-question")
        self.assertIn("font:noto-serif-sc-variable", {row["id"] for row in question[:4]})
        self.assertEqual(operation[0]["id"], "type-use:stable-labels")
        self.assertIn("font:noto-sans-sc-variable", {row["id"] for row in operation[:4]})
        exact_faces = styles.resource_search({}, "思源宋体", "fonts", sample="如果有一天")
        eligible_ids = [row["id"] for row in exact_faces if row.get("coverage", {}).get("supported")]
        self.assertIn("font:noto-serif-sc-variable", eligible_ids)
        self.assertNotIn("font:noto-serif-sc-subset", eligible_ids)

    def test_unlisted_sample_and_variation_selectors_use_actual_cmap_data(self):
        coverage = styles.resource_get({}, "font:lxgw-wenkai-regular", sample="𠮷；工作台 A-19")["coverage"]
        self.assertTrue(coverage["supported"], coverage)
        demo = {"cmap": "4E01-4E03", "variationSequences": {"E0100": "4E01"}}
        report = styles.typography_coverage(demo, "丁\U000E0100丂\U000E0100七\U000E0100\n\U000E0100")
        self.assertEqual([row["precedingCharacter"] for row in report["missing"]], ["丂", "七", None])
        self.assertTrue(styles.typography_coverage(demo, "丁\U000E0100\r\n\t")["supported"])

    def test_checks_hash_on_selected_asset_and_resolves_l2_for_approved_use(self):
        asset = next(row for row in self.fonts if row["id"] == "font:noto-serif-sc-variable")
        copy = asset["copies"][0]
        damaged_file = {**copy, "file": {**copy["file"], "sha256": "0" * 64}}
        damaged_license = {**copy, "license": {**copy["license"], "sha256": "0" * 64}}
        self.assertEqual(styles.typography_availability({**asset, "copies": [damaged_file]})[0], "font-file-unavailable")
        self.assertEqual(styles.typography_availability({**asset, "copies": [damaged_license]})[0], "license-unverified")
        for resource_id in ("type-use:closing-line-after-list", "font:noto-serif-sc-variable"):
            row = styles.resource_fulltext({}, resource_id, "L2", {})
            content = row["content"].encode("utf-8")
            self.assertEqual(hashlib.sha256(content).hexdigest(), row["sha256"])
            self.assertEqual(len(content), row["bytes"])
            self.assertIn(resource_id, row["content"])


if __name__ == "__main__":
    unittest.main()
