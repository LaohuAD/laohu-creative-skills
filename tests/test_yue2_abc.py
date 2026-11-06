import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "tools" / "check_yue2_abc.py"
CACHE_TEST_ROOT = ROOT / ".cache" / "validation" / "yue2-external-abc"
LOCKED_TEXT = "Unicode punctuation test：中文，标点！\nnewline\n"

spec = importlib.util.spec_from_file_location("check_yue2_abc", SCRIPT)
abc = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = abc
spec.loader.exec_module(abc)


def header(key="C", meter="4/4", unit="1/8", bpm=96):
    return "\n".join([
        "X:1",
        "T:",
        f"M:{meter}",
        f"L:{unit}",
        f"Q:1/4={bpm}",
        'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
        'V: Ins clef=treble name="Ins Melody" snm="Inst."',
        f"K:{key}",
    ])


def one_group(
    vocal,
    ins,
    *,
    key="C",
    meter="4/4",
    unit="1/8",
    bpm=96,
    vocal_fields=(),
    ins_fields=(),
    section=None,
):
    lines = [header(key=key, meter=meter, unit=unit, bpm=bpm)]
    if section:
        lines.append(f"% {section}")
    lines.append("V: Vocal")
    lines.extend(vocal_fields)
    lines.append(vocal)
    lines.append("V: Ins")
    lines.extend(ins_fields)
    lines.append(ins)
    return "\n".join(lines) + "\n"


# A small self-contained native-profile score: two 4/4 bars, six attacks,
# and an instrumental whole-bar rest spanning both measures.
NATIVE_DIAGNOSTIC = one_group("C2D2E2F2|G4A4|", "Z2|")


