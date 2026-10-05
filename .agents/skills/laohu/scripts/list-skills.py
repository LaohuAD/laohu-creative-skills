#!/usr/bin/env python3
"""Read the live catalog of public, root-level Skills without modifying it."""

import argparse
import json
import re
import sys
from pathlib import Path


NAME = re.compile(r"laohu(?:-[a-z0-9]+)*")
COMMAND = re.compile(r"/(laohu(?:-[a-z0-9]+)*)")
FIELD = re.compile(r"^(name|description):(?:\s+(.*))?$")
SCAFFOLD_SUFFIX = "（框架待填充）"
HEADING = re.compile(r"^#{1,6} +\S.*$")


def read_scalar(raw, continuation):
    raw = re.sub(r"\s+#.*$", "", raw).strip() if not raw.startswith(('"', "'")) else raw
    if raw in {"|", "|-", "|+", ">", ">-", ">+"}:
        parts = [line.strip() for line in continuation]
        return ("\n" if raw.startswith("|") else " ").join(parts).strip()
    if any(line.strip() and not line.lstrip().startswith("#") for line in continuation):
        raise ValueError("use | or > for multiline fields")
    if raw.startswith('"'):
        # JSON strings form a portable subset of YAML double-quoted strings.
        value, end = json.JSONDecoder().raw_decode(raw)
        rest = raw[end:].strip()
        if rest and not rest.startswith("#"):
            raise ValueError("unexpected text after quoted field")
        return value
    if raw.startswith("'"):
        match = re.fullmatch(r"'((?:[^']|'')*)'\s*(?:#.*)?", raw)
        if not match:
            raise ValueError("invalid single-quoted field")
        return match[1].replace("''", "'")
    if not raw or raw[0] in "[{&*!%?@`>|" or re.search(r":(?:\s|$)", raw):
        raise ValueError("expected a plain, quoted, | or > text field")
    if raw.lower() in {"null", "~", "true", "false", "yes", "no", "on", "off"} or re.fullmatch(r"[+-]?\d+(?:\.\d+)?", raw):
        raise ValueError("field must be text")
    return raw


def read_metadata(path):
    lines = path.read_text(encoding="utf-8-sig").splitlines()
    if not lines or lines[0] != "---":
        raise ValueError("missing opening frontmatter delimiter")
    try:
        end = lines.index("---", 1)
    except ValueError:
        raise ValueError("missing closing frontmatter delimiter") from None
    if not "\n".join(lines[end + 1:]).strip():
        raise ValueError("missing Skill body")
    fields = {}
    i = 1
    while i < end:
        match = FIELD.fullmatch(lines[i])
        if not match:
            i += 1
            continue
        key, raw = match[1], match[2] or ""
        if key in fields:
            raise ValueError("duplicate frontmatter field: " + key)
        j = i + 1
        while j < end and (not lines[j].strip() or lines[j][0].isspace()):
            j += 1
        fields[key] = read_scalar(raw, lines[i + 1:j])
        i = j
    if not all(isinstance(fields.get(key), str) and fields[key].strip() for key in ("name", "description")):
        raise ValueError("name and description are required text fields")
    if not NAME.fullmatch(fields["name"]) or len(fields["name"]) >= 64:
        raise ValueError("name must be laohu-* and shorter than 64 characters")
    if not 1 <= len(fields["description"]) <= 1024:
        raise ValueError("description must contain 1-1024 characters")
    return fields


def _scaffold_body(lines):
    """Return the body after optional frontmatter, or None if no closing marker."""
    if not lines or lines[0] != "---":
        return lines
    try:
        end = lines.index("---", 1)
    except ValueError:
        return None
    return lines[end + 1:]


