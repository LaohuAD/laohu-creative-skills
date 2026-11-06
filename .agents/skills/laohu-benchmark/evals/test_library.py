"""Offline technical checks. Fixtures are synthetic and are not professional examples."""

from __future__ import annotations

import concurrent.futures
import copy
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[4]
TMP = Path(os.environ.get("LAOHU_BENCHMARK_TEST_TMPDIR", str(ROOT / ".cache/tmp/benchmark-build")))
TMP.mkdir(parents=True, exist_ok=True)
SCRIPT = Path(__file__).resolve().parents[1] / "scripts/library.py"
spec = importlib.util.spec_from_file_location("benchmark_library", SCRIPT)
library = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(library)

PRIVATE_SENTINEL = "PRIVATE_SOURCE_BODY_FIXTURE_6f3c2a"


def sample_bundle():
    return {
        "source": {
            "schema_version": 1,
            "identity": {"title": "Fixture Work", "creator": "Fixture Creator", "medium": "text", "version": "fixture-1"},
            "provenance": {"identity_basis": "synthetic unit test", "locator": "fixture://unit/1", "access_scope": "technical fixture only"},
            "source_material": {"reference_kind": "user-provided-text", "reference": "fixture://unit/1", "version": "fixture-1", "read_scope": "synthetic test passage only", "captured_excerpt": "Synthetic source text for technical testing; not a real work."},
            "evidence_status": "context-readable",
            "notes": PRIVATE_SENTINEL,
        },
        "atoms": [{
            "category": "language",
            "index_card": {"title": "Two step reveal fixture", "summary": "A brief paraphrase for searching by the receiving decision.", "terms": ["孤灯", "停顿", "句序"]},
            "analysis": {
                "observed_unit": {"location": "fixture paragraph 2", "context_summary": PRIVATE_SENTINEL + "; synthetic surrounding-context note"},
                "visible_observations": ["A quoted sequence is followed by a response in the fixture."],
                "creator_statement": None,
                "mechanism_inference": {"claim": "A changed referent can make the second clause narrow the first; this is only a fixture hypothesis."},
                "conditions": {"applies_when": ["The source sequence supports the changed referent."], "fixed_relations": ["Keep the initial referent available."], "open_variables": ["Exact wording and medium."], "limits": ["No reception outcome is simulated."]},
                "effect_evidence": {"status": "unknown", "notes": "Technical fixture only."},
            },
            "consumer_bindings": [{
                "consumer": "laohu-writing", "decision": "how to order an explanation", "stage": "structure",
                "required_context": "Read the full unit and its surrounding relation.",
                "adaptation": "Use only the sequence relation; create current-task wording.",
                "return": "Return to the paragraph plan before drafting.",
                "check": "Confirm the paragraph still follows the user's material and task.",
            }, {
                "consumer": "laohu-title", "decision": "whether a key phrase changes focus", "stage": "selection",
                "required_context": "Read the phrase in its paragraph or lyric section.",
                "adaptation": "Transfer the change-of-focus operation, not the wording.",
                "return": "Return to candidate drafting at the requested position.",
                "check": "Read the candidate in its real surrounding text.",
            }],
            "evidence_status": "method-candidate",
        }],
    }


def source_only_bundle(*, empty_atoms: bool = False):
    bundle = sample_bundle()
    del bundle["atoms"]
    if empty_atoms:
        bundle["atoms"] = []
    return bundle


def bundle_with_units(unit_count: int = 3):
    """Synthetic technical records for cache and view behavior, not creative examples."""
    bundle = sample_bundle()
    source = bundle["source"]
    source["notes"] = "GROUP_NOTES_MUST_NOT_SPREAD_TO_UNIT_CARDS"
    source["provenance"]["independent_units"] = [
        {
            "unit": f"fixture-{index:02d}",
            "title": f"Route procedure unit {index:02d}",
            "disposition": f"Technical route step {index:02d}.",
            "locator": f"fixture://unit/{index:02d}",
            "analysis": f"Synthetic unit-only analysis sentinel {index:02d}.",
        }
        for index in range(1, unit_count + 1)
    ]
    source["provenance"]["private_sibling_metadata"] = "private sibling metadata must not appear in unit views"
    bundle["atoms"][0]["index_card"]["terms"].append("route")
    return bundle


class LibraryTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="library-", dir=TMP)
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()

    def add_bundle(self):
        result = library.put_bundle(self.root, sample_bundle())
        self.assertTrue(result["source_committed"])
        self.assertEqual(result["index"]["status"], "rebuilt")
        return result

    def test_read_commands_do_not_create_or_rebuild(self):
        missing = self.root / "not-created"
        with self.assertRaises(library.LibraryError):
            library.search(missing, "孤灯")
        self.assertFalse(missing.exists())
        self.assertEqual(library.stats(missing)["source_count"], 0)
        self.assertFalse(missing.exists())
        result = library.validate(missing)
        self.assertFalse(result["writes_performed"])
        self.assertFalse(missing.exists())
        with self.assertRaises(library.LibraryError):
            library.rebuild_index(missing)
        self.assertFalse(missing.exists())

    def test_put_is_stable_and_idempotent_without_overwrite(self):
        first = self.add_bundle()
        again = library.put_bundle(self.root, sample_bundle())
        self.assertEqual(first["source_ids"], again["source_ids"])
        self.assertEqual(first["atom_ids"], again["atom_ids"])
        self.assertEqual(again["files_written"], [])
        self.assertEqual(again["idempotent_or_deduplicated_atoms"], first["atom_ids"])
        self.assertEqual(library.stats(self.root)["source_count"], 1)
        self.assertEqual(library.stats(self.root)["atom_count"], 1)
        changed = sample_bundle()
        changed["source"]["notes"] = "different source metadata"
        with self.assertRaises(library.LibraryError):
            library.put_bundle(self.root, changed)
        self.assertEqual(library.stats(self.root)["source_count"], 1)

    def test_source_material_is_explicit_and_round_trips_once(self):
        result = self.add_bundle()
        source = library.get_source(self.root, result["source_ids"][0])
        excerpt = "Synthetic source text for technical testing; not a real work."
        self.assertEqual(source["source_material"]["captured_excerpt"], excerpt)
        stored = json.loads((self.root / "sources" / f"{result['source_ids'][0]}.json").read_text())
        self.assertEqual(stored["source_material"], source["source_material"])
        atom = library.get_atom(self.root, result["atom_ids"][0])
        self.assertNotIn(excerpt, json.dumps(atom, ensure_ascii=False))

    def test_source_without_material_reference_fails_as_library_error(self):
        bundle = sample_bundle()
        del bundle["source"]["source_material"]
        with self.assertRaisesRegex(library.LibraryError, "source_material"):
            library.put_bundle(self.root, bundle)

    def test_source_only_put_writes_source_and_no_atom_category_or_usage(self):
        bundle = source_only_bundle()
        result = library.put_bundle(self.root, bundle)
        source_id = result["source_ids"][0]

        self.assertTrue(result["source_committed"])
        self.assertEqual(result["atom_ids"], [])
        self.assertEqual(result["idempotent_or_deduplicated_atoms"], [])
        self.assertEqual(result["files_written"], [f"sources/{source_id}.json"])
        self.assertEqual(result["index"], {
            "status": "rebuilt", "sources": 1, "atoms": 0, "categories": [], "indexes": [],
        })
        self.assertEqual(result["catalog"]["status"], "rebuilt")
        self.assertEqual(result["catalog"]["material_cards"], 1)
        stored_source = library.get_source(self.root, source_id)
        expected_source = library._validate_source(bundle["source"], add_id=True)
        self.assertEqual(library._semantic_record(stored_source),
                         library._semantic_record(expected_source))
        self.assertEqual(library.stats(self.root)["source_count"], 1)
        self.assertEqual(library.stats(self.root)["atom_count"], 0)
        self.assertEqual(library.stats(self.root)["usage_count"], 0)
        self.assertEqual(library.stats(self.root)["atoms_by_category"], {})
        self.assertTrue(library.validate(self.root)["ok"])
        self.assertEqual(library.validate(self.root)["index_state"], "empty")
        self.assertEqual([path.name for path in self.root.iterdir()], ["catalog.sqlite3", "sources"])
        self.assertFalse((self.root / "sources" / "atoms").exists())
        self.assertFalse((self.root / "language").exists())
        self.assertFalse((self.root / "usage").exists())
        with self.assertRaisesRegex(library.LibraryError, "atom not found"):
            library.get_atom(self.root, "ATM-0000000000000000")
        with self.assertRaisesRegex(library.LibraryError, "search index does not exist"):
            library.search(self.root, "Fixture Work")

    def test_source_only_put_accepts_omitted_or_empty_atoms_and_is_idempotent(self):
        first = library.put_bundle(self.root, source_only_bundle())
        stored_path = self.root / "sources" / f"{first['source_ids'][0]}.json"
        original_bytes = stored_path.read_bytes()
        second = library.put_bundle(self.root, source_only_bundle(empty_atoms=True))

        self.assertEqual(first["source_ids"], second["source_ids"])
        self.assertEqual(second["atom_ids"], [])
        self.assertEqual(second["files_written"], [])
        self.assertEqual(second["idempotent_or_deduplicated_atoms"], [])
        self.assertEqual(stored_path.read_bytes(), original_bytes)

        conflicting = source_only_bundle()
        conflicting["source"]["notes"] = "conflicting metadata must not overwrite"
        with self.assertRaisesRegex(library.LibraryError, "source ID already belongs to different content"):
            library.put_bundle(self.root, conflicting)
        self.assertEqual(stored_path.read_bytes(), original_bytes)
        self.assertEqual(library.stats(self.root)["source_count"], 1)
        self.assertEqual(library.stats(self.root)["atom_count"], 0)

    def test_source_only_cli_put_is_idempotent_and_get_source_reads_record(self):
        bundle = source_only_bundle()
        with tempfile.TemporaryDirectory(prefix="source-only-cli-", dir=TMP) as temporary:
            input_path = Path(temporary) / "bundle.json"
            input_path.write_text(json.dumps(bundle, ensure_ascii=False), encoding="utf-8")

            def run_cli(*arguments):
                return subprocess.run(
                    [sys.executable, str(SCRIPT), "--library-root", str(self.root), *arguments],
                    cwd=ROOT, capture_output=True, text=True,
                )

            first = run_cli("put", "--input", str(input_path))
            second = run_cli("put", "--input", str(input_path))
            first_result = json.loads(first.stdout)
            read = run_cli("get-source", first_result["source_ids"][0])
        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertEqual(second.returncode, 0, second.stderr)
        second_result = json.loads(second.stdout)
        self.assertEqual(first_result["source_ids"], second_result["source_ids"])
        self.assertEqual(first_result["atom_ids"], [])
        self.assertEqual(second_result["atom_ids"], [])
        self.assertEqual(second_result["files_written"], [])

        self.assertEqual(read.returncode, 0, read.stderr)
        self.assertEqual(json.loads(read.stdout)["source_id"], first_result["source_ids"][0])
        self.assertEqual(library.stats(self.root)["source_count"], 1)
        self.assertEqual(library.stats(self.root)["atom_count"], 0)

    def test_source_only_material_is_not_added_to_atom_search(self):
        self.add_bundle()
        source_only = source_only_bundle()
        source_only["source"]["identity"].update({
            "title": "Source Only zzqxy9876 Sentinel", "creator": "Source Only Creator",
        })
        source_only["source"]["provenance"]["locator"] = "fixture://source-only/search-sentinel"
        source_only["source"]["source_material"].update({
            "reference": "fixture://source-only/search-sentinel",
            "read_scope": "synthetic source-only search fixture",
        })
        result = library.put_bundle(self.root, source_only)

        self.assertEqual(result["atom_ids"], [])
        self.assertEqual(result["index"]["status"], "rebuilt")
        self.assertEqual(library.search(self.root, "zzqxy9876"), [])
        self.assertEqual(len(library.search(self.root, "Two step reveal fixture")), 1)
        self.assertEqual(library.stats(self.root)["source_count"], 2)
        self.assertEqual(library.stats(self.root)["atom_count"], 1)
        self.assertEqual(library.stats(self.root)["usage_count"], 0)
        self.assertFalse((self.root / "visual").exists())
        self.assertFalse((self.root / "language" / "usage").exists())

    def test_source_search_reads_title_and_notes_without_exposing_source_material(self):
        noted = source_only_bundle()
        noted["source"]["identity"].update({"title": "北方旧桥", "creator": "Fixture Note Creator"})
        noted["source"]["provenance"]["locator"] = "fixture://source-search/noted"
        noted["source"]["notes"] = "夜雾路标与倒叙线索的来源检索说明"
        noted["source"]["source_material"]["reference"] = "fixture://source-search/noted"
        noted["source"]["source_material"]["captured_excerpt"] = "蓝莓月球独有摘录"
        noted["source"]["source_material"]["read_scope"] = "synthetic source search fixture"
        noted_result = library.put_bundle(self.root, noted)

        legacy = source_only_bundle()
        legacy["source"].pop("notes")
        legacy["source"]["identity"].update({"title": "旧目录记录", "creator": "Fixture Legacy Creator"})
        legacy["source"]["provenance"]["locator"] = "fixture://source-search/legacy"
        legacy["source"]["source_material"]["reference"] = "fixture://source-search/legacy"
        legacy_result = library.put_bundle(self.root, legacy)

        before = {path.relative_to(self.root).as_posix(): path.read_bytes()
                  for path in self.root.rglob("*") if path.is_file()}
        dirs_before = sorted(path.relative_to(self.root).as_posix()
                             for path in self.root.rglob("*") if path.is_dir())
        self.assertFalse(any(path.name == library.INDEX_NAME for path in self.root.rglob("*")))
        title_match = library.search_sources(self.root, "旧目录")
        notes_match = library.search_sources(self.root, "夜雾路标")
        note_source = notes_match[0]

        self.assertEqual(title_match[0]["source_id"], legacy_result["source_ids"][0])
        self.assertEqual(title_match[0]["matched_fields"], ["identity.title"])
        self.assertEqual(title_match[0]["summary"], "旧目录记录")
        self.assertEqual(note_source["record_type"], "source")
        self.assertEqual(note_source["source_id"], noted_result["source_ids"][0])
        self.assertEqual(note_source["matched_fields"], ["notes"])
        self.assertEqual(note_source["summary"], "夜雾路标与倒叙线索的来源检索说明")
        self.assertEqual(set(note_source), {
            "record_type", "source_id", "identity", "summary", "evidence_status", "matched_fields",
        })
        self.assertNotIn("provenance", note_source)
        self.assertNotIn("source_material", note_source)
        self.assertNotIn("蓝莓月球独有摘录", json.dumps(note_source, ensure_ascii=False))
        self.assertEqual(library.search_sources(self.root, "蓝莓月球"), [])
        after = {path.relative_to(self.root).as_posix(): path.read_bytes()
                 for path in self.root.rglob("*") if path.is_file()}
        self.assertEqual(after, before)
        dirs_after = sorted(path.relative_to(self.root).as_posix()
                            for path in self.root.rglob("*") if path.is_dir())
        self.assertEqual(dirs_after, dirs_before)

    def test_source_search_orders_ties_stably_and_applies_limit(self):
        source_ids = []
        for title in ("来源甲", "来源乙", "来源丙"):
            bundle = source_only_bundle()
            bundle["source"]["identity"].update({"title": title, "creator": "Fixture Sort Creator"})
            bundle["source"]["provenance"]["locator"] = f"fixture://source-search/{title}"
            bundle["source"]["source_material"]["reference"] = f"fixture://source-search/{title}"
            bundle["source"]["notes"] = "来源检索稳定排序夹具"
            source_ids.extend(library.put_bundle(self.root, bundle)["source_ids"])

        first = library.search_sources(self.root, "来源", limit=2)
        second = library.search_sources(self.root, "来源", limit=2)
        self.assertEqual([item["source_id"] for item in first], sorted(source_ids)[:2])
        self.assertEqual(first, second)
        self.assertEqual(len(library.search_sources(self.root, "来源", limit=100)), 3)

    def test_source_search_summary_stays_single_line_and_bounded(self):
        long_title = source_only_bundle()
        long_title["source"]["identity"]["title"] = "长标题" * 100
        long_title["source"]["notes"] = "   "
        long_title["source"]["provenance"]["locator"] = "fixture://source-search/long-title"
        long_title["source"]["source_material"]["reference"] = "fixture://source-search/long-title"
        library.put_bundle(self.root, long_title)

        long_notes = source_only_bundle()
        long_notes["source"]["identity"]["title"] = "短标题"
        long_notes["source"]["notes"] = "长说明" * 100
        long_notes["source"]["provenance"]["locator"] = "fixture://source-search/long-notes"
        long_notes["source"]["source_material"]["reference"] = "fixture://source-search/long-notes"
        library.put_bundle(self.root, long_notes)

        long_title_summary = library.search_sources(self.root, "长标题")[0]["summary"]
        long_notes_summary = library.search_sources(self.root, "长说明")[0]["summary"]
        self.assertLessEqual(len(long_title_summary), 200)
        self.assertLessEqual(len(long_notes_summary), 200)
        self.assertNotIn("\n", long_title_summary)
        self.assertNotIn("\r", long_title_summary)
        self.assertEqual(long_notes_summary, "短标题")

    def test_source_search_validates_query_limit_and_does_not_create_library(self):
        self.assertEqual(library.search_sources(self.root, "不存在"), [])
        for query, limit in (("  ", 10), (None, 10), ("来源", 0), ("来源", 101), ("来源", True)):
            with self.subTest(query=query, limit=limit), self.assertRaises(library.LibraryError):
                library.search_sources(self.root, query, limit=limit)
        missing = self.root / "not-created-source-search"
        with self.assertRaisesRegex(library.LibraryError, "does not exist"):
            library.search_sources(missing, "来源")
        self.assertFalse(missing.exists())

    def test_source_search_rejects_symlinked_paths_and_pending_transactions_without_repair(self):
        result = self.add_bundle()
        source_path = self.root / "sources" / f"{result['source_ids'][0]}.json"
        original = source_path.read_bytes()
        with tempfile.TemporaryDirectory(prefix="source-search-outside-", dir=TMP) as temporary:
            outside = Path(temporary) / "record.json"
            outside.write_bytes(original)
            source_path.unlink()
            source_path.symlink_to(outside)
            with self.assertRaisesRegex(library.LibraryError, "symbolic link"):
                library.search_sources(self.root, "Fixture")
            source_path.unlink()
            source_path.write_bytes(original)

            source_path.write_text("{broken json", encoding="utf-8")
            with self.assertRaisesRegex(library.LibraryError, "cannot read JSON"):
                library.search_sources(self.root, "Fixture")
            source_path.write_bytes(original)

        sources_dir = self.root / "sources"
        saved_sources_dir = self.root / "sources-saved"
        sources_dir.rename(saved_sources_dir)
        sources_dir.symlink_to(saved_sources_dir, target_is_directory=True)
        with self.assertRaisesRegex(library.LibraryError, "symbolic link"):
            library.search_sources(self.root, "Fixture")
        sources_dir.unlink()
        saved_sources_dir.rename(sources_dir)

        alias = self.root.parent / (self.root.name + "-source-search-link")
        alias.symlink_to(self.root, target_is_directory=True)
        self.addCleanup(lambda: alias.unlink(missing_ok=True))
        with self.assertRaisesRegex(library.LibraryError, "symbolic link"):
            library.search_sources(alias, "Fixture")

        transaction = self.root / library.TRANSACTIONS_DIR / ("TXN-" + "a" * 32)
        transaction.mkdir(parents=True)
        journal = transaction / "journal.json"
        journal.write_text("pending fixture", encoding="utf-8")
        with self.assertRaisesRegex(library.LibraryError, "pending transaction"):
            library.search_sources(self.root, "Fixture")
        self.assertTrue(journal.is_file())
        self.assertEqual(source_path.read_bytes(), original)

    def test_source_search_cli_returns_catalog_rows_and_json_errors(self):
        bundle = source_only_bundle()
        bundle["source"]["identity"]["title"] = "晨雾书页"
        result = library.put_bundle(self.root, bundle)
        run = subprocess.run(
            [sys.executable, str(SCRIPT), "--library-root", str(self.root), "search-sources", "晨雾"],
            cwd=ROOT, capture_output=True, text=True,
        )
        self.assertEqual(run.returncode, 0, run.stderr)
        rows = json.loads(run.stdout)
        self.assertEqual([row["source_id"] for row in rows], result["source_ids"])
        self.assertEqual(rows[0]["matched_fields"], ["identity.title"])

        invalid = subprocess.run(
            [sys.executable, str(SCRIPT), "--library-root", str(self.root), "search-sources", "", "--limit", "0"],
            cwd=ROOT, capture_output=True, text=True,
        )
        self.assertNotEqual(invalid.returncode, 0)
        self.assertIn("error", json.loads(invalid.stderr))
        invalid_limit = subprocess.run(
            [sys.executable, str(SCRIPT), "--library-root", str(self.root), "search-sources", "晨雾", "--limit", "0"],
            cwd=ROOT, capture_output=True, text=True,
        )
        self.assertNotEqual(invalid_limit.returncode, 0)
        self.assertIn("limit", json.loads(invalid_limit.stderr)["error"])

    def test_source_only_commit_failure_can_be_recovered_without_records(self):
        bundle = source_only_bundle()
        source = library._validate_source(bundle["source"], add_id=True)
        transaction_root = self.root / library.TRANSACTIONS_DIR
        with mock.patch.object(library, "_commit_staged", side_effect=OSError("fixture commit failure")):
            with self.assertRaisesRegex(OSError, "fixture commit failure"):
                library.put_bundle(self.root, bundle)

        self.assertFalse((self.root / "sources" / f"{source['source_id']}.json").exists())
        pending = list(transaction_root.glob("TXN-*/journal.json"))
        self.assertEqual(len(pending), 1)
        recovered = library.recover(self.root)
        self.assertEqual(recovered["recovered"], [pending[0].parent.name + ":rolled-back"])
        self.assertTrue(recovered["writes_performed"])
        self.assertFalse(transaction_root.exists())
        self.assertEqual(library.stats(self.root)["source_count"], 0)
        self.assertEqual(library.stats(self.root)["atom_count"], 0)

    def test_source_only_index_failure_preserves_source_and_no_atom_index(self):
        bundle = source_only_bundle()
        with mock.patch.object(library, "_rebuild_index_unlocked",
                               side_effect=OSError("fixture source-only index failure")):
            result = library.put_bundle(self.root, bundle)

        self.assertTrue(result["source_committed"])
        self.assertEqual(result["atom_ids"], [])
        self.assertEqual(result["index"]["status"], "stale-or-unavailable")
        self.assertEqual(library.get_source(self.root, result["source_ids"][0])["source_id"],
                         result["source_ids"][0])
        self.assertEqual(library.stats(self.root)["atom_count"], 0)
        self.assertFalse((self.root / "language").exists())
        with self.assertRaisesRegex(library.LibraryError, "search index does not exist"):
            library.search(self.root, "Fixture Work")

    def test_invalid_explicit_atoms_are_rejected_not_downgraded_to_source_only(self):
        valid_source = source_only_bundle()["source"]
        cases = [
            ({"source": valid_source, "atoms": "not-an-array"}, "atoms must be an array"),
            ({"source": valid_source, "atoms": [None]}, "atoms must be an array"),
            ({"source": valid_source, "atom": []}, "atom must be an object"),
            ({"source": valid_source, "atom": None}, "atom must be an object"),
            ({"source": valid_source, "atoms": None}, "atom must be an object"),
            ({"source": valid_source, "atoms": [{}]}, "category must be a lowercase slug"),
            ({"sources": {}, "atoms": []}, "source object or a nonempty sources array"),
        ]
        for bundle, expected in cases:
            with self.subTest(expected=expected), self.assertRaisesRegex(library.LibraryError, expected):
                library.put_bundle(self.root, bundle)

        self.assertEqual(list(self.root.iterdir()), [])
        self.assertEqual(library.stats(self.root)["source_count"], 0)
        self.assertEqual(library.stats(self.root)["atom_count"], 0)

        with tempfile.TemporaryDirectory(prefix="source-only-invalid-", dir=TMP) as temporary:
            input_path = Path(temporary) / "bundle.json"
            input_path.write_text(json.dumps({"source": valid_source, "atoms": "not-an-array"}),
                                  encoding="utf-8")
            run = subprocess.run([sys.executable, str(SCRIPT), "--library-root", str(self.root),
                                  "put", "--input", str(input_path)],
                                 cwd=ROOT, capture_output=True, text=True)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn("atoms must be an array", json.loads(run.stderr)["error"])
        self.assertEqual(library.stats(self.root)["source_count"], 0)
        self.assertEqual(library.stats(self.root)["atom_count"], 0)

    def test_user_text_source_cannot_store_an_empty_excerpt(self):
        bundle = sample_bundle()
        bundle["source"]["source_material"]["captured_excerpt"] = " \n "
        with self.assertRaisesRegex(library.LibraryError, "captured_excerpt"):
            library.put_bundle(self.root, bundle)

    def test_reserved_sources_category_is_rejected_without_creating_records(self):
        bundle = sample_bundle()
        bundle["atoms"][0]["category"] = "sources"
        with self.assertRaisesRegex(library.LibraryError, "reserved"):
            library.put_bundle(self.root, bundle)
        self.assertFalse((self.root / "sources").exists())
        self.assertFalse((self.root / "sources" / "atoms").exists())
        self.assertEqual(library.stats(self.root)["source_count"], 0)
        self.assertEqual(library.stats(self.root)["atom_count"], 0)

        invalid_usage = {
            "usage_id": "USG-0000000000000000", "atom_id": "ATM-0000000000000000",
            "category": "sources", "consumer": "laohu-writing", "decision": "draft",
            "stage": "writing", "required_context": "context", "adaptation": "adapt",
            "return": "return", "check": "check", "outcome": "applied",
            "recorded_at": "2026-11-02T00:00:00Z",
        }
        with self.assertRaisesRegex(library.LibraryError, "category"):
            library._validate_usage(invalid_usage)

        schemas = SCRIPT.parent.parent / "schemas"
        for name in ("atom.schema.json", "usage.schema.json", "usage-input.schema.json"):
            schema = json.loads((schemas / name).read_text(encoding="utf-8"))
            self.assertEqual(schema["properties"]["category"]["not"], {"const": "sources"})

    def test_chinese_two_character_search_and_consumer_binding_filter(self):
        result = self.add_bundle()
        atom_id = result["atom_ids"][0]
        matches = library.search(self.root, "孤灯", consumer="laohu-writing")
        self.assertEqual([item["atom_id"] for item in matches], [atom_id])
        self.assertEqual(library.search(self.root, "孤灯", consumer="laohu-image"), [])
        self.assertEqual(library.search(self.root, "order", consumer="laohu-writing"), [matches[0]])
        self.assertEqual(library.search(
            self.root, "孤灯", consumer="laohu-writing",
            decision="whether a key phrase changes focus", stage="structure"), [])
        self.assertEqual(library.get_atom(self.root, atom_id, "language")["atom_id"], atom_id)

    def test_unmapped_candidate_consumer_can_be_saved_searched_and_used(self):
        bundle = sample_bundle()
        binding = bundle["atoms"][0]["consumer_bindings"][0]
        binding.update({
            "consumer": "candidate-unmapped",
            "decision": "future visual method requiring a new professional handoff",
            "stage": "future-design",
            "return": "Return to the identified future consumer when its skill is defined.",
            "check": "Verify the method in its eventual real output.",
        })
        result = library.put_bundle(self.root, bundle)
        atom_id = result["atom_ids"][0]
        found = library.search(self.root, "孤灯", consumer="candidate-unmapped",
                               decision=binding["decision"], stage="future-design")
        self.assertEqual([row["atom_id"] for row in found], [atom_id])
        usage = library.log_usage(self.root, {
            "atom_id": atom_id, "category": "language", "consumer": "candidate-unmapped",
            "decision": binding["decision"], "stage": "future-design", "outcome": "pending",
            "case_ref": "candidate routing fixture",
        })
        self.assertEqual(usage["status"], "logged")
        self.assertEqual(library.get_atom(self.root, atom_id)["consumer_bindings"][0]["consumer"],
                         "candidate-unmapped")

    def test_each_category_has_its_own_rebuildable_index(self):
        first = self.add_bundle()
        second_atom = copy.deepcopy(sample_bundle()["atoms"][0])
        second_atom["category"] = "visual"
        second_atom["index_card"]["title"] = "Second category fixture"
        second_atom["analysis"]["observed_unit"]["location"] = "fixture image 3"
        source = library.get_source(self.root, first["source_ids"][0])
        library.put_bundle(self.root, {"source": source, "atom": second_atom})
        self.assertTrue((self.root / "language/index.sqlite3").is_file())
        self.assertTrue((self.root / "visual/index.sqlite3").is_file())
        self.assertFalse((self.root / "index.sqlite3").exists())
        self.assertEqual({item["category"] for item in library.search(self.root, "fixture")},
                         {"language", "visual"})
        self.assertTrue(library.validate(self.root)["ok"])

    def test_atom_lookup_without_category_rejects_symlinked_parent(self):
        result = self.add_bundle()
        atom = library.get_atom(self.root, result["atom_ids"][0], "language")
        with tempfile.TemporaryDirectory(prefix="atom-link-", dir=TMP) as temporary:
            outside = Path(temporary)
            (outside / "atoms").mkdir()
            (outside / "atoms" / f"{atom['atom_id']}.json").write_text(
                json.dumps(atom), encoding="utf-8")
            (self.root / "linked-category").symlink_to(outside, target_is_directory=True)
            with self.assertRaises(library.LibraryError):
                library.get_atom(self.root, atom["atom_id"])

    def test_search_index_excludes_source_context_and_atom_analysis(self):
        self.add_bundle()
        result = library.search(self.root, "孤灯")
        self.assertEqual(len(result), 1)
        self.assertNotIn(PRIVATE_SENTINEL, json.dumps(result, ensure_ascii=False))
        index = (self.root / "language/index.sqlite3").read_bytes()
        self.assertNotIn(PRIVATE_SENTINEL.encode(), index)
        self.assertNotIn(b"Synthetic source text for technical testing", index)
        self.assertIn(PRIVATE_SENTINEL, library.get_source(self.root, result[0]["source_id"])["notes"])
        self.assertIn(PRIVATE_SENTINEL, library.get_atom(self.root, result[0]["atom_id"])["analysis"]["observed_unit"]["context_summary"])

    def test_log_usage_requires_matching_cross_class_binding_and_is_idempotent(self):
        result = self.add_bundle()
        atom_id = result["atom_ids"][0]
        mismatch = {"atom_id": atom_id, "category": "language", "consumer": "laohu-image",
                    "decision": "draw an image", "stage": "composition", "outcome": "applied"}
        with self.assertRaises(library.LibraryError):
            library.log_usage(self.root, mismatch)
        usage = {"atom_id": atom_id, "category": "language", "consumer": "laohu-writing",
                 "decision": "how to order an explanation", "stage": "structure", "outcome": "adapted",
                 "recorded_at": "2026-11-02T00:00:00Z", "case_ref": "synthetic-case-1"}
        first = library.log_usage(self.root, usage)
        second = library.log_usage(self.root, usage)
        self.assertEqual(first["usage_id"], second["usage_id"])
        self.assertEqual(second["status"], "idempotent")
        self.assertEqual(library.stats(self.root)["usage_by_outcome"], {"adapted": 1})

    def test_usage_directory_is_created_only_when_usage_is_logged(self):
        atom_id = self.add_bundle()["atom_ids"][0]
        usage_dir = self.root / "language" / "usage"
        self.assertFalse(usage_dir.exists())
        library.log_usage(self.root, {
            "atom_id": atom_id, "category": "language", "consumer": "laohu-writing",
            "decision": "how to order an explanation", "stage": "structure", "outcome": "applied",
        })
        self.assertTrue(usage_dir.is_dir())
        self.assertEqual(len(list(usage_dir.glob("*.jsonl"))), 1)

    def test_usage_retry_without_recorded_at_has_stable_event_id(self):
        atom_id = self.add_bundle()["atom_ids"][0]
        usage = {"atom_id": atom_id, "category": "language", "consumer": "laohu-writing",
                 "decision": "how to order an explanation", "stage": "structure",
                 "outcome": "applied", "case_ref": "same-commit-retry"}
        first = library.log_usage(self.root, usage)
        second = library.log_usage(self.root, usage)
        self.assertEqual(first["usage_id"], second["usage_id"])
        self.assertEqual(second["status"], "idempotent")
        self.assertEqual(library.stats(self.root)["usage_count"], 1)

    def test_canonical_usage_record_matches_storage_schema(self):
        atom_id = self.add_bundle()["atom_ids"][0]
        library.log_usage(self.root, {"atom_id": atom_id, "category": "language",
            "consumer": "laohu-writing", "decision": "how to order an explanation",
            "stage": "structure", "outcome": "applied"})
        schema = json.loads((SCRIPT.parent.parent / "schemas/usage.schema.json").read_text(encoding="utf-8"))
        canonical = json.loads((self.root / "language/usage" / f"{library._utc_now()[:7]}.jsonl")
                              .read_text(encoding="utf-8").splitlines()[0])
        self.assertTrue(set(schema["required"]).issubset(canonical))
        self.assertFalse(set(canonical) - set(schema["properties"]))

    def test_malformed_enumerated_types_return_library_errors_and_cli_json(self):
        bundle = sample_bundle()
        invalid_source = copy.deepcopy(bundle["source"])
        invalid_source["evidence_status"] = []
        with self.assertRaises(library.LibraryError):
            library._validate_source(invalid_source, add_id=True)
        invalid_atom = copy.deepcopy(bundle["atoms"][0])
        invalid_atom["evidence_status"] = {}
        with self.assertRaises(library.LibraryError):
            library._validate_atom(invalid_atom, add_id=True, default_source="SRC-0000000000000000")
        invalid_effect = copy.deepcopy(bundle["atoms"][0])
        invalid_effect["analysis"]["effect_evidence"]["status"] = []
        with self.assertRaises(library.LibraryError):
            library._validate_atom(invalid_effect, add_id=True, default_source="SRC-0000000000000000")
        invalid_usage = {"usage_id": "USG-0000000000000000", "atom_id": "ATM-0000000000000000",
            "consumer": "laohu-writing", "decision": "draft", "stage": "writing",
            "required_context": "context", "adaptation": "adapt", "return": "return", "check": "check",
            "outcome": [], "recorded_at": "2026-11-02T00:00:00Z"}
        with self.assertRaises(library.LibraryError):
            library._validate_usage(invalid_usage)
        with tempfile.TemporaryDirectory(prefix="invalid-cli-", dir=TMP) as temporary:
            input_path = Path(temporary) / "bundle.json"
            invalid_bundle = sample_bundle()
            invalid_bundle["source"]["evidence_status"] = []
            input_path.write_text(json.dumps(invalid_bundle), encoding="utf-8")
            run = subprocess.run([sys.executable, str(SCRIPT), "--library-root", str(self.root),
                                  "put", "--input", str(input_path)],
                                 cwd=ROOT, capture_output=True, text=True)
            self.assertNotEqual(run.returncode, 0)
            self.assertIn("error", json.loads(run.stderr))

    def test_batch_transaction_recovery_rolls_back_only_matching_new_files(self):
        bundle = sample_bundle()
        source = library._validate_source(bundle["source"], add_id=True)
        atom = library._validate_atom(bundle["atoms"][0], add_id=True, default_source=source["source_id"])
        records = [(f"sources/{source['source_id']}.json", source),
                   (f"{atom['category']}/atoms/{atom['atom_id']}.json", atom)]
        txid = library._make_staged(self.root, records)
        transaction = self.root / library.TRANSACTIONS_DIR / txid
        journal = library._read_journal(transaction / "journal.json", self.root)
        first = journal["items"][0]
        target = self.root / first["target"]
        target.parent.mkdir(parents=True)
        (self.root / first["staged"]).replace(target)
        self.assertTrue(target.exists())
        recovered = library.recover(self.root)
        self.assertIn(txid + ":rolled-back", recovered["recovered"])
        self.assertFalse(target.exists())
        self.assertFalse((self.root / library.TRANSACTIONS_DIR).exists())

    def test_read_journal_rejects_malformed_item_fields_types_paths_and_digests(self):
        valid_target = "sources/SRC-0000000000000000.json"
        cases = [
            ([{}], "item fields"),
            ([{"target": [], "staged": "placeholder", "sha256": "a" * 64}], "item types"),
            ([{"target": "../outside.json", "staged": "placeholder", "sha256": "a" * 64}], "unsafe transaction journal path"),
            ([{"target": valid_target, "staged": "placeholder", "sha256": "not-a-digest"}], "SHA-256"),
        ]
        for index, (items, expected_error) in enumerate(cases):
            transaction_id = "TXN-" + ("0" * 31) + str(index)
            transaction = self.root / library.TRANSACTIONS_DIR / transaction_id
            transaction.mkdir(parents=True)
            staged = f"{library.TRANSACTIONS_DIR}/{transaction_id}/staged/00000.json"
            for item in items:
                if isinstance(item, dict) and item.get("staged") == "placeholder":
                    item["staged"] = staged
            journal = {"format_version": 1, "transaction_id": transaction_id,
                       "state": "prepared", "items": items}
            path = transaction / "journal.json"
            path.write_text(json.dumps(journal), encoding="utf-8")
            with self.subTest(index=index), self.assertRaisesRegex(library.LibraryError, expected_error):
                library._read_journal(path, self.root)

    def test_recovery_prevalidates_all_journals_and_returns_json_error(self):
        bundle = sample_bundle()
        source = library._validate_source(bundle["source"], add_id=True)
        atom = library._validate_atom(bundle["atoms"][0], add_id=True, default_source=source["source_id"])
        records = [(f"sources/{source['source_id']}.json", source),
                   (f"{atom['category']}/atoms/{atom['atom_id']}.json", atom)]
        valid_id = library._make_staged(self.root, records)
        valid_transaction = self.root / library.TRANSACTIONS_DIR / valid_id
        journal = library._read_journal(valid_transaction / "journal.json", self.root)
        first = journal["items"][0]
        target = library._contained(self.root, first["target"])
        target.parent.mkdir(parents=True)
        library._contained(self.root, first["staged"]).replace(target)
        self.assertTrue(target.is_file())

        malformed_id = "TXN-" + "f" * 32
        malformed_transaction = self.root / library.TRANSACTIONS_DIR / malformed_id
        malformed_transaction.mkdir()
        malformed_journal = {"format_version": 1, "transaction_id": malformed_id,
                              "state": "prepared", "items": [{}]}
        malformed_path = malformed_transaction / "journal.json"
        malformed_path.write_text(json.dumps(malformed_journal), encoding="utf-8")

        with self.assertRaisesRegex(library.LibraryError, "item fields"):
            library.recover(self.root)
        self.assertTrue(target.is_file())
        self.assertTrue(valid_transaction.is_dir())
        self.assertTrue(malformed_path.is_file())

        run = subprocess.run([sys.executable, str(SCRIPT), "--library-root", str(self.root), "recover"],
                             cwd=ROOT, capture_output=True, text=True)
        self.assertNotEqual(run.returncode, 0)
        error = json.loads(run.stderr)
        self.assertIn("error", error)
        self.assertIn("item fields", error["error"])
        self.assertNotIn("Traceback", run.stderr)
        self.assertTrue(target.is_file())
        self.assertTrue(valid_transaction.is_dir())
        self.assertTrue(malformed_path.is_file())

    def test_recovery_invalid_utf8_journal_returns_json_error_and_is_preserved(self):
        transaction_id = "TXN-" + "e" * 32
        transaction = self.root / library.TRANSACTIONS_DIR / transaction_id
        transaction.mkdir(parents=True)
        journal_path = transaction / "journal.json"
        journal_path.write_bytes(b"\xff\xfe invalid utf-8")

        with self.assertRaisesRegex(library.LibraryError, "cannot read JSON"):
            library.recover(self.root)
        self.assertTrue(journal_path.is_file())
        self.assertTrue(transaction.is_dir())

        run = subprocess.run([sys.executable, str(SCRIPT), "--library-root", str(self.root), "recover"],
                             cwd=ROOT, capture_output=True, text=True)
        self.assertNotEqual(run.returncode, 0)
        self.assertIn("error", json.loads(run.stderr))
        self.assertNotIn("Traceback", run.stderr)
        self.assertTrue(journal_path.is_file())
        self.assertTrue(transaction.is_dir())

    def test_index_failure_does_not_undo_canonical_source_or_atom(self):
        with mock.patch.object(library, "_rebuild_index_unlocked", side_effect=OSError("fixture index failure")):
            result = library.put_bundle(self.root, sample_bundle())
        self.assertTrue(result["source_committed"])
        self.assertEqual(result["index"]["status"], "stale-or-unavailable")
        self.assertEqual(library.stats(self.root)["atom_count"], 1)
        atom = library.get_atom(self.root, result["atom_ids"][0])
        self.assertEqual(atom["source_id"], result["source_ids"][0])

    def test_concurrent_identical_writes_serialize_and_deduplicate(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(lambda _: library.put_bundle(self.root, sample_bundle()), range(4)))
        self.assertTrue(all(result["source_committed"] for result in results))
        self.assertEqual(library.stats(self.root)["source_count"], 1)
        self.assertEqual(library.stats(self.root)["atom_count"], 1)
        self.assertTrue(library.validate(self.root)["ok"])

    def test_rebuild_restores_deleted_derived_cache_without_touching_sources(self):
        self.add_bundle()
        before = sorted(path.relative_to(self.root).as_posix() for path in self.root.rglob("*.json"))
        (self.root / "language/index.sqlite3").unlink()
        rebuilt = library.rebuild_index(self.root)
        after = sorted(path.relative_to(self.root).as_posix() for path in self.root.rglob("*.json"))
        self.assertEqual(rebuilt["status"], "rebuilt")
        self.assertEqual(before, after)
        self.assertEqual(len(library.search(self.root, "孤灯")), 1)

    def test_symbolic_link_and_parent_traversal_are_rejected(self):
        outside = self.root.parent / (self.root.name + "-outside")
        outside.mkdir(exist_ok=True)
        self.addCleanup(lambda: outside.rmdir() if outside.exists() and not any(outside.iterdir()) else None)
        link = self.root / "linked"
        link.symlink_to(outside, target_is_directory=True)
        with self.assertRaises(library.LibraryError):
            library._contained(self.root, "linked/payload")
        with self.assertRaises(library.LibraryError):
            library._contained(self.root, "../escape")
        self.assertEqual(list(outside.iterdir()), [])

    def test_progressive_query_returns_bounded_typed_cards_and_pages(self):
        bundle = bundle_with_units(3)
        result = library.put_bundle(self.root, bundle)
        self.assertEqual(result["catalog"]["status"], "rebuilt")

        first = library.query(self.root, "route", limit=2)
        self.assertEqual(first["returned_count"], 2)
        self.assertTrue(first["has_more"])
        self.assertTrue(first["next_cursor"])
        self.assertLess(len(json.dumps(first, ensure_ascii=False).encode("utf-8")), 12000)
        second = library.query(self.root, "route", limit=2, cursor=first["next_cursor"])
        self.assertFalse(second["has_more"])
        self.assertIsNone(second["next_cursor"])
        cards = first["cards"] + second["cards"]
        self.assertEqual(len(cards), 4)
        self.assertEqual({card["kind"] for card in cards}, {"material", "method"})
        self.assertEqual(len({json.dumps(card["ref"], sort_keys=True) for card in cards}), 4)
        unit_cards = [card for card in cards if card["kind"] == "material"]
        self.assertEqual({card["ref"]["unit_key"] for card in unit_cards},
                         {"fixture-01", "fixture-02", "fixture-03"})
        self.assertTrue(all(card["source_ref"] is None for card in cards if card["kind"] == "method"))
        self.assertTrue(all("GROUP_NOTES_MUST_NOT_SPREAD" not in json.dumps(card, ensure_ascii=False)
                            for card in unit_cards))

    def test_progressive_query_soft_consumer_preference_and_same_binding_filters(self):
        self.add_bundle()
        candidates = library.query(self.root, "孤灯", kind="method", for_consumer="laohu-image")
        self.assertEqual(len(candidates["cards"]), 1)
        self.assertEqual(candidates["cards"][0]["consumer_status"], "not-registered")
        restricted = library.query(self.root, "孤灯", kind="method", for_consumer="laohu-image",
                                   registered_only=True)
        self.assertEqual(restricted["cards"], [])
        with self.assertRaisesRegex(library.LibraryError, "requires an explicit consumer"):
            library.query(self.root, "孤灯", registered_only=True)
        with self.assertRaisesRegex(library.LibraryError, "conflict"):
            library.query(self.root, "孤灯", for_consumer="laohu-image", consumer="laohu-writing")
        # Consumer and stage exist on different bindings in the same atom;
        # strict filters must be satisfied by one row, never combined loosely.
        mismatch = library.query(self.root, "孤灯", kind="method", consumer="laohu-writing", stage="selection")
        self.assertEqual(mismatch["cards"], [])

    def test_progressive_query_cursor_distinguishes_case_sensitive_stage_values(self):
        bundle = sample_bundle()
        atom = bundle["atoms"][0]
        draft_upper = copy.deepcopy(atom["consumer_bindings"][0])
        draft_lower = copy.deepcopy(atom["consumer_bindings"][0])
        draft_upper["stage"] = "Draft"
        draft_lower["stage"] = "draft"
        atom["consumer_bindings"] = [draft_upper, draft_lower]
        second = copy.deepcopy(atom)
        second["analysis"]["observed_unit"]["location"] = "fixture paragraph 3"
        bundle["atoms"].append(second)
        library.put_bundle(self.root, bundle)

        uppercase_page = library.query(self.root, "孤灯", kind="method", consumer="laohu-writing",
                                       stage="Draft", limit=1)
        lowercase_page = library.query(self.root, "孤灯", kind="method", consumer="laohu-writing",
                                       stage="draft", limit=1)
        self.assertTrue(uppercase_page["has_more"])
        self.assertTrue(lowercase_page["has_more"])
        self.assertNotEqual(uppercase_page["next_cursor"], lowercase_page["next_cursor"])
        with self.assertRaisesRegex(library.LibraryError, "does not match this query or filter"):
            library.query(self.root, "孤灯", kind="method", consumer="laohu-writing",
                          stage="draft", limit=1, cursor=uppercase_page["next_cursor"])

    def test_progressive_query_rejects_oversized_unit_key_card_without_echoing_value(self):
        root = self.root / "oversized-unit-key"
        bundle = bundle_with_units(1)
        long_unit_key = "fixture-" + ("k" * 50_000)
        bundle["source"]["provenance"]["independent_units"][0]["unit"] = long_unit_key
        saved = library.put_bundle(root, bundle)

        # Stable identifiers remain intact and directly readable; query must
        # fail rather than truncate the key or return an apparently empty page.
        detail = library.get_source(root, saved["source_ids"][0], unit=long_unit_key)
        self.assertEqual(detail["unit"]["unit"], long_unit_key)
        with self.assertRaisesRegex(library.LibraryError, "candidate metadata exceeds the 16 KiB serialized-card budget") as raised:
            library.query(root, "route", kind="material", limit=1)
        message = str(raised.exception)
        self.assertLess(len(message.encode("utf-8")), 256)
        self.assertNotIn(long_unit_key, message)

    def test_progressive_query_rejects_oversized_consumer_card_without_echoing_value(self):
        root = self.root / "oversized-consumer"
        bundle = sample_bundle()
        long_consumer = "laohu-" + ("c" * 50_000)
        bundle["atoms"][0]["consumer_bindings"][0]["consumer"] = long_consumer
        saved = library.put_bundle(root, bundle)

        atom = library.get_atom(root, saved["atom_ids"][0])
        self.assertEqual(atom["consumer_bindings"][0]["consumer"], long_consumer)
        with self.assertRaisesRegex(library.LibraryError, "candidate metadata exceeds the 16 KiB serialized-card budget") as raised:
            library.query(root, "孤灯", kind="method", limit=1)
        message = str(raised.exception)
        self.assertLess(len(message.encode("utf-8")), 256)
        self.assertNotIn(long_consumer, message)

    def test_progressive_query_does_not_parse_canonical_json_per_request(self):
        self.add_bundle()
        with mock.patch.object(library, "_load_json", side_effect=AssertionError("query parsed a record")), \
                mock.patch.object(library, "_all_sources", side_effect=AssertionError("query loaded all sources")), \
                mock.patch.object(library, "_all_atoms", side_effect=AssertionError("query loaded all atoms")):
            result = library.query(self.root, "孤灯", kind="method")
        self.assertEqual(result["returned_count"], 1)
        self.assertFalse(result["writes_performed"])

    def test_progressive_cli_info_query_and_scoped_detail_views(self):
        saved = library.put_bundle(self.root, bundle_with_units(2))
        atom_id = saved["atom_ids"][0]
        source_id = saved["source_ids"][0]

        def cli(*arguments):
            return subprocess.run(
                [sys.executable, str(SCRIPT), "--library-root", str(self.root), *arguments],
                cwd=ROOT, capture_output=True, text=True,
                env={**os.environ, "TMPDIR": str(TMP), "PYTHONDONTWRITEBYTECODE": "1"},
            )

        info_result = cli("info")
        self.assertEqual(info_result.returncode, 0, info_result.stderr)
        self.assertEqual(json.loads(info_result.stdout)["catalog_state"], "current")

        query_result = cli("query", "route", "--kind", "material", "--limit", "1")
        self.assertEqual(query_result.returncode, 0, query_result.stderr)
        query_data = json.loads(query_result.stdout)
        self.assertEqual(query_data["returned_count"], 1)
        self.assertTrue(query_data["has_more"])
        self.assertEqual(query_data["cards"][0]["ref"]["type"], "material_unit")

        source_result = cli("get-source", source_id, "--unit", "fixture-01")
        self.assertEqual(source_result.returncode, 0, source_result.stderr)
        source_data = json.loads(source_result.stdout)
        self.assertEqual(source_data["view"], "material")
        self.assertFalse(source_data["raw_excerpt_available"])
        self.assertNotIn("fixture-02", json.dumps(source_data, ensure_ascii=False))
        self.assertNotIn("captured_excerpt", source_data)

        atom_result = cli("get-atom", atom_id, "--view", "decision", "--consumer", "laohu-image")
        self.assertEqual(atom_result.returncode, 0, atom_result.stderr)
        atom_data = json.loads(atom_result.stdout)
        self.assertEqual(atom_data["binding_context"]["status"], "not-registered")
        self.assertEqual(atom_data["binding_context"]["matches"], [])

    def test_info_and_query_report_missing_stale_and_pending_catalog_without_repair(self):
        missing = self.root / "missing-progressive-catalog"
        self.assertEqual(library.info(missing)["catalog_state"], "missing")
        self.assertFalse(missing.exists())
        with self.assertRaisesRegex(library.LibraryError, "does not exist"):
            library.query(missing, "fixture")
        self.assertFalse(missing.exists())

        result = self.add_bundle()
        self.assertEqual(library.info(self.root)["catalog_state"], "current")
        catalog = self.root / "catalog.sqlite3"
        original = catalog.read_bytes()
        source_path = library.source_path(self.root, result["source_ids"][0])
        source_path.write_bytes(source_path.read_bytes() + b" ")
        self.assertEqual(library.info(self.root)["catalog_state"], "stale")
        with self.assertRaisesRegex(library.LibraryError, "inventory changed"):
            library.query(self.root, "孤灯")
        self.assertEqual(catalog.read_bytes(), original)

        transaction = self.root / ".transactions" / ("TXN-" + "a" * 32)
        transaction.mkdir(parents=True)
        (transaction / "journal.json").write_text("{}", encoding="utf-8")
        self.assertEqual(library.info(self.root)["catalog_state"], "pending")
        with self.assertRaisesRegex(library.LibraryError, "pending transaction"):
            library.query(self.root, "孤灯")
        self.assertTrue(transaction.exists())
        self.assertEqual(catalog.read_bytes(), original)

    def test_managed_writes_update_catalog_and_invalidate_old_cursor(self):
        bundle = bundle_with_units(3)
        library.put_bundle(self.root, bundle)
        first = library.query(self.root, "route", limit=1)
        old_cursor = first["next_cursor"]
        old_revision = first["revision"]
        second = source_only_bundle()
        second["source"]["identity"]["title"] = "Second technical fixture"
        second["source"]["provenance"]["locator"] = "fixture://source/second"
        second["source"]["source_material"]["reference"] = "fixture://source/second"
        second["source"]["notes"] = "second_source_lookup_term"
        saved = library.put_bundle(self.root, second)
        self.assertEqual(saved["catalog"]["status"], "rebuilt")
        self.assertNotEqual(library.info(self.root)["catalog_revision"], old_revision)
        with self.assertRaisesRegex(library.LibraryError, "older library revision"):
            library.query(self.root, "route", limit=1, cursor=old_cursor)
        self.assertEqual(library.query(self.root, "second_source_lookup_term")["returned_count"], 1)

    def test_source_unit_views_isolate_one_unit_and_only_return_verified_excerpt(self):
        bundle = bundle_with_units(17)
        source = bundle["source"]
        unit = source["provenance"]["independent_units"][0]
        unit["verified_span"] = {
            "source_version": source["source_material"]["version"],
            "start": 0, "end": len("Synthetic"),
            "sha256": hashlib.sha256("Synthetic".encode("utf-8")).hexdigest(),
        }
        saved = library.put_bundle(self.root, bundle)
        source_id = saved["source_ids"][0]

        default_unit = library.get_source(self.root, source_id, unit="fixture-01")
        serialized = json.dumps(default_unit, ensure_ascii=False)
        self.assertEqual(default_unit["view"], "material")
        self.assertEqual(default_unit["raw_excerpt_available"], True)
        self.assertEqual(default_unit["raw_excerpt"], "Synthetic")
        self.assertNotIn("captured_excerpt", serialized)
        self.assertNotIn("fixture-02", serialized)
        self.assertNotIn("fixture-17", serialized)
        self.assertNotIn("private sibling", serialized)

        analysis = library.get_source(self.root, source_id, unit="fixture-01", view="analysis")
        analysis_text = json.dumps(analysis, ensure_ascii=False)
        self.assertIn("Synthetic unit-only analysis sentinel 01", analysis_text)
        self.assertNotIn("Synthetic unit-only analysis sentinel 02", analysis_text)
        self.assertNotIn("captured_excerpt", analysis_text)

        unverified = library.get_source(self.root, source_id, unit="fixture-02", view="material")
        self.assertFalse(unverified["raw_excerpt_available"])
        self.assertNotIn("raw_excerpt", unverified)
        self.assertEqual(unverified["locator"], "fixture://unit/02")

    def test_source_without_stable_unit_keys_uses_whole_source_fallback(self):
        bundle = bundle_with_units(1)
        del bundle["source"]["provenance"]["independent_units"][0]["unit"]
        saved = library.put_bundle(self.root, bundle)
        cards = library.query(self.root, "Fixture Work", kind="material")["cards"]
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["ref"], {"type": "source", "source_id": saved["source_ids"][0]})
        with self.assertRaisesRegex(library.LibraryError, "lack stable keys"):
            library.get_source(self.root, saved["source_ids"][0], unit="fixture-01")

    def test_detail_views_include_real_basis_and_do_not_invent_bindings_or_links(self):
        saved = library.put_bundle(self.root, bundle_with_units(2))
        atom_id = saved["atom_ids"][0]
        method = library.query(self.root, "孤灯", kind="method")["cards"][0]
        self.assertIsNone(method["source_ref"])
        decision = library.get_atom(self.root, atom_id, view="decision", consumer="laohu-image")
        self.assertEqual(decision["binding_context"]["status"], "not-registered")
        self.assertEqual(decision["binding_context"]["matches"], [])
        self.assertIn("common_conditions", decision)
        self.assertEqual(decision["source_basis"]["unit_linkage"], "unknown")
        self.assertEqual(decision["record_revision"], library._record_revision(library.get_atom(self.root, atom_id)))
        self.assertNotEqual(decision["revision"], decision["record_revision"])
        self.assertTrue(decision["basis_revision"])

        linked = bundle_with_units(2)
        linked["source"]["identity"]["title"] = "Linked technical fixture"
        linked["source"]["provenance"]["locator"] = "fixture://source/linked"
        linked["source"]["source_material"]["reference"] = "fixture://source/linked"
        linked["atoms"][0]["analysis"]["observed_unit"]["source_unit_ref"] = {"unit_key": "fixture-02"}
        linked_saved = library.put_bundle(self.root, linked)
        linked_cards = library.query(self.root, "孤灯", kind="method")["cards"]
        linked_card = next(card for card in linked_cards if card["ref"]["source_id"] == linked_saved["source_ids"][0])
        self.assertEqual(linked_card["source_ref"], {"type": "material_unit", "source_id": linked_saved["source_ids"][0], "unit_key": "fixture-02"})

    def test_unit_and_decision_revision_track_source_basis_changes(self):
        saved = library.put_bundle(self.root, bundle_with_units(1))
        source_id = saved["source_ids"][0]
        atom_id = saved["atom_ids"][0]
        card = library.query(self.root, "route", kind="material")["cards"][0]
        unit_detail = library.get_source(self.root, source_id, unit="fixture-01")
        self.assertEqual(card["revision"], unit_detail["record_revision"])
        self.assertEqual(card["source_revision"], unit_detail["basis_revision"])
        old_pack = library.get_atom(self.root, atom_id, view="decision")

        source_file = library.source_path(self.root, source_id)
        source_record = json.loads(source_file.read_text(encoding="utf-8"))
        source_record["provenance"]["access_scope"] = "changed technical fixture scope"
        source_file.write_text(json.dumps(source_record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        library.rebuild_index(self.root)
        new_pack = library.get_atom(self.root, atom_id, view="decision")
        self.assertEqual(new_pack["record_revision"], old_pack["record_revision"])
        self.assertNotEqual(new_pack["basis_revision"], old_pack["basis_revision"])
        self.assertNotEqual(new_pack["revision"], old_pack["revision"])

    def test_rejected_verified_span_does_not_write_source(self):
        bundle = bundle_with_units(1)
        unit = bundle["source"]["provenance"]["independent_units"][0]
        unit["verified_span"] = {"source_version": "wrong-version", "start": 0, "end": 3,
                                 "sha256": "0" * 64}
        with self.assertRaisesRegex(library.LibraryError, "does not match"):
            library.put_bundle(self.root, bundle)
        self.assertFalse((self.root / "sources").exists())

    def test_catalog_rebuild_failure_keeps_old_cache_available(self):
        self.add_bundle()
        catalog = self.root / "catalog.sqlite3"
        original = catalog.read_bytes()
        with mock.patch.object(library, "_catalog_cards", side_effect=RuntimeError("fixture catalog failure")):
            with self.assertRaisesRegex(RuntimeError, "fixture catalog failure"):
                library.rebuild_index(self.root)
        self.assertEqual(catalog.read_bytes(), original)
        self.assertEqual(library.info(self.root)["catalog_state"], "current")

    def test_workspace_ignore_rules_keep_all_root_benchmark_data_local(self):
        isolation_root = TMP / "benchmark-local-only"
        isolation_root.mkdir(parents=True, exist_ok=True)
        ignored_paths = [
            "benchmark/sources/SRC-0123456789ABCDEF.json",
            "benchmark/language/atoms/ATM-0123456789ABCDEF.json",
            "benchmark/language/usage/2026-11.jsonl",
            "benchmark/language/index.sqlite3",
            "benchmark/language/index.sqlite3-wal",
            "benchmark/language/index.sqlite3-shm",
            "benchmark/language/.index.sqlite3.0123456789abcdef.tmp",
            "benchmark/manifest.json",
            "benchmark/exports/atom-bundle.json",
            "benchmark/arbitrary.db",
            "benchmark/media/source-sample.bin",
            "benchmark/future/unknown/nested-record.toml",
            "benchmark/.transactions/TXN-0123456789abcdef0123456789abcdef/journal.json",
            "benchmark/.library.lock",
            "benchmark/.library.lock.stale-123456",
        ]
        visible_paths = [
            "benchmark/README.md",
            ".agents/skills/laohu-benchmark/SKILL.md",
            ".agents/skills/laohu-benchmark/scripts/library.py",
            ".agents/skills/laohu-benchmark/manifest.json",
            ".agents/skills/laohu-benchmark/schemas/source.schema.json",
        ]
        with tempfile.TemporaryDirectory(dir=isolation_root) as temp_dir:
            sandbox = Path(temp_dir)
            repo = sandbox / "repo"
            repo.mkdir()
            template = sandbox / "empty-template"
            template.mkdir()
            empty_global = sandbox / "empty-global.gitconfig"
            empty_global.write_text("", encoding="utf-8")
            env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
            env["GIT_CONFIG_NOSYSTEM"] = "1"
            env["GIT_CONFIG_GLOBAL"] = str(empty_global)
            init = subprocess.run(
                ["git", "init", "--quiet", "--template", str(template), str(repo)],
                capture_output=True, text=True, env=env,
            )
            self.assertEqual(init.returncode, 0, init.stderr)
            (repo / ".gitignore").write_text((ROOT / ".gitignore").read_text(encoding="utf-8"), encoding="utf-8")
            git_info = repo / ".git/info"
            git_info.mkdir(parents=True, exist_ok=True)
            (git_info / "exclude").write_text("", encoding="utf-8")
            for relative in ignored_paths + visible_paths:
                path = repo / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("synthetic ignore-policy fixture", encoding="utf-8")

            def is_ignored(relative):
                result = subprocess.run(
                    ["git", "-C", str(repo), "-c", f"core.excludesFile={empty_global}",
                     "check-ignore", "--no-index", "--quiet", "--", relative],
                    capture_output=True, text=True, env=env,
                )
                self.assertIn(result.returncode, (0, 1), result.stderr)
                return result.returncode == 0

            for relative in ignored_paths:
                with self.subTest(path=relative):
                    self.assertTrue(is_ignored(relative), f"expected ignored: {relative}")
            for relative in visible_paths:
                with self.subTest(path=relative):
                    self.assertFalse(is_ignored(relative), f"must remain shareable: {relative}")


if __name__ == "__main__":
    unittest.main()
