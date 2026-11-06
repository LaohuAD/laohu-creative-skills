"""Regression tests for embedded vocal controls and exact lyric round-tripping."""

import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import check_controlled_lyrics as checker


LOCKED = "[Verse 1]\n窗边第一行\n第二行\n\n[Chorus]\n副歌原句。\n"
CONTROLLED = (
    "[Verse 1 ｜sing close｜keep the phrase restrained]\n"
    "[(Connect both lyric lines as one phrase｜anchor: 窗边第一行)]\n"
    "窗边第一行\n第二行\n\n"
    "[Chorus]\n副歌原句。\n"
)
PACKAGE = (
    "## 方案 A Style Prompt\n\n"
    "Global Metadata: Contemporary pop, steady pulse.\n"
    "Vocal Details: Clear solo lead, close and natural.\n"
    "Arrangement: Keep the vocal forward.\n\n"
    "## 方案 A Controlled Lyrics\n\n"
    + CONTROLLED
    + "\n## 方案 A Platform note\n\n"
    "The target interface is unspecified; acceptance is unknown.\n"
)


class ControlledLyricsTests(unittest.TestCase):
    def test_valid_package_accepts_multiline_phrase_and_optional_platform_note(self):
        result = checker.validate(LOCKED, PACKAGE, "方案 A Controlled Lyrics")
        self.assertTrue(result["valid"], result["errors"])
        self.assertEqual(result["control_count"], 2)
        self.assertEqual(result["sections"], ["Verse 1", "Chorus"])
        self.assertIn("round-trip only", result["evidence_scope"])

    def test_complete_core_package_does_not_require_optional_note_or_local_controls(self):
        plain = (
            "## 方案 A Style Prompt\n"
            "Global Metadata: Pop.\nVocal Details: Solo.\nArrangement: Keep it sparse.\n"
            "## 方案 A Controlled Lyrics\n"
            "[Verse 1]\n窗边第一行\n第二行\n\n[Chorus]\n副歌原句。\n"
        )
        result = checker.validate(LOCKED, plain, "方案 A Controlled Lyrics")
        self.assertTrue(result["valid"], result["errors"])
        self.assertEqual(result["control_count"], 0)
        self.assertFalse(checker.validate(LOCKED, plain, "方案 A Controlled Lyrics", require_controls=True)["valid"])

    def test_chinese_style_body_and_control_are_accepted_without_synopsis(self):
        chinese = (
            "## 方案 中文 Style Prompt\n"
            "Global Metadata: 当代流行，稳定脉冲。\n"
            "Vocal Details: 单人主唱，自然近讲。\n"
            "Arrangement: 主唱保持前景，句尾留白。\n"
            "## 方案 中文 Controlled Lyrics\n"
            "[Verse 1 ｜保持近讲｜句尾收住]\n窗边第一行\n第二行\n\n"
            "[Chorus]\n副歌原句。\n"
        )
        result = checker.validate(LOCKED, chinese, "方案 中文 Controlled Lyrics")
        self.assertTrue(result["valid"], result["errors"])

    def test_bilingual_complete_groups_each_round_trip_locked_lyrics(self):
        bilingual = (
            "## Campus EN Style Prompt\n"
            "Global Metadata: Contemporary pop, final blueprint pulse.\n"
            "Vocal Details: Clear solo lead.\n"
            "Arrangement: Preserve the phrase relationship and return.\n"
            "## Campus EN Controlled Lyrics\n" + CONTROLLED + "\n"
            "## 校园中文 Style Prompt\n"
            "Global Metadata: 当代流行，沿用最终蓝图脉冲。\n"
            "Vocal Details: 清晰的单人主唱。\n"
            "Arrangement: 保留乐句关系并安排回返。\n"
            "## 校园中文 Controlled Lyrics\n"
            "[Verse 1 ｜保持近讲｜整句连贯]\n"
            "[(把两行唱作一个完整乐句｜锚点：窗边第一行)]\n"
            "窗边第一行\n第二行\n\n[Chorus]\n副歌原句。\n"
        )
        en = checker.validate(LOCKED, bilingual, "Campus EN Controlled Lyrics")
        zh = checker.validate(LOCKED, bilingual, "校园中文 Controlled Lyrics")
        self.assertTrue(en["valid"], en["errors"])
        self.assertTrue(zh["valid"], zh["errors"])
        self.assertEqual(en["sections"], zh["sections"])
        self.assertEqual(en["control_count"], zh["control_count"])

    def test_ascii_separator_is_a_hard_syntax_error(self):
        bad = CONTROLLED.replace("Verse 1 ｜", "Verse 1 |", 1)
        parsed = checker.parse_controlled_lyrics(bad)
        self.assertTrue(any("full-width" in error for error in parsed.errors), parsed.errors)

    def test_ascii_separator_inside_section_instructions_is_a_hard_syntax_error(self):
        bad = CONTROLLED.replace("keep the phrase restrained]", "keep the phrase | restrained]", 1)
        parsed = checker.parse_controlled_lyrics(bad)
        self.assertTrue(any("full-width" in error for error in parsed.errors), parsed.errors)

    def test_ascii_separator_inside_phrase_control_is_a_hard_syntax_error(self):
        bad = CONTROLLED.replace("Connect both lyric lines as one phrase｜anchor", "Connect both lyric lines as one phrase|anchor")
        parsed = checker.parse_controlled_lyrics(bad)
        self.assertTrue(any("full-width" in error for error in parsed.errors), parsed.errors)

    def test_phrase_control_must_be_immediately_above_target(self):
        bad = CONTROLLED.replace("[(Connect both lyric lines as one phrase｜anchor: 窗边第一行)]\n", "[(Connect both lyric lines as one phrase｜anchor: 窗边第一行)]\n\n", 1)
        parsed = checker.parse_controlled_lyrics(bad)
        self.assertTrue(any("immediately above" in error for error in parsed.errors), parsed.errors)

    def test_phrase_control_cannot_be_detached_at_end(self):
        parsed = checker.parse_controlled_lyrics("[Verse 1]\n[(sing the next phrase)]\n")
        self.assertTrue(any("no target lyric phrase" in error for error in parsed.errors), parsed.errors)

    def test_exact_mode_preserves_line_breaks_and_authorized_reflow_only_ignores_whitespace(self):
        reflowed = LOCKED.replace("窗边第一行\n第二行", "窗边第一行 第二行")
        exact_ok, _, _, exact_errors = checker.compare_locked_lyrics(LOCKED, reflowed)
        self.assertFalse(exact_ok)
        self.assertTrue(any("line breaks" in error for error in exact_errors))
        reflow_ok, _, _, reflow_errors = checker.compare_locked_lyrics(LOCKED, reflowed, allow_reflow=True)
        self.assertTrue(reflow_ok, reflow_errors)
        punctuation_changed = LOCKED.replace("副歌原句。", "副歌原句！")
        allowed, _, _, errors = checker.compare_locked_lyrics(LOCKED, punctuation_changed, allow_reflow=True)
        self.assertFalse(allowed)
        self.assertTrue(any("punctuation" in error for error in errors))

    def test_changed_section_order_fails_even_if_lyric_characters_remain(self):
        changed = "[Chorus]\n副歌原句。\n\n[Verse 1]\n窗边第一行\n第二行\n"
        valid, _, _, errors = checker.compare_locked_lyrics(LOCKED, changed)
        self.assertFalse(valid)
        self.assertTrue(any("section labels or order" in error for error in errors))

    def test_custom_verse_and_chinese_section_names_are_locked_without_enum(self):
        locked = "[Verse A]\nTOKEN_A\n\n[尾声回返]\nTOKEN_B\n"
        controlled = (
            "[Verse A ｜stay close]\nTOKEN_A\n\n"
            "[尾声回返 ｜open the final phrase]\nTOKEN_B\n"
        )
        valid, expected, actual, errors = checker.compare_locked_lyrics(locked, controlled)
        self.assertTrue(valid, errors)
        self.assertEqual(expected.sections, ["Verse A", "尾声回返"])
        self.assertEqual(actual.sections, expected.sections)

        renamed = controlled.replace("Verse A ｜", "Verse B ｜", 1)
        valid, _, _, errors = checker.compare_locked_lyrics(locked, renamed)
        self.assertFalse(valid)
        self.assertTrue(any("section labels or order" in error for error in errors))

        reordered = (
            "[尾声回返 ｜open the final phrase]\nTOKEN_A\n\n"
            "[Verse A ｜stay close]\nTOKEN_B\n"
        )
        valid, _, _, errors = checker.compare_locked_lyrics(locked, reordered)
        self.assertFalse(valid)
        self.assertTrue(any("section labels or order" in error for error in errors))

    def test_colon_is_part_of_a_custom_section_name_not_a_control_separator(self):
        locked = "[Verse A: reprise]\nTOKEN_A\n"
        controlled = "[Verse A: reprise ｜stay close]\nTOKEN_A\n"
        valid, expected, actual, errors = checker.compare_locked_lyrics(locked, controlled)
        self.assertTrue(valid, errors)
        self.assertEqual(expected.sections, ["Verse A: reprise"])
        self.assertEqual(actual.sections, expected.sections)

        renamed_from_plain = "[Verse A: reprise ｜stay close]\nTOKEN_A\n"
        valid, _, _, errors = checker.compare_locked_lyrics("[Verse A]\nTOKEN_A\n", renamed_from_plain)
        self.assertFalse(valid)
        self.assertTrue(any("section labels or order" in error for error in errors))

    def test_open_structure_flag_allows_new_labels_but_locks_exact_lyric_layout(self):
        locked = "TOKEN_A  \n\tTOKEN_B，\n"
        controlled = (
            "[Verse A ｜sing close]\nTOKEN_A  \n"
            "\tTOKEN_B，\n[自定副歌 ｜open the phrase]\n"
        )
        valid, _, _, errors = checker.compare_locked_lyrics(locked, controlled)
        self.assertFalse(valid)
        self.assertTrue(any("section labels or order" in error for error in errors))

        valid, _, actual, errors = checker.compare_locked_lyrics(
            locked, controlled, structure_open=True
        )
        self.assertTrue(valid, errors)
        self.assertEqual(actual.sections, ["Verse A", "自定副歌"])

        changed_spacing = controlled.replace("TOKEN_A  ", "TOKEN_A ", 1)
        valid, _, _, errors = checker.compare_locked_lyrics(
            locked, changed_spacing, structure_open=True
        )
        self.assertFalse(valid)
        self.assertTrue(any("line breaks" in error for error in errors))

    def test_structure_open_cannot_unlock_a_source_with_existing_section_labels(self):
        result = checker.validate(
            LOCKED, PACKAGE, "方案 A Controlled Lyrics", structure_open=True
        )
        self.assertFalse(result["valid"])
        self.assertTrue(
            any("only applies when locked lyrics contain no section labels" in error
                for error in result["errors"]),
            result["errors"],
        )

    def test_structure_open_package_reports_manual_blueprint_review_scope(self):
        locked = "TOKEN_A\nTOKEN_B\n"
        body = "[Verse A ｜stay close]\nTOKEN_A\n[Outro X ｜settle]\nTOKEN_B\n"
        package = (
            "## 方案 A Style Prompt\nGlobal Metadata: Pop.\nVocal Details: Solo.\nArrangement: Sparse.\n"
            "## 方案 A Controlled Lyrics\n" + body
        )
        result = checker.validate(
            locked, package, "方案 A Controlled Lyrics", structure_open=True
        )
        self.assertTrue(result["valid"], result["errors"])
        self.assertIn("must be compared manually with the current sound blueprint", result["evidence_scope"])
        self.assertIn("only when the locked lyrics have no terminal line ending", result["evidence_scope"])

    def test_package_requires_style_prompt_then_controlled_lyrics_and_style_triplet(self):
        missing = PACKAGE.replace("## 方案 A Style Prompt", "## Style Prompt", 1)
        result = checker.validate(LOCKED, missing, "方案 A Controlled Lyrics")
        self.assertFalse(result["valid"])
        self.assertTrue(any("missing package field" in error for error in result["errors"]))
        reversed_fields = (
            "## 方案 A Controlled Lyrics\n" + CONTROLLED + "\n"
            "## 方案 A Style Prompt\n"
            "Global Metadata: Pop.\nVocal Details: Solo.\nArrangement: Sparse.\n"
        )
        result = checker.validate(LOCKED, reversed_fields, "方案 A Controlled Lyrics")
        self.assertFalse(result["valid"])
        self.assertIn(
            "package fields must be ordered: Style Prompt → Controlled Lyrics → optional Platform note",
            result["errors"],
        )

    def test_style_fields_are_line_local_and_allow_empty_middle_and_final_values(self):
        style = (
            "Global Metadata: Pop, steady pulse.\n"
            "Vocal Details:\n"
            "Arrangement:\n"
        )
        fields, errors = checker._parse_style_fields(style)
        self.assertEqual(errors, [])
        self.assertEqual(fields, {
            "Global Metadata": "Pop, steady pulse.",
            "Vocal Details": "",
            "Arrangement": "",
        })

        blank_middle = PACKAGE.replace(
            "Vocal Details: Clear solo lead, close and natural.\n", "Vocal Details:\n", 1
        )
        result = checker.validate(LOCKED, blank_middle, "方案 A Controlled Lyrics")
        self.assertTrue(result["valid"], result["errors"])

        blank_final = PACKAGE.replace(
            "Arrangement: Keep the vocal forward.\n", "Arrangement:\n", 1
        )
        result = checker.validate(LOCKED, blank_final, "方案 A Controlled Lyrics")
        self.assertTrue(result["valid"], result["errors"])

    def test_style_fields_still_require_unique_names_and_correct_order(self):
        missing = PACKAGE.replace("Vocal Details: Clear solo lead, close and natural.\n", "", 1)
        result = checker.validate(LOCKED, missing, "方案 A Controlled Lyrics")
        self.assertFalse(result["valid"])
        self.assertTrue(any("Vocal Details:" in error for error in result["errors"]))

        duplicate = PACKAGE.replace(
            "Vocal Details: Clear solo lead, close and natural.\n",
            "Vocal Details: Clear solo lead, close and natural.\nVocal Details: Extra.\n", 1
        )
        result = checker.validate(LOCKED, duplicate, "方案 A Controlled Lyrics")
        self.assertFalse(result["valid"])
        self.assertTrue(any("duplicate Style Prompt field 'Vocal Details:'" in error for error in result["errors"]))

        reversed_style = PACKAGE.replace(
            "Global Metadata: Contemporary pop, steady pulse.\n"
            "Vocal Details: Clear solo lead, close and natural.\n",
            "Vocal Details: Clear solo lead, close and natural.\n"
            "Global Metadata: Contemporary pop, steady pulse.\n", 1
        )
        result = checker.validate(LOCKED, reversed_style, "方案 A Controlled Lyrics")
        self.assertFalse(result["valid"])
        self.assertTrue(any("Style Prompt fields must be ordered" in error for error in result["errors"]))

        empty_style = PACKAGE.replace(
            "Global Metadata: Contemporary pop, steady pulse.\n"
            "Vocal Details: Clear solo lead, close and natural.\n"
            "Arrangement: Keep the vocal forward.\n", "", 1
        )
        result = checker.validate(LOCKED, empty_style, "方案 A Controlled Lyrics")
        self.assertFalse(result["valid"])
        self.assertTrue(any("empty package field: 方案 A Style Prompt" in error for error in result["errors"]))

    def test_platform_note_is_optional_but_unique_ordered_and_nonempty_when_present(self):
        duplicate = PACKAGE + "\n## 方案 A Platform note\nsecond note\n"
        result = checker.validate(LOCKED, duplicate, "方案 A Controlled Lyrics")
        self.assertFalse(result["valid"])
        self.assertTrue(any("duplicate package field" in error for error in result["errors"]))
        misplaced = PACKAGE.replace(
            "## 方案 A Controlled Lyrics\n\n" + CONTROLLED + "\n## 方案 A Platform note",
            "## 方案 A Platform note\n\nThe interface is unknown.\n\n## 方案 A Controlled Lyrics\n\n" + CONTROLLED.rstrip("\n"),
            1,
        )
        result = checker.validate(LOCKED, misplaced, "方案 A Controlled Lyrics")
        self.assertFalse(result["valid"])
        self.assertTrue(any("ordered" in error for error in result["errors"]))
        empty_note = PACKAGE.split("## 方案 A Platform note")[0] + "## 方案 A Platform note\n\n"
        result = checker.validate(LOCKED, empty_note, "方案 A Controlled Lyrics")
        self.assertFalse(result["valid"])
        self.assertTrue(any("empty package field" in error for error in result["errors"]))

    def test_fenced_lyrics_body_preserves_final_newline_exactly(self):
        fenced = (
            "## 方案 A Style Prompt\nGlobal Metadata: Pop.\nVocal Details: Solo.\nArrangement: Sparse.\n\n"
            "## 方案 A Controlled Lyrics\n\n```text\n" + CONTROLLED + "```\n\n"
            "## 方案 A Platform note\nUnknown.\n"
        )
        result = checker.validate(LOCKED, fenced, "方案 A Controlled Lyrics")
        self.assertTrue(result["valid"], result["errors"])
        body, errors = checker.extract_heading_body(fenced, "方案 A Controlled Lyrics")
        self.assertFalse(errors)
        self.assertEqual(body, CONTROLLED)

    def test_last_package_section_allows_one_markdown_blank_after_closing_fence(self):
        fenced_last = (
            "## 方案 A Style Prompt\nGlobal Metadata: Pop.\nVocal Details: Solo.\nArrangement: Sparse.\n\n"
            "## 方案 A Controlled Lyrics\n\n```text\n" + CONTROLLED + "```\n\n"
        )
        result = checker.validate(LOCKED, fenced_last, "方案 A Controlled Lyrics")
        self.assertTrue(result["valid"], result["errors"])
        body, errors = checker.extract_heading_body(fenced_last, "方案 A Controlled Lyrics")
        self.assertFalse(errors)
        self.assertEqual(body, CONTROLLED)

    def test_fenced_payload_without_source_ending_omits_only_closing_fence_separator(self):
        locked_no_ending = LOCKED[:-1]
        controlled_no_ending = CONTROLLED[:-1]
        prefix = (
            "## 方案 A Style Prompt\nGlobal Metadata: Pop.\nVocal Details: Solo.\nArrangement: Sparse.\n\n"
            "## 方案 A Controlled Lyrics\n\n```text\n"
        )
        fenced = prefix + controlled_no_ending + "\n```\n"
        result = checker.validate(locked_no_ending, fenced, "方案 A Controlled Lyrics")
        self.assertTrue(result["valid"], result["errors"])
        self.assertIn("only when the locked lyrics have no terminal line ending", result["evidence_scope"])

        raw_body, errors = checker.extract_heading_body(fenced, "方案 A Controlled Lyrics")
        self.assertFalse(errors)
        self.assertEqual(raw_body, controlled_no_ending + "\n")
        exact_body, errors = checker.extract_heading_body(
            fenced, "方案 A Controlled Lyrics", locked_terminal_ending=""
        )
        self.assertFalse(errors)
        self.assertEqual(exact_body, controlled_no_ending)

        extra_blank = prefix + controlled_no_ending + "\n\n```\n"
        changed_content = prefix + controlled_no_ending + "额外文字\n```\n"
        self.assertFalse(checker.validate(locked_no_ending, extra_blank, "方案 A Controlled Lyrics")["valid"])
        self.assertFalse(checker.validate(locked_no_ending, changed_content, "方案 A Controlled Lyrics")["valid"])

    def test_non_fenced_body_keeps_terminal_ending_exact(self):
        locked_no_ending = LOCKED[:-1]
        controlled_no_ending = CONTROLLED[:-1]
        prefix = (
            "## 方案 A Style Prompt\nGlobal Metadata: Pop.\nVocal Details: Solo.\nArrangement: Sparse.\n"
            "## 方案 A Controlled Lyrics\n"
        )
        exact = checker.validate(
            locked_no_ending, prefix + controlled_no_ending, "方案 A Controlled Lyrics"
        )
        self.assertTrue(exact["valid"], exact["errors"])
        with_ending = checker.validate(
            locked_no_ending, prefix + controlled_no_ending + "\n", "方案 A Controlled Lyrics"
        )
        self.assertFalse(with_ending["valid"])

    def test_fenced_crlf_source_ending_is_preserved_and_compared_exactly(self):
        locked_crlf = LOCKED.replace("\n", "\r\n")
        controlled_crlf = CONTROLLED.replace("\n", "\r\n")
        prefix_crlf = (
            "## 方案 A Style Prompt\r\nGlobal Metadata: Pop.\r\nVocal Details: Solo.\r\n"
            "Arrangement: Sparse.\r\n\r\n## 方案 A Controlled Lyrics\r\n\r\n```text\r\n"
        )
        valid = checker.validate(
            locked_crlf,
            prefix_crlf + controlled_crlf + "```\r\n",
            "方案 A Controlled Lyrics",
        )
        self.assertTrue(valid["valid"], valid["errors"])

        wrong_ending = checker.validate(
            locked_crlf,
            prefix_crlf + CONTROLLED + "```\r\n",
            "方案 A Controlled Lyrics",
        )
        self.assertFalse(wrong_ending["valid"])
        wrong_terminal_only = checker.validate(
            locked_crlf,
            prefix_crlf + controlled_crlf[:-2] + "\n```\r\n",
            "方案 A Controlled Lyrics",
        )
        self.assertFalse(wrong_terminal_only["valid"])

    def test_cli_returns_nonzero_for_invalid_control_syntax(self):
        scratch = ROOT / ".cache/tmp/arrangement-controls"
        scratch.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="validator-test-", dir=scratch) as temp:
            temp_root = Path(temp)
            locked_path = temp_root / "locked.txt"
            package_path = temp_root / "package.md"
            locked_path.write_text(LOCKED, encoding="utf-8")
            package_path.write_text(PACKAGE.replace("Verse 1 ｜", "Verse 1 |", 1), encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
                status = checker.main([
                    "--lyrics", str(locked_path), "--package", str(package_path),
                    "--section", "方案 A Controlled Lyrics",
                ])
            self.assertNotEqual(status, 0)

    def test_cli_structure_open_flag_allows_new_sections_and_reports_manual_check(self):
        scratch = ROOT / ".cache/tmp/arrangement-controls"
        scratch.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="validator-open-structure-", dir=scratch) as temp:
            temp_root = Path(temp)
            locked_path = temp_root / "locked.txt"
            package_path = temp_root / "package.md"
            locked_path.write_text("TOKEN_A\nTOKEN_B\n", encoding="utf-8")
            package_path.write_text(
                "## 方案 A Style Prompt\nGlobal Metadata: Pop.\nVocal Details:\nArrangement:\n"
                "## 方案 A Controlled Lyrics\n"
                "[Verse A ｜stay close]\nTOKEN_A\n[Outro X ｜settle]\nTOKEN_B\n",
                encoding="utf-8",
            )
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(io.StringIO()):
                status = checker.main([
                    "--lyrics", str(locked_path), "--package", str(package_path),
                    "--section", "方案 A Controlled Lyrics", "--structure-open",
                ])
            self.assertEqual(status, 0)
            self.assertIn("compare new section labels and positions", stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
