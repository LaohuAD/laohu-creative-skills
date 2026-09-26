"""Directory behavior tests using disposable projects on the same filesystem."""

import importlib.util
import sys
import subprocess
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
SKILL = Path(__file__).resolve().parents[1]
ROOT = SKILL.parents[2]
spec = importlib.util.spec_from_file_location("workspace", SKILL / "scripts/workspace.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        (ROOT / "tmp").mkdir(exist_ok=True)
        temporary = tempfile.TemporaryDirectory(prefix="archive-", dir=ROOT / "tmp")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        (self.root / "AGENTS.md").write_text("# Fixture\n")
        (self.root / ".agents/skills").mkdir(parents=True)

    def test_preview_does_not_create_directories(self):
        result = api.workspace(self.root, "music", "晚风来信")
        self.assertEqual(result["status"], "planned")
        self.assertFalse((self.root / "works").exists())

    def test_create_reuse_and_preserve_mixed_media(self):
        result = api.workspace(self.root, "music", "晚风来信", write=True)
        path = Path(result["work_dir"])
        self.assertEqual(list(path.iterdir()), [])
        original = {"lyrics.md": b"lyrics", "arrangement.md": b"arrangement", "cover.png": b"image", "song.wav": b"audio", "video.mp4": b"video"}
        for name, data in original.items():
            (path / name).write_bytes(data)
        again = api.workspace(self.root, "music", "晚风来信", write=True, reuse=True)
        self.assertEqual(again["work_dir"], result["work_dir"])
        self.assertEqual(again["status"], "reused")
        self.assertEqual({p.name: p.read_bytes() for p in path.iterdir()}, original)

    def test_collision_requires_explicit_reuse(self):
        api.workspace(self.root, "cover", "Poster", write=True)
        with self.assertRaises(ValueError):
            api.workspace(self.root, "cover", "Poster", write=True)
        with self.assertRaises(ValueError):
            api.workspace(self.root, "cover", "poster", write=True, reuse=True)

    def test_invalid_category_or_name_does_not_write(self):
        for category, name in [("unknown", "Work"), ("../music", "Work"), ("music", "../escape"), ("music", "/escape"), ("music", "NUL"), ("music", "one/two"), ("music", "name."), ("music", "")]:
            with self.subTest(category=category, name=name), self.assertRaises(ValueError):
                api.workspace(self.root, category, name, write=True)
        self.assertFalse((self.root / "works").exists())

    def test_missing_reuse_and_wrong_root_fail(self):
        with self.assertRaises(ValueError):
            api.workspace(self.root, "music", "Missing", write=True, reuse=True)
        with self.assertRaises(ValueError):
            api.workspace(self.root / ".agents", "music", "Wrong", write=True)

    def test_file_and_symlink_collisions_are_preserved(self):
        works = self.root / "works"
        works.write_bytes(b"existing file")
        with self.assertRaises(ValueError):
            api.workspace(self.root, "music", "Song", write=True)
        self.assertEqual(works.read_bytes(), b"existing file")
        works.unlink()
        outside = self.root / "outside"
        outside.mkdir()
        works.symlink_to(outside, target_is_directory=True)
        with self.assertRaises(ValueError):
            api.workspace(self.root, "music", "Song", write=True)
        self.assertEqual(list(outside.iterdir()), [])

    def test_category_symlink_and_occupied_work_name_fail(self):
        parent = self.root / "works/music"
        parent.mkdir(parents=True)
        (parent / "Song").write_bytes(b"user data")
        with self.assertRaises(ValueError):
            api.workspace(self.root, "music", "Song", write=True, reuse=True)
        (self.root / "works/cover").symlink_to(parent, target_is_directory=True)
        with self.assertRaises(ValueError):
            api.workspace(self.root, "cover", "Poster", write=True)
        self.assertEqual((parent / "Song").read_bytes(), b"user data")


    def test_external_exact_path_create_and_reuse(self):
        target = self.root / "client project/交付/秋日展"
        result = api.prepare_target(target, write=True)
        self.assertEqual(result["work_dir"], str(target))
        (target / "brief.md").write_text("原文")
        again = api.prepare_target(target, write=True, reuse=True)
        self.assertEqual(again["status"], "reused")
        self.assertEqual((target / "brief.md").read_text(), "原文")

    def test_cli_external_requires_confirmation_and_no_default_fallback(self):
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        command = [sys.executable, str(SKILL / "scripts/workspace.py")]
        target = self.root / "external/交付"
        for args in (["--category", "music", "--name", "Wrong"],
                     ["--work-dir", str(target), "--write"]):
            run = subprocess.run(command + args, cwd=self.root, capture_output=True)
            self.assertNotEqual(run.returncode, 0)
        self.assertFalse(target.exists())
        run = subprocess.run(command + ["--work-dir", str(target), "--location-confirmed", "--write"],
                             cwd=self.root, capture_output=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertTrue(target.is_dir())

    def test_external_symlink_parent_and_traversal_rejected(self):
        parent = self.root / "outside"
        parent.mkdir()
        (self.root / "linked").symlink_to(parent, target_is_directory=True)
        for target in (self.root / "linked/Work", self.root / "outside/../Work", Path("relative/Work")):
            with self.subTest(target=target), self.assertRaises(ValueError):
                api.prepare_target(target, write=True)
        self.assertEqual(list(parent.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
