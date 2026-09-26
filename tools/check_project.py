#!/usr/bin/env python3
"""Offline project checks. Empty reserved Skill directories are informational."""

import argparse
import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
SKILLS = Path(".agents/skills")
PACKAGE = SKILLS / "laohu/references/release.json"
IGNORED = {".git", "tmp", ".tmp", "output", ".cache", "works", "knowledge",
           "node_modules", "__pycache__", ".venv"}


def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def release_api(root):
    return load_module(root / SKILLS / "laohu/scripts/check-update.py", "laohu_release")


def project_files(root):
    def walk(directory):
        for path in sorted(directory.iterdir()):
            if path.name in IGNORED:
                continue
            if path.is_symlink():
                yield path
            elif path.is_dir():
                yield from walk(path)
            else:
                yield path
    yield from walk(root)


def markdown_targets(text):
    # Code examples are not declarations of files that must exist.
    prose = re.sub(r"^\s*(`{3,}|~{3,}).*?^\s*\1\s*$", "", text, flags=re.M | re.S)
    prose = re.sub(r"(`+).*?\1", "", prose)
    return re.findall(r"!?\[[^\]\n]*\]\((<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)", prose)


def check_interface(path, name, read_scalar):
    """Check the project's three UI fields; leave other host settings alone."""
    lines = path.read_text(encoding="utf-8").splitlines()
    starts = [i for i, line in enumerate(lines) if re.fullmatch(r"interface:\s*(?:#.*)?", line)]
    if len(starts) != 1:
        raise ValueError("openai.yaml requires one interface mapping")
    fields = {}
    required = {"display_name", "short_description", "default_prompt"}
    for line in lines[starts[0] + 1:]:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if not line[0].isspace():
            break
        match = re.fullmatch(r"  ([a-z_]+):\s*(.*)", line)
        if not match or match[1] not in required:
            continue
        key, raw = match.groups()
        if key in fields:
            raise ValueError(f"duplicate interface field: {key}")
        if not raw.startswith(('"', "'")):
            raise ValueError(f"interface.{key} must be a quoted single-line string")
        fields[key] = read_scalar(raw, [])
    if any(not isinstance(fields.get(key), str) or not fields[key].strip() for key in required):
        raise ValueError("openai.yaml requires display_name, short_description and default_prompt")
    display_name = fields["display_name"]
    prefix = f"{name} | "
    if (not display_name.startswith(prefix) or display_name.count(name) != 1
            or not re.search(r"[\u4e00-\u9fff]", display_name[len(prefix):])):
        raise ValueError(f'interface.display_name must be "{name} | 中文名称" with the exact Skill name once')
    if not 25 <= len(fields["short_description"]) <= 64:
        raise ValueError("interface.short_description must contain 25-64 characters")
    if not re.search(r"\$" + re.escape(name) + r"(?![a-z0-9-])", fields["default_prompt"]):
        raise ValueError("interface.default_prompt must mention $" + name)