def cli(*args):
    return subprocess.run(
        [sys.executable, "-B", str(SCRIPT), *map(str, args)],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


class NativeAbcTests(unittest.TestCase):
    def test_parses_self_contained_two_bar_native_profile_fixture(self):
        score = abc.parse_abc(NATIVE_DIAGNOSTIC)
        report = abc._score_report(score, "melody", None)
        self.assertEqual(report["bar_count"], 2)
        self.assertEqual(report["duration_quarters"], "8")
        self.assertEqual(report["nominal_duration_seconds"], 5.0)
        self.assertEqual(report["voices"]["Vocal"]["attack_count"], 6)
        self.assertEqual(report["voices"]["Ins"]["rests"], [
            {"onset_quarters": "0", "duration_quarters": "8"},
        ])

    def test_header_without_any_music_group_is_rejected(self):
        with self.assertRaisesRegex(abc.AbcError, "no Vocal/Ins music group"):
            abc.parse_abc(header())

    def test_blank_and_padded_lines_parse_without_losing_strip_line_indices(self):
        text = "\n".join([
            "  X:1  ",
            "",
            "T: ",
            "M:4/4",
            "L:1/8",
            "Q:1/4=96",
            'V: Vocal clef=treble name="Vocal Melody" snm="Vocal"',
            'V: Ins clef=treble name="Ins Melody" snm="Inst."',
            "K:C",
            "",
            "  V: Vocal ",
            '  "Cmaj7"C8|  ',
            "",
            " V: Ins ",
            " Z| ",
            "",
        ])
        score = abc.parse_abc(text)
        self.assertEqual(len(score.voices["Vocal"].notes), 1)
        stripped = abc.strip_music_chords(text)
        self.assertIn("  C8|  ", stripped)
        self.assertIn('name="Vocal Melody"', stripped)
        self.assertTrue(abc.compare_scores(score, abc.parse_abc(stripped))["match"])

    def test_key_signature_is_resolved_to_sounding_midi_pitch(self):
        score = abc.parse_abc(one_group("F2C2A4|", "Z|", key="D"))
        self.assertEqual([event.midi for event in score.voices["Vocal"].notes], [66, 61, 69])

    def test_accidentals_propagate_by_letter_across_octaves_and_reset_at_bar(self):
        text = one_group("^F2f2F,2D2|F2f2F,2D2|", "Z2|", key="C")
        score = abc.parse_abc(text)
        self.assertEqual(
            [event.midi for event in score.voices["Vocal"].notes],
            [66, 78, 54, 62, 65, 77, 53, 62],
        )

    def test_inline_key_change_is_synchronized_and_resets_local_accidental(self):
        text = one_group(
            "^F2[K:C]F2A4|",
            "z2[K:C]z2z4|",
            key="C",
        )
        score = abc.parse_abc(text)
        self.assertEqual([event.midi for event in score.voices["Vocal"].notes], [66, 65, 69])
        self.assertEqual(score.voices["Vocal"].key_directives[0].onset, abc.Fraction(1))
        self.assertEqual(score.voices["Vocal"].key_directives, score.voices["Ins"].key_directives)

    def test_unsynchronized_inline_key_change_fails(self):
        text = one_group("F2[K:G]F2A4|", "Z|", key="C")
        with self.assertRaisesRegex(abc.AbcError, "inline \\[K:\\] changes must match"):
            abc.parse_abc(text)

    def test_inline_key_change_at_different_voice_onsets_fails(self):
        text = one_group("[K:G]C8|", "z2[K:G]z2z4|", key="C")
        with self.assertRaisesRegex(abc.AbcError, "inline \\[K:\\] changes must match"):
            abc.parse_abc(text)

    def test_matching_group_key_change_is_applied_to_both_voices(self):
        text = "\n".join([
            header(key="C"),
            "V: Vocal",
            "F8|",
            "V: Ins",
            "Z|",
            "V: Vocal",
            "K:G",
            "F8|",
            "V: Ins",
            "K:G",
            "Z|",
        ]) + "\n"
        score = abc.parse_abc(text)
        self.assertEqual(score.voices["Vocal"].notes[0].midi, 65)
        self.assertEqual(score.voices["Vocal"].notes[1].midi, 66)

    def test_mismatched_group_fields_fail_closed(self):
        text = "\n".join([
            header(key="C"),
            "V: Vocal",
            "K:G",
            "F8|",
            "V: Ins",
            "Z|",
        ]) + "\n"
        with self.assertRaisesRegex(abc.AbcError, "M:/K: fields must match"):
            abc.parse_abc(text)

    def test_cross_bar_tie_keeps_pitch_without_leaking_accidental_to_new_attack(self):
        text = one_group("^F8-|F2F6|", "Z2|", key="C")
        score = abc.parse_abc(text)
        self.assertEqual(
            score.voices["Vocal"].notes,
            [
                abc.NoteEvent(abc.Fraction(0), 66, abc.Fraction(5)),
                abc.NoteEvent(abc.Fraction(5), 65, abc.Fraction(3)),
            ],
        )

    def test_explicit_contradiction_on_tie_continuation_is_rejected(self):
        with self.assertRaisesRegex(abc.AbcError, "tie changes sounding pitch"):
            abc.parse_abc(one_group("^F8-|=F2F6|", "Z2|", key="C"))

    def test_tied_repetition_is_one_attack_but_repeated_note_is_two(self):
        tied = abc.parse_abc(one_group("C4-C4|", "Z|"))
        attacked = abc.parse_abc(one_group("C4C4|", "Z|"))
        self.assertEqual(tied.voices["Vocal"].notes, [
            abc.NoteEvent(abc.Fraction(0), 60, abc.Fraction(4)),
        ])
        self.assertEqual(len(attacked.voices["Vocal"].notes), 2)
        self.assertFalse(abc.compare_scores(tied, attacked)["match"])

    def test_unresolved_tie_fails(self):
        with self.assertRaisesRegex(abc.AbcError, "unresolved tie"):
            abc.parse_abc(one_group("C8-|", "Z|"))

    def test_different_voice_bar_count_fails(self):
        with self.assertRaisesRegex(abc.AbcError, "different measure counts"):
            abc.parse_abc(one_group("C8|D8|", "Z|"))

    def test_meter_change_requires_matching_fields_and_changes_actual_bar_grid(self):
        text = "\n".join([
            header(key="C", meter="4/4"),
            "V: Vocal",
            "C8|",
            "V: Ins",
            "Z|",
            "V: Vocal",
            "M:3/4",
            "D6|",
            "V: Ins",
            "M:3/4",
            "Z|",
        ]) + "\n"
        score = abc.parse_abc(text)
        self.assertEqual([bar.meter for bar in score.voices["Vocal"].bars], [(4, 4), (3, 4)])
        self.assertEqual(score.voices["Ins"].bars, score.voices["Vocal"].bars)

    def test_only_native_supported_duration_multipliers_are_accepted(self):
        with self.assertRaisesRegex(abc.AbcError, "unsupported duration multiplier"):
            abc.parse_abc(one_group("C5D3|", "Z|"))

    def test_compressed_full_bar_rest_expands_to_measures(self):
        score = abc.parse_abc(one_group("C8|D8|", "Z2|"))
        self.assertEqual(len(score.voices["Ins"].bars), 2)
        self.assertEqual(abc._merge_rests(score.voices["Ins"].rests), [
            abc.RestEvent(abc.Fraction(0), abc.Fraction(8)),
        ])

    def test_group_accepts_up_to_four_measures_and_rejects_five(self):
        four = one_group("C8|D8|E8|F8|", "Z4|")
        self.assertEqual(len(abc.parse_abc(four).voices["Vocal"].bars), 4)
        five = one_group("C8|D8|E8|F8|G8|", "Z4|Z|")
        with self.assertRaisesRegex(abc.AbcError, "1–4 measures"):
            abc.parse_abc(five)


class HarmonyAndModeTests(unittest.TestCase):
    def test_supported_chords_are_reported_at_textual_onsets(self):
        score = abc.parse_abc(one_group('"Cmaj7"F2"G##dim7/Bb"F2E4|', "Z|"))
        self.assertEqual(
            score.voices["Vocal"].chords,
            [
                abc.ChordEvent(abc.Fraction(0), "Cmaj7"),
                abc.ChordEvent(abc.Fraction(1), "G##dim7/Bb"),
            ],
        )

    def test_full_mode_does_not_require_chords(self):
        score = abc.parse_abc(one_group("C8|", "Z|"))
        report = abc._score_report(score, "full", None)
        self.assertTrue(report["valid"])
        self.assertEqual(report["chord_presence"]["requirement"], "optional")
        self.assertEqual(report["chord_presence"]["count"], 0)

    def test_melody_mode_rejects_chord_symbols(self):
        score = abc.parse_abc(one_group('"C"F8|', "Z|"))
        report = abc._score_report(score, "melody", None)
        self.assertFalse(report["valid"])
        self.assertEqual(report["violations"], ["melody mode requires no musical chord symbols"])

    def test_unsupported_chord_quality_is_rejected(self):
        with self.assertRaisesRegex(abc.AbcError, "unsupported chord symbol"):
            abc.parse_abc(one_group('"Cmaj9"C8|', "Z|"))

    def test_chord_symbol_in_instrumental_voice_is_rejected(self):
        with self.assertRaisesRegex(abc.AbcError, "allowed only in Vocal"):
            abc.parse_abc(one_group("C8|", '"G7"Z|'))

    def test_strip_chords_preserves_both_melodies_header_names_and_timing(self):
        source = one_group('"Cmaj7"F2"G7"F2E4|', "G2A2B4|")
        stripped_text = abc.strip_music_chords(source)
        stripped = abc.parse_abc(stripped_text)
        original = abc.parse_abc(source)
        self.assertTrue(abc.compare_scores(original, stripped)["match"])
        self.assertEqual(stripped.voices["Vocal"].notes, original.voices["Vocal"].notes)
        self.assertEqual(stripped.voices["Ins"].notes, original.voices["Ins"].notes)
        self.assertEqual(stripped.voices["Vocal"].chords, [])
        self.assertIn('name="Vocal Melody"', stripped_text)
        self.assertIn('name="Ins Melody"', stripped_text)
        self.assertIn("G2A2B4|", stripped_text)
        self.assertNotIn('"Cmaj7"', stripped_text)
        self.assertNotIn('"G7"', stripped_text)

    def test_strip_chords_does_not_change_header_quoted_text(self):
        source = one_group('"C"F8|', "Z|")
        result = abc.strip_music_chords(source)
        self.assertIn('name="Vocal Melody"', result)
        self.assertIn('name="Ins Melody"', result)


class CompareAndLockTests(unittest.TestCase):
    def test_compare_detects_note_and_rest_grid_drift(self):
        before = abc.parse_abc(one_group("C2z2D4|", "Z|"))
        after = abc.parse_abc(one_group("C2z4D2|", "Z|"))
        comparison = abc.compare_scores(before, after)
        self.assertFalse(comparison["match"])
        self.assertTrue(any("note duration" in item or "attack onset" in item
                            for item in comparison["differences"]))
        self.assertIn("Vocal: rest onset/duration grid differs", comparison["differences"])

    def test_default_compare_keeps_both_voices_and_selected_compare_is_explicit(self):
        before = abc.parse_abc(one_group("C8|", "E8|"))
        after = abc.parse_abc(one_group("C8|", "F8|"))
        self.assertFalse(abc.compare_scores(before, after)["match"])
        self.assertTrue(abc.compare_scores(before, after, ("Vocal",))["match"])

    def test_compare_uses_key_change_time_not_group_vs_inline_notation(self):
        group_key = "\n".join([
            header(key="C"),
            "V: Vocal",
            "K:G",
            "F8|",
            "V: Ins",
            "K:G",
            "z8|",
        ]) + "\n"
        inline_key = one_group("[K:G]F8|", "[K:G]z8|", key="C")
        self.assertTrue(abc.compare_scores(
            abc.parse_abc(group_key),
            abc.parse_abc(inline_key),
        )["match"])

    def test_compare_tempo_boundary_can_be_explicitly_relaxed(self):
        before = abc.parse_abc(one_group("C8|", "Z|", bpm=96))
        after = abc.parse_abc(one_group("C8|", "Z|", bpm=100))
        self.assertFalse(abc.compare_scores(before, after)["match"])
        self.assertTrue(abc.compare_scores(before, after, allow_tempo_change=True)["match"])

    def test_compare_protects_section_boundaries_but_ignores_unlabeled_group_splits(self):
        before = "\n".join([
            header(),
            "% verse",
            "V: Vocal",
            "C8|D8|",
            "V: Ins",
            "Z2|",
            "V: Vocal",
            "E8|F8|",
            "V: Ins",
            "Z2|",
        ]) + "\n"
        regrouped = "\n".join([
            header(),
            "% verse",
            "V: Vocal",
            "C8|",
            "V: Ins",
            "Z|",
            "V: Vocal",
            "D8|E8|F8|",
            "V: Ins",
            "Z3|",
        ]) + "\n"
        moved = "\n".join([
            header(),
            "% verse",
            "V: Vocal",
            "C8|",
            "V: Ins",
            "Z|",
            "% chorus",
            "V: Vocal",
            "D8|",
            "V: Ins",
            "Z|",
            "V: Vocal",
            "E8|F8|",
            "V: Ins",
            "Z2|",
        ]) + "\n"
        source = abc.parse_abc(before)
        same_boundary = abc.parse_abc(regrouped)
        changed_boundary = abc.parse_abc(moved)
        self.assertTrue(abc.compare_scores(source, same_boundary)["match"])
        result = abc.compare_scores(source, changed_boundary)
        self.assertFalse(result["match"])
        self.assertIn("section boundary or label sequence differs", result["differences"])

    def test_duration_is_checked_only_against_supplied_limit(self):
        score = abc.parse_abc(NATIVE_DIAGNOSTIC)
        no_limit = abc._score_report(score, "full", None)
        enough = abc._score_report(score, "full", abc.Fraction(5))
        too_short = abc._score_report(score, "full", abc.Fraction(4))
        self.assertEqual(no_limit["duration_limit_check"], "NOT_CHECKED")
        self.assertIsNone(no_limit["maximum_duration_seconds"])
        self.assertTrue(enough["valid"])
        self.assertFalse(too_short["valid"])
        self.assertEqual(too_short["duration_limit_check"], "FAIL")
        self.assertIn("cloud cap is not inferred", no_limit["duration_limit_source"])

    def test_locked_lyrics_compare_exact_text_and_only_normalize_newlines(self):
        lyrics = LOCKED_TEXT
        same = abc.compare_lyrics(lyrics, lyrics.replace("\n", "\r\n"))
        changed = abc.compare_lyrics(lyrics, lyrics.replace("，", "", 1))
        self.assertTrue(same["match"])
        self.assertFalse(changed["match"])
        self.assertIsNotNone(changed["first_difference_index"])
        self.assertFalse(changed["note_alignment_checked"])
        self.assertEqual(changed["source_characters"], len(lyrics))

    def test_locked_lyrics_preserve_space_and_line_order(self):
        lyrics = LOCKED_TEXT
        self.assertFalse(abc.compare_lyrics(
            lyrics,
            lyrics.replace("\n", " ", 1),
        )["match"])
        lines = lyrics.splitlines(keepends=True)
        swapped = lines[1] + lines[0] + "".join(lines[2:])
        self.assertFalse(abc.compare_lyrics(lyrics, swapped)["match"])


class CommandLineTests(unittest.TestCase):
    def setUp(self):
        CACHE_TEST_ROOT.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=CACHE_TEST_ROOT)
        self.directory = Path(self.temp.name)
        self.lyrics_source, self.lyrics_final = self.write_lyrics_pair()

    def tearDown(self):
        self.temp.cleanup()

    def write_score(self, name, text):
        path = self.directory / name
        with path.open("w", encoding="utf-8", newline="") as handle:
            handle.write(text)
        return path

    def write_lyrics_pair(self, source_text=LOCKED_TEXT, final_text=LOCKED_TEXT):
        source = self.directory / "source-lyrics.txt"
        final = self.directory / "final-lyrics.txt"
        for path, text in ((source, source_text), (final, final_text)):
            with path.open("w", encoding="utf-8", newline="") as handle:
                handle.write(text)
        return source, final

    def test_inspect_cli_returns_exact_json_and_respects_melody_mode(self):
        source = self.write_score("score.abc", one_group("C8|", "Z|"))
        result = cli("inspect", source, "--mode", "melody", "--max-duration", "3")
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertTrue(report["valid"])
        self.assertEqual(report["duration_limit_check"], "PASS")
        self.assertIn("not full ABC validation", report["scope"])

    def test_inspect_cli_fails_nonzero_when_supplied_duration_is_too_short(self):
        source = self.write_score("score.abc", one_group("C8|", "Z|"))
        result = cli("inspect", source, "--max-duration", "1")
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertFalse(json.loads(result.stdout)["valid"])

    def test_inspect_cli_checks_locked_lyrics_without_binding_syllables_to_notes(self):
        score = self.write_score("score.abc", one_group("C8|", "Z|"))
        result = cli("inspect", score, "--lyrics", self.lyrics_source,
                     "--package-lyrics", self.lyrics_final, "--mode", "full")
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertTrue(report["lyrics_lock"]["match"])
        self.assertEqual(report["lyrics_note_alignment"], "not checked")

    def test_inspect_cli_requires_both_lyric_paths(self):
        score = self.write_score("score.abc", one_group("C8|", "Z|"))
        result = cli("inspect", score, "--lyrics", self.lyrics_source)
        self.assertEqual(result.returncode, 2)
        self.assertIn("must be supplied together", result.stderr)

    def test_inspect_cli_writes_new_json_and_refuses_existing_output(self):
        source = self.write_score("score.abc", one_group("C8|", "Z|"))
        output = self.directory / "report.json"
        first = cli("inspect", source, "--output", output)
        self.assertEqual(first.returncode, 0, first.stderr)
        before = output.read_text(encoding="utf-8")
        second = cli("inspect", source, "--output", output)
        self.assertEqual(second.returncode, 2)
        self.assertEqual(output.read_text(encoding="utf-8"), before)

    def test_report_output_cannot_alias_an_input_path(self):
        source = self.write_score("score.abc", one_group("C8|", "Z|"))
        result = cli("inspect", source, "--output", source)
        self.assertEqual(result.returncode, 2)
        self.assertIn("Refusing to overwrite or alias input", result.stderr)

    def test_compare_cli_reports_voice_invariant_failure(self):
        before = self.write_score("before.abc", one_group("C8|", "E8|"))
        after = self.write_score("after.abc", one_group("C8|", "F8|"))
        both = cli("compare", before, after)
        vocal = cli("compare", before, after, "--voices", "Vocal")
        self.assertEqual(both.returncode, 1)
        self.assertFalse(json.loads(both.stdout)["match"])
        self.assertEqual(vocal.returncode, 0)
        self.assertTrue(json.loads(vocal.stdout)["match"])

    def test_melody_mode_cli_rejects_music_chord_but_full_allows_optional_chords(self):
        source = self.write_score("score.abc", one_group('"C"F8|', "Z|"))
        melody = cli("inspect", source, "--mode", "melody")
        full = cli("inspect", source, "--mode", "full")
        self.assertEqual(melody.returncode, 1)
        self.assertFalse(json.loads(melody.stdout)["valid"])
        self.assertEqual(full.returncode, 0)
        self.assertEqual(json.loads(full.stdout)["chord_presence"]["requirement"], "optional")

    def test_strip_chords_cli_preserves_source_and_refuses_existing_or_aliased_dest(self):
        source = self.write_score("source.abc", one_group('"Cmaj7"F2"G7"F2E4|', "G2A2B4|"))
        source_bytes = source.read_bytes()
        destination = self.directory / "stripped.abc"
        result = cli("strip-chords", source, destination)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(source.read_bytes(), source_bytes)
        self.assertIn("G2A2B4|", destination.read_text(encoding="utf-8"))
        self.assertNotIn('"Cmaj7"', destination.read_text(encoding="utf-8"))
        existing = cli("strip-chords", source, destination)
        self.assertEqual(existing.returncode, 2)
        alias_path = self.directory / "unused" / ".." / source.name
        alias = cli("strip-chords", source, alias_path)
        self.assertEqual(alias.returncode, 2)
        self.assertEqual(source.read_bytes(), source_bytes)

    def test_illegal_tokens_fail_with_nonzero_status_and_clear_boundary(self):
        source = self.write_score("illegal.abc", one_group("C4&xD4|", "Z|"))
        result = cli("inspect", source)
        self.assertEqual(result.returncode, 2)
        self.assertIn("unsupported token", result.stderr)


if __name__ == "__main__":
    unittest.main()
