"""Offline interface checks for the motion SFX source adapter."""

import hashlib
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[4]
ADAPTER_PATH = ROOT / ".agents" / "skills" / "laohu-motion" / "scripts" / "sfx-sources.py"
SPEC = importlib.util.spec_from_file_location("sfx_sources_under_test", ADAPTER_PATH)
ADAPTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ADAPTER)


def fake_ffprobe(path, duration="0.25", codec="vorbis", format_name="ogg"):
    path.write_text(
        "#!/bin/sh\nif [ \"$1\" = \"-version\" ]; then printf 'ffprobe version fixture\\n'; exit 0; fi\nprintf '%s\\n' '{\"streams\":[{\"codec_type\":\"audio\",\"codec_name\":\""
        + codec
        + "\",\"sample_rate\":\"48000\",\"channels\":1}],\"format\":{\"format_name\":\""
        + format_name
        + "\",\"duration\":\""
        + duration
        + "\"}}'\n",
        encoding="utf-8",
    )
    path.chmod(0o755)


def fake_probe_unavailable(path):
    path.write_text(
        "#!/bin/sh\nprintf '%s\\n' 'dyld: Library not loaded: libfixture-missing.dylib' >&2\nexit 127\n",
        encoding="utf-8",
    )
    path.chmod(0o755)


def fake_invalid_media_ffprobe(path):
    path.write_text(
        "#!/bin/sh\nif [ \"$1\" = \"-version\" ]; then printf 'ffprobe version fixture\\n'; exit 0; fi\nprintf '%s\\n' 'Invalid data found when processing input' >&2\nexit 1\n",
        encoding="utf-8",
    )
    path.chmod(0o755)


