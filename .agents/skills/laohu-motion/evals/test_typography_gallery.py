"""Check that the offline specimen catalogue matches the production font index."""

import json
from pathlib import Path
import subprocess
import sys
import unittest


SKILL = Path(__file__).resolve().parents[1]
GALLERY = SKILL / "assets" / "typography"


class TypographyGalleryTests(unittest.TestCase):
    def test_offline_data_is_current_and_includes_every_indexed_face(self):
        result = subprocess.run([sys.executable, "-B", str(SKILL / "scripts" / "refresh-typography-gallery.py")],
                                text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stdout or result.stderr)
        mirror = (GALLERY / "gallery-data.js").read_text(encoding="utf-8")
        payload = json.loads(mirror.partition("window.motionFontGallery = ")[2].strip().rstrip(";"))
        production = json.loads((GALLERY / "fonts.json").read_text(encoding="utf-8"))
        self.assertEqual([row["id"] for row in payload["fonts"]], [row["id"] for row in production["entries"]])
        self.assertTrue(all(copy["file"]["url"].startswith(("../", "vendor/"))
                            for row in payload["fonts"] for copy in row["copies"]))
        weights = {row["id"]: row["weight"] for row in payload["fonts"]}
        self.assertEqual(weights["font:noto-sans-sc-900-subset"], {"min": 900, "max": 900})


if __name__ == "__main__":
    unittest.main()
