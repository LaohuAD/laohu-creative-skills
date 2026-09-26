"""Offline installation lifecycle tests, confined to this project's disk."""
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('installer', ROOT / 'tools/install.py')
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


class InstallationTests(unittest.TestCase):
    def setUp(self):
        (ROOT / 'tmp').mkdir(exist_ok=True)
        temp = tempfile.TemporaryDirectory(dir=ROOT / 'tmp', prefix='install-')
        self.addCleanup(temp.cleanup)
        self.base = Path(temp.name)
        self.root = self.base / 'source repo'
        self.root.mkdir()
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        for name in ['AGENTS.md', 'VERSION', 'tools/check_project.py', 'docs/runtime.md',
                     '.agents/skills/laohu/scripts/list-skills.py']:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, target)
        for name in ('laohu', 'laohu-update', 'laohu-story'):
            self.add_skill(name)
        (self.root / '.agents/skills/laohu-reserved').mkdir()
        self.dest = self.base / 'global skills'

    def add_skill(self, name):
        path = self.root / '.agents/skills' / name
        path.mkdir(parents=True, exist_ok=True)
        (path / 'SKILL.md').write_text(f'---\nname: {name}\ndescription: A test skill\n---\n# Skill\n')

    def test_preview_lifecycle_preserves_source_and_other_skills(self):
        api.manage(self.root, 'install', self.dest)
        self.assertFalse(self.dest.exists())
        self.assertFalse((self.root / api.STATE).exists())
        result = api.manage(self.root, 'install', self.dest, True)
        self.assertTrue(result['written'])
        self.assertEqual(len(list(self.dest.iterdir())), 3)
        self.assertEqual((self.dest / 'laohu-story/SKILL.md').read_bytes(),
                         (self.root / '.agents/skills/laohu-story/SKILL.md').read_bytes())
        self.assertFalse(api.manage(self.root, 'install', self.dest, True)['changed'])
        (self.dest / 'another-skill').mkdir()
        api.manage(self.root, 'uninstall', self.dest, True)
        self.assertEqual([x.name for x in self.dest.iterdir()], ['another-skill'])
        self.assertTrue((self.root / '.agents/skills/laohu/SKILL.md').exists())

    def test_collision_is_preflight_and_never_overwritten(self):
        self.dest.mkdir()
        (self.dest / 'laohu-update').write_text('personal')
        with self.assertRaises(ValueError):
            api.manage(self.root, 'install', self.dest, True)
        self.assertEqual([x.name for x in self.dest.iterdir()], ['laohu-update'])
        self.assertEqual((self.dest / 'laohu-update').read_text(), 'personal')

    def test_sync_add_remove_and_repair_missing_link(self):
        api.manage(self.root, 'install', self.dest, True)
        shutil.rmtree(self.root / '.agents/skills/laohu-story')
        self.add_skill('laohu-writing')
        (self.dest / 'laohu').unlink()
        api.manage(self.root, 'sync', write=True)
        self.assertFalse((self.dest / 'laohu-story').is_symlink())
        self.assertTrue((self.dest / 'laohu-writing').is_symlink())
        self.assertTrue((self.dest / 'laohu').is_symlink())
        self.assertFalse(api.manage(self.root, 'status')['changed'])

    def test_replaced_managed_link_blocks_sync_and_uninstall(self):
        api.manage(self.root, 'install', self.dest, True)
        (self.dest / 'laohu-story').unlink()
        (self.dest / 'laohu-story').mkdir()
        for action in ('sync', 'uninstall'):
            with self.subTest(action=action), self.assertRaises(ValueError):
                api.manage(self.root, action, self.dest, True)
        self.assertTrue((self.dest / 'laohu').is_symlink())
        self.assertTrue((self.dest / 'laohu-story').is_dir())

    def test_rollback_on_record_write_failure(self):
        with patch.object(api.os, 'replace', side_effect=OSError('simulated disk failure')):
            with self.assertRaises(OSError):
                api.manage(self.root, 'install', self.dest, True)
        self.assertFalse(self.dest.exists())
        self.assertFalse((self.root / api.STATE).exists())
        self.assertFalse((self.root / '.laohu-install.lock').exists())

    def test_broken_foreign_link_and_source_overlap_rejected(self):
        self.dest.mkdir()
        (self.dest / 'laohu').symlink_to(self.base / 'missing')
        with self.assertRaises(ValueError):
            api.manage(self.root, 'install', self.dest, True)
        with self.assertRaises(ValueError):
            api.manage(self.root, 'install', self.root / '.agents/skills', True)
        self.assertTrue((self.dest / 'laohu').is_symlink())

    def test_invalid_metadata_and_foreign_state_fail_closed(self):
        (self.root / '.agents/skills/laohu-story/SKILL.md').write_text('bad')
        with self.assertRaises(ValueError):
            api.manage(self.root, 'install', self.dest, True)
        self.add_skill('laohu-story')
        (self.root / api.STATE).write_text(json.dumps({'schema': 1, 'source': '/other', 'destinations': {}}))
        with self.assertRaises(ValueError):
            api.manage(self.root, 'install', self.dest, True)
        self.assertFalse(self.dest.exists())

    def test_private_entry_is_not_distributed_or_registered(self):
        self.add_skill('laohu-private-test')
        (self.root / '.agents/skills/laohu-private-test/.local-only').write_text('private')
        result = api.manage(self.root, 'install', self.dest, True)
        self.assertNotIn('laohu-private-test', result['skills'])
        self.assertFalse((self.dest / 'laohu-private-test').exists())
        spec = importlib.util.spec_from_file_location('private_discovery', self.root / '.agents/skills/laohu/scripts/list-skills.py')
        discovery = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(discovery)
        self.assertNotIn('laohu-private-test', [x['name'] for x in discovery.discover(self.root / '.agents/skills')['skills']])

    def test_cli_preview_writes_no_bytecode_or_state(self):
        result = subprocess.run([sys.executable, str(ROOT / 'tools/install.py'), 'install',
                                 '--root', str(self.root), '--skills-dir', str(self.dest)], capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(list(self.root.rglob('__pycache__')), [])
        self.assertFalse(self.dest.exists())
        self.assertFalse((self.root / api.STATE).exists())

    def test_cli_cannot_register_through_sync_or_status(self):
        for action in ('sync', 'status'):
            result = subprocess.run([sys.executable, str(ROOT / 'tools/install.py'), action,
                                     '--root', str(self.root), '--skills-dir', str(self.dest), '--write'],
                                    capture_output=True)
            self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.dest.exists())


if __name__ == '__main__':
    unittest.main()