class SfxSourcesInterfaceTests(unittest.TestCase):
    def make_project(self, temp_root):
        project = temp_root / "project"
        index_dir = project / "assets" / "audio"
        index_dir.mkdir(parents=True)
        audio = index_dir / "wood-latch.ogg"
        audio.write_bytes(b"offline fake media used only with the fake ffprobe")
        checksum = hashlib.sha256(audio.read_bytes()).hexdigest()
        index = {
            "schemaVersion": 1,
            "assets": [{
                "id": "project.wood-latch",
                "file": audio.name,
                "tags": ["wood", "latch", "closure"],
                "material": "wood and metal contact",
                "durationSec": 0.2,
                "sha256": checksum,
                "license": "CC0-1.0",
                "redistribution": {"status": "redistributable", "basis": "fixture license record"},
                "reviewStatus": "candidate-unreviewed",
                "source": {"page": "https://example.invalid/source"},
            }],
        }
        index_path = index_dir / "index.json"
        index_path.write_text(json.dumps(index), encoding="utf-8")
        return project, audio, index, index_path

    def run_local(self, project, index_path, probe_path, review_scope=None):
        command = [
            sys.executable,
            str(ADAPTER_PATH),
            "local-search",
            "--query", "wood latch",
            "--work-root", str(project),
            "--index", str(index_path),
            "--ffprobe", str(probe_path),
        ]
        if review_scope is not None:
            command.extend(["--review-scope", review_scope])
        return subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
            env=os.environ.copy(),
        )

    def run_groups(self, project, index_path, **options):
        return self.run_groups_with_indexes(project, [index_path], **options)

    def run_groups_with_indexes(self, project, index_paths, **options):
        command = [
            sys.executable,
            str(ADAPTER_PATH),
            "local-groups",
            "--work-root", str(project),
        ]
        for index_path in index_paths:
            command.extend(["--index", str(index_path)])
        for key, value in options.items():
            flag = "--" + key.replace("_", "-")
            if value is not None:
                command.extend([flag, str(value)])
        return subprocess.run(command, capture_output=True, text=True, check=False, env=os.environ.copy())

    def add_candidate_group_fixture(self, index, project):
        audio_dir = project / "assets" / "audio"
        metal_file = audio_dir / "metal-contact.ogg"
        metal_file.write_bytes(b"offline second fixture media")
        metal_asset = json.loads(json.dumps(index["assets"][0]))
        metal_asset.update({
            "id": "project.metal-contact",
            "file": metal_file.name,
            "tags": ["metal", "impact", "contact"],
            "material": "metal",
            "energy": "light",
            "durationSec": 0.2,
            "sha256": hashlib.sha256(metal_file.read_bytes()).hexdigest(),
            "reviewStatus": "candidate-unreviewed",
        })
        index["assets"].append(metal_asset)
        index["candidateGroups"] = [{
            "id": "short-contact-impact",
            "purpose": "A brief single-surface contact.",
            "keywords": ["impact", "contact", "landing"],
            "applicability": ["single contact"],
            "excludeWhen": ["sustained movement"],
            "default": {
                "assetId": "project.wood-latch",
                "when": "wood landing",
                "actions": ["land", "contact"],
                "materials": ["wood"],
                "intensities": ["light"],
            },
            "alternatives": [{
                "assetId": "project.metal-contact",
                "when": "metal landing",
                "actions": ["land", "contact"],
                "materials": ["metal"],
                "intensities": ["light"],
            }],
        }]
        return metal_file

    def test_local_search_rejects_invalid_index_roots_and_asset_members_as_json(self):
        temp_base = Path(os.environ["TMPDIR"])
        invalid_documents = (
            ("null-root", None),
            ("list-root", []),
            ("null-asset-member", {"schemaVersion": 1, "assets": [None]}),
        )
        for label, document in invalid_documents:
            with self.subTest(case=label), tempfile.TemporaryDirectory(prefix="sfx-local-search-invalid-index-", dir=temp_base) as name:
                temp_root = Path(name)
                project, _audio, _index, index_path = self.make_project(temp_root)
                index_path.write_text(json.dumps(document), encoding="utf-8")
                probe = temp_root / "ffprobe-fixture"
                fake_ffprobe(probe)

                result = self.run_local(project, index_path, probe)

                self.assertEqual(result.returncode, 4)
                self.assertEqual(result.stderr, "")
                output = json.loads(result.stdout)
                self.assertEqual(output["operation"], "local-search")
                self.assertEqual(output["status"], "index_error")
                self.assertEqual(output["results"], [])
                self.assertEqual(len(output["errors"]), 1)
                if label in {"null-root", "list-root"}:
                    self.assertIn("asset index must be a JSON object", output["errors"][0]["error"])
                else:
                    self.assertIn("every indexed asset must be an object", output["errors"][0]["error"])

    def test_local_search_returns_checked_plan_asset_without_listening_claim(self):
        temp_base = Path(os.environ["TMPDIR"])
        with tempfile.TemporaryDirectory(prefix="sfx-interface-", dir=temp_base) as name:
            temp_root = Path(name)
            project, audio, _index, index_path = self.make_project(temp_root)
            indexed = json.loads(index_path.read_text(encoding="utf-8"))
            indexed["candidateGroups"] = [{
                "id": "fixture-closure",
                "purpose": "Fixture closure contact",
                "keywords": ["wood", "latch"],
                "applicability": ["brief closure"],
                "excludeWhen": [],
                "default": {"assetId": "project.wood-latch", "when": "wood latch", "actions": ["close"], "materials": ["wood"], "intensities": []},
                "alternatives": [],
            }]
            index_path.write_text(json.dumps(indexed), encoding="utf-8")
            probe = temp_root / "ffprobe-fixture"
            fake_ffprobe(probe)
            result = self.run_local(project, index_path, probe)
            self.assertEqual(result.returncode, 0, result.stderr)
            document = json.loads(result.stdout)
            self.assertEqual(document["schemaVersion"], 1)
            self.assertEqual(document["operation"], "local-search")
            self.assertEqual(document["status"], "ok")
            candidate = document["results"][0]
            self.assertEqual(candidate["assetId"], "project.wood-latch")
            self.assertEqual(candidate["durationSec"], 0.25)
            self.assertEqual(candidate["sha256"], hashlib.sha256(audio.read_bytes()).hexdigest())
            self.assertEqual(candidate["reviewStatus"], "candidate-unreviewed")
            self.assertEqual(candidate["audioPlanAsset"]["file"], "assets/audio/wood-latch.ogg")
            self.assertEqual(candidate["audioPlanAsset"]["durationSec"], 0.25)

    def test_local_groups_valid_references_preserve_candidate_review_state_and_filter_with_reasons(self):
        temp_base = Path(os.environ["TMPDIR"])
        with tempfile.TemporaryDirectory(prefix="sfx-groups-fit-", dir=temp_base) as name:
            temp_root = Path(name)
            project, _audio, index, index_path = self.make_project(temp_root)
            self.add_candidate_group_fixture(index, project)
            index_path.write_text(json.dumps(index), encoding="utf-8")

            result = self.run_groups(
                project, index_path, group_id="short-contact-impact", action="landing",
                material="wood", intensity="light", max_source_duration_sec="0.3",
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            document = json.loads(result.stdout)
            self.assertEqual(document["operation"], "local-groups")
            self.assertEqual(document["status"], "ok")
            group = document["results"][0]
            rows = {row["assetId"]: row for row in group["candidates"]}
            self.assertEqual(set(rows), {"project.wood-latch", "project.metal-contact"})
            self.assertEqual(rows["project.wood-latch"]["kind"], "default")
            self.assertEqual(rows["project.wood-latch"]["status"], "matched")
            self.assertTrue(rows["project.wood-latch"]["matchReasons"])
            self.assertEqual(rows["project.wood-latch"]["reviewStatus"], "candidate-unreviewed")
            self.assertEqual(rows["project.metal-contact"]["kind"], "alternative")
            self.assertEqual(rows["project.metal-contact"]["status"], "excluded")
            self.assertTrue(any("material" in reason for reason in rows["project.metal-contact"]["exclusionReasons"]))
            self.assertEqual(rows["project.metal-contact"]["reviewStatus"], "candidate-unreviewed")
            persisted = json.loads(index_path.read_text(encoding="utf-8"))
            self.assertTrue(all(asset["reviewStatus"] == "candidate-unreviewed" for asset in persisted["assets"]))

    def test_local_groups_unknown_group_fails_explicitly(self):
        temp_base = Path(os.environ["TMPDIR"])
        with tempfile.TemporaryDirectory(prefix="sfx-groups-unknown-", dir=temp_base) as name:
            temp_root = Path(name)
            project, _audio, index, index_path = self.make_project(temp_root)
            self.add_candidate_group_fixture(index, project)
            index_path.write_text(json.dumps(index), encoding="utf-8")
            result = self.run_groups(project, index_path, group_id="does-not-exist")
            self.assertEqual(result.returncode, 4)
            document = json.loads(result.stdout)
            self.assertEqual(document["status"], "unknown_group")
            self.assertEqual(document["groupId"], "does-not-exist")

    def test_local_groups_unreadable_index_returns_index_error_not_unknown_group(self):
        temp_base = Path(os.environ["TMPDIR"])
        for malformed_kind in ("missing", "invalid-json"):
            with self.subTest(kind=malformed_kind), tempfile.TemporaryDirectory(prefix="sfx-groups-index-error-", dir=temp_base) as name:
                temp_root = Path(name)
                project, _audio, _index, _index_path = self.make_project(temp_root)
                malformed = temp_root / "unreadable-index.json"
                if malformed_kind == "invalid-json":
                    malformed.write_text("{ invalid json\n", encoding="utf-8")
                result = self.run_groups(project, malformed, group_id="does-not-exist")
                self.assertEqual(result.returncode, 4)
                document = json.loads(result.stdout)
                self.assertEqual(document["status"], "index_error")
                self.assertEqual(document["groupId"], "does-not-exist")
                self.assertTrue(document["errors"])
                self.assertEqual(document["results"], [])
                self.assertEqual(result.stderr, "")

    def test_local_groups_keeps_successful_index_results_and_read_errors(self):
        temp_base = Path(os.environ["TMPDIR"])
        with tempfile.TemporaryDirectory(prefix="sfx-groups-partial-index-", dir=temp_base) as name:
            temp_root = Path(name)
            project, _audio, index, index_path = self.make_project(temp_root)
            self.add_candidate_group_fixture(index, project)
            index_path.write_text(json.dumps(index), encoding="utf-8")
            missing = temp_root / "another-index.json"
            result = self.run_groups_with_indexes(
                project, [index_path, missing], group_id="short-contact-impact",
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            document = json.loads(result.stdout)
            self.assertEqual(document["status"], "ok")
            self.assertEqual(len(document["results"]), 1)
            self.assertEqual(document["results"][0]["groupId"], "short-contact-impact")
            self.assertEqual(len(document["errors"]), 1)
            self.assertIn("No such file", document["errors"][0]["error"])

    def test_local_groups_rejects_nonobject_asset_members_as_structured_index_error(self):
        temp_base = Path(os.environ["TMPDIR"])
        for member in (None, "not-an-object"):
            with self.subTest(member=member), tempfile.TemporaryDirectory(prefix="sfx-groups-invalid-asset-", dir=temp_base) as name:
                temp_root = Path(name)
                project, _audio, _index, _index_path = self.make_project(temp_root)
                invalid_index = project / "assets" / "audio" / "invalid-index.json"
                invalid_index.write_text(json.dumps({
                    "schemaVersion": 1,
                    "assets": [member],
                    "candidateGroups": [],
                }), encoding="utf-8")
                result = self.run_groups(project, invalid_index, group_id="does-not-exist")
                self.assertEqual(result.returncode, 4)
                document = json.loads(result.stdout)
                self.assertEqual(document["status"], "index_error")
                self.assertTrue(any("every indexed asset must be an object" in error["error"] for error in document["errors"]))
                self.assertEqual(result.stderr, "")

    def test_local_groups_rejects_nonobject_index_root_as_structured_index_error(self):
        temp_base = Path(os.environ["TMPDIR"])
        with tempfile.TemporaryDirectory(prefix="sfx-groups-invalid-root-", dir=temp_base) as name:
            temp_root = Path(name)
            project, _audio, _index, index_path = self.make_project(temp_root)
            index_path.write_text("[]\n", encoding="utf-8")
            result = self.run_groups(project, index_path, group_id="does-not-exist")
            self.assertEqual(result.returncode, 4)
            document = json.loads(result.stdout)
            self.assertEqual(document["status"], "index_error")
            self.assertTrue(any("asset index must be a JSON object" in error["error"] for error in document["errors"]))
            self.assertEqual(result.stderr, "")

    def test_local_groups_negative_and_compound_conditions_are_unconfirmed_not_substring_matches(self):
        temp_base = Path(os.environ["TMPDIR"])
        with tempfile.TemporaryDirectory(prefix="sfx-groups-negative-fit-", dir=temp_base) as name:
            temp_root = Path(name)
            project, _audio, index, index_path = self.make_project(temp_root)
            self.add_candidate_group_fixture(index, project)
            index_path.write_text(json.dumps(index), encoding="utf-8")

            for material in ("non-metal", "wood and metal"):
                with self.subTest(material=material):
                    result = self.run_groups(project, index_path, group_id="short-contact-impact", material=material)
                    self.assertEqual(result.returncode, 0, result.stderr)
                    group = json.loads(result.stdout)["results"][0]
                    metal = next(row for row in group["candidates"] if row["assetId"] == "project.metal-contact")
                    self.assertEqual(metal["status"], "unconfirmed")
                    self.assertFalse(metal["matchReasons"])
                    self.assertTrue(any("exact known value" in reason for reason in metal["uncertainties"]))

            result = self.run_groups(project, index_path, group_id="short-contact-impact", action="landing contact")
            self.assertEqual(result.returncode, 0, result.stderr)
            group = json.loads(result.stdout)["results"][0]
            self.assertTrue(all(row["status"] == "unconfirmed" for row in group["candidates"]))
            self.assertTrue(all(not row["matchReasons"] for row in group["candidates"]))
            self.assertTrue(all(any("exact known value" in reason for reason in row["uncertainties"]) for row in group["candidates"]))

            interface = self.run_groups(project, ADAPTER.DEFAULT_INDEX, group_id="interface-feedback", action="no click")
            self.assertEqual(interface.returncode, 0, interface.stderr)
            candidate = json.loads(interface.stdout)["results"][0]["candidates"][0]
            self.assertEqual(candidate["status"], "unconfirmed")
            self.assertFalse(candidate["matchReasons"])
            self.assertTrue(any("exact known value" in reason for reason in candidate["uncertainties"]))

    def test_wyzowl_source_guidance_survives_indexing_and_local_search(self):
        document = json.loads(ADAPTER.DEFAULT_INDEX.read_text(encoding="utf-8"))
        assets = {asset["id"]: asset for asset in document["assets"]}
        expected = {
            "wyzowl.whoosh-medium-soft": (0.229, "move-peak", [0.85, 1.2]),
            "wyzowl.whoosh-medium-hard": (0.201, "move-peak", [0.85, 1.2]),
            "wyzowl.impact-light-firm": (0.011, "instant", [0.92, 1.1]),
            "wyzowl.notification-success-soft": (0, "instant", [1, 1]),
            "wyzowl.sting-minimal-short": (0.1, "instant", [1, 1]),
        }
        for asset_id, (sync_at, sync_meets, rate) in expected.items():
            with self.subTest(asset=asset_id):
                asset = assets[asset_id]
                source = asset["source"]
                self.assertEqual(asset["hitTimeSec"], sync_at)
                self.assertEqual(source["sync"]["at"], sync_at)
                self.assertEqual(source["sync"]["meets"], sync_meets)
                self.assertIn("how", source["sync"])
                self.assertIsInstance(source["timing"], dict)
                self.assertEqual(source["adapt"]["rate"], rate)
                self.assertTrue(source["adapt"]["notes"])
                self.assertTrue(source["use_for"])
                self.assertTrue(source["avoid_for"])
                self.assertIsNotNone(source["under_voiceover_db"])
                self.assertTrue(source["manifestTags"])
                self.assertEqual(asset["reviewStatus"], "candidate-unreviewed")
                self.assertIn("loudest 150 ms", source["levelMeasurement"])
                self.assertIn("not integrated LUFS", source["levelMeasurement"])
                self.assertAlmostEqual(asset["durationSec"], source["sourceDeclaredLengthSec"], places=2)
        self.assertEqual(assets["wyzowl.notification-success-soft"]["source"]["tuning"], "C major pentatonic")
        sting = assets["wyzowl.sting-minimal-short"]["source"]
        self.assertIn("300 ms or more", sting["adapt"]["notes"])
        self.assertTrue(any("Mid-film" in item for item in sting["avoid_for"]))

        temp_base = Path(os.environ["TMPDIR"])
        with tempfile.TemporaryDirectory(prefix="sfx-wyzowl-consumer-", dir=temp_base) as name:
            probe = Path(name) / "ffprobe-wav"
            fake_ffprobe(probe, duration="0.5425", codec="pcm_s24le", format_name="wav")
            result = subprocess.run([
                sys.executable, str(ADAPTER_PATH), "local-search",
                "--query", "whoosh-medium-soft", "--work-root", str(ROOT),
                "--index", str(ADAPTER.DEFAULT_INDEX), "--ffprobe", str(probe),
            ], capture_output=True, text=True, check=False, env=os.environ.copy())
            self.assertEqual(result.returncode, 0, result.stderr)
            rows = json.loads(result.stdout)["results"]
            selected = next(row for row in rows if row["assetId"] == "wyzowl.whoosh-medium-soft")
            self.assertEqual(selected["source"]["sync"]["at"], 0.229)
            self.assertEqual(selected["source"]["sync"]["meets"], "move-peak")
            self.assertEqual(selected["source"]["adapt"]["rate"], [0.85, 1.2])
            self.assertEqual(selected["reviewStatus"], "candidate-unreviewed")

    def test_bundled_candidate_groups_cover_current_assets_with_valid_default_and_alternative_refs(self):
        document = json.loads(ADAPTER.DEFAULT_INDEX.read_text(encoding="utf-8"))
        assets = {asset["id"]: asset for asset in document["assets"]}
        groups = document["candidateGroups"]
        self.assertEqual(len(groups), 10)
        self.assertEqual(len({group["id"] for group in groups}), len(groups))
        referenced = []
        for group in groups:
            with self.subTest(group=group["id"]):
                self.assertIsInstance(group["default"], dict)
                self.assertIn(group["default"]["assetId"], assets)
                self.assertIsInstance(group["alternatives"], list)
                referenced.append(group["default"]["assetId"])
                for candidate in group["alternatives"]:
                    self.assertIn(candidate["assetId"], assets)
                    referenced.append(candidate["assetId"])
        self.assertEqual(set(referenced), set(assets))
        self.assertEqual(len(referenced), len(set(referenced)))
        self.assertEqual({asset["reviewStatus"] for asset in assets.values()}, {"candidate-unreviewed"})

    def test_local_search_reuses_only_an_exact_full_file_review_after_group_metadata_addition(self):
        temp_base = Path(os.environ["TMPDIR"])
        with tempfile.TemporaryDirectory(prefix="sfx-review-exact-local-", dir=temp_base) as name:
            temp_root = Path(name)
            project, _audio, index, index_path = self.make_project(temp_root)
            self.add_candidate_group_fixture(index, project)
            asset = index["assets"][0]
            asset["reviewStatus"] = "ready"
            asset["reviewRecord"] = {
                "fileSha256": asset["sha256"],
                "applicableScope": "wood latch closure",
                "sourceRange": {"inSec": 0.0, "outSec": 0.25},
                "reviewer": "reviewer-42",
                "conclusion": "pass",
            }
            index_path.write_text(json.dumps(index), encoding="utf-8")
            probe = temp_root / "ffprobe-fixture"
            fake_ffprobe(probe, duration="0.25")
            result = self.run_local(project, index_path, probe, review_scope="wood latch closure")
            self.assertEqual(result.returncode, 0, result.stderr)
            row = json.loads(result.stdout)["results"][0]
            self.assertEqual(row["reviewReuseStatus"], "reused-exact-scope-and-file-hash")
            self.assertEqual(row["reviewStatus"], "ready")

    def test_local_search_preserves_sync_only_boundary_and_rejects_missing_basis(self):
        temp_base = Path(os.environ["TMPDIR"])
        with tempfile.TemporaryDirectory(prefix="sfx-rights-boundary-", dir=temp_base) as name:
            temp_root = Path(name)
            project, _audio, index, index_path = self.make_project(temp_root)
            audio_dir = index_path.parent
            allowed_sync = index["assets"][0]
            allowed_sync["id"] = "project.sync-only-latch"
            allowed_sync["license"] = "CC-BY-4.0"
            allowed_sync["redistribution"] = {
                "status": "not-authorized-for-redistribution",
                "syncUse": "allowed",
                "basis": "fixture permits synchronization but prohibits source-file redistribution",
            }
            sync_only_file = audio_dir / "sync-only-latch.ogg"
            sync_only_file.write_bytes(b"sync-only fake audio bytes")
            sync_only = json.loads(json.dumps(allowed_sync))
            sync_only.update({
                "id": "project.sync-only-status",
                "file": sync_only_file.name,
                "sha256": hashlib.sha256(sync_only_file.read_bytes()).hexdigest(),
                "redistribution": {
                    "status": "sync-only",
                    "syncUse": "allowed",
                    "notes": "may be synchronized but source file is not redistributed",
                },
            })
            missing_basis_file = audio_dir / "latch-without-rights-basis.ogg"
            missing_basis_file.write_bytes(b"separate fake audio bytes")
            missing_basis = json.loads(json.dumps(allowed_sync))
            missing_basis.update({
                "id": "project.missing-rights-basis",
                "file": missing_basis_file.name,
                "sha256": hashlib.sha256(missing_basis_file.read_bytes()).hexdigest(),
                "license": "CC0-1.0",
                "redistribution": {"status": "redistributable", "syncUse": "allowed"},
            })
            index["assets"] = [allowed_sync, sync_only, missing_basis]
            index_path.write_text(json.dumps(index), encoding="utf-8")
            probe = temp_root / "ffprobe-fixture"
            fake_ffprobe(probe)

            result = self.run_local(project, index_path, probe)
            self.assertEqual(result.returncode, 0, result.stderr)
            document = json.loads(result.stdout)
            self.assertEqual(document["status"], "ok")
            rows = {row["assetId"]: row for row in document["results"]}
            sync_row = rows["project.sync-only-latch"]
            self.assertEqual(sync_row["status"], "candidate")
            self.assertEqual(sync_row["audioPlanAsset"]["redistribution"]["status"], "not-authorized-for-redistribution")
            self.assertEqual(sync_row["audioPlanAsset"]["redistribution"]["syncUse"], "allowed")
            sync_only_row = rows["project.sync-only-status"]
            self.assertEqual(sync_only_row["status"], "candidate")
            self.assertEqual(sync_only_row["audioPlanAsset"]["redistribution"]["status"], "sync-only")
            missing_row = rows["project.missing-rights-basis"]
            self.assertEqual(missing_row["status"], "rights_unverified")
            self.assertIsNone(missing_row["audioPlanAsset"])

    def test_local_search_rejects_hash_mismatch(self):
        temp_base = Path(os.environ["TMPDIR"])
        with tempfile.TemporaryDirectory(prefix="sfx-hash-", dir=temp_base) as name:
            temp_root = Path(name)
            project, audio, index, index_path = self.make_project(temp_root)
            audio.write_bytes(b"changed after index registration")
            probe = temp_root / "ffprobe-fixture"
            fake_ffprobe(probe)
            index["assets"][0]["sha256"] = "0" * 64
            index_path.write_text(json.dumps(index), encoding="utf-8")
            result = self.run_local(project, index_path, probe)
            self.assertEqual(result.returncode, 6, result.stderr)
            document = json.loads(result.stdout)
            self.assertEqual(document["status"], "file_invalid")
            self.assertEqual(document["results"][0]["status"], "file_invalid")
            self.assertIn("SHA-256", document["results"][0]["error"])

    def test_local_search_does_not_reuse_partial_range_review_as_ready(self):
        temp_base = Path(os.environ["TMPDIR"])
        with tempfile.TemporaryDirectory(prefix="sfx-review-range-", dir=temp_base) as name:
            temp_root = Path(name)
            project, _audio, index, index_path = self.make_project(temp_root)
            asset = index["assets"][0]
            asset["reviewStatus"] = "ready"
            asset["reviewRecord"] = {
                "fileSha256": asset["sha256"],
                "applicableScope": "wood latch closure",
                "sourceRange": {"inSec": 0.0, "outSec": 0.1},
                "reviewer": "reviewer-42",
                "conclusion": "pass",
            }
            index_path.write_text(json.dumps(index), encoding="utf-8")
            probe = temp_root / "ffprobe-fixture"
            fake_ffprobe(probe, duration="0.25")
            result = self.run_local(project, index_path, probe, review_scope="wood latch closure")
            self.assertEqual(result.returncode, 0, result.stderr)
            row = json.loads(result.stdout)["results"][0]
            self.assertEqual(row["reviewReuseStatus"], "review-range-does-not-cover-file")
            self.assertEqual(row["reviewStatus"], "candidate-unreviewed")
            self.assertEqual(row["audioPlanAsset"]["reviewStatus"], "candidate-unreviewed")

    def test_probe_startup_failure_propagates_separately_from_invalid_media(self):
        temp_base = Path(os.environ["TMPDIR"])
        with tempfile.TemporaryDirectory(prefix="sfx-probe-state-", dir=temp_base) as name:
            temp_root = Path(name)
            project, _audio, _index, index_path = self.make_project(temp_root)
            unavailable = temp_root / "ffprobe-unavailable"
            fake_probe_unavailable(unavailable)
            result = self.run_local(project, index_path, unavailable)
            self.assertEqual(result.returncode, ADAPTER.PROBE_UNAVAILABLE_EXIT, result.stderr)
            document = json.loads(result.stdout)
            self.assertEqual(document["status"], "probe_unavailable")
            self.assertEqual(document["results"][0]["status"], "probe_unavailable")
            self.assertIn("dyld", document["results"][0]["error"])

            invalid = temp_root / "ffprobe-invalid-media"
            fake_invalid_media_ffprobe(invalid)
            result = self.run_local(project, index_path, invalid)
            self.assertEqual(result.returncode, 6, result.stderr)
            document = json.loads(result.stdout)
            self.assertEqual(document["status"], "file_invalid")
            self.assertEqual(document["results"][0]["status"], "file_invalid")

    def api_args(self, command, project, cache_dir, *extra):
        return ADAPTER.parser().parse_args([
            command, "--work-root", str(project), "--cache-dir", str(cache_dir), *extra,
        ])

    def test_freesound_missing_service_confirmation_or_credentials_is_structured_and_offline(self):
        temp_base = Path(os.environ["TMPDIR"])
        with tempfile.TemporaryDirectory(prefix="sfx-api-config-", dir=temp_base) as name:
            project = Path(name) / "project"
            project.mkdir()
            args = self.api_args("freesound-search", project, project / ".cache" / "api", "--query", "wood latch")
            output = io.StringIO()
            with mock.patch.dict(os.environ, {}, clear=True), mock.patch.object(ADAPTER, "safe_urlopen") as request, contextlib.redirect_stdout(output):
                result, code = ADAPTER.freesound_search(args)
            self.assertEqual(code, 2)
            self.assertEqual(result["status"], "configuration_required")
            self.assertTrue(result["results"], "configuration failures remain non-empty for CLI/JSON consumers")
            request.assert_not_called()
            self.assertIn("service_use_unconfirmed", {item["status"] for item in result["results"][0]["errors"]})
            self.assertIn("api_credentials_missing", {item["status"] for item in result["results"][0]["errors"]})

    def test_freesound_search_uses_mocked_official_api_and_keeps_license_label_unverified(self):
        class FixtureResponse:
            headers = {}
            def __init__(self, payload, url):
                self.payload, self.url = payload, url
            def __enter__(self): return self
            def __exit__(self, *_args): return False
            def read(self, limit=-1): return self.payload[:limit]
            def geturl(self): return self.url

        temp_base = Path(os.environ["TMPDIR"])
        with tempfile.TemporaryDirectory(prefix="sfx-api-search-", dir=temp_base) as name:
            project = Path(name) / "project"
            project.mkdir()
            cache = project / ".cache" / "api"
            payload = json.dumps({
                "count": 1, "next": None, "previous": None,
                "results": [{
                    "id": 123, "name": "Wood latch close", "username": "artist",
                    "description": "A dry wooden latch closing.", "tags": ["wood", "latch"],
                    "duration": 0.42, "license": "Attribution",
                    "previews": {"preview-hq-mp3": "https://cdn.freesound.org/previews/1/123_hq.mp3"},
                    "download": "https://freesound.org/apiv2/sounds/123/download/",
                    "num_downloads": 12, "avg_rating": 4.5, "num_ratings": 2,
                }],
            }).encode()
            seen = []
            def fake_urlopen(request, timeout):
                seen.append(request)
                return FixtureResponse(payload, request.full_url)
            args = self.api_args("freesound-search", project, cache, "--query", "wood latch", "--service-use", "non-commercial")
            output = io.StringIO()
            with mock.patch.dict(os.environ, {"FREESOUND_API_TOKEN": "test-api-key"}, clear=True), \
                 mock.patch.object(ADAPTER, "safe_urlopen", side_effect=fake_urlopen), contextlib.redirect_stdout(output):
                result, code = ADAPTER.freesound_search(args)
            self.assertEqual(code, 0)
            self.assertEqual(result["status"], "ok")
            self.assertTrue(seen[0].full_url.startswith("https://freesound.org/apiv2/search/?"))
            self.assertEqual(seen[0].get_header("Authorization"), "Token test-api-key")
            row = result["results"][0]
            self.assertEqual(row["key"], "fs:123")
            self.assertEqual(row["candidatePage"], "https://freesound.org/people/artist/sounds/123/")
            self.assertEqual(row["licenseLabel"], "Attribution")
            self.assertEqual(row["licenseDetailStatus"], "manual-exact-single-file-license-check-required")
            self.assertEqual(row["rightsStatus"], "unverified-until-manual-exact-license-url-is-recorded")
            self.assertEqual(result["serviceUse"], "non-commercial")
            cache_index = project / result["cacheIndex"]
            self.assertTrue(cache_index.is_file())
            self.assertIn("fs:123", json.loads(cache_index.read_text(encoding="utf-8"))["sounds"])

    def test_preview_download_requires_manual_file_license_and_preserves_review_boundary(self):
        class FixtureResponse:
            headers = {"Content-Type": "audio/mpeg"}
            def __enter__(self): return self
            def __exit__(self, *_args): return False
            def read(self, limit=-1): return b"fixture mp3 bytes"[:limit]
            def geturl(self): return "https://cdn.freesound.org/previews/1/123_hq.mp3"

        temp_base = Path(os.environ["TMPDIR"])
        with tempfile.TemporaryDirectory(prefix="sfx-api-download-", dir=temp_base) as name:
            temp_root = Path(name)
            project = temp_root / "project"
            audio_dir = project / "assets" / "audio"
            audio_dir.mkdir(parents=True)
            cache = project / ".cache" / "api"
            cache.mkdir(parents=True)
            entry = ADAPTER.normalize_search_result({
                "id": 123, "name": "Wood latch close", "username": "artist",
                "description": "Dry latch", "license": "Attribution",
                "previews": {"preview-hq-mp3": "https://cdn.freesound.org/previews/1/123_hq.mp3"},
            })
            (cache / "freesound-api-index.json").write_text(json.dumps({"schemaVersion": 1, "sounds": {"fs:123": entry}}), encoding="utf-8")
            probe = temp_root / "ffprobe-fixture"
            fake_ffprobe(probe, codec="mp3", format_name="mp3")
            args = self.api_args("download", project, cache, "--key", "fs:123", "--kind", "preview",
                "--service-use", "non-commercial", "--verified-license-url", "https://creativecommons.org/licenses/by/4.0/",
                "--rights-verified-by", "reviewer-17", "--out-dir", str(audio_dir), "--ffprobe", str(probe))
            output = io.StringIO()
            with mock.patch.dict(os.environ, {"FREESOUND_API_TOKEN": "test-api-key"}, clear=True), \
                 mock.patch.object(ADAPTER, "safe_urlopen", return_value=FixtureResponse()), contextlib.redirect_stdout(output):
                result, code = ADAPTER.external_download(args)
            self.assertEqual(code, 0)
            self.assertEqual(result["status"], "ok")
            row = result["results"][0]
            self.assertEqual(row["status"], "candidate-unreviewed")
            self.assertEqual(row["audioPlanAsset"]["license"], "CC-BY-4.0")
            self.assertEqual(row["audioPlanAsset"]["reviewStatus"], "candidate-unreviewed")
            self.assertIn("not the uploader's original file", row["audioPlanAsset"]["source"]["fileKind"])
            self.assertEqual(row["audioPlanAsset"]["source"]["licenseVerifiedBy"], "reviewer-17")
            self.assertIsNone(row["hitTimeSec"])
            self.assertEqual(row["sha256"], hashlib.sha256(b"fixture mp3 bytes").hexdigest())

            args = self.api_args("download", project, cache, "--key", "fs:123", "--kind", "preview",
                "--service-use", "non-commercial", "--out-dir", str(audio_dir / "no-rights"), "--ffprobe", str(probe))
            with mock.patch.dict(os.environ, {"FREESOUND_API_TOKEN": "test-api-key"}, clear=True), \
                 mock.patch.object(ADAPTER, "safe_urlopen", return_value=FixtureResponse()):
                no_rights, code = ADAPTER.external_download(args)
            self.assertEqual(code, 5)
            self.assertEqual(no_rights["results"][0]["status"], "rights_unverified")
            self.assertIsNone(no_rights["results"][0]["audioPlanAsset"])

    def test_original_download_uses_oauth_bearer_and_does_not_call_preview(self):
        class FixtureResponse:
            headers = {"Content-Disposition": 'attachment; filename="wood.wav"'}
            def __enter__(self): return self
            def __exit__(self, *_args): return False
            def read(self, limit=-1): return b"fixture original bytes"[:limit]
            def geturl(self): return "https://freesound.org/apiv2/sounds/123/download/"
        temp_base = Path(os.environ["TMPDIR"])
        with tempfile.TemporaryDirectory(prefix="sfx-original-", dir=temp_base) as name:
            temp_root = Path(name)
            project = temp_root / "project"
            project.mkdir()
            cache = project / ".cache" / "api"
            cache.mkdir(parents=True)
            entry = ADAPTER.normalize_search_result({
                "id": 123, "name": "Wood latch close", "username": "artist",
                "license": "Creative Commons 0", "previews": {"preview-hq-mp3": "https://cdn.freesound.org/previews/1/123.mp3"},
            })
            (cache / "freesound-api-index.json").write_text(json.dumps({"schemaVersion": 1, "sounds": {"fs:123": entry}}), encoding="utf-8")
            probe = temp_root / "ffprobe-fixture"
            fake_ffprobe(probe, codec="pcm_s16le", format_name="wav")
            args = self.api_args("download", project, cache, "--key", "fs:123", "--kind", "original",
                "--service-use", "non-commercial", "--verified-license-url", "https://creativecommons.org/publicdomain/zero/1.0/",
                "--rights-verified-by", "reviewer-17", "--ffprobe", str(probe))
            seen = []
            def fake_urlopen(request, timeout):
                seen.append(request)
                return FixtureResponse()
            with mock.patch.dict(os.environ, {"FREESOUND_OAUTH_ACCESS_TOKEN": "oauth-only"}, clear=True), \
                 mock.patch.object(ADAPTER, "safe_urlopen", side_effect=fake_urlopen):
                result, code = ADAPTER.external_download(args)
            self.assertEqual(code, 0)
            self.assertEqual(seen[0].get_header("Authorization"), "Bearer oauth-only")
            self.assertEqual(seen[0].full_url, "https://freesound.org/apiv2/sounds/123/download/")
            self.assertEqual(result["results"][0]["downloadKind"], "original")
            self.assertEqual(result["results"][0]["audioPlanAsset"]["license"], "CC0-1.0")
            self.assertIn("uploader original", result["results"][0]["audioPlanAsset"]["source"]["fileKind"])

    def test_redirects_are_checked_before_following_and_authorization_stays_origin_bound(self):
        initial_url = "https://freesound.org/apiv2/sounds/123/download/"

        class FixtureResponse:
            headers = {"Content-Type": "audio/wav"}
            def __init__(self, final_url): self.final_url = final_url
            def __enter__(self): return self
            def __exit__(self, *_args): return False
            def read(self, limit=-1): return b"redirected original bytes"[:limit]
            def geturl(self): return self.final_url

        def request_through_redirect(target_url):
            seen = []

            class FixtureOpener:
                def __init__(self, handler): self.handler = handler
                def open(self, request, timeout):
                    seen.append(request)
                    if len(seen) == 1:
                        redirected = self.handler.redirect_request(
                            request, None, 302, "Found", {"Location": target_url}, target_url,
                        )
                        return self.open(redirected, timeout)
                    return FixtureResponse(target_url)

            with mock.patch.object(ADAPTER, "build_opener", side_effect=lambda handler: FixtureOpener(handler)):
                try:
                    response = ADAPTER.safe_urlopen(
                        ADAPTER.Request(initial_url, headers={
                            "Authorization": "Bearer oauth-only",
                            "Proxy-Authorization": "Basic proxy-only",
                        }), timeout=60,
                    )
                except ADAPTER.URLError:
                    return seen, None
                with response:
                    result = response.read(1024), response.geturl()
            return seen, result

        same_origin, same_result = request_through_redirect("https://freesound.org/apiv2/sounds/123/file.wav")
        self.assertEqual(len(same_origin), 2)
        self.assertEqual(same_origin[1].get_header("Authorization"), "Bearer oauth-only")
        self.assertEqual(same_origin[1].get_header("Proxy-authorization"), "Basic proxy-only")
        self.assertEqual(same_result[1], "https://freesound.org/apiv2/sounds/123/file.wav")

        cdn_origin, cdn_result = request_through_redirect("https://cdn.freesound.org/downloads/123/file.wav")
        self.assertEqual(len(cdn_origin), 2)
        self.assertIsNone(cdn_origin[1].get_header("Authorization"), "OAuth credentials must not cross origins")
        self.assertIsNone(cdn_origin[1].get_header("Proxy-authorization"), "proxy credentials must not cross origins")
        self.assertEqual(cdn_result[0], b"redirected original bytes")
        self.assertEqual(cdn_result[1], "https://cdn.freesound.org/downloads/123/file.wav")

        blocked_requests, blocked_result = request_through_redirect("https://attacker.invalid/collect")
        self.assertIsNone(blocked_result)
        self.assertEqual(len(blocked_requests), 1, "unapproved targets must be rejected before a follow-up request")
        for invalid_url in (
            "http://cdn.freesound.org/downloads/123/file.wav",
            "https://cdn.freesound.org:8443/downloads/123/file.wav",
            "https://user@cdn.freesound.org/downloads/123/file.wav",
        ):
            with self.subTest(url=invalid_url):
                invalid_requests, invalid_result = request_through_redirect(invalid_url)
                self.assertIsNone(invalid_result)
                self.assertEqual(len(invalid_requests), 1)

    def test_rights_gate_matches_consumer_statuses_and_evidence_requirements(self):
        base_asset = {"license": "CC-BY-4.0"}
        accepted = [
            {"status": "redistributable", "basis": "license record"},
            {"status": "sync-only", "notes": "source file stays local"},
            {"status": "not-authorized-for-redistribution", "syncUse": "allowed", "basis": "sync use only"},
            {"status": "project-generated", "basis": "generated under project tool"},
        ]
        for rights in accepted:
            with self.subTest(rights=rights):
                self.assertTrue(ADAPTER.rights_are_consumable({**base_asset, "redistribution": rights}))
        rejected = [
            {"status": "redistributable", "syncUse": "allowed"},
            {"status": "redistributable", "basis": "license record", "syncUse": "unknown"},
            {"status": "redistributable", "basis": "license record", "syncUse": "prohibited"},
            {"status": "redistributable", "basis": "license record", "syncUse": "maybe"},
            {"status": "sync-only", "basis": "source file stays local", "syncUse": "prohibited"},
            {"status": "not-authorized-for-redistribution", "basis": "sync use only"},
            {"status": "not-authorized-for-redistribution", "basis": "sync use only", "syncUse": "unknown"},
            {"status": "project-generated", "notes": "generated locally", "syncUse": "prohibited"},
            {"status": "public-domain", "basis": "license record"},
        ]
        for rights in rejected:
            with self.subTest(rights=rights):
                self.assertFalse(ADAPTER.rights_are_consumable({**base_asset, "redistribution": rights}))
        self.assertFalse(ADAPTER.rights_are_consumable({"license": "CC-BY-4.0", "redistribution": {"status": "redistributable", "basis": "  "}}))
        self.assertFalse(ADAPTER.rights_are_consumable({"license": "unknown", "redistribution": {"status": "redistributable", "basis": "license record"}}))

    def test_manual_license_url_requires_exact_supported_per_file_match(self):
        cc0, error = ADAPTER.parse_manual_license_url("Creative Commons 0", "https://creativecommons.org/publicdomain/zero/1.0/", "reviewer-42")
        self.assertIsNone(error)
        self.assertEqual(cc0["id"], "CC0-1.0")
        by, error = ADAPTER.parse_manual_license_url("Attribution", "https://creativecommons.org/licenses/by/4.0/", "reviewer-42")
        self.assertIsNone(error)
        self.assertEqual(by["id"], "CC-BY-4.0")
        self.assertIsNone(ADAPTER.parse_manual_license_url("Attribution", "https://creativecommons.org/licenses/by-nc/4.0/", "reviewer-42")[0])
        self.assertIsNotNone(ADAPTER.parse_manual_license_url("Attribution", "https://creativecommons.org/licenses/by/4.0/", "unknown")[1])
        self.assertIsNotNone(ADAPTER.parse_manual_license_url("Attribution NonCommercial", "https://creativecommons.org/licenses/by/4.0/", "reviewer-42")[1])

    def test_runtime_has_no_upstream_import_or_html_scraping_dependency(self):
        source = ADAPTER_PATH.read_text(encoding="utf-8")
        for retired in ("fetch_pinned_source", "load_upstream", "raw.githubusercontent.com", "HTMLParser", "classify_search_html"):
            self.assertNotIn(retired, source)

    def test_ready_review_requires_full_file_range_reviewer_and_pass(self):
        asset = {
            "reviewRecord": {
                "fileSha256": "a" * 64,
                "applicableScope": "paper page turning on a desk",
                "sourceRange": {"inSec": 0.1, "outSec": 0.8},
                "reviewer": "reviewer-42",
                "conclusion": "pass",
            }
        }
        self.assertEqual(
            ADAPTER.review_reuse_status(asset, "a" * 64, "paper page turning on a desk", 1.0),
            "review-range-does-not-cover-file",
        )
        full_review = json.loads(json.dumps(asset))
        full_review["reviewRecord"]["sourceRange"] = {"inSec": 0.0, "outSec": 1.0}
        self.assertEqual(
            ADAPTER.review_reuse_status(full_review, "a" * 64, "paper page turning on a desk", 1.0),
            "reused-exact-scope-and-file-hash",
        )
        derived_file_review = json.loads(json.dumps(full_review))
        derived_file_review["reviewRecord"]["fileSha256"] = "b" * 64
        self.assertEqual(
            ADAPTER.review_reuse_status(derived_file_review, "b" * 64, "paper page turning on a desk", 1.0),
            "reused-exact-scope-and-file-hash",
        )
        no_reviewer = json.loads(json.dumps(full_review))
        no_reviewer["reviewRecord"].pop("reviewer")
        self.assertEqual(
            ADAPTER.review_reuse_status(no_reviewer, "a" * 64, "paper page turning on a desk", 1.0),
            "reviewer-missing",
        )
        placeholder_reviewer = json.loads(json.dumps(full_review))
        placeholder_reviewer["reviewRecord"]["reviewer"] = "unknown"
        self.assertEqual(
            ADAPTER.review_reuse_status(placeholder_reviewer, "a" * 64, "paper page turning on a desk", 1.0),
            "reviewer-missing",
        )
        no_conclusion = json.loads(json.dumps(full_review))
        no_conclusion["reviewRecord"].pop("conclusion")
        self.assertEqual(
            ADAPTER.review_reuse_status(no_conclusion, "a" * 64, "paper page turning on a desk", 1.0),
            "review-conclusion-not-pass",
        )
        failed_review = json.loads(json.dumps(full_review))
        failed_review["reviewRecord"]["conclusion"] = "fail"
        self.assertEqual(
            ADAPTER.review_reuse_status(failed_review, "a" * 64, "paper page turning on a desk", 1.0),
            "review-conclusion-not-pass",
        )
        self.assertEqual(
            ADAPTER.review_reuse_status(asset, "a" * 64, None, 1.0),
            "scope-not-provided",
        )
        self.assertEqual(
            ADAPTER.review_reuse_status(asset, "b" * 64, "paper page turning on a desk", 1.0),
            "file-hash-mismatch",
        )
        self.assertEqual(
            ADAPTER.review_reuse_status(asset, "a" * 64, "paper crumpling on a desk", 1.0),
            "scope-mismatch",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
