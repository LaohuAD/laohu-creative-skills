#!/usr/bin/env python3
"""Technical fixtures for the isolated Shotcraft beat-grid adapter."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf


REPO_ROOT = Path(__file__).resolve().parents[4]
TEST_ROOT = REPO_ROOT / ".cache" / "tmp" / "motion-source-integration" / "beat-grid-tests"
SCRIPT = REPO_ROOT / ".agents" / "skills" / "laohu-arrangement" / "scripts" / "laohu-beat-grid.py"
SPEC = importlib.util.spec_from_file_location("laohu_beat_grid", SCRIPT)
beat_grid = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(beat_grid)


def synthetic_kick_track(sr: int = 44100, duration: float = 12.0, period: float = 0.6) -> np.ndarray:
    audio = np.zeros(round(sr * duration), dtype=np.float32)
    for at in np.arange(0.25, duration - 0.3, period):
        start = round(float(at) * sr)
        count = round(0.06 * sr)
        time = np.arange(count) / sr
        pulse = np.sin(2 * np.pi * 82 * time) * np.exp(-time * 42)
        audio[start : start + count] += pulse.astype(np.float32)
        audio[start] += 1.5
    return audio


class BeatGridTests(unittest.TestCase):
    def test_candidate_comparison_with_zero_bidirectional_matches_is_unresolved(self) -> None:
        no_matches = {"matchedCount": 0, "fractionWithinDiagnosticTolerance": 0.0}
        some_matches = {"matchedCount": 1, "fractionWithinDiagnosticTolerance": 0.1}
        self.assertEqual(
            beat_grid.candidate_interpretation_status(no_matches, no_matches),
            "unresolved-review-required-no-bidirectional-matches",
        )
        self.assertEqual(
            beat_grid.candidate_interpretation_status(some_matches, no_matches),
            "unresolved-review-required-no-bidirectional-matches",
        )
        self.assertEqual(
            beat_grid.candidate_interpretation_status(some_matches, some_matches),
            "candidate-only-absolute-offset-alias-ambiguous",
        )

    def test_half_normal_double_candidate_periods(self) -> None:
        detected = 0.2 + np.arange(20, dtype=float) * 0.5
        fit = beat_grid.fit_grid(detected)
        candidates = beat_grid.candidate_grid_specs(detected, fit)
        by_id = {row["id"]: row for row in candidates}
        self.assertAlmostEqual(by_id["0.5x-phase0"]["periodSec"], 1.0, places=9)
        self.assertAlmostEqual(by_id["1x"]["periodSec"], 0.5, places=9)
        self.assertAlmostEqual(by_id["2x-phase0"]["periodSec"], 0.25, places=9)
        self.assertAlmostEqual(by_id["0.5x-phase0"]["bpm"], 60.0, places=8)
        self.assertAlmostEqual(by_id["1x"]["bpm"], 120.0, places=8)
        self.assertAlmostEqual(by_id["2x-phase0"]["bpm"], 240.0, places=8)

    def test_kick_grid_metrics_distinguish_half_and_double_candidates(self) -> None:
        detected = 0.2 + np.arange(16, dtype=float) * 0.5
        fit = beat_grid.fit_grid(detected)
        candidates = beat_grid.score_candidates(beat_grid.candidate_grid_specs(detected, fit), detected, 8.0)
        candidates.sort(key=beat_grid.candidate_rank)
        by_id = {row["id"]: row for row in candidates}
        self.assertEqual(candidates[0]["id"], "1x")
        self.assertAlmostEqual(by_id["0.5x-phase0"]["gridMetrics"]["match"], 1.0, places=9)
        self.assertAlmostEqual(by_id["0.5x-phase0"]["gridMetrics"]["kickTransientCoverage"], 0.5, places=9)
        self.assertAlmostEqual(by_id["0.5x-phase0"]["gridMetrics"]["gridBeatMatch"], 1.0, places=9)
        self.assertAlmostEqual(by_id["2x-phase0"]["gridMetrics"]["match"], 0.5, places=9)
        self.assertAlmostEqual(by_id["2x-phase0"]["gridMetrics"]["kickTransientCoverage"], 1.0, places=9)
        self.assertAlmostEqual(by_id["2x-phase0"]["gridMetrics"]["gridBeatMatch"], 0.5, places=9)

    def test_source_time_mapping_applies_source_in_track_speed_and_time_map_once(self) -> None:
        mapping = {"localStartSec": 0.0, "filmStartSec": 2.0, "speed": 2.0}
        clock = {
            "sourceInSec": 0.5,
            "trackStartSec": 1.0,
            "trackSpeed": 1.5,
            "timeMap": mapping,
        }
        actual = beat_grid.map_source_file_time(1.25, clock)
        self.assertAlmostEqual(actual["sourceRelativeSec"], 0.75, places=9)
        self.assertAlmostEqual(actual["trackLocalSec"], 1.5, places=9)
        self.assertAlmostEqual(actual["filmGlobalSec"], 2.75, places=9)

    def test_real_librosa_analysis_returns_three_grids_and_selects_machine_kick_rate(self) -> None:
        result = beat_grid.analyze_waveform(synthetic_kick_track(), 44100, "off")
        by_id = {row["id"]: row for row in result["candidates"]}
        self.assertTrue({"0.5x-phase0", "1x", "2x-phase0"}.issubset(by_id))
        self.assertTrue(98.0 <= result["candidates"][0]["bpm"] <= 103.0)
        self.assertGreater(len(result["kickPeaks"]), 10)

    def test_hpss_branch_is_explicit_and_records_which_signal_won(self) -> None:
        result = beat_grid.analyze_waveform(synthetic_kick_track(), 44100, "always")
        self.assertTrue(result["hpss"]["attempted"])
        self.assertTrue(result["hpss"]["used"])
        self.assertIn(result["signal"], {"hpss-percussive", "full-mix"})
        self.assertGreaterEqual(len(result["hpss"]["attempts"]), 2)

    def test_piecewise_tempo_diagnostics_are_available_for_residual_trigger_cases(self) -> None:
        first = 0.2 + np.arange(20, dtype=float) * 0.5
        second = np.asarray([first[-1] + 0.6 * index for index in range(1, 21)], dtype=float)
        changed = np.concatenate([first, second])
        global_fit = beat_grid.fit_grid(changed)
        self.assertGreater(global_fit["residualMaxMs"], 15.0)
        segments = beat_grid.segmented_fit_candidates(changed)
        self.assertGreaterEqual(len(segments), 3)
        self.assertTrue(all(row["diagnosticOnly"] for row in segments))
        self.assertAlmostEqual(segments[0]["bpm"], 120.0, delta=0.1)
        self.assertAlmostEqual(segments[-1]["bpm"], 100.0, delta=0.1)

    def test_cli_verify_render_decodes_continuous_18s_mux_on_video_relative_clock(self) -> None:
        ffmpeg = os.environ.get("MOTION_FFMPEG") or shutil.which("ffmpeg")
        ffprobe = os.environ.get("MOTION_FFPROBE") or shutil.which("ffprobe")
        self.assertTrue(ffmpeg and ffprobe, "the render integration test requires the existing ffmpeg and ffprobe executables")
        TEST_ROOT.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="mux-render-", dir=TEST_ROOT) as directory:
            root = Path(directory)
            sr = 44100
            audio_path = root / "source-bgm.wav"
            sf.write(audio_path, synthetic_kick_track(sr=sr, duration=18.0), sr, subtype="PCM_16")
            asset_hash = hashlib.sha256(audio_path.read_bytes()).hexdigest()
            plan = {
                "schemaVersion": 1,
                "timeUnit": "seconds",
                "timeBasis": "film-global",
                "durationSec": 18.0,
                "sampleRate": 48000,
                "channels": 2,
                "tracks": [{"id": "locked-music", "assetId": "bgm", "bus": "music", "startSec": 0, "locked": True}],
                "assets": [{"id": "bgm", "file": "source-bgm.wav", "sha256": asset_hash}],
                "timeMaps": [],
            }
            plan_path = root / "audio-plan.json"
            plan_path.write_text(json.dumps(plan), encoding="utf-8")
            reference = beat_grid.analyze_selected_track(plan_path, "locked-music", root, "off")
            reference_path = root / "reference-grid.json"
            reference_path.write_text(json.dumps(reference, allow_nan=False), encoding="utf-8")

            render_path = root / "final-mux.mp4"
            encode = subprocess.run(
                [
                    str(ffmpeg), "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                    "-f", "lavfi", "-i", "color=c=black:s=64x64:r=24:d=18",
                    "-i", str(audio_path), "-map", "0:v:0", "-map", "1:a:0", "-t", "18",
                    "-c:v", "mpeg4", "-q:v", "5", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
                    str(render_path),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(encode.returncode, 0, encode.stderr)

            output_path = root / "render-check.json"
            env = os.environ.copy()
            env["MOTION_FFMPEG"] = str(ffmpeg)
            env["MOTION_FFPROBE"] = str(ffprobe)
            env["TMPDIR"] = str(root)
            command = [
                os.sys.executable, str(SCRIPT), "verify-render",
                "--reference", str(reference_path), "--render", str(render_path),
                "--output", str(output_path), "--project-root", str(root),
            ]
            checked = subprocess.run(command, check=False, capture_output=True, text=True, env=env)
            self.assertEqual(checked.returncode, 0, checked.stderr)
            self.assertIn("NUMERICAL_CANDIDATE", checked.stdout)
            self.assertIn("periodDeltaMs=", checked.stdout)
            self.assertIn("meanAbsMs(refToMux=", checked.stdout)
            self.assertIn("matchedFractions=", checked.stdout)
            self.assertIn("not a unique absolute track offset", checked.stdout)
            payload = json.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["status"], "measured-not-a-quality-verdict")
            self.assertEqual(payload["reference"]["audioPlanSha256"], hashlib.sha256(plan_path.read_bytes()).hexdigest())
            self.assertTrue(payload["reference"]["locked"])
            self.assertEqual(payload["render"]["audio"]["codec_type"], "audio")
            self.assertEqual(payload["render"]["audio"]["codec_name"], "aac")
            self.assertAlmostEqual(payload["render"]["videoStartSec"], 0.0, places=6)
            self.assertAlmostEqual(payload["render"]["decodedPcmClock"]["sampleIndexZeroFilmGlobalSec"], 0.0, places=9)
            self.assertAlmostEqual(payload["render"]["decodedAudioDurationSec"], 18.0, delta=0.05)
            self.assertGreater(payload["render"]["decodedFrames"], sr * 17)
            self.assertEqual(payload["render"]["packetPtsClock"]["packetPtsJumps"], [])
            self.assertEqual(payload["render"]["decodedFramePtsClock"]["framePtsGaps"], [])
            self.assertAlmostEqual(payload["render"]["decodedPcmClock"]["estimatedLeadingSilenceSec"], 0.0, delta=0.03)
            self.assertGreaterEqual(payload["comparison"]["mappedPlanBeatCountInMuxRange"], 2)
            self.assertEqual(payload["comparison"]["referenceBeatsOutsideDecodedAudio"], 0)
            self.assertIn("absoluteOffsetLimit", payload["comparison"]["candidateInterpretation"])
            self.assertIn("whole-beat or half-beat aliases", payload["comparison"]["candidateInterpretation"]["absoluteOffsetLimit"])
            self.assertIn("final mux", payload["render"]["decodedAudioMethod"])
            self.assertIn("-copyts", payload["render"]["decodedAudioMethod"])
            self.assertIn("acoustic proxies", payload["comparison"]["referenceEventDetectionMethod"])
            self.assertEqual(payload["comparison"]["selectedMuxGridCandidate"]["referenceToMuxGrid"]["sourceCount"], payload["comparison"]["mappedPlanBeatCountInMuxRange"])

    def test_cli_verify_render_preserves_leading_and_interior_aac_pts_gaps(self) -> None:
        ffmpeg = os.environ.get("MOTION_FFMPEG") or shutil.which("ffmpeg")
        ffprobe = os.environ.get("MOTION_FFPROBE") or shutil.which("ffprobe")
        self.assertTrue(ffmpeg and ffprobe, "the render integration test requires the existing ffmpeg and ffprobe executables")
        TEST_ROOT.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="mux-pts-gap-", dir=TEST_ROOT) as directory:
            root = Path(directory)
            sr = 48000
            audio_path = root / "source-bgm.wav"
            sf.write(audio_path, synthetic_kick_track(sr=sr, duration=8.0, period=0.5), sr, subtype="PCM_16")
            asset_hash = hashlib.sha256(audio_path.read_bytes()).hexdigest()
            plan = {
                "schemaVersion": 1,
                "timeUnit": "seconds",
                "timeBasis": "film-global",
                "durationSec": 12.0,
                "sampleRate": 48000,
                "channels": 2,
                "tracks": [{"id": "locked-music", "assetId": "bgm", "bus": "music", "startSec": 0.228, "locked": True}],
                "assets": [{"id": "bgm", "file": "source-bgm.wav", "sha256": asset_hash}],
                "timeMaps": [],
            }
            plan_path = root / "audio-plan.json"
            plan_path.write_text(json.dumps(plan), encoding="utf-8")
            reference = beat_grid.analyze_selected_track(plan_path, "locked-music", root, "off")
            reference_path = root / "reference-grid.json"
            reference_path.write_text(json.dumps(reference, allow_nan=False), encoding="utf-8")

            render_path = root / "offset-gap-mux.mp4"
            # The video starts at PTS 2 s; this plan deliberately starts its track
            # at the AAC stream's approximately 0.228 s video-relative offset.
            # AAC then resumes after a 1.04 s PTS gap near source second 1.1.
            encode = subprocess.run(
                [
                    str(ffmpeg), "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-copyts",
                    "-itsoffset", "2", "-f", "lavfi", "-i", "color=c=black:s=64x64:r=24:d=12",
                    "-i", str(audio_path), "-filter:a", r"asetpts=PTS+2.25/TB+gte(T\,1.1)*1.04/TB",
                    "-map", "0:v:0", "-map", "1:a:0", "-t", "14",
                    "-c:v", "mpeg4", "-q:v", "5", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
                    str(render_path),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(encode.returncode, 0, encode.stderr)

            output_path = root / "render-check.json"
            env = os.environ.copy()
            env["MOTION_FFMPEG"] = str(ffmpeg)
            env["MOTION_FFPROBE"] = str(ffprobe)
            env["TMPDIR"] = str(root)
            command = [
                os.sys.executable, str(SCRIPT), "verify-render",
                "--reference", str(reference_path), "--render", str(render_path),
                "--output", str(output_path), "--project-root", str(REPO_ROOT),
            ]
            checked = subprocess.run(command, check=False, capture_output=True, text=True, env=env)
            self.assertEqual(checked.returncode, 0, checked.stderr)
            self.assertIn("NUMERICAL_CANDIDATE", checked.stdout)
            self.assertIn("periodDeltaMs=", checked.stdout)
            self.assertIn("meanAbsMs(refToMux=", checked.stdout)
            self.assertIn("matchedFractions=", checked.stdout)
            self.assertIn("not a unique absolute track offset", checked.stdout)
            payload = json.loads(output_path.read_text(encoding="utf-8"))
            render = payload["render"]
            packet_clock = render["packetPtsClock"]
            frame_clock = render["decodedFramePtsClock"]
            pcm_clock = render["decodedPcmClock"]
            comparison = payload["comparison"]
            self.assertAlmostEqual(render["videoStartSec"], 2.0, delta=0.01)
            self.assertGreater(render["audioOffsetFromVideoStartSec"], 0.2)
            self.assertLess(render["audioOffsetFromVideoStartSec"], 0.26)
            self.assertAlmostEqual(pcm_clock["sampleIndexZeroFilmGlobalSec"], 0.0, places=9)
            self.assertGreater(pcm_clock["estimatedLeadingSilenceSec"], 0.2)
            self.assertLess(pcm_clock["estimatedLeadingSilenceSec"], 0.26)
            self.assertGreaterEqual(len(packet_clock["packetPtsJumps"]), 1)
            self.assertGreaterEqual(len(frame_clock["framePtsGaps"]), 1)
            self.assertAlmostEqual(frame_clock["framePtsGaps"][0]["estimatedMissingPresentationSec"], 1.04, delta=0.03)
            self.assertEqual(pcm_clock["interiorPtsGapRanges"], frame_clock["framePtsGaps"])
            self.assertGreater(render["decodedAudioDurationSec"], 9.0)
            self.assertLess(render["decodedAudioDurationSec"], render["videoDurationSec"])
            self.assertFalse(pcm_clock["audioIsExtendedToVideoEnd"])
            self.assertEqual(comparison["referenceBeatsOutsideDecodedAudio"], 0)
            self.assertIn("absoluteOffsetLimit", comparison["candidateInterpretation"])
            self.assertIn("whole-beat or half-beat aliases", comparison["candidateInterpretation"]["absoluteOffsetLimit"])
            first_grid_error = comparison["selectedMuxGridCandidate"]["referenceToMuxGrid"]["firstSignedMs"]
            self.assertIsNotNone(first_grid_error)
            # This fixed fixture checks that video-relative PCM timing and the
            # plan's explicit track start agree; it is not a general quality gate.
            self.assertLess(abs(first_grid_error), 100.0)
            first_kick = next(row for row in comparison["referenceEventComparisons"] if row["kind"] == "kick")
            self.assertLess(abs(first_kick["signedOffsetMsMuxMinusReference"]), 50.0)

    def test_locked_music_is_read_only_analyzable_and_receipt_marks_protection(self) -> None:
        TEST_ROOT.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="locked-track-", dir=TEST_ROOT) as directory:
            root = Path(directory)
            asset_path = root / "locked-bgm.wav"
            audio = synthetic_kick_track(duration=12.0)
            sf.write(asset_path, audio, 44100, subtype="PCM_16")
            asset_hash = hashlib.sha256(asset_path.read_bytes()).hexdigest()
            plan = {
                "schemaVersion": 1,
                "timeUnit": "seconds",
                "timeBasis": "film-global",
                "durationSec": 12.0,
                "sampleRate": 48000,
                "channels": 2,
                "tracks": [{"id": "locked-music", "assetId": "bgm", "bus": "music", "startSec": 0, "locked": True}],
                "assets": [{"id": "bgm", "file": "locked-bgm.wav", "sha256": asset_hash}],
                "timeMaps": [],
            }
            plan_path = root / "audio-plan.json"
            plan_path.write_text(json.dumps(plan), encoding="utf-8")
            receipt = beat_grid.analyze_selected_track(plan_path, "locked-music", root, "off")
            self.assertTrue(receipt["source"]["locked"])
            self.assertEqual(receipt["source"]["trackId"], "locked-music")
            self.assertGreaterEqual(len(receipt["beats"]), 8)
            self.assertIn("do not create a second audio plan", receipt["selectionBoundary"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
