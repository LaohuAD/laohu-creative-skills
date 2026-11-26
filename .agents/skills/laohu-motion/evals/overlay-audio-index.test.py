"""Consumer checks for the pinned Overlay audio examples added to the local SFX index."""

import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import unittest


ROOT = Path(__file__).resolve().parents[4]
INDEX_PATH = ROOT / ".agents/skills/laohu-motion/assets/audio/index.json"
EVIDENCE_PATH = ROOT / ".agents/skills/laohu-motion/assets/audio/licenses/overlay-sfx-defaults-evidence.json"
SFX_TOOL = ROOT / ".agents/skills/laohu-motion/scripts/sfx-sources.py"
NEW_IDS = [
    "overlay.sfx-default.pop-light", "overlay.sfx-default.pop", "overlay.sfx-default.pop-cluster",
    "overlay.sfx-default.chime", "overlay.sfx-default.ding", "overlay.sfx-default.glitch",
    "overlay.sfx-default.sparkle", "overlay.sfx-default.type", "overlay.sfx-default.shutter",
    "overlay.sfx-default.impact", "overlay.sfx-default.rise", "overlay.sfx-default.whoosh-soft",
    "overlay.sfx-default.whoosh",
]
DUPLICATES = {"click": "kenney.interface-click-001", "hit-soft": "kenney.impact-soft-medium-000"}


def read_data():
    return json.loads(INDEX_PATH.read_text(encoding="utf-8"))


def row_by_id(index, asset_id):
    return next(row for row in index["assets"] if row["id"] == asset_id)


class OverlayAudioIndexTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = read_data()
        cls.evidence = json.loads(EVIDENCE_PATH.read_text(encoding="utf-8"))
        cls.ffprobe = shutil.which("ffprobe")

    def test_source_identity_deduplication_rights_and_unreviewed_status_are_explicit(self):
        self.assertEqual(self.index["schemaVersion"], 1)
        self.assertEqual(len(self.evidence["decodedComparisons"]), 15)
        self.assertEqual({x["name"] for x in self.evidence["decodedComparisons"]},
                         {"pop-light", "pop", "pop-cluster", "click", "chime", "ding", "glitch",
                          "sparkle", "type", "shutter", "impact", "hit-soft", "rise", "whoosh-soft", "whoosh"})
        self.assertEqual(self.evidence["decodedDedupeMethod"]["uniqueFilesCopied"], 13)
        self.assertIn("all 95 indexed non-music audio assets", self.evidence["decodedDedupeMethod"]["method"])
        self.assertEqual({x["sourceName"] for x in self.evidence["assets"]},
                         {x["name"] for x in self.evidence["decodedComparisons"]})
        self.assertEqual(self.evidence["decodedDedupeMethod"]["duplicateOutputsNotCopied"], DUPLICATES)
        self.assertEqual(len(self.index["assets"]), 137)
        for source_name, existing_id in DUPLICATES.items():
            row = row_by_id(self.index, existing_id)
            alias = next(x for x in row["source"]["sameAudioAliases"] if x["name"] == source_name)
            self.assertGreaterEqual(alias["correlation"], 0.995)
            self.assertGreaterEqual(alias["durationRatio"], 0.85)
            self.assertFalse((ROOT / ".agents/skills/laohu-motion/assets/audio/overlay-sfx-defaults" / f"{source_name}.mp3").exists())

        for asset_id in NEW_IDS:
            row = row_by_id(self.index, asset_id)
            file_path = ROOT / ".agents/skills/laohu-motion/assets/audio" / row["file"]
            self.assertTrue(file_path.is_file(), asset_id)
            self.assertEqual(hashlib.sha256(file_path.read_bytes()).hexdigest(), row["sha256"], asset_id)
            self.assertEqual(row["reviewStatus"], "candidate-unreviewed", asset_id)
            self.assertEqual(row["hitTimeConfidence"], "low", asset_id)
            self.assertIn("Estimate only", row["hitTimeMethod"], asset_id)
            self.assertNotIn("/Users/", json.dumps(row, ensure_ascii=False), asset_id)
            self.assertNotIn(".cache/research", json.dumps(row, ensure_ascii=False), asset_id)
            if asset_id.endswith(("whoosh", "whoosh-soft")):
                self.assertNotEqual(row["license"], "CC0-1.0")
                self.assertIn("no SPDX", row["license"])
            else:
                self.assertEqual(row["license"], "CC0-1.0")

    @unittest.skipUnless(shutil.which("ffprobe"), "ffprobe is required for the indexed-file consumer check")
    def test_local_search_checks_each_new_stable_id_and_real_media_file(self):
        for asset_id in NEW_IDS:
            with self.subTest(asset_id=asset_id):
                completed = subprocess.run([
                    sys.executable, str(SFX_TOOL), "local-search", "--asset-id", asset_id,
                    "--work-root", str(ROOT), "--index", str(INDEX_PATH), "--ffprobe", self.ffprobe,
                ], capture_output=True, text=True, check=False, cwd=ROOT)
                self.assertEqual(completed.returncode, 0, completed.stderr)
                result = json.loads(completed.stdout)
                self.assertEqual(result["status"], "ok")
                self.assertEqual(result["results"][0]["assetId"], asset_id)
                self.assertEqual(result["results"][0]["reviewStatus"], "candidate-unreviewed")
                self.assertNotEqual(result["results"][0]["reviewReuseStatus"], "ready")

    def test_candidate_groups_surface_unranked_choices_without_ready_defaults(self):
        groups = {item["id"]: item for item in self.index["candidateGroups"]}
        expected = {
            "digital-glitch-accent": "overlay.sfx-default.glitch",
            "text-entry-tick": "overlay.sfx-default.type",
            "camera-shutter": "overlay.sfx-default.shutter",
        }
        for group_id, asset_id in expected.items():
            with self.subTest(group_id=group_id):
                group = groups[group_id]
                self.assertFalse(group.get("defaultSelectionAllowed", True))
                self.assertEqual(group.get("selectionPolicy"), "parallel-unranked-candidates")
                self.assertIn(asset_id, {x["assetId"] for x in group["candidates"]})

        ffprobe = self.ffprobe or "ffprobe"
        completed = subprocess.run([
            sys.executable, str(SFX_TOOL), "local-groups", "--group-id", "digital-glitch-accent",
            "--work-root", str(ROOT), "--index", str(INDEX_PATH),
        ], capture_output=True, text=True, check=False, cwd=ROOT)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        result = json.loads(completed.stdout)
        self.assertEqual(result["status"], "ok")
        self.assertFalse(result["results"][0]["defaultSelectionAllowed"])
        self.assertEqual(result["results"][0]["candidates"][0]["assetId"], "overlay.sfx-default.glitch")


if __name__ == "__main__":
    unittest.main()
