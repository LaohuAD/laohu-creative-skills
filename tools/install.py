#!/usr/bin/env python3
"""Register the complete repository's Skills without copying or overwriting assets."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
STATE = '.laohu-install.json'
HOSTS = {'codex': '.agents/skills', 'claude': '.claude/skills'}


def source_skills(root):
    root = Path(root).resolve(strict=True)
    actual = subprocess.check_output(['git', '-C', str(root), 'rev-parse', '--show-toplevel'], text=True).strip()
    if Path(actual).resolve() != root:
        raise ValueError('Source must be the complete Git repository root')
    for name in ('AGENTS.md', 'VERSION', 'tools/check_project.py', 'docs/runtime.md'):
        if not (root / name).is_file():
            raise ValueError('Incomplete repository: ' + name)
    spec = importlib.util.spec_from_file_location('install_discovery', root / '.agents/skills/laohu/scripts/list-skills.py')
    api = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(api)
    result = {}
    for directory in sorted((root / '.agents/skills').iterdir()):
        if directory.is_symlink():
            raise ValueError('Source Skill cannot be a symlink: ' + str(directory))
        if not directory.is_dir():
            continue
        if (directory / ".local-only").is_file():
            continue
        skill = directory / 'SKILL.md'
        if not skill.is_file():
            if any(p.name not in {'.gitkeep', '.DS_Store'} for p in directory.iterdir()):
                raise ValueError('Nonempty Skill directory without SKILL.md: ' + str(directory))
            continue
        if api.read_metadata(skill)['name'] != directory.name:
            raise ValueError('Skill name mismatch: ' + str(directory))
        result[directory.name] = str(directory)
    if not {'laohu', 'laohu-update'} <= result.keys():
        raise ValueError('Missing main/update entry')
    return result


def link_target(path):
    if not path.is_symlink():
        return None
    return os.path.abspath(path.parent / os.readlink(path))


def read_state(root):
    path = root / STATE
    if path.is_symlink():
        raise ValueError('Installation record cannot be a symlink')
    if not path.exists():
        return {'schema': 1, 'source': str(root), 'destinations': {}}
    data = json.loads(path.read_text(encoding='utf-8'))
    if data.get('schema') != 1 or data.get('source') != str(root) or not isinstance(data.get('destinations'), dict):
        raise ValueError('Invalid record or moved repository; restore its recorded location before managing links')
    for destination, entries in data['destinations'].items():
        if not Path(destination).is_absolute() or not isinstance(entries, dict):
            raise ValueError('Invalid destination record')
        for name, target in entries.items():
            if '/' in name or '\\' in name or name in {'.', '..'} or not name.startswith('laohu'):
                raise ValueError('Invalid managed entry name')
            if target != str(root / '.agents/skills' / name):
                raise ValueError('Recorded target is outside this installation')
    return data


def manage(root, action, destination=None, write=False):
    root = Path(root).resolve(strict=True)
    skills = source_skills(root)
    state = read_state(root)
    before = json.loads(json.dumps(state))
    if action in {'install', 'uninstall'} and destination is None:
        raise ValueError('Choose --host or --skills-dir')
    if destination is not None:
        destination = Path(destination).expanduser().resolve()
        source = root / '.agents/skills'
        if destination == source or source in destination.parents or destination in source.parents:
            raise ValueError('Destination cannot overlap the source Skill collection')
        destinations = [str(destination)]
    else:
        destinations = list(state['destinations'])
    operations = []
    for dest in destinations:
        directory = Path(dest)
        if directory.exists() and not directory.is_dir():
            raise ValueError('Destination is not a directory: ' + dest)
        old = state['destinations'].get(dest, {})
        if action == 'uninstall' and dest not in state['destinations']:
            raise ValueError('This installation does not manage that destination')
        wanted = {} if action == 'uninstall' else skills
        for name in sorted(set(old) | set(wanted)):
            path = directory / name
            expected = old.get(name)
            actual = link_target(path)
            occupied = os.path.lexists(path)
            if occupied and (actual is None or actual != (expected or wanted.get(name))):
                raise ValueError('Existing entry is not ours; left untouched: ' + str(path))
            if name in wanted:
                if not occupied:
                    operations.append(('link', str(path), wanted[name]))
            elif occupied:
                operations.append(('unlink', str(path), expected))
        if action == 'uninstall':
            state['destinations'].pop(dest, None)
        else:
            state['destinations'][dest] = dict(wanted)
    changed = state != before or bool(operations)
    result = {'source': str(root), 'action': action, 'destinations': destinations,
              'skills': sorted(skills), 'operations': operations, 'changed': changed, 'written': False}
    if not write or action == 'status' or not changed:
        return result
    lock = root / '.laohu-install.lock'
    fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)
    completed, created_dirs = [], []
    temp_name = None
    try:
        if read_state(root) != before:
            raise ValueError('Installation state changed; preview again')
        # Recheck all destinations under the lock before the first write.
        refreshed = manage(root, action, destination, write=False)
        if refreshed['operations'] != operations:
            raise ValueError('Entries changed; preview again')
        for op, raw, target in operations:
            path = Path(raw)
            if op == 'link':
                missing = []
                parent = path.parent
                while not parent.exists():
                    missing.append(parent)
                    parent = parent.parent
                for parent in reversed(missing):
                    parent.mkdir()
                    created_dirs.append(parent)
                path.symlink_to(target, target_is_directory=True)
            else:
                if link_target(path) != target:
                    raise ValueError('Entry changed before removal: ' + raw)
                path.unlink()
            completed.append((op, raw, target))
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=root,
                                         prefix='.laohu-install-', suffix='.tmp', delete=False) as out:
            temp_name = out.name
            json.dump(state, out, ensure_ascii=False, indent=2)
            out.write('\n')
        os.replace(temp_name, root / STATE)
        temp_name = None
        result['written'] = True
        return result
    except Exception:
        # Undo only links changed by this run, and never overwrite a newer entry.
        for op, raw, target in reversed(completed):
            path = Path(raw)
            if op == 'link' and link_target(path) == target:
                path.unlink()
            elif op == 'unlink' and not os.path.lexists(path):
                path.symlink_to(target, target_is_directory=True)
        for directory in reversed(created_dirs):
            try:
                directory.rmdir()
            except OSError:
                pass
        raise
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)
        lock.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['install', 'status', 'sync', 'uninstall'])
    parser.add_argument('--root', type=Path, default=ROOT, help='Complete source repository')
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--host', choices=HOSTS)
    group.add_argument('--skills-dir', type=Path, help='Explicit verified host directory (also for isolated tests)')
    parser.add_argument('--write', action='store_true', help='Apply; default is a read-only preview')
    args = parser.parse_args()
    destination = Path.home() / HOSTS[args.host] if args.host else args.skills_dir
    if args.action in {'sync', 'status'} and destination is not None:
        # Never register a new destination through a routine status/sync command.
        try:
            registered = read_state(args.root.resolve())['destinations']
            if str(destination.expanduser().resolve()) not in registered:
                raise ValueError('Destination not registered; use install')
        except (OSError, ValueError) as error:
            print(json.dumps({'error': str(error)}, ensure_ascii=False), file=sys.stderr)
            return 1
    try:
        result = manage(args.root, args.action, destination, args.write)
    except (OSError, ValueError, subprocess.SubprocessError, ImportError) as error:
        print(json.dumps({'error': str(error)}, ensure_ascii=False), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