def has_scaffold_marker(path):
    """Identify marked drafts even when malformed, so discovery cannot expose them."""
    try:
        lines = Path(path).read_text(encoding="utf-8-sig").splitlines()
    except (OSError, UnicodeError):
        return False
    body = _scaffold_body(lines)
    if body is None:
        return False
    return any(line.startswith("# ")
               and line.endswith(SCAFFOLD_SUFFIX)
               and line[2:-len(SCAFFOLD_SUFFIX)].strip()
               for line in body)


def is_skill_scaffold(path):
    """Recognize a headings-only draft with optional name/description metadata.

    The metadata only identifies the draft; callers keep it out of executable
    Skill discovery. Any marked but malformed draft is rejected separately.
    """
    try:
        lines = Path(path).read_text(encoding="utf-8-sig").splitlines()
    except (OSError, UnicodeError):
        return False
    body = _scaffold_body(lines)
    if body is None:
        return False
    meaningful = [line for line in body if line.strip()]
    if (not meaningful or not meaningful[0].startswith("# ")
            or not meaningful[0].endswith(SCAFFOLD_SUFFIX)
            or not meaningful[0][2:-len(SCAFFOLD_SUFFIX)].strip()):
        return False
    if any(not HEADING.fullmatch(line) for line in meaningful):
        return False
    if any(re.match(r"^#\s", line) for line in meaningful[1:]):
        return False
    if lines and lines[0] == "---":
        try:
            fields = read_metadata(Path(path))
            end = lines.index("---", 1)
        except (OSError, ValueError):
            return False
        keys = []
        for line in lines[1:end]:
            if not line.strip() or line.lstrip().startswith("#") or line[:1].isspace():
                continue
            match = re.match(r"^([A-Za-z][A-Za-z0-9_-]*):", line)
            if not match:
                return False
            keys.append(match[1])
        if sorted(keys) != ["description", "name"]:
            return False
        if fields["name"] != Path(path).parent.name:
            return False
    return True


def read_display_order(path):
    """Read the public display tree without making it an entry registry."""
    document = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(document, dict) or not isinstance(document.get("items"), list):
        raise ValueError("display order requires an items array")
    if len(document["items"]) != 1:
        raise ValueError("display order must contain exactly one /laohu root")
    seen = set()

    def validate(item, parent=None):
        if not isinstance(item, dict):
            raise ValueError("display order entries must be objects")
        command = item.get("command")
        if not isinstance(command, str) or not COMMAND.fullmatch(command):
            raise ValueError("display order command must be a /laohu entry")
        if command in seen:
            raise ValueError("duplicate display order command: " + command)
        seen.add(command)
        name = command[1:]
        parent_name = parent[1:] if parent else None
        if parent_name and not name.startswith(parent_name + "-"):
            raise ValueError(f"display order child {command} is outside parent {parent}")
        if not isinstance(item.get("label"), str) or not item["label"].strip():
            raise ValueError("display order entries require a label")
        children = item.get("children", [])
        if not isinstance(children, list):
            raise ValueError("display order children must be an array")
        for child in children:
            validate(child, command)

    root = document["items"][0]
    validate(root)
    if root.get("command") != "/laohu":
        raise ValueError("display order root must be /laohu")
    return document


def display_order_names(document):
    """Return commands in tree order, including the /laohu root."""
    names = []

    def visit(item):
        names.append(item["command"][1:])
        for child in item.get("children", []):
            visit(child)

    for item in document["items"]:
        visit(item)
    return names


def display_order_parents(document):
    """Return each listed command's intended parent from the display tree."""
    parents = {}

    def visit(item, parent=None):
        name = item["command"][1:]
        parents[name] = parent
        for child in item.get("children", []):
            visit(child, name)

    for item in document["items"]:
        name = item["command"][1:]
        parents[name] = None
        for child in item.get("children", []):
            visit(child)
    return parents


