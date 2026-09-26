#!/usr/bin/env python3
"""Read a live catalog from one flat Skill collection without modifying it."""

import argparse
import json
import re
import sys
from pathlib import Path


NAME = re.compile(r"laohu(?:-[a-z0-9]+)*")
FIELD = re.compile(r"^(name|description):(?:\s+(.*))?$")


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


def discover(root):
    root = root.expanduser().resolve()
    if not root.is_dir():
        raise ValueError("Skill collection directory does not exist")
    skills, unavailable = [], []
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
                raise ValueError("missing SKILL.md (reserved directory or broken link)")
            fields = read_metadata(path)
            if fields["name"] != directory.name:
                raise ValueError("directory name and frontmatter name differ")
            skills.append({
                "name": fields["name"],
                "description": fields["description"],
                "path": str(path.resolve()),
                "level": len(fields["name"].split("-")),
            })
        except (OSError, ValueError, RuntimeError) as error:
            unavailable.append({"directory": directory.name, "reason": str(error)})
    names = {skill["name"] for skill in skills}
    for skill in skills:
        parts = skill["name"].split("-")
        skill["parent"] = next(
            ("-".join(parts[:i]) for i in range(len(parts) - 1, 1, -1)
             if "-".join(parts[:i]) in names), None
        )
    return {"root": str(root), "skills": skills, "unavailable": unavailable}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2],
                        help="Explicit flat Skill collection; defaults to this Skill's siblings")
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