def duplicate_eval_cases(data):
    """Return pairs of duplicate case ids keyed by their complete task input."""
    cases = data.get("cases", []) if isinstance(data, dict) else []
    seen, duplicates = {}, []
    for index, case in enumerate(cases):
        if not isinstance(case, dict):
            continue
        identity = json.dumps(
            [case.get("prompt"), case.get("context"), case.get("conversation_context"),
             case.get("input_files", []), case.get("fixture_setup")],
            ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        case_id = case.get("id", f"index {index}")
        if identity in seen:
            duplicates.append((seen[identity], case_id))
        else:
            seen[identity] = case_id
    return duplicates


def evaluation_material_errors(data):
    """Check declared executable fixture inputs, not semantic adequacy or results."""
    errors = []
    for case in data.get("cases", []) if isinstance(data, dict) else []:
        if not isinstance(case, dict) or case.get("execution_mode") != "write":
            continue
        name = case.get("id", "unnamed")
        setup = case.get("fixture_setup", {})
        files = setup.get("files", {}) if isinstance(setup, dict) else {}
        if not isinstance(files, dict) or not files:
            errors.append(f"{name}: write case requires nonempty fixture_setup.files")
            continue
        for path, content in files.items():
            if (not isinstance(path, str) or not path or Path(path).is_absolute()
                    or ".." in Path(path).parts or "\\" in path
                    or not isinstance(content, str)):
                errors.append(f"{name}: invalid fixture path/content: {path}")
        inputs = case.get("input_files")
        if not isinstance(inputs, list) or not inputs:
            errors.append(f"{name}: write case requires input_files")
        else:
            for path in inputs:
                if not isinstance(path, str) or path not in files:
                    errors.append(f"{name}: fixture input not supplied: {path}")
    return errors


def check_project(root):
    root = root.resolve()
    errors, notes = [], []
    active, reserved = [], []
    required = ("AGENTS.md", "docs/runtime.md", "LICENSE", ".gitignore", "VERSION", "UPDATE.json", "CHANGELOG.md",
                "README.md", "README.en.md", "README.ja.md", "README.ko.md", "README.zh-TW.md",
                str(PACKAGE), str(SKILLS / "laohu/SKILL.md"), str(SKILLS / "laohu-update/SKILL.md"))
    for relative in required:
        if not (root / relative).is_file():
            errors.append(f"missing required file: {relative}")
    try:
        discovery = load_module(root / SKILLS / "laohu/scripts/list-skills.py", "laohu_discovery")
        for directory in sorted((root / SKILLS).iterdir()):
            if directory.name.startswith("."):
                continue
            if directory.is_symlink():
                errors.append(f"source Skill must not be a symlink: {directory.name}")
                continue
            if not directory.is_dir():
                continue
            if (directory / ".local-only").is_file():
                continue
            path = directory / "SKILL.md"
            if not path.is_file():
                remaining = [p for p in directory.iterdir() if p.name not in {".gitkeep", ".DS_Store"}]
                if not remaining and discovery.NAME.fullmatch(directory.name):
                    reserved.append(directory.name)
                else:
                    errors.append(f"nonempty or incorrectly named Skill directory without SKILL.md: {directory.name}")
                continue
            try:
                data = discovery.read_metadata(path)
                if data["name"] != directory.name:
                    raise ValueError("directory/name mismatch")
                if '{SKILL_DIR}/../../../docs/runtime.md' not in path.read_text(encoding='utf-8'):
                    raise ValueError('missing shared runtime entry dependency')
                active.append(directory.name)
                check_interface(directory / "agents/openai.yaml", data["name"], discovery.read_scalar)
            except (OSError, ValueError) as error:
                errors.append(f"{path.relative_to(root)}: {error}")
        found = {item["name"] for item in discovery.discover(root / SKILLS)["skills"]}
        if found != set(active) - {"laohu"}:
            errors.append("discovery output differs from valid project entries")
    except (OSError, ValueError, ImportError, SyntaxError) as error:
        errors.append(f"discovery check failed: {error}")
    try:
        api = release_api(root)
        version = (root / "VERSION").read_text(encoding="utf-8").strip()
        api.version_tuple(version)
        manifest = json.loads((root / "UPDATE.json").read_text(encoding="utf-8"))
        api.validate_manifest(manifest)
        package = json.loads((root / PACKAGE).read_text(encoding="utf-8"))
        if manifest != package or manifest["version"] != version:
            errors.append("VERSION, UPDATE.json and bundled release.json are inconsistent")
        headings = re.findall(r"^## (\d+\.\d+\.\d+)\s*$", (root / "CHANGELOG.md").read_text(encoding="utf-8"), re.M)
        if not headings or headings[0] != version or len(headings) != len(set(headings)):
            errors.append("CHANGELOG latest heading must match VERSION; duplicate versions are forbidden")
    except (OSError, ValueError, KeyError, TypeError, ImportError, SyntaxError) as error:
        errors.append(f"release metadata: {error}")
    for path in project_files(root):
        relative = path.relative_to(root)
        if path.is_symlink():
            errors.append(f"source contains symlink: {relative}")
            continue
        if path.name == "SKILL.md" and path.parent.parent != root / SKILLS:
            if not any(part in {"evals", "assets"} for part in relative.parts):
                errors.append(f"nested Skill cannot be discovered: {relative}")
        if path.suffix not in {".md", ".json", ".py"}:
            continue
        try:
            text = path.read_text(encoding="utf-8")
            if path.suffix == ".json":
                parsed = json.loads(text)
                if path.name == "evals.json" and "evals" in relative.parts:
                    for message in evaluation_material_errors(parsed):
                        errors.append(f"evaluation materials in {relative}: {message}")
                    for first, duplicate in duplicate_eval_cases(parsed):
                        errors.append(f"duplicate evaluation input in {relative}: {first} and {duplicate}")
            elif path.suffix == ".py":
                compile(text, str(path), "exec")
            else:
                for raw in markdown_targets(text):
                    raw = raw.strip("<>")
                    target = urlsplit(raw)
                    decoded = unquote(raw)
                    decoded_path = unquote(target.path)
                    windows_absolute = (re.match(r"^[A-Za-z]:[\\/]", decoded)
                                        or decoded.startswith("\\\\"))
                    posix_absolute = (not target.scheme and not target.netloc
                                      and decoded_path.startswith("/"))
                    if target.scheme.lower() == "file" or windows_absolute or posix_absolute:
                        errors.append(f"absolute local file link: {relative} -> {raw}")
                        continue
                    if target.scheme or target.netloc or not target.path:
                        continue
                    if re.search(r"\{[A-Z][A-Z0-9_]*\}", decoded_path):
                        errors.append(f"unexpanded path placeholder in Markdown link: {relative} -> {raw}")
                        continue
                    linked = (path.parent / decoded_path).resolve()
                    if root not in linked.parents and linked != root:
                        errors.append(f"local link leaves project: {relative} -> {raw}")
                    elif not linked.exists():
                        errors.append(f"broken Markdown link: {relative} -> {raw}")
                if path.parent == root and path.name.startswith("README"):
                    commands = re.findall(r"^\|\s*/(laohu(?:-[a-z0-9]+)*)\s*\|", text, re.M)
                    for command in commands:
                        if command not in active and command not in reserved:
                            errors.append(f"README command has no project entry: {relative} -> {command}")
                    if re.search(r"github\.com/LaohuAD/laohu-creative-skill(?:[^s\w-]|$)", text):
                        errors.append(f"outdated repository URL: {relative}")
        except (OSError, ValueError, SyntaxError) as error:
            errors.append(f"{relative}: {error}")
    for readme_name in ("README.md", "README.en.md", "README.ja.md", "README.ko.md", "README.zh-TW.md"):
        readme = root / readme_name
        if not readme.is_file():
            continue
        commands = set(re.findall(r"^\|\s*/(laohu(?:-[a-z0-9]+)*)\s*\|",
                                  readme.read_text(encoding="utf-8"), re.M))
        missing_entries = sorted(set(active) - commands)
        if missing_entries:
            errors.append(f"README capability table omits formal entries: {readme_name} -> "
                          + ", ".join("/" + name for name in missing_entries))
    notes.append(f"{len(active)} defined entries; {len(reserved)} reserved directories (not errors)")
    notes.append("Checks cover metadata, UI fields, formal-entry README tables, declared executable eval materials, duplicate eval inputs, flat discovery, links, syntax and release consistency; not full YAML, semantic routing or creative quality.")
    return {"ok": not errors, "errors": errors, "notes": notes, "active": active, "reserved": reserved}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--test", action="store_true", help="Also run the project's offline regression suites")
    args = parser.parse_args()
    root = args.root.resolve()
    try:
        result = check_project(root)
    except (OSError, ValueError) as error:
        result = {"ok": False, "errors": [str(error)], "notes": []}
    if args.test and result["ok"]:
        suites = [SKILLS / "laohu/evals/test_discovery.py", Path("tests/test_maintenance.py"),
                  Path("tests/test_gzh_tools.py"), Path("tests/test_install.py"), SKILLS / "laohu-archive/evals/test_workspace.py"]
        for suite in suites:
            run = subprocess.run([sys.executable, "-B", str(root / suite)], cwd=root,
                                 capture_output=True, text=True)
            if run.returncode:
                result["errors"].append(f"{suite}:\n{run.stdout}{run.stderr}")
            else:
                result["notes"].append(f"PASS: {suite}")
        result["ok"] = not result["errors"]
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print("PASS" if result["ok"] else "FAIL")
        for message in result["notes"]:
            print("INFO: " + message)
        for error in result["errors"]:
            print("ERROR: " + error)
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