def apply_display_order(skills, document):
    """Order discovered entries by the display tree, then append unknowns.

    This changes presentation only. Discovery still comes from the live Skill
    directories, and entries omitted from the tree remain visible at the end.
    """
    by_name = {skill["name"]: skill for skill in skills}
    children = {}
    for skill in skills:
        children.setdefault(skill["parent"], []).append(skill["name"])

    def configured_children(item):
        return [child["command"][1:] for child in item.get("children", [])]

    result, emitted = [], set()

    def emit(name, order_item=None):
        if name in emitted or name not in by_name:
            return
        emitted.add(name)
        result.append(by_name[name])
        actual_children = children.get(name, [])
        requested = configured_children(order_item) if order_item else []
        ordered_children = [child for child in requested if child in actual_children]
        ordered_children.extend(sorted(child for child in actual_children if child not in ordered_children))
        child_items = {child["command"][1:]: child for child in order_item.get("children", [])} if order_item else {}
        for child in ordered_children:
            emit(child, child_items.get(child))

    root_item = document["items"][0]
    actual_roots = children.get(None, [])
    requested_roots = configured_children(root_item)
    ordered_roots = [name for name in requested_roots if name in actual_roots]
    ordered_roots.extend(sorted(name for name in actual_roots if name not in ordered_roots))
    root_items = {child["command"][1:]: child for child in root_item.get("children", [])}
    for name in ordered_roots:
        emit(name, root_items.get(name))
    return result


def discover(root, order_file=None):
    """Return direct public Skills; naming hierarchy never implies deployment.

    Each result's ``level`` and ``parent`` describe name segments and the
    nearest matching public name prefix. ``deployment`` describes the physical
    location and remains ``public`` for every entry returned here.
    """
    root = root.expanduser().resolve()
    if not root.is_dir():
        raise ValueError("Skill collection directory does not exist")
    if order_file is None:
        if root.parent.name == ".agents":
            candidate = root.parent.parent / "docs" / "skill-display-order.json"
            if candidate.is_file():
                order_file = candidate
    display_order = None
    if order_file is not None:
        display_order = read_display_order(order_file)
    skills, unavailable, reserved, scaffolds = [], [], [], []
    for directory in sorted(root.iterdir()):
        if not directory.name.startswith("laohu-"):
            continue
        if (directory / ".local-only").is_file():
            continue
        path = directory / "SKILL.md"
        try:
            if not directory.is_dir():
                if directory.is_symlink():
                    raise ValueError("broken Skill directory link")
                continue
            if not path.is_file():
                remaining = [item for item in directory.iterdir()
                             if item.name not in {".gitkeep", ".DS_Store"}]
                if not remaining and NAME.fullmatch(directory.name):
                    reserved.append(directory.name)
                    continue
                raise ValueError("missing SKILL.md (nonempty reserved directory or broken link)")
            if is_skill_scaffold(path):
                scaffolds.append({"directory": directory.name, "path": str(path.resolve())})
                continue
            if has_scaffold_marker(path):
                raise ValueError("invalid Skill scaffold")
            fields = read_metadata(path)
            if fields["name"] != directory.name:
                raise ValueError("directory name and frontmatter name differ")
            skills.append({
                "name": fields["name"],
                "description": fields["description"],
                "path": str(path.resolve()),
                "deployment": "public",
            })
        except (OSError, ValueError, RuntimeError) as error:
            unavailable.append({"directory": directory.name, "reason": str(error)})
    names = {skill["name"] for skill in skills}
    for skill in skills:
        parts = skill["name"].split("-")
        skill["level"] = len(parts)
        skill["parent"] = next(
            ("-".join(parts[:i]) for i in range(len(parts) - 1, 1, -1)
            if "-".join(parts[:i]) in names), None
        )
    if display_order is not None:
        skills = apply_display_order(skills, display_order)
    return {"root": str(root), "skills": skills, "unavailable": unavailable,
            "reserved": reserved, "scaffolds": scaffolds}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2],
                        help="Public root-level Skill collection; defaults to this Skill's siblings")
    args = parser.parse_args()
    try:
        result = discover(args.root)
    except (OSError, ValueError, RuntimeError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
