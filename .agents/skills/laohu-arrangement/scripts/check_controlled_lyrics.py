#!/usr/bin/env python3
"""Strictly check an embedded Controlled Lyrics package and locked lyric text.

This tool validates package structure, label syntax/placement, and lyric
round-tripping. It does not judge instruction meaning, platform acceptance, or
actual vocal performance.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path


SECTION_RE = re.compile(r"^\[\s*([^\[\]|｜]+?)(?:\s*([|｜])\s*(.*?))?\s*\]$")
PHRASE_CONTROL_RE = re.compile(r"^\[\((.*?)\)\]$")
HEADING_RE = re.compile(r"^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$")
FENCE_RE = re.compile(r"^\s{0,3}```[^`]*\s*$")


@dataclass
class ParsedLyrics:
    text: str
    sections: list[str]
    control_count: int
    errors: list[str]


def read_text(path: str | Path) -> str:
    # Decode bytes directly so CRLF/LF choices remain visible to exact-layout checks.
    return Path(path).read_bytes().decode("utf-8")


def _without_ending(line: str) -> str:
    return line[:-2] if line.endswith("\r\n") else line[:-1] if line.endswith(("\n", "\r")) else line


def _ending(line: str) -> str:
    return "\r\n" if line.endswith("\r\n") else "\n" if line.endswith("\n") else "\r" if line.endswith("\r") else ""


def _section_label(line: str) -> tuple[str, str | None, str | None] | None:
    stripped = line.strip()
    if PHRASE_CONTROL_RE.fullmatch(stripped):
        return None
    match = SECTION_RE.fullmatch(stripped)
    if not match:
        return None
    name = match.group(1).strip()
    if not name:
        return None
    return name, match.group(2), match.group(3)


def parse_controlled_lyrics(text: str, *, validate_syntax: bool = True) -> ParsedLyrics:
    lines = text.splitlines(keepends=True)
    if not lines and text:
        lines = [text]
    output: list[str] = []
    sections: list[str] = []
    errors: list[str] = []
    controls = 0

    for index, raw_line in enumerate(lines):
        line = _without_ending(raw_line)
        ending = _ending(raw_line)
        stripped = line.strip()

        section = _section_label(line)
        if section is not None:
            name, separator, directives = section
            sections.append(name)
            if validate_syntax and separator is not None:
                controls += 1
                if separator != "｜":
                    errors.append(f"line {index + 1}: section controls must use full-width ｜, not {separator!r}")
                parts = (directives or "").split("｜")
                if not directives or any(not item.strip() for item in parts):
                    errors.append(f"line {index + 1}: section control contains an empty instruction")
                if any("|" in item for item in parts):
                    errors.append(f"line {index + 1}: section controls must separate instructions with full-width ｜")
            elif separator is not None:
                controls += 1
            output.append(f"[{name}]{ending}")
            continue

        phrase = PHRASE_CONTROL_RE.fullmatch(stripped)
        if phrase is not None:
            controls += 1
            instruction = phrase.group(1).strip()
            if validate_syntax:
                if not instruction:
                    errors.append(f"line {index + 1}: phrase control is empty")
                if "|" in instruction:
                    errors.append(f"line {index + 1}: phrase controls must separate instructions with full-width ｜")
                if "｜" in instruction and any(not item.strip() for item in instruction.split("｜")):
                    errors.append(f"line {index + 1}: phrase control contains an empty instruction")
                if index + 1 >= len(lines):
                    errors.append(f"line {index + 1}: phrase control has no target lyric phrase")
                else:
                    next_line = _without_ending(lines[index + 1]).strip()
                    if not next_line:
                        errors.append(f"line {index + 1}: phrase control must sit immediately above its lyric phrase")
                    elif _section_label(next_line) is not None or PHRASE_CONTROL_RE.fullmatch(next_line):
                        errors.append(f"line {index + 1}: phrase control must sit above lyric text, not another label")
            continue

        if validate_syntax and "｜" in line:
            errors.append(f"line {index + 1}: full-width ｜ is only allowed inside a section or phrase-control label")
        elif validate_syntax and stripped.startswith("[") and stripped.endswith("]") and "｜" in stripped:
            errors.append(f"line {index + 1}: malformed or unsupported control label")
        output.append(raw_line)

    return ParsedLyrics("".join(output), sections, controls, errors)


def _heading_matches(lines: list[str], title: str) -> list[int]:
    matches: list[int] = []
    for index, raw_line in enumerate(lines):
        match = HEADING_RE.fullmatch(_without_ending(raw_line))
        if match and match.group(2).strip() == title:
            matches.append(index)
    return matches


def extract_heading_body(
    text: str,
    title: str,
    *,
    locked_terminal_ending: str | None = None,
) -> tuple[str | None, list[str]]:
    """Extract a package field, optionally separating a fence delimiter from payload.

    When a fenced payload is compared with locked lyrics that have no terminal
    line ending, the line ending required to put the closing fence on its own
    line is packaging syntax. This exception is opt-in and applies only to a
    fenced body; other payload endings remain untouched.
    """
    lines = text.splitlines(keepends=True)
    matches = _heading_matches(lines, title)
    if not matches:
        return None, [f"missing package heading: {title}"]
    if len(matches) != 1:
        return None, [f"duplicate package heading: {title}"]
    start = matches[0] + 1
    end = len(lines)
    has_following_heading = False
    for index in range(start, len(lines)):
        if HEADING_RE.fullmatch(_without_ending(lines[index])):
            end = index
            has_following_heading = True
            break
    body = lines[start:end]
    # One blank line directly under a heading is Markdown layout, not lyric text.
    if body and not _without_ending(body[0]).strip():
        body = body[1:]
    # Support one complete fenced block without changing any line inside it.
    if body and FENCE_RE.fullmatch(_without_ending(body[0])):
        # A single blank after the closing fence belongs to Markdown packaging,
        # even when Controlled Lyrics is the final package section. Blanks
        # inside the fence remain untouched as part of the locked lyric layout.
        if body and not _without_ending(body[-1]).strip():
            body = body[:-1]
        if not body or not FENCE_RE.fullmatch(_without_ending(body[-1])):
            return None, [f"unclosed code fence in package field: {title}"]
        body = body[1:-1]
        if locked_terminal_ending == "" and body:
            # A Markdown closing fence must begin on a new line. If the locked
            # payload has no terminal ending, remove only that one delimiter.
            ending = _ending(body[-1])
            if ending:
                body[-1] = body[-1][:-len(ending)]
    elif has_following_heading and body and not _without_ending(body[-1]).strip():
        # Remove exactly the final Markdown separator blank, retaining any earlier blanks.
        body = body[:-1]
    return "".join(body), []


def _parse_style_fields(style: str) -> tuple[dict[str, str], list[str]]:
    expected = ("Global Metadata", "Vocal Details", "Arrangement")
    found: dict[str, str] = {}
    positions: list[int] = []
    errors: list[str] = []
    lines = style.splitlines()
    for field in expected:
        pattern = re.compile(rf"\s*{re.escape(field)}\s*:\s*(.*?)\s*")
        matches = [
            (index, match.group(1).strip())
            for index, line in enumerate(lines)
            if (match := pattern.fullmatch(line)) is not None
        ]
        if not matches:
            errors.append(f"Style Prompt must contain one '{field}:' field")
        elif len(matches) > 1:
            errors.append(f"duplicate Style Prompt field '{field}:'")
        else:
            index, value = matches[0]
            positions.append(index)
            found[field] = value
    if len(positions) == len(expected) and positions != sorted(positions):
        errors.append("Style Prompt fields must be ordered: Global Metadata → Vocal Details → Arrangement")
    return found, errors


def validate_package(text: str, lyrics_heading: str) -> list[str]:
    suffix = " Controlled Lyrics"
    if not lyrics_heading.endswith(suffix):
        return ["--section must end with ' Controlled Lyrics'"]
    scheme = lyrics_heading[:-len(suffix)].strip()
    required = [
        f"{scheme} Style Prompt",
        lyrics_heading,
    ]
    optional = f"{scheme} Platform note"
    lines = text.splitlines(keepends=True)
    positions: list[int] = []
    errors: list[str] = []
    bodies: dict[str, str] = {}
    for title in required:
        matches = _heading_matches(lines, title)
        if not matches:
            errors.append(f"missing package field: {title}")
            continue
        if len(matches) != 1:
            errors.append(f"duplicate package field: {title}")
            continue
        positions.append(matches[0])
        body, body_errors = extract_heading_body(text, title)
        errors.extend(body_errors)
        if body is not None:
            bodies[title] = body
            if not body.strip():
                errors.append(f"empty package field: {title}")
    optional_matches = _heading_matches(lines, optional)
    if len(optional_matches) > 1:
        errors.append(f"duplicate package field: {optional}")
    elif optional_matches:
        positions.append(optional_matches[0])
        body, body_errors = extract_heading_body(text, optional)
        errors.extend(body_errors)
        if body is not None:
            bodies[optional] = body
            if not body.strip():
                errors.append(f"empty package field: {optional}")

    if len(positions) == len(required) + (1 if optional_matches else 0) and positions != sorted(positions):
        errors.append("package fields must be ordered: Style Prompt → Controlled Lyrics → optional Platform note")

    style_title = f"{scheme} Style Prompt"
    if style_title in bodies:
        style = bodies[style_title]
        _, style_errors = _parse_style_fields(style)
        errors.extend(style_errors)
    return errors


def _without_section_rows(text: str) -> str:
    lines = text.splitlines(keepends=True)
    return "".join(raw_line for raw_line in lines if _section_label(_without_ending(raw_line)) is None)


def compare_locked_lyrics(
    locked: str,
    controlled: str,
    *,
    allow_reflow: bool = False,
    structure_open: bool = False,
) -> tuple[bool, ParsedLyrics, ParsedLyrics, list[str]]:
    expected = parse_controlled_lyrics(locked, validate_syntax=False)
    actual = parse_controlled_lyrics(controlled, validate_syntax=True)
    errors = list(actual.errors)
    if structure_open and expected.sections:
        errors.append("--structure-open only applies when locked lyrics contain no section labels")
    elif not structure_open and expected.sections != actual.sections:
        errors.append("section labels or order changed from the locked lyrics")
    expected_text = _without_section_rows(expected.text) if structure_open else expected.text
    actual_text = _without_section_rows(actual.text) if structure_open else actual.text
    if allow_reflow:
        expected_text = "".join(char for char in expected_text if not char.isspace())
        actual_text = "".join(char for char in actual_text if not char.isspace())
    if expected_text != actual_text:
        mode = "non-whitespace lyric characters/punctuation" if allow_reflow else "lyric text, punctuation, or line breaks"
        errors.append(f"{mode} changed from the locked lyrics")
    return not errors, expected, actual, errors


def validate(
    locked: str,
    package: str,
    section: str,
    *,
    allow_reflow: bool = False,
    require_controls: bool = False,
    structure_open: bool = False,
) -> dict[str, object]:
    errors = validate_package(package, section)
    body, body_errors = extract_heading_body(
        package, section, locked_terminal_ending=_ending(locked)
    )
    errors.extend(body_errors)
    _, expected, actual, lyric_errors = compare_locked_lyrics(
        locked, body or "", allow_reflow=allow_reflow, structure_open=structure_open
    )
    errors.extend(lyric_errors)
    if require_controls and actual.control_count == 0:
        errors.append("Controlled Lyrics contains no embedded controls")
    structure_open_applied = structure_open and not expected.sections
    evidence_scope = (
        "package syntax and locked-lyric round-trip only; for fenced Controlled Lyrics, the single line ending required before the closing fence is treated as Markdown packaging only when the locked lyrics have no terminal line ending; "
        "all other terminal endings and non-fenced bodies remain exact; instruction meaning, platform acceptance, and audio effect require separate review"
    )
    if structure_open_applied:
        evidence_scope = (
            "package syntax and locked lyric text round-trip only; new section labels are not checked against the sound blueprint, "
            "so their names, order, and positions must be compared manually with the current sound blueprint; "
            "for fenced Controlled Lyrics, the single line ending required before the closing fence is treated as Markdown packaging only when the locked lyrics have no terminal line ending; "
            "all other terminal endings and non-fenced bodies remain exact; "
            "instruction meaning, platform acceptance, and audio effect require separate review"
        )
    return {
        "valid": not errors,
        "errors": errors,
        "control_count": actual.control_count,
        "sections": actual.sections,
        "comparison": "authorized-reflow" if allow_reflow else "exact-layout",
        "structure_comparison": "manual-blueprint-check-required" if structure_open_applied else "locked-source-exact",
        "evidence_scope": evidence_scope,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check embedded Controlled Lyrics syntax and locked lyric fidelity.")
    parser.add_argument("--lyrics", required=True, help="locked lyric source file")
    parser.add_argument("--package", required=True, help="complete human-vocal package file")
    parser.add_argument("--section", required=True, help="exact heading title for the Controlled Lyrics section")
    parser.add_argument("--allow-performance-reflow", action="store_true", help="explicitly authorized whitespace-only singing-layout comparison")
    parser.add_argument("--structure-open", action="store_true", help="allow new section labels only when locked lyrics have none; compare their structure manually with the current sound blueprint")
    parser.add_argument("--require-controls", action="store_true", help="fail if the package has no embedded section or phrase controls")
    parser.add_argument("--json", action="store_true", help="emit a JSON result")
    args = parser.parse_args(argv)
    try:
        result = validate(
            read_text(args.lyrics), read_text(args.package), args.section,
            allow_reflow=args.allow_performance_reflow,
            require_controls=args.require_controls,
            structure_open=args.structure_open,
        )
    except (OSError, UnicodeDecodeError) as error:
        parser.error(str(error))
    if args.json:
        print(json.dumps(result, ensure_ascii=False))
    elif result["valid"]:
        print(f"PASS: Controlled Lyrics package syntax and locked text ({result['comparison']})")
        print(f"embedded controls: {result['control_count']}")
        if result["structure_comparison"] == "manual-blueprint-check-required":
            print("structure: open; compare new section labels and positions with the current sound blueprint")
    else:
        print("FAIL: Controlled Lyrics package check", file=sys.stderr)
        for error in result["errors"]:
            print(f"- {error}", file=sys.stderr)
    return 0 if result["valid"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
