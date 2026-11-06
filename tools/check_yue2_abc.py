#!/usr/bin/env python3
"""Offline checker for a bounded native YuE2 two-voice ABC profile.

This is not a general ABC parser, a YuE cloud/API schema validator, or an
audio/transcription check. It reads only the ABC text supplied by the caller
and uses the Python standard library.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from dataclasses import dataclass, field
from fractions import Fraction
from pathlib import Path
from typing import Iterable


VOICES = ("Vocal", "Ins")
SUPPORTED_LENGTHS = frozenset({1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48})
CHORD_QUALITIES = (
    "m(maj7)", "7sus4", "m7b5", "maj7", "dim7", "sus4", "sus2",
    "aug", "dim", "m7", "m6", "m", "7", "6", "",
)
CHORD_ROOT = r"[A-G](?:bb|##|b|#)?"
CHORD_RE = re.compile(
    CHORD_ROOT
    + r"(?:(?:"
    + "|".join(re.escape(value) for value in CHORD_QUALITIES)
    + r"))?(?:/"
    + CHORD_ROOT
    + r")?"
)
TOKEN_RE = re.compile(
    r'(?P<chord>"[^"\r\n]*")|'
    r"(?P<key>\[K:[^\]\r\n]+\])|"
    r"(?P<event>(?P<acc>\^\^|__|\^|_|=)?"
    r"(?P<symbol>[A-Ga-gzZ])(?P<oct>[,']*)(?P<duration>[0-9]*)(?P<tie>-?))"
)
NATURAL_SEMITONES = dict(zip("CDEFGAB", (0, 2, 4, 5, 7, 9, 11)))
KEY_SIGNATURES = {
    **dict(zip(
        ("Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"),
        range(-7, 8),
    )),
    **dict(zip(
        ("Abm", "Ebm", "Bbm", "Fm", "Cm", "Gm", "Dm", "Am", "Em", "Bm", "F#m", "C#m", "G#m", "D#m", "A#m"),
        range(-7, 8),
    )),
}
ACCIDENTAL_VALUE = {"=": 0, "_": -1, "__": -2, "^": 1, "^^": 2}
ACCIDENTAL_ORDER = "FCGDAEB"
FLAT_ORDER = "BEADGCF"
TOOL_SCOPE = (
    "Offline structural and symbolic checks for the bounded native two-voice "
    "YuE2/SheetSage-style ABC profile; not full ABC validation, cloud/API "
    "schema validation, audio verification, or perceptual harmony review."
)


class AbcError(ValueError):
    """The input is outside the supported profile or violates an invariant."""


def _fail(condition: bool, message: str) -> None:
    if condition:
        raise AbcError(message)


@dataclass(frozen=True)
class NoteEvent:
    onset: Fraction
    midi: int
    duration: Fraction


@dataclass(frozen=True)
class RestEvent:
    onset: Fraction
    duration: Fraction


@dataclass(frozen=True)
class ChordEvent:
    onset: Fraction
    symbol: str


@dataclass(frozen=True)
class Bar:
    start: Fraction
    duration: Fraction
    meter: tuple[int, int]


@dataclass(frozen=True)
class KeyDirective:
    onset: Fraction
    key: str
    placement: str
    group: int


@dataclass(frozen=True)
class PendingTie:
    midi: int
    written_midi: int


@dataclass
class Voice:
    name: str
    meter: tuple[int, int]
    key: str
    time: Fraction = Fraction(0)
    notes: list[NoteEvent] = field(default_factory=list)
    rests: list[RestEvent] = field(default_factory=list)
    bars: list[Bar] = field(default_factory=list)
    chords: list[ChordEvent] = field(default_factory=list)
    key_directives: list[KeyDirective] = field(default_factory=list)
    pending_tie: PendingTie | None = None


@dataclass(frozen=True)
class Group:
    number: int
    start: Fraction
    end: Fraction
    bars: int
    sections: tuple[str, ...]


@dataclass
class Score:
    text: str
    unit: Fraction
    bpm: int
    initial_meter: tuple[int, int]
    initial_key: str
    voices: dict[str, Voice]
    music_lines: dict[int, str]
    groups: list[Group]


def _key_signature(key: str) -> dict[str, int]:
    _fail(key not in KEY_SIGNATURES, f"Unsupported key {key!r}; expected a standard major/minor key")
    count = KEY_SIGNATURES[key]
    result = {letter: 0 for letter in NATURAL_SEMITONES}
    order = ACCIDENTAL_ORDER if count > 0 else FLAT_ORDER
    for letter in order[:abs(count)]:
        result[letter] = 1 if count > 0 else -1
    return result


def _meter(text: str) -> tuple[int, int]:
    match = re.fullmatch(r"([1-9][0-9]*)/([1-9][0-9]*)", text)
    _fail(match is None, f"Unsupported meter {text!r}; use an explicit fraction")
    numerator, denominator = map(int, match.groups())
    _fail(denominator > 1024 or denominator & (denominator - 1) != 0,
          f"Unsupported meter denominator {denominator}")
    return numerator, denominator


def _bar_duration(meter: tuple[int, int]) -> Fraction:
    numerator, denominator = meter
    return Fraction(4 * numerator, denominator)


def _valid_chord(symbol: str) -> bool:
    return CHORD_RE.fullmatch(symbol) is not None


def _parse_bar(body: str, voice: Voice, unit: Fraction, context: str, group: int) -> None:
    bar_length = _bar_duration(voice.meter)
    start = voice.time
    offset = Fraction(0)
    accidental_by_letter: dict[str, int] = {}

    if body == "Z":
        _fail(voice.pending_tie is not None, f"{context}: a tie cannot enter a full-measure rest")
        voice.rests.append(RestEvent(start, bar_length))
        offset = bar_length
    else:
        cursor = 0
        while cursor < len(body):
            if body[cursor].isspace():
                cursor += 1
                continue
            match = TOKEN_RE.match(body, cursor)
            _fail(match is None, f"{context}: unsupported token at {body[cursor:cursor + 24]!r}")
            cursor = match.end()
            _fail(offset >= bar_length, f"{context}: event occurs at or after the measure end")

            chord_token = match.group("chord")
            if chord_token is not None:
                symbol = chord_token[1:-1]
                _fail(not _valid_chord(symbol), f"{context}: unsupported chord symbol {symbol!r}")
                _fail(voice.name != "Vocal", f"{context}: native chord symbols are allowed only in Vocal")
                voice.chords.append(ChordEvent(start + offset, symbol))
                continue

            key_token = match.group("key")
            if key_token is not None:
                key = key_token[3:-1]
                _key_signature(key)
                voice.key = key
                voice.key_directives.append(KeyDirective(start + offset, key, "inline", group))
                accidental_by_letter.clear()
                continue

            accidental = match.group("acc")
            symbol = match.group("symbol")
            octave_marks = match.group("oct")
            units_text = match.group("duration")
            tie = match.group("tie") == "-"
            units = int(units_text or "1")
            _fail(units_text.startswith("0") if units_text else False,
                  f"{context}: duration multipliers cannot start with zero")
            _fail(units not in SUPPORTED_LENGTHS,
                  f"{context}: unsupported duration multiplier {units}; split it into supported lengths")
            _fail("," in octave_marks and "'" in octave_marks, f"{context}: mixed octave marks")
            duration = unit * 4 * units
            _fail(offset + duration > bar_length, f"{context}: note/rest exceeds meter duration")

            if symbol == "Z":
                raise AbcError(f"{context}: Z rest must occupy a whole bar (or use Z2–Z4 between bars)")
            if symbol == "z":
                _fail(bool(accidental or octave_marks or tie),
                      f"{context}: a rest cannot have accidentals, octave marks, or a tie")
                _fail(voice.pending_tie is not None, f"{context}: a tie cannot enter a rest")
                voice.rests.append(RestEvent(start + offset, duration))
            else:
                letter = symbol.upper()
                written_midi = (
                    60
                    + NATURAL_SEMITONES[letter]
                    + (12 if symbol.islower() else 0)
                    + 12 * (octave_marks.count("'") - octave_marks.count(","))
                )
                base_alteration = accidental_by_letter.get(letter, _key_signature(voice.key)[letter])
                if accidental:
                    base_alteration = ACCIDENTAL_VALUE[accidental]
                    # The native exporter propagates an accidental by letter across octaves.
                    accidental_by_letter[letter] = base_alteration
                pitch = written_midi + base_alteration

                if voice.pending_tie is not None:
                    pending = voice.pending_tie
                    # A tied continuation keeps the old sound if the same written pitch is
                    # unmarked, even when a barline or key change reset the accidental state.
                    if not accidental and written_midi == pending.written_midi:
                        pitch = pending.midi
                    _fail(pitch != pending.midi,
                          f"{context}: tie changes sounding pitch from {pending.midi} to {pitch}")
                    _fail(not voice.notes, f"{context}: tie has no preceding note")
                    previous = voice.notes[-1]
                    voice.notes[-1] = NoteEvent(previous.onset, previous.midi, previous.duration + duration)
                else:
                    _fail(not 0 <= pitch <= 127, f"{context}: MIDI pitch {pitch} is outside 0–127")
                    voice.notes.append(NoteEvent(start + offset, pitch, duration))
                voice.pending_tie = PendingTie(pitch, written_midi) if tie else None

            offset += duration

    _fail(offset != bar_length,
          f"{context}: bar duration is {offset} quarter notes; expected {bar_length}")
    voice.bars.append(Bar(start, bar_length, voice.meter))
    voice.time += bar_length


def parse_abc(text: str) -> Score:
    """Parse a bounded native dialect and fail closed on unsupported syntax."""
    raw_lines = text.splitlines()
    lines: list[str] = []
    physical_line_indices: list[int] = []
    for physical_index, raw_line in enumerate(raw_lines):
        normalized = raw_line.strip()
        if normalized:
            lines.append(normalized)
            physical_line_indices.append(physical_index)
    _fail(len(lines) < 8, "Incomplete native ABC header")
    _fail(lines[:2] != ["X:1", "T:"], "Expected native X:1 and blank T: header")
    _fail(not lines[2].startswith("M:"), "Missing header M:")
    initial_meter = _meter(lines[2][2:])
    unit_match = re.fullmatch(r"L:1/([1-9][0-9]*)", lines[3])
    _fail(unit_match is None, "Expected L:1/<power-of-two denominator>")
    denominator = int(unit_match.group(1))
    _fail(denominator > 1024 or denominator & (denominator - 1) != 0,
          "Unsupported L: denominator; expected a power of two through 1024")
    unit = Fraction(1, denominator)
    tempo_match = re.fullmatch(r"Q:1/4=([1-9][0-9]*)", lines[4])
    _fail(tempo_match is None, "Expected positive integer quarter-note tempo Q:1/4=<BPM>")
    bpm = int(tempo_match.group(1))
    expected_voices = (
        'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
        'V: Ins clef=treble name="Ins Melody" snm="Inst."',
    )
    _fail(tuple(lines[5:7]) != expected_voices, "Expected the native Vocal and Ins voice definitions")
    _fail(not lines[7].startswith("K:"), "Missing header K:")
    initial_key = lines[7][2:]
    _key_signature(initial_key)

    voices = {
        name: Voice(name=name, meter=initial_meter, key=initial_key)
        for name in VOICES
    }
    music_lines: dict[int, str] = {}
    groups: list[Group] = []
    cursor = 8

    while cursor < len(lines):
        sections: list[str] = []
        while cursor < len(lines) and lines[cursor].startswith("% "):
            label = lines[cursor][2:].strip()
            _fail(not label, "Section comments must include a label after '% '")
            sections.append(label)
            cursor += 1
        _fail(cursor == len(lines), "Dangling section comment without a following voice group")

        group_number = len(groups) + 1
        group_start = voices["Vocal"].time
        group_fields: dict[str, dict[str, str]] = {}
        inline_changes: dict[str, list[tuple[Fraction, str]]] = {}
        group_counts: dict[str, int] = {}

        for name in VOICES:
            context = f"group {group_number}, {name}"
            _fail(cursor >= len(lines) or lines[cursor] != f"V: {name}",
                  f"{context}: expected V: {name} in Vocal/Ins order")
            cursor += 1
            voice = voices[name]
            fields: dict[str, str] = {}
            while cursor < len(lines) and lines[cursor].startswith(("M:", "K:")):
                field_name, value = lines[cursor].split(":", 1)
                _fail(field_name in fields, f"{context}: duplicate {field_name}: field")
                fields[field_name] = value
                cursor += 1
            for field_name, value in fields.items():
                if field_name == "M":
                    voice.meter = _meter(value)
                elif field_name == "K":
                    _key_signature(value)
                    voice.key = value
                    voice.key_directives.append(KeyDirective(voice.time, value, "group", group_number))
            group_fields[name] = fields

            _fail(cursor >= len(lines), f"{context}: missing music line")
            music_line = lines[cursor]
            _fail(not music_line.endswith("|"),
                  f"{context}: music line must end in a plain barline")
            _fail(music_line.endswith("||") or music_line.endswith("|]") or music_line.endswith("|:"),
                  f"{context}: double/repeat endings are outside the native profile")
            music_lines[physical_line_indices[cursor]] = name
            cursor += 1

            bar_bodies: list[str] = []
            for raw_bar in music_line[:-1].split("|"):
                body = raw_bar.strip()
                _fail(not body, f"{context}: empty measure or unsupported double/repeat barline")
                compressed_rest = re.fullmatch(r"Z([2-4])?", body)
                if compressed_rest:
                    bar_bodies.extend(["Z"] * int(compressed_rest.group(1) or "1"))
                else:
                    bar_bodies.append(body)
            _fail(not 1 <= len(bar_bodies) <= 4,
                  f"{context}: each group must contain 1–4 measures after expanding Z rests")
            group_counts[name] = len(bar_bodies)
            inline_changes[name] = []
            before_directives = len(voice.key_directives)
            for bar_body in bar_bodies:
                _parse_bar(bar_body, voice, unit, f"{context}, bar {len(voice.bars) + 1}", group_number)
            inline_changes[name] = [
                (item.onset, item.key)
                for item in voice.key_directives[before_directives:]
                if item.placement == "inline"
            ]

        _fail(group_counts["Vocal"] != group_counts["Ins"],
              f"group {group_number}: Vocal and Ins have different measure counts")
        _fail(group_fields["Vocal"] != group_fields["Ins"],
              f"group {group_number}: M:/K: fields must match in both voice blocks")
        _fail(inline_changes["Vocal"] != inline_changes["Ins"],
              f"group {group_number}: inline [K:] changes must match in both voices at the same time")
        _fail(voices["Vocal"].time != voices["Ins"].time,
              f"group {group_number}: voice time grids differ")
        groups.append(Group(
            group_number,
            group_start,
            voices["Vocal"].time,
            group_counts["Vocal"],
            tuple(sections),
        ))

    _fail(not groups, "ABC score has a header but no Vocal/Ins music group")
    for voice in voices.values():
        _fail(voice.pending_tie is not None, f"{voice.name}: unresolved tie at end of score")
    _fail(voices["Vocal"].bars != voices["Ins"].bars,
          "Vocal and Ins bar meter/time grids differ")
    _fail(
        [(item.onset, item.key, item.placement) for item in voices["Vocal"].key_directives]
        != [(item.onset, item.key, item.placement) for item in voices["Ins"].key_directives],
        "Vocal and Ins key-change timelines differ",
    )

    return Score(
        text=text,
        unit=unit,
        bpm=bpm,
        initial_meter=initial_meter,
        initial_key=initial_key,
        voices=voices,
        music_lines=music_lines,
        groups=groups,
    )


def _merge_rests(rests: Iterable[RestEvent]) -> list[RestEvent]:
    merged: list[RestEvent] = []
    for event in sorted(rests, key=lambda item: (item.onset, item.duration)):
        if merged and merged[-1].onset + merged[-1].duration == event.onset:
            previous = merged[-1]
            merged[-1] = RestEvent(previous.onset, previous.duration + event.duration)
        else:
            merged.append(event)
    return merged


def _effective_key_timeline(score: Score, voice: Voice) -> list[tuple[Fraction, str]]:
    timeline = [(Fraction(0), score.initial_key)]
    current = score.initial_key
    for directive in voice.key_directives:
        if directive.key != current:
            timeline.append((directive.onset, directive.key))
            current = directive.key
    return timeline


def _event_json(event: NoteEvent | RestEvent | ChordEvent) -> dict:
    if isinstance(event, NoteEvent):
        return {
            "onset_quarters": str(event.onset),
            "midi_pitch": event.midi,
            "duration_quarters": str(event.duration),
        }
    if isinstance(event, RestEvent):
        return {"onset_quarters": str(event.onset), "duration_quarters": str(event.duration)}
    return {"onset_quarters": str(event.onset), "symbol": event.symbol}


def _score_report(score: Score, mode: str, max_duration: Fraction | None) -> dict:
    total_quarters = score.voices["Vocal"].time
    nominal_seconds = total_quarters * 60 / score.bpm
    voices: dict[str, dict] = {}
    for name, voice in score.voices.items():
        voices[name] = {
            "attack_count": len(voice.notes),
            "notes": [_event_json(event) for event in voice.notes],
            "rests": [_event_json(event) for event in _merge_rests(voice.rests)],
            "bars": [
                {
                    "start_quarters": str(bar.start),
                    "duration_quarters": str(bar.duration),
                    "meter": f"{bar.meter[0]}/{bar.meter[1]}",
                }
                for bar in voice.bars
            ],
            "chords": [_event_json(event) for event in voice.chords],
            "key_directives": [
                {
                    "onset_quarters": str(item.onset),
                    "key": item.key,
                    "placement": item.placement,
                }
                for item in voice.key_directives
            ],
        }
    chord_count = sum(len(voice.chords) for voice in score.voices.values())
    violations: list[str] = []
    if mode == "melody" and chord_count:
        violations.append("melody mode requires no musical chord symbols")
    if max_duration is not None and nominal_seconds > max_duration:
        violations.append(
            f"nominal duration {nominal_seconds} seconds exceeds supplied limit {max_duration} seconds"
        )
    duration_check = (
        "NOT_CHECKED" if max_duration is None
        else ("FAIL" if nominal_seconds > max_duration else "PASS")
    )
    return {
        "scope": TOOL_SCOPE,
        "valid": not violations,
        "violations": violations,
        "profile_mode": mode,
        "chord_presence": {
            "count": chord_count,
            "requirement": "forbidden" if mode == "melody" else "optional",
        },
        "sha256": hashlib.sha256(score.text.encode("utf-8")).hexdigest(),
        "bpm_quarter_note": score.bpm,
        "unit_length": str(score.unit),
        "initial_meter": f"{score.initial_meter[0]}/{score.initial_meter[1]}",
        "initial_key": score.initial_key,
        "bar_count": len(score.voices["Vocal"].bars),
        "duration_quarters": str(total_quarters),
        "nominal_duration_seconds": float(nominal_seconds),
        "maximum_duration_seconds": float(max_duration) if max_duration is not None else None,
        "duration_limit_check": duration_check,
        "duration_limit_source": "caller-supplied only; cloud cap is not inferred",
        "lyrics_lock": None,
        "lyrics_note_alignment": "not checked",
        "groups": [
            {
                "group": group.number,
                "start_quarters": str(group.start),
                "end_quarters": str(group.end),
                "bars": group.bars,
                "sections": list(group.sections),
            }
            for group in score.groups
        ],
        "sections": [
            {"onset_quarters": str(group.start), "label": label}
            for group in score.groups
            for label in group.sections
        ],
        "voices": voices,
    }


def _normalize_newlines(text: str) -> str:
    return text.replace("\r\n", "\n").replace("\r", "\n")


def compare_lyrics(lyrics: str, package_lyrics: str) -> dict:
    """Compare locked lyric text without attempting note/syllable alignment."""
    left = _normalize_newlines(lyrics)
    right = _normalize_newlines(package_lyrics)
    first_difference = next(
        (index for index, (a, b) in enumerate(zip(left, right)) if a != b),
        None,
    )
    if first_difference is None and len(left) != len(right):
        first_difference = min(len(left), len(right))
    return {
        "match": first_difference is None,
        "comparison": "Unicode characters, punctuation, whitespace, and line order; newline style normalized",
        "source_characters": len(left),
        "package_characters": len(right),
        "first_difference_index": first_difference,
        "source_sha256": hashlib.sha256(left.encode("utf-8")).hexdigest(),
        "package_sha256": hashlib.sha256(right.encode("utf-8")).hexdigest(),
        "note_alignment_checked": False,
    }


def compare_scores(
    before: Score,
    after: Score,
    voices: Iterable[str] = VOICES,
    allow_tempo_change: bool = False,
) -> dict:
    selected = tuple(voices)
    differences: list[str] = []
    if before.bpm != after.bpm and not allow_tempo_change:
        differences.append("quarter-note tempo differs")
    before_sections = [
        (group.start, label)
        for group in before.groups
        for label in group.sections
    ]
    after_sections = [
        (group.start, label)
        for group in after.groups
        for label in group.sections
    ]
    if before_sections != after_sections:
        differences.append("section boundary or label sequence differs")
    for name in selected:
        left = before.voices[name]
        right = after.voices[name]
        if left.notes != right.notes:
            common = min(len(left.notes), len(right.notes))
            first = next((i for i in range(common) if left.notes[i] != right.notes[i]), common)
            differences.append(
                f"{name}: sounding pitch, attack onset, or note duration differs at attack {first + 1}"
            )
        if _merge_rests(left.rests) != _merge_rests(right.rests):
            differences.append(f"{name}: rest onset/duration grid differs")
        if left.bars != right.bars:
            differences.append(f"{name}: measure timing or meter differs")
        if _effective_key_timeline(before, left) != _effective_key_timeline(after, right):
            differences.append(f"{name}: key-signature timeline differs")
    return {
        "scope": (
            "Exact symbolic pitches, attacks, durations, rests, bars, meter, and key timeline "
            "for selected voices; chord symbols and audio/perceptual harmony are not compared."
        ),
        "match": not differences,
        "compared_voices": list(selected),
        "tempo_change_allowed": allow_tempo_change,
        "before_bpm": before.bpm,
        "after_bpm": after.bpm,
        "differences": differences,
    }


def strip_music_chords(text: str) -> str:
    """Remove only quoted musical chord tokens from a parsed native score."""
    score = parse_abc(text)
    lines = text.splitlines(keepends=True)
    for line_index in score.music_lines:
        line = lines[line_index]
        removals: list[tuple[int, int]] = []
        cursor = 0
        while cursor < len(line):
            if line[cursor].isspace() or line[cursor] == "|":
                cursor += 1
                continue
            match = TOKEN_RE.match(line, cursor)
            _fail(match is None, f"music line {line_index + 1}: unsupported token during chord removal")
            cursor = match.end()
            if match.group("chord") is not None:
                removals.append((match.start(), match.end()))
        if removals:
            rebuilt: list[str] = []
            last = 0
            for start, end in removals:
                rebuilt.append(line[last:start])
                last = end
            rebuilt.append(line[last:])
            lines[line_index] = "".join(rebuilt)
    output = "".join(lines)
    stripped = parse_abc(output)
    invariant = compare_scores(score, stripped)
    _fail(not invariant["match"], f"Chord removal changed melody/time invariants: {invariant['differences']}")
    _fail(any(voice.chords for voice in stripped.voices.values()),
          "Chord removal left a musical chord symbol")
    return output


def _same_path(first: Path, second: Path) -> bool:
    if first.resolve(strict=False) == second.resolve(strict=False):
        return True
    try:
        return first.exists() and second.exists() and os.path.samefile(first, second)
    except OSError:
        return False


def _assert_new_output(output: Path, inputs: Iterable[Path]) -> None:
    for source in inputs:
        if _same_path(output, source):
            raise AbcError(f"Refusing to overwrite or alias input file {source}")
    if output.exists() or output.is_symlink():
        raise AbcError(f"Output already exists; choose a new path: {output}")
    if not output.parent.is_dir():
        raise AbcError(f"Output parent directory does not exist: {output.parent}")


def _write_new(path: Path, content: str) -> None:
    try:
        with path.open("x", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
    except FileExistsError as error:
        raise AbcError(f"Output already exists; choose a new path: {path}") from error


def _read_utf8(path: Path) -> str:
    with path.open("r", encoding="utf-8", newline="") as handle:
        return handle.read()


def _positive_seconds(value: str) -> Fraction:
    if not re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", value):
        raise argparse.ArgumentTypeError("seconds must be a non-negative decimal number")
    parsed = Fraction(value)
    if parsed < 0:
        raise argparse.ArgumentTypeError("seconds must be non-negative")
    return parsed


def _render_json(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def _emit_json(data: dict, output: Path | None, inputs: Iterable[Path]) -> None:
    rendered = _render_json(data)
    if output is None:
        print(rendered, end="")
    else:
        _assert_new_output(output, inputs)
        _write_new(output, rendered)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=TOOL_SCOPE,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    commands = parser.add_subparsers(dest="command", required=True)

    inspect = commands.add_parser("inspect", help="parse native ABC and report exact symbolic events")
    inspect.add_argument("score", type=Path)
    inspect.add_argument("--mode", choices=("full", "melody"), default="full",
                         help="full allows zero or more supported Vocal chords; melody forbids chord symbols")
    inspect.add_argument("--max-duration", type=_positive_seconds,
                         help="caller-known maximum generation duration in seconds")
    inspect.add_argument("--lyrics", type=Path, help="locked source lyric text")
    inspect.add_argument("--package-lyrics", type=Path, help="final lyric text to compare with --lyrics")
    inspect.add_argument("--output", type=Path, help="write a new JSON file; existing paths are refused")

    compare = commands.add_parser("compare", help="check symbolic invariants after a score edit")
    compare.add_argument("before", type=Path)
    compare.add_argument("after", type=Path)
    compare.add_argument("--voices", choices=("both", *VOICES), default="both")
    compare.add_argument("--allow-tempo-change", action="store_true")
    compare.add_argument("--output", type=Path, help="write a new JSON file; existing paths are refused")

    strip = commands.add_parser("strip-chords", help="remove only musical chord symbols from Vocal")
    strip.add_argument("source", type=Path)
    strip.add_argument("destination", type=Path)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "inspect":
            if (args.lyrics is None) != (args.package_lyrics is None):
                raise AbcError("--lyrics and --package-lyrics must be supplied together")
            text = _read_utf8(args.score)
            score = parse_abc(text)
            data = _score_report(score, args.mode, args.max_duration)
            inputs = [args.score]
            if args.lyrics is not None and args.package_lyrics is not None:
                locked = compare_lyrics(_read_utf8(args.lyrics), _read_utf8(args.package_lyrics))
                data["lyrics_lock"] = locked
                if not locked["match"]:
                    data["valid"] = False
                    data["violations"].append(
                        f"locked lyric text differs at character index {locked['first_difference_index']}"
                    )
                inputs.extend([args.lyrics, args.package_lyrics])
            _emit_json(data, args.output, inputs)
            return 0 if data["valid"] else 1

        if args.command == "compare":
            before_text = _read_utf8(args.before)
            after_text = _read_utf8(args.after)
            before = parse_abc(before_text)
            after = parse_abc(after_text)
            selected = VOICES if args.voices == "both" else (args.voices,)
            data = compare_scores(before, after, selected, args.allow_tempo_change)
            _emit_json(data, args.output, [args.before, args.after])
            return 0 if data["match"] else 1

        if args.command == "strip-chords":
            _assert_new_output(args.destination, [args.source])
            source = _read_utf8(args.source)
            output = strip_music_chords(source)
            _write_new(args.destination, output)
            print(json.dumps({
                "scope": "removed musical chord symbols only; preserved Vocal and Ins melodies and header text",
                "output": str(args.destination),
                "preserved_voices": list(VOICES),
                "audio_checked": False,
            }, ensure_ascii=False))
            return 0
        raise AbcError(f"Unknown command {args.command!r}")
    except (AbcError, OSError, UnicodeError, ValueError) as error:
        print(f"ABC check failed: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
