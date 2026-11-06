#!/usr/bin/env python3
"""Analyze an explicitly selected music track on its original source and film clocks."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

try:
    import librosa
    import numpy as np
    import soundfile as sf
    from scipy.signal import butter, find_peaks, sosfilt
except ImportError as error:  # Do not replace the pinned analysis libraries with an approximation.
    raise SystemExit(
        "beat-grid requires the project-isolated environment from "
        "scripts/beat-grid-requirements.lock; missing: " + str(error)
    ) from error


FORMAT = "laohu.arrangement.beat-grid/1"
EPSILON = 1e-9


def fail(message: str) -> None:
    raise ValueError(message)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def finite_number(value: Any, label: str, minimum: float | None = None) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as error:
        fail(f"{label} must be a finite number")
        raise error
    if not math.isfinite(result) or (minimum is not None and result < minimum):
        fail(f"{label} must be finite" + (f" and >= {minimum}" if minimum is not None else ""))
    return result


def file_duration(path: Path) -> float:
    try:
        info = sf.info(str(path))
        duration = float(info.duration)
    except Exception:
        duration = float(librosa.get_duration(path=str(path)))
    if not math.isfinite(duration) or duration <= 0:
        fail(f"selected music asset has no measurable duration: {path}")
    return duration


def resolve_track(plan_path: Path, project_root: Path, plan: dict[str, Any], track_id: str) -> dict[str, Any]:
    if plan.get("schemaVersion") != 1 or plan.get("timeUnit") != "seconds" or plan.get("timeBasis") != "film-global":
        fail("audio plan must be audio-plan.v1 with seconds and film-global timeBasis")
    tracks = [row for row in plan.get("tracks", []) if row.get("id") == track_id]
    if len(tracks) != 1:
        fail("--track-id must match exactly one audio-plan track")
    track = tracks[0]
    if track.get("bus") != "music":
        fail("beat-grid only analyzes a selected music track")
    assets = [row for row in plan.get("assets", []) if row.get("id") == track.get("assetId")]
    if len(assets) != 1:
        fail("selected music track must reference exactly one existing audio-plan asset")
    asset = assets[0]
    asset_rel = asset.get("file")
    if not isinstance(asset_rel, str) or not asset_rel:
        fail("selected music asset needs a project-relative file path")
    asset_path = (plan_path.parent / asset_rel).resolve(strict=True)
    root_real = project_root.resolve(strict=True)
    if os.path.commonpath([str(root_real), str(asset_path)]) != str(root_real):
        fail("selected music asset must stay inside --project-root")
    expected_sha = asset.get("sha256")
    actual_sha = sha256_file(asset_path)
    if not isinstance(expected_sha, str) or actual_sha != expected_sha.lower():
        fail(f"selected music asset hash does not match audio plan: {asset_path}")
    asset_duration = file_duration(asset_path)
    source_in = finite_number(track.get("sourceInSec", 0), "track.sourceInSec", 0)
    source_out = finite_number(track.get("sourceOutSec", asset_duration), "track.sourceOutSec", 0)
    if not (source_out > source_in) or source_out > asset_duration + 1e-8:
        fail("selected music track sourceIn/sourceOut range is invalid for its asset")
    track_speed = finite_number(track.get("speed", 1), "track.speed", 1e-6)
    track_start = finite_number(track.get("startSec"), "track.startSec")
    maps = {row.get("id"): row for row in plan.get("timeMaps", [])}
    map_id = track.get("timeMapId")
    mapping = maps.get(map_id) if map_id else None
    if map_id and not mapping:
        fail("selected music track references a missing audio-plan timeMapId")
    if mapping:
        local_start = finite_number(mapping.get("localStartSec"), "timeMap.localStartSec")
        film_start = finite_number(mapping.get("filmStartSec"), "timeMap.filmStartSec")
        map_speed = finite_number(mapping.get("speed"), "timeMap.speed", 1e-6)
        mapped_track_start = film_start + (track_start - local_start) / map_speed
    else:
        map_speed = 1.0
        mapped_track_start = track_start
    effective_speed = track_speed * map_speed
    return {
        "trackId": track_id,
        "locked": bool(track.get("locked")),
        "trackStartSec": track_start,
        "trackSpeed": track_speed,
        "timeMapId": map_id,
        "timeMap": mapping,
        "timeMapSpeed": map_speed,
        "filmStartSec": mapped_track_start,
        "effectiveSpeed": effective_speed,
        "sourceInSec": source_in,
        "sourceOutSec": source_out,
        "sourceDurationSec": source_out - source_in,
        "assetId": asset["id"],
        "assetPath": asset_path,
        "assetSha256": actual_sha,
        "assetDurationSec": asset_duration,
    }


def map_source_file_time(source_file_sec: float, clock: dict[str, Any]) -> dict[str, float]:
    source_relative_sec = source_file_sec - clock["sourceInSec"]
    track_local_sec = clock["trackStartSec"] + source_relative_sec / clock["trackSpeed"]
    if clock["timeMap"]:
        mapping = clock["timeMap"]
        film_global_sec = mapping["filmStartSec"] + (track_local_sec - mapping["localStartSec"]) / mapping["speed"]
    else:
        film_global_sec = track_local_sec
    return {
        "sourceFileSec": float(source_file_sec),
        "sourceRelativeSec": float(source_relative_sec),
        "trackLocalSec": float(track_local_sec),
        "filmGlobalSec": float(film_global_sec),
    }


def fit_grid(beat_times: np.ndarray) -> dict[str, Any]:
    beats = np.asarray(beat_times, dtype=float)
    if beats.ndim != 1 or len(beats) < 3 or not np.all(np.isfinite(beats)):
        fail("librosa beat_track must return at least three finite beat times to fit a grid")
    indices = np.arange(len(beats), dtype=float)
    design = np.vstack([indices, np.ones_like(indices)]).T
    (period, phase), *_ = np.linalg.lstsq(design, beats, rcond=None)
    if not math.isfinite(float(period)) or period <= 0:
        fail("least-squares beat grid fit returned an invalid period")
    residual = beats - (phase + indices * period)
    return {
        "periodSec": float(period),
        "t0Sec": float(phase),
        "bpm": float(60.0 / period),
        "residualSec": residual,
        "residualMaxMs": float(np.max(np.abs(residual)) * 1000),
        "residualMeanAbsMs": float(np.mean(np.abs(residual)) * 1000),
    }


def segmented_fit_candidates(beat_times: np.ndarray, window_beats: int = 16, hop_beats: int = 8) -> list[dict[str, Any]]:
    """Local least-squares fits used only after the source 15 ms global residual trigger."""
    beats = np.asarray(beat_times, dtype=float)
    segments = []
    if len(beats) < 4:
        return segments
    starts = list(range(0, max(1, len(beats) - 2), hop_beats))
    if starts and starts[-1] + 3 < len(beats) and len(beats) - window_beats > starts[-1]:
        starts.append(max(0, len(beats) - window_beats))
    for start in sorted(set(starts)):
        end = min(len(beats), start + window_beats)
        if end - start < 4:
            continue
        fitted = fit_grid(beats[start:end])
        segments.append({
            "startBeatIndex": int(start),
            "endBeatIndexExclusive": int(end),
            "startDetectedBeatSec": float(beats[start]),
            "endDetectedBeatSec": float(beats[end - 1]),
            "bpm": fitted["bpm"],
            "t0DetectedBeatSec": fitted["t0Sec"],
            "periodSec": fitted["periodSec"],
            "fitResidualMaxMs": fitted["residualMaxMs"],
            "fitResidualMeanAbsMs": fitted["residualMeanAbsMs"],
            "diagnosticOnly": True,
        })
    return segments


def beat_analysis(y: np.ndarray, sr: int) -> tuple[float, np.ndarray, dict[str, Any]]:
    tempo_value, beats = librosa.beat.beat_track(y=y, sr=sr, tightness=400, units="time")
    tempo_array = np.asarray(tempo_value).reshape(-1)
    tempo_diagnostic = float(tempo_array[0]) if len(tempo_array) else float("nan")
    beat_times = np.asarray(beats, dtype=float)
    return tempo_diagnostic, beat_times, fit_grid(beat_times)


def band_env(y: np.ndarray, sr: int, low_hz: float, high_hz: float) -> tuple[np.ndarray, np.ndarray]:
    if high_hz >= sr / 2:
        fail(f"source sample rate {sr} Hz cannot resolve the required {low_hz:g}-{high_hz:g} Hz band")
    sos = butter(4, [low_hz, high_hz], btype="band", fs=sr, output="sos")
    filtered = sosfilt(sos, y)
    env = librosa.onset.onset_strength(y=filtered, sr=sr)
    times = librosa.times_like(env, sr=sr)
    return np.asarray(env, dtype=float), np.asarray(times, dtype=float)


def detect_transients(env: np.ndarray, times: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray]:
    if len(env) < 3:
        return np.asarray([], dtype=float), np.asarray([], dtype=float)
    p75, p90, p99 = np.percentile(env, [75, 90, 99])
    height = max(float(p75), float(p90) * 0.35)
    prominence = max(float(p90 - p75) * 0.2, np.finfo(float).eps)
    # Local peak-cluster guard: collapse retriggers within 220 ms while retaining fast machine beats.
    distance = max(1, int(round(0.22 * sr / 512)))
    indices, properties = find_peaks(env, height=height, prominence=prominence, distance=distance)
    if len(indices) == 0:
        indices = np.asarray([int(np.argmax(env))], dtype=int) if np.max(env) > 0 else np.asarray([], dtype=int)
    values = env[indices]
    normalized = np.clip(values / max(float(p99), np.finfo(float).eps), 0.0, 1.0)
    return times[indices], normalized


def band_analysis(y: np.ndarray, sr: int) -> dict[str, Any]:
    kick, kick_times = band_env(y, sr, 40, 160)
    snare_body, _ = band_env(y, sr, 150, 500)
    snare_attack, _ = band_env(y, sr, 1000, 3000)
    snare = np.sqrt(np.maximum(0, snare_body) * np.maximum(0, snare_attack))
    if sr / 2 <= 14000:
        hi_high = min(14000, sr * 0.48)
        if hi_high <= 6000:
            hihat = np.zeros_like(kick)
            hihat_reason = f"sample rate {sr} Hz cannot represent 6-14 kHz; hihat band omitted"
        else:
            hihat, _ = band_env(y, sr, 6000, hi_high)
            hihat_reason = f"hihat upper band capped at {hi_high:g} Hz by source Nyquist"
    else:
        hihat, _ = band_env(y, sr, 6000, 14000)
        hihat_reason = None
    # All envelopes use librosa's default hop length (512), as in the pinned method.
    times = kick_times
    if len(snare) != len(times) or len(hihat) != len(times):
        fail("librosa onset envelopes returned inconsistent frame clocks")
    return {
        "kick": {"env": kick, "times": times},
        "snare": {"env": snare, "times": times},
        "snareBody": {"env": snare_body, "times": times},
        "snareAttack": {"env": snare_attack, "times": times},
        "hihat": {"env": hihat, "times": times},
        "hihatBandNote": hihat_reason,
    }


def candidate_grid_specs(base_beat_times: np.ndarray, base_fit: dict[str, Any]) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for multiplier in (0.5, 1.0):
        phases = (0, 1) if multiplier == 0.5 else (0,)
        for phase in phases:
            subset = base_beat_times[phase::2] if multiplier == 0.5 else base_beat_times
            if len(subset) < 3:
                continue
            fitted = fit_grid(subset)
            period = float(fitted["periodSec"])
            candidates.append({
                "id": f"{multiplier:g}x" + (f"-phase{phase}" if multiplier == 0.5 else ""),
                "multiplier": multiplier,
                "phaseVariant": phase if multiplier == 0.5 else None,
                "periodSec": period,
                "t0Sec": float(fitted["t0Sec"]),
                "bpm": float(60 / period),
                "fitResidualMaxMs": float(fitted["residualMaxMs"]),
                "fitResidualMeanAbsMs": float(fitted["residualMeanAbsMs"]),
                "derivedFrom": "least-squares fit of alternating detected beat sequence" if multiplier == 0.5 else "least-squares fit of complete detected beat sequence",
            })
    for phase in (0, 1):
        period = float(base_fit["periodSec"] / 2)
        t0 = float(base_fit["t0Sec"] + (phase * period))
        candidates.append({
            "id": f"2x-phase{phase}",
            "multiplier": 2.0,
            "phaseVariant": phase,
            "periodSec": period,
            "t0Sec": t0,
            "bpm": float(60 / period),
            "fitResidualMaxMs": float(base_fit["residualMaxMs"]),
            "fitResidualMeanAbsMs": float(base_fit["residualMeanAbsMs"]),
            "derivedFrom": "half-period grid from complete detected beat fit; phase candidate evaluated against kick transients",
        })
    return candidates


def grid_times(t0_sec: float, period_sec: float, duration_sec: float) -> tuple[np.ndarray, np.ndarray]:
    first = int(math.ceil((-t0_sec - EPSILON) / period_sec))
    last = int(math.floor((duration_sec - t0_sec + EPSILON) / period_sec))
    if last < first:
        return np.asarray([], dtype=float), np.asarray([], dtype=int)
    beat_indices = np.arange(first, last + 1, dtype=int)
    return t0_sec + beat_indices * period_sec, beat_indices


def nearest_transient_metrics(times: np.ndarray, peaks: np.ndarray, period: float) -> dict[str, Any]:
    tolerance = min(0.08, max(0.03, period * 0.15))
    if not len(times) or not len(peaks):
        return {
            "match": 0.0,
            "gridBeatMatch": 0.0,
            "kickTransientCoverage": 0.0,
            "matchedBeatCount": 0,
            "gridBeatCount": int(len(times)),
            "kickTransientCount": int(len(peaks)),
            "matchedKickTransientCount": 0,
            "meanAbsMs": None,
            "driftSlopeMsPerSec": None,
            "totalDriftMs": None,
            "firstBeatEffective": False,
            "toleranceSec": tolerance,
            "residualsSec": np.asarray([], dtype=float),
            "matchedGridTimesSec": np.asarray([], dtype=float),
        }
    peak_indices = np.searchsorted(peaks, times)
    matched_residuals: list[float] = []
    matched_times: list[float] = []
    match_flags: list[bool] = []
    for index, beat in zip(peak_indices, times):
        nearby = []
        if index < len(peaks):
            nearby.append(peaks[index])
        if index > 0:
            nearby.append(peaks[index - 1])
        nearest = min(nearby, key=lambda peak: abs(float(peak) - float(beat))) if nearby else None
        residual = float(nearest - beat) if nearest is not None else math.inf
        matched = abs(residual) <= tolerance
        match_flags.append(matched)
        if matched:
            matched_residuals.append(residual)
            matched_times.append(float(beat))
    matched_kick_residuals: list[float] = []
    for peak in peaks:
        index = int(np.searchsorted(times, peak))
        nearby = []
        if index < len(times):
            nearby.append(times[index])
        if index > 0:
            nearby.append(times[index - 1])
        if nearby:
            residual = float(peak - min(nearby, key=lambda beat: abs(float(beat) - float(peak))))
            if abs(residual) <= tolerance:
                matched_kick_residuals.append(residual)
    kick_residual_array = np.asarray(matched_kick_residuals, dtype=float)
    residual_array = np.asarray(matched_residuals, dtype=float)
    matched_time_array = np.asarray(matched_times, dtype=float)
    if len(residual_array) >= 2 and np.ptp(matched_time_array) > 0:
        slope, intercept = np.polyfit(matched_time_array, residual_array, 1)
        total_drift = float(slope * np.ptp(matched_time_array) * 1000)
    else:
        slope, total_drift = None, None
    return {
        "match": float(np.mean(match_flags)) if match_flags else 0.0,
        "gridBeatMatch": float(np.mean(match_flags)) if match_flags else 0.0,
        "kickTransientCoverage": float(len(kick_residual_array) / len(peaks)) if len(peaks) else 0.0,
        "matchedBeatCount": int(np.count_nonzero(match_flags)),
        "gridBeatCount": int(len(times)),
        "kickTransientCount": int(len(peaks)),
        "matchedKickTransientCount": int(len(kick_residual_array)),
        "meanAbsMs": float(np.mean(np.abs(residual_array)) * 1000) if len(residual_array) else None,
        "kickMeanAbsMs": float(np.mean(np.abs(kick_residual_array)) * 1000) if len(kick_residual_array) else None,
        "driftSlopeMsPerSec": float(slope * 1000) if slope is not None else None,
        "totalDriftMs": total_drift,
        "firstBeatEffective": bool(match_flags[0]) if match_flags else False,
        "toleranceSec": tolerance,
        "residualsSec": residual_array,
        "matchedGridTimesSec": matched_time_array,
    }


def score_candidates(candidates: list[dict[str, Any]], kick_times: np.ndarray, duration_sec: float) -> list[dict[str, Any]]:
    for candidate in candidates:
        times, indices = grid_times(candidate["t0Sec"], candidate["periodSec"], duration_sec)
        metrics = nearest_transient_metrics(times, kick_times, candidate["periodSec"])
        candidate["beatTimesCropSec"] = times
        candidate["beatNumbers"] = indices
        candidate["gridMetrics"] = {key: value for key, value in metrics.items() if key not in ("residualsSec", "matchedGridTimesSec")}
        candidate["_metrics"] = metrics
    return candidates


def candidate_rank(candidate: dict[str, Any]) -> tuple[Any, ...]:
    metrics = candidate["_metrics"]
    mean_abs = metrics["meanAbsMs"] if metrics["meanAbsMs"] is not None else float("inf")
    drift = abs(metrics["totalDriftMs"]) if metrics["totalDriftMs"] is not None else float("inf")
    return (-metrics["kickTransientCoverage"], -metrics["match"], mean_abs, drift, not metrics["firstBeatEffective"], candidate["id"])


def energy_profile(y: np.ndarray, sr: int, crop_duration: float, grid: dict[str, Any], bands: dict[str, Any], source_in: float, clock: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rms = np.asarray(librosa.feature.rms(y=y)[0], dtype=float)
    rms_times = np.asarray(librosa.times_like(rms, sr=sr), dtype=float)
    stride = max(1, int(math.ceil(len(rms) / 4096)))
    rms_curve = []
    for t, value in zip(rms_times[::stride], rms[::stride]):
        mapped = map_source_file_time(source_in + float(t), clock)
        rms_curve.append({"t": mapped["sourceFileSec"], "rms": float(value), "filmGlobalSec": mapped["filmGlobalSec"]})

    beat_times = grid["beatTimesCropSec"]
    period = grid["periodSec"]
    step = 8
    if not len(beat_times):
        return rms_curve, []
    kick_peak_times, _ = detect_transients(bands["kick"]["env"], bands["kick"]["times"], sr)
    windows = []
    for start_index in range(0, len(beat_times), step):
        start = float(beat_times[start_index])
        end_index = min(start_index + step, len(beat_times))
        end = float(beat_times[end_index]) if end_index < len(beat_times) else crop_duration
        if end <= start:
            continue
        mask = (rms_times >= start) & (rms_times < end)
        kick_mask = (kick_peak_times >= start) & (kick_peak_times < end)
        mean_rms = float(np.mean(rms[mask])) if np.any(mask) else 0.0
        kick_density = float(np.count_nonzero(kick_mask) / (end - start)) if np.any(kick_mask) else 0.0
        windows.append({
            "startBeatIndex": int(start_index),
            "endBeatIndexExclusive": int(start_index + step),
            "startCropSec": start,
            "endCropSec": end,
            "meanRms": mean_rms,
            "kickDensityPerSec": kick_density,
        })
    median_rms = float(np.median([row["meanRms"] for row in windows])) if windows else 0.0
    positive_densities = [row["kickDensityPerSec"] for row in windows if row["kickDensityPerSec"] > 0]
    median_density = float(np.median(positive_densities)) if positive_densities else 0.0
    p95_rms = float(np.percentile(rms, 95)) if len(rms) else 0.0
    sections = []
    for row in windows:
        relative_rms = row["meanRms"] / max(p95_rms, np.finfo(float).eps)
        low = median_rms > 0 and row["meanRms"] <= median_rms * 0.55 and (median_density == 0 or row["kickDensityPerSec"] <= median_density * 0.5)
        high = median_rms > 0 and row["meanRms"] >= median_rms * 1.15 and (median_density == 0 or row["kickDensityPerSec"] >= median_density * 1.15)
        start_mapped = map_source_file_time(source_in + row["startCropSec"], clock)
        end_mapped = map_source_file_time(source_in + row["endCropSec"], clock)
        sections.append({
            "startBeatIndex": row["startBeatIndex"],
            "endBeatIndexExclusive": row["endBeatIndexExclusive"],
            "sourceFileStartSec": start_mapped["sourceFileSec"],
            "sourceFileEndSec": end_mapped["sourceFileSec"],
            "filmGlobalStartSec": start_mapped["filmGlobalSec"],
            "filmGlobalEndSec": end_mapped["filmGlobalSec"],
            "meanRms": row["meanRms"],
            "relativeRmsToP95": relative_rms,
            "kickDensityPerSec": row["kickDensityPerSec"],
            "structureCandidate": "breakdown" if low else "high-energy" if high else "steady",
            "candidateOnly": True,
        })
    return rms_curve, sections


def analyze_waveform(y: np.ndarray, sr: int, hpss_mode: str = "auto") -> dict[str, Any]:
    if y.ndim != 1 or len(y) < sr:
        fail("selected audio range must decode to at least one second of mono PCM")
    method_attempts = []
    source_audio = np.asarray(y, dtype=np.float32)
    signal_name = "full-mix"

    def run(signal: np.ndarray, label: str) -> dict[str, Any]:
        tempo, beat_times, fit = beat_analysis(signal, sr)
        bands = band_analysis(signal, sr)
        kick_peak_times, kick_peak_strengths = detect_transients(bands["kick"]["env"], bands["kick"]["times"], sr)
        candidates = score_candidates(candidate_grid_specs(beat_times, fit), kick_peak_times, len(signal) / sr)
        if not candidates:
            fail("half/double candidate construction produced no valid beat grid")
        candidates.sort(key=candidate_rank)
        best = candidates[0]
        method_attempts.append({
            "signal": label,
            "tempoScalarDiagnosticBpm": tempo if math.isfinite(tempo) else None,
            "detectedBeatCount": int(len(beat_times)),
            "fitBpm": fit["bpm"],
            "fitT0CropSec": fit["t0Sec"],
            "fitPeriodSec": fit["periodSec"],
            "fitResidualMaxMs": fit["residualMaxMs"],
            "bestCandidateId": best["id"],
            "bestCandidateMatch": best["_metrics"]["match"],
        })
        return {
            "signal": label,
            "tempo": tempo,
            "beatTimes": beat_times,
            "fit": fit,
            "bands": bands,
            "kickPeaks": kick_peak_times,
            "kickStrengths": kick_peak_strengths,
            "candidates": candidates,
        }

    analysis = run(source_audio, signal_name)
    best_match = analysis["candidates"][0]["_metrics"]["match"]
    should_hpss = hpss_mode == "always" or (hpss_mode == "auto" and (best_match < 0.98 or analysis["fit"]["residualMaxMs"] > 15))
    hpss_used = False
    if should_hpss:
        harmonic, percussive = librosa.effects.hpss(source_audio)
        candidate = run(np.asarray(percussive, dtype=np.float32), "hpss-percussive")
        if candidate["candidates"][0]["_metrics"]["match"] > best_match:
            analysis = candidate
            hpss_used = True
        elif hpss_mode == "always":
            analysis = candidate
            hpss_used = True
    analysis["hpss"] = {"mode": hpss_mode, "used": hpss_used, "attempted": should_hpss, "attempts": method_attempts}
    analysis["piecewiseFits"] = segmented_fit_candidates(analysis["beatTimes"]) if analysis["fit"]["residualMaxMs"] > 15 else []
    analysis["piecewiseFitTriggered"] = analysis["fit"]["residualMaxMs"] > 15
    return analysis


def public_candidate(candidate: dict[str, Any], source_in: float, clock: dict[str, Any]) -> dict[str, Any]:
    beats = []
    for beat_no, crop_time in zip(candidate["beatNumbers"], candidate["beatTimesCropSec"]):
        mapped = map_source_file_time(source_in + float(crop_time), clock)
        beats.append({"beat": int(beat_no), **mapped})
    metrics = candidate["gridMetrics"]
    fit_fields = {"fitResidualMaxMs": candidate["fitResidualMaxMs"], "fitResidualMeanAbsMs": candidate["fitResidualMeanAbsMs"]}
    return {
        "id": candidate["id"],
        "multiplier": candidate["multiplier"],
        "phaseVariant": candidate["phaseVariant"],
        "bpm": candidate["bpm"],
        "t0CropSec": candidate["t0Sec"],
        "t0SourceFileSec": source_in + candidate["t0Sec"],
        "periodSec": candidate["periodSec"],
        "derivedFrom": candidate["derivedFrom"],
        **fit_fields,
        "metrics": metrics,
        "beats": beats,
    }


def analyze_selected_track(plan_path: Path, track_id: str, project_root: Path, hpss_mode: str) -> dict[str, Any]:
    plan_bytes = plan_path.read_bytes()
    plan = json.loads(plan_bytes)
    clock = resolve_track(plan_path, project_root, plan, track_id)
    y, sr = librosa.load(
        str(clock["assetPath"]),
        sr=None,
        mono=True,
        offset=clock["sourceInSec"],
        duration=clock["sourceDurationSec"],
    )
    decoded_duration = len(y) / sr
    if abs(decoded_duration - clock["sourceDurationSec"]) > max(1 / sr, 1e-4):
        fail("librosa decoded source range length does not match selected track sourceIn/sourceOut")
    analysis = analyze_waveform(y, sr, hpss_mode)
    candidates = [public_candidate(candidate, clock["sourceInSec"], clock) for candidate in analysis["candidates"]]
    winner_id = candidates[0]["id"]
    winner = next(candidate for candidate in candidates if candidate["id"] == winner_id)
    fit = analysis["fit"]

    hits = []
    for name, category in (("kick", "kick"), ("snare", "snare"), ("hihat", "hihat")):
        band = analysis["bands"][name]
        times, strengths = detect_transients(band["env"], band["times"], sr)
        for crop_time, strength in zip(times, strengths):
            mapped = map_source_file_time(clock["sourceInSec"] + float(crop_time), clock)
            beat_number = int(round((float(crop_time) - winner["t0CropSec"]) / winner["periodSec"]))
            hits.append({"t": mapped["sourceFileSec"], "s": float(strength), "k": category, "beat": beat_number, **mapped})
    hits.sort(key=lambda row: (row["t"], row["k"]))
    strongest_kicks = sorted((row for row in hits if row["k"] == "kick"), key=lambda row: row["s"], reverse=True)[:3]
    strongest_ids = {id(row) for row in strongest_kicks}
    for row in hits:
        row["strongKickCandidate"] = id(row) in strongest_ids

    rms_curve, sections = energy_profile(y, sr, decoded_duration, analysis["candidates"][0], analysis["bands"], clock["sourceInSec"], clock)
    best_metrics = winner["metrics"]
    accepted = (
        best_metrics["match"] >= 0.98
        and best_metrics["kickTransientCoverage"] >= 0.98
        and (best_metrics["meanAbsMs"] is not None and best_metrics["meanAbsMs"] < 10)
        and (best_metrics["totalDriftMs"] is not None and abs(best_metrics["totalDriftMs"]) < 5)
        and best_metrics["firstBeatEffective"]
        and fit["residualMaxMs"] <= 15
    )
    winner_reason = (
        "local half/double disambiguation ranks kick-transient coverage first, then the source-defined grid-beat match, mean grid alignment error, cumulative drift, first-beat validity, and stable candidate ID"
    )
    beat_curve = rms_curve
    source_audio_clock = {
        key: value for key, value in clock.items() if key not in {"assetPath", "timeMap"}
    }
    source_audio_clock["timeMap"] = clock["timeMap"]
    return {
        "format": FORMAT,
        "status": "grid-meets-source-acceptance" if accepted else "candidate-grid-needs-review",
        "source": {
            "audioPlanPath": str(plan_path),
            "audioPlanSha256": hashlib.sha256(plan_bytes).hexdigest(),
            "trackId": track_id,
            "assetId": clock["assetId"],
            "assetPath": str(clock["assetPath"]),
            "assetSha256": clock["assetSha256"],
            "locked": clock["locked"],
            "sourceInSec": clock["sourceInSec"],
            "sourceOutSec": clock["sourceOutSec"],
            "timeMapId": clock["timeMapId"],
            "timeMap": clock["timeMap"],
            "trackStartSec": clock["trackStartSec"],
            "trackSpeed": clock["trackSpeed"],
            "timeMapSpeed": clock["timeMapSpeed"],
            "effectiveSpeed": clock["effectiveSpeed"],
            "mappedFilmStartSec": clock["filmStartSec"],
            "mappingFormula": "sourceFileSec = sourceInSec + librosaCropSec; trackLocalSec = trackStartSec + (sourceFileSec - sourceInSec)/trackSpeed; filmGlobalSec = timeMap.filmStartSec + (trackLocalSec - timeMap.localStartSec)/timeMap.speed (or trackLocalSec when no timeMap)",
        },
        "analysis": {
            "method": "librosa.beat.beat_track(tightness=400, units=time) followed by numpy least-squares t_i=t0+i*T fit; tempo scalar is diagnostic only",
            "sr": int(sr),
            "decodedFrames": int(len(y)),
            "decodedDurationSec": decoded_duration,
            "tempoScalarDiagnosticBpm": analysis["tempo"] if math.isfinite(analysis["tempo"]) else None,
            "fittedBpm": fit["bpm"],
            "t0": clock["sourceInSec"] + fit["t0Sec"],
            "t0CropSec": fit["t0Sec"],
            "T": fit["periodSec"],
            "fitResidualMaxMs": fit["residualMaxMs"],
            "fitResidualMeanAbsMs": fit["residualMeanAbsMs"],
            "detectedBeatCount": int(len(analysis["beatTimes"])),
            "signalUsed": analysis["signal"],
            "hpss": analysis["hpss"],
            "piecewiseFitTriggeredByResidualOver15Ms": analysis["piecewiseFitTriggered"],
            "piecewiseTempoFitCandidates": analysis["piecewiseFits"],
            "bandNotes": [analysis["bands"]["hihatBandNote"]] if analysis["bands"]["hihatBandNote"] else [],
            "transientMetricTolerance": "per-grid tolerance = min(80ms, max(30ms, 15% of candidate beat period)); local peak detector collapses peaks within 220ms; match is source-direction grid beat to nearest kick transient; kickTransientCoverage is a local supplement to resolve half/double ambiguity",
            "candidateSelectionMethod": "local completion of the source method: compare all 0.5x/1x/2x grid candidates by detected kick coverage, then source-direction grid match and alignment metrics",
            "sectionsMethod": "candidate-only 8-beat RMS/kick-density windows; separate from least-squares tempo segmentation",
            "tempoSegmentationMethod": "when whole-range beat-fit max residual exceeds 15ms, run overlapping local 16-beat least-squares fits at 8-beat hops; local fit table is diagnostic and is not silently promoted to a continuous global grid",
        },
        "grid_drift": {
            "winnerId": winner_id,
            "winnerReason": winner_reason,
            "candidateAcceptanceCriteria": {"match (grid beats landing on a kick transient)": ">=0.98", "kickTransientCoverage (local half/double guard)": ">=0.98", "meanAbsMs (grid-to-transient)": "<10", "absoluteTotalDriftMs": "<5", "firstBeatEffective": True, "fitResidualMaxMs": "<=15"},
            "candidates": candidates,
        },
        "bpm": winner["bpm"],
        "t0": winner["t0SourceFileSec"],
        "T": winner["periodSec"],
        "beats": winner["beats"],
        "hits": hits,
        "rms": beat_curve,
        "sections": sections,
        "selectionBoundary": "Beat times, transients, RMS, and sections are candidate evidence only. They do not create a second audio plan, change locked ASR/voice tracks, move existing event IDs, or auto-trigger visual impacts.",
    }


def write_new(path: Path, payload: dict[str, Any]) -> None:
    if path.exists() or path.is_symlink():
        fail(f"output already exists; choose a new path: {path}")
    serialized = json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".part", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(serialized)
            handle.flush()
            os.fsync(handle.fileno())
        os.link(temporary, path)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def resolve_media_tools() -> tuple[str, str]:
    configured_ffmpeg = os.environ.get("MOTION_FFMPEG")
    ffmpeg = configured_ffmpeg or shutil.which("ffmpeg")
    if not ffmpeg:
        fail("verify-render needs the configured ffmpeg executable (MOTION_FFMPEG) or ffmpeg on PATH")
    ffmpeg_path = Path(ffmpeg).resolve(strict=True)
    if not ffmpeg_path.is_file() or not os.access(ffmpeg_path, os.X_OK):
        fail("MOTION_FFMPEG does not point to an executable file")
    os.environ["PATH"] = str(ffmpeg_path.parent) + os.pathsep + os.environ.get("PATH", "")
    configured_ffprobe = os.environ.get("MOTION_FFPROBE")
    sibling_ffprobe = ffmpeg_path.with_name("ffprobe")
    ffprobe = configured_ffprobe or (str(sibling_ffprobe) if sibling_ffprobe.is_file() else shutil.which("ffprobe"))
    if not ffprobe:
        fail("verify-render needs ffprobe beside ffmpeg or MOTION_FFPROBE on PATH")
    ffprobe_path = Path(ffprobe).resolve(strict=True)
    if not ffprobe_path.is_file() or not os.access(ffprobe_path, os.X_OK):
        fail("MOTION_FFPROBE does not point to an executable file")
    return str(ffmpeg_path), str(ffprobe_path)


def probe_audio_packet_clock(path: Path, ffprobe: str, sample_rate: int, video_start: float) -> dict[str, Any]:
    command = [
        ffprobe, "-v", "error", "-select_streams", "a:0", "-show_packets",
        "-show_entries", "packet=pts_time,duration_time,side_data_list", "-of", "json", str(path),
    ]
    result = subprocess.run(command, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        fail("ffprobe could not inspect final mux audio packet timestamps: " + result.stderr.strip()[-1200:])
    packets = json.loads(result.stdout).get("packets", [])
    parsed = []
    for index, row in enumerate(packets):
        try:
            pts = finite_number(row.get("pts_time"), f"audio packet {index}.pts_time")
        except ValueError:
            continue
        duration = None
        if row.get("duration_time") is not None:
            duration = finite_number(row.get("duration_time"), f"audio packet {index}.duration_time", 0)
        skip_samples = 0
        discard_padding = 0
        for side_data in row.get("side_data_list", []):
            if side_data.get("side_data_type") == "Skip Samples":
                skip_samples = int(side_data.get("skip_samples", 0) or 0)
                discard_padding = int(side_data.get("discard_padding", 0) or 0)
        parsed.append({"index": index, "ptsSec": pts, "durationSec": duration, "skipSamples": skip_samples, "discardPadding": discard_padding})
    if len(parsed) < 2:
        fail("final mux has too few timestamped audio packets to reconstruct its clock")
    deltas = np.diff(np.asarray([row["ptsSec"] for row in parsed], dtype=float))
    positive_deltas = deltas[deltas > 0]
    if not len(positive_deltas):
        fail("final mux audio packet PTS is not increasing")
    nominal_step = float(np.median(positive_deltas))
    gap_threshold = max(2 / sample_rate, nominal_step * 0.5)
    pts_jumps = []
    for index, delta in enumerate(deltas, start=1):
        excess = float(delta) - nominal_step
        if excess <= gap_threshold:
            continue
        previous = parsed[index - 1]
        current = parsed[index]
        pts_jumps.append({
            "afterPacketIndex": previous["index"],
            "beforePacketIndex": current["index"],
            "previousPacketPtsSec": previous["ptsSec"],
            "nextPacketPtsSec": current["ptsSec"],
            "packetPtsStepSec": float(delta),
            "medianPacketPtsStepSec": nominal_step,
            "inferredMissingPresentationSec": excess,
            "previousPacketDeclaredDurationSec": previous["durationSec"],
            "relativeToVideoStart": {
                "estimatedGapStartFilmGlobalSec": previous["ptsSec"] + nominal_step - video_start,
                "gapEndFilmGlobalSec": current["ptsSec"] - video_start,
                "estimatedGapDurationSec": excess,
            },
            "basis": "PTS step minus median packet cadence; packet duration is retained separately and is not treated as decoded sample payload",
        })
    first = parsed[0]
    first_audible_sample_sec = first["ptsSec"] + first["skipSamples"] / sample_rate
    leading_silence_sec = max(0.0, first_audible_sample_sec - video_start)
    return {
        "packetCount": len(parsed),
        "firstPacketPtsSec": first["ptsSec"],
        "lastPacketPtsSec": parsed[-1]["ptsSec"],
        "firstPacketSkipSamples": first["skipSamples"],
        "firstPacketDiscardPaddingSamples": first["discardPadding"],
        "firstAudibleSamplePtsSecEstimate": first_audible_sample_sec,
        "firstPacketPtsRelativeToVideoStartSec": first["ptsSec"] - video_start,
        "estimatedLeadingSilenceFromVideoStartSec": leading_silence_sec,
        "estimatedLeadingSilenceFrames": int(round(leading_silence_sec * sample_rate)),
        "medianPacketPtsStepSec": nominal_step,
        "packetPtsJumps": pts_jumps,
        "inferredMissingPresentationSec": float(sum(row["inferredMissingPresentationSec"] for row in pts_jumps)),
    }


def probe_decoded_frame_clock(path: Path, ffprobe: str, sample_rate: int, video_start: float) -> dict[str, Any]:
    command = [
        ffprobe, "-v", "error", "-select_streams", "a:0", "-show_frames",
        "-show_entries", "frame=pts_time,best_effort_timestamp_time,nb_samples", "-of", "json", str(path),
    ]
    result = subprocess.run(command, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        fail("ffprobe could not inspect final mux decoded audio frame timestamps: " + result.stderr.strip()[-1200:])
    frames = json.loads(result.stdout).get("frames", [])
    parsed = []
    for index, row in enumerate(frames):
        pts_value = row.get("best_effort_timestamp_time", row.get("pts_time"))
        try:
            pts = finite_number(pts_value, f"decoded audio frame {index}.pts_time")
            samples = int(finite_number(row.get("nb_samples"), f"decoded audio frame {index}.nb_samples", 1))
        except ValueError:
            continue
        parsed.append({"index": index, "ptsSec": pts, "samples": samples})
    if len(parsed) < 2:
        fail("final mux has too few timestamped decoded audio frames to reconstruct its clock")
    pts_gaps = []
    for previous, current in zip(parsed, parsed[1:]):
        expected_end = previous["ptsSec"] + previous["samples"] / sample_rate
        gap_sec = current["ptsSec"] - expected_end
        if gap_sec <= 2 / sample_rate:
            continue
        gap_start_abs = expected_end
        gap_end_abs = current["ptsSec"]
        gap_start_film = max(0.0, gap_start_abs - video_start)
        gap_end_film = max(0.0, gap_end_abs - video_start)
        if gap_end_film <= gap_start_film:
            continue
        pts_gaps.append({
            "afterDecodedFrameIndex": previous["index"],
            "beforeDecodedFrameIndex": current["index"],
            "previousFramePtsSec": previous["ptsSec"],
            "previousFrameSamples": previous["samples"],
            "nextFramePtsSec": current["ptsSec"],
            "estimatedMissingPresentationSec": gap_sec,
            "relativeToVideoStart": {
                "gapStartFilmGlobalSec": gap_start_film,
                "gapEndFilmGlobalSec": gap_end_film,
                "estimatedGapDurationSec": gap_end_film - gap_start_film,
            },
            "estimatedInsertedSilenceFrames": int(round((gap_end_film - gap_start_film) * sample_rate)),
        })
    return {
        "decodedFrameCount": len(parsed),
        "firstDecodedFramePtsSec": parsed[0]["ptsSec"],
        "lastDecodedFramePtsSec": parsed[-1]["ptsSec"],
        "medianFrameDurationSec": float(np.median([row["samples"] for row in parsed])) / sample_rate,
        "framePtsGaps": pts_gaps,
        "inferredMissingPresentationSec": float(sum(row["estimatedMissingPresentationSec"] for row in pts_gaps)),
        "estimatedInsertedSilenceFrames": int(sum(row["estimatedInsertedSilenceFrames"] for row in pts_gaps)),
    }


def probe_mux(path: Path, ffprobe: str) -> dict[str, Any]:
    command = [
        ffprobe, "-v", "error", "-show_entries",
        "format=start_time,duration:stream=index,codec_type,codec_name,start_time,duration,sample_rate,channels",
        "-of", "json", str(path),
    ]
    result = subprocess.run(command, check=False, capture_output=True, text=True)
    if result.returncode != 0:
        fail("ffprobe could not inspect the final mux: " + result.stderr.strip()[-1200:])
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        fail(f"ffprobe returned invalid JSON: {error}")
    streams = payload.get("streams", [])
    video_streams = [row for row in streams if row.get("codec_type") == "video"]
    audio_streams = [row for row in streams if row.get("codec_type") == "audio"]
    if not video_streams or not audio_streams:
        fail("verify-render requires a final mux containing both video and audio")
    video = video_streams[0]
    audio = audio_streams[0]
    video_start = finite_number(video.get("start_time", 0), "video stream start_time")
    audio_start = finite_number(audio.get("start_time", 0), "audio stream start_time")
    duration_value = video.get("duration") or payload.get("format", {}).get("duration")
    video_duration = finite_number(duration_value, "final video duration", 1e-6)
    sample_rate = int(finite_number(audio.get("sample_rate"), "audio sample_rate", 1))
    packet_clock = probe_audio_packet_clock(path, ffprobe, sample_rate, video_start)
    decoded_frame_clock = probe_decoded_frame_clock(path, ffprobe, sample_rate, video_start)
    return {
        "video": video,
        "audio": audio,
        "videoStartSec": video_start,
        "audioStartSec": audio_start,
        "audioOffsetFromVideoStartSec": audio_start - video_start,
        "videoDurationSec": video_duration,
        "audioSampleRate": sample_rate,
        "audioPacketClock": packet_clock,
        "decodedAudioFrameClock": decoded_frame_clock,
        "format": payload.get("format", {}),
    }


def nearest_residuals(source_times: np.ndarray, target_times: np.ndarray) -> np.ndarray:
    if not len(source_times) or not len(target_times):
        return np.asarray([], dtype=float)
    residuals = []
    for source_time in source_times:
        index = int(np.searchsorted(target_times, source_time))
        nearby = []
        if index < len(target_times):
            nearby.append(float(target_times[index]))
        if index > 0:
            nearby.append(float(target_times[index - 1]))
        nearest = min(nearby, key=lambda value: abs(value - float(source_time)))
        residuals.append(nearest - float(source_time))
    return np.asarray(residuals, dtype=float)


def residual_summary(source_times: np.ndarray, target_times: np.ndarray, tolerance_sec: float) -> dict[str, Any]:
    residuals = nearest_residuals(source_times, target_times)
    if not len(residuals):
        return {
            "sourceCount": int(len(source_times)),
            "targetCount": int(len(target_times)),
            "matchedCount": 0,
            "toleranceSecForDiagnostic": tolerance_sec,
            "fractionWithinDiagnosticTolerance": None,
            "meanSignedMs": None,
            "meanAbsMs": None,
            "medianAbsMs": None,
            "maxAbsMs": None,
            "firstSignedMs": None,
            "lastSignedMs": None,
            "driftSlopeMsPerSec": None,
            "totalDriftMs": None,
            "residualsMs": [],
        }
    source_span = float(np.ptp(source_times)) if len(source_times) > 1 else 0.0
    if len(residuals) >= 2 and source_span > 0:
        slope, _ = np.polyfit(source_times, residuals, 1)
        total_drift_ms = float(slope * source_span * 1000)
    else:
        slope, total_drift_ms = None, None
    absolute = np.abs(residuals)
    return {
        "sourceCount": int(len(source_times)),
        "targetCount": int(len(target_times)),
        "matchedCount": int(np.count_nonzero(absolute <= tolerance_sec)),
        "toleranceSecForDiagnostic": tolerance_sec,
        "fractionWithinDiagnosticTolerance": float(np.mean(absolute <= tolerance_sec)),
        "meanSignedMs": float(np.mean(residuals) * 1000),
        "meanAbsMs": float(np.mean(absolute) * 1000),
        "medianAbsMs": float(np.median(absolute) * 1000),
        "maxAbsMs": float(np.max(absolute) * 1000),
        "firstSignedMs": float(residuals[0] * 1000),
        "lastSignedMs": float(residuals[-1] * 1000),
        "driftSlopeMsPerSec": float(slope * 1000) if slope is not None else None,
        "totalDriftMs": total_drift_ms,
        "residualsMs": (residuals * 1000).tolist(),
    }


def candidate_interpretation_status(reference_to_mux: dict[str, Any], mux_to_reference: dict[str, Any]) -> str:
    if int(reference_to_mux.get("matchedCount", 0)) == 0 or int(mux_to_reference.get("matchedCount", 0)) == 0:
        return "unresolved-review-required-no-bidirectional-matches"
    return "candidate-only-absolute-offset-alias-ambiguous"


def validate_reference(reference_path: Path, project_root: Path) -> tuple[dict[str, Any], dict[str, Any], bytes]:
    reference_bytes = reference_path.read_bytes()
    reference = json.loads(reference_bytes)
    if reference.get("format") != FORMAT:
        fail("--reference must be a laohu.arrangement.beat-grid/1 result")
    source = reference.get("source", {})
    plan_path_value = source.get("audioPlanPath")
    if not isinstance(plan_path_value, str) or not Path(plan_path_value).is_absolute():
        fail("beat-grid reference must record an absolute audioPlanPath")
    plan_path = Path(plan_path_value).resolve(strict=True)
    if os.path.commonpath([str(project_root), str(plan_path)]) != str(project_root):
        fail("reference audio plan must stay inside --project-root")
    plan_bytes = plan_path.read_bytes()
    expected_plan_hash = source.get("audioPlanSha256")
    if hashlib.sha256(plan_bytes).hexdigest() != expected_plan_hash:
        fail("reference audio plan hash changed since source beat-grid analysis")
    track_id = source.get("trackId")
    if not isinstance(track_id, str) or not track_id:
        fail("beat-grid reference is missing its selected track ID")
    plan = json.loads(plan_bytes)
    clock = resolve_track(plan_path, project_root, plan, track_id)
    if clock["assetSha256"] != source.get("assetSha256") or clock["assetId"] != source.get("assetId"):
        fail("reference selected asset no longer matches its recorded identity")
    if not isinstance(reference.get("beats"), list):
        fail("beat-grid reference is missing mapped beats")
    return reference, clock, reference_bytes


def verify_render_audio(reference_path: Path, render_path: Path, output_path: Path, project_root: Path) -> dict[str, Any]:
    if os.path.commonpath([str(project_root), str(reference_path)]) != str(project_root):
        fail("reference result must stay inside --project-root")
    if os.path.commonpath([str(project_root), str(render_path)]) != str(project_root):
        fail("final mux must stay inside --project-root")
    reference, clock, reference_bytes = validate_reference(reference_path, project_root)
    ffmpeg, ffprobe = resolve_media_tools()
    mux = probe_mux(render_path, ffprobe)
    audio_offset = mux["audioOffsetFromVideoStartSec"]
    sample_rate = mux["audioSampleRate"]
    video_start = mux["videoStartSec"]
    timestamp_filter = f"asetpts=PTS-{video_start:.12f}/TB,aresample=async=1:first_pts=0"
    temp_root = project_root / ".cache" / "tmp" / "motion-source-integration" / "render-backtest"
    temp_root.mkdir(parents=True, exist_ok=True)
    temp_root = temp_root.resolve(strict=True)
    if os.path.commonpath([str(project_root), str(temp_root)]) != str(project_root):
        fail("render decode temporary path must stay inside --project-root")
    with tempfile.TemporaryDirectory(prefix="mux-audio-", dir=temp_root) as temp_dir:
        decoded_path = Path(temp_dir) / "decoded-audio.wav"
        command = [
            ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-copyts", "-i", str(render_path),
            "-map", "0:a:0", "-vn", "-af", timestamp_filter, "-ac", "1",
            "-ar", str(sample_rate), "-c:a", "pcm_f32le", "-f", "wav", str(decoded_path),
        ]
        decoded = subprocess.run(command, check=False, capture_output=True, text=True)
        if decoded.returncode != 0:
            fail("ffmpeg could not decode the final mux audio stream: " + decoded.stderr.strip()[-1200:])
        try:
            y, decoded_sr = sf.read(str(decoded_path), dtype="float32", always_2d=False)
        except Exception as error:
            fail(f"decoded final mux audio could not be read as PCM: {error}")
    if int(decoded_sr) != sample_rate or y.ndim != 1 or not len(y) or not np.all(np.isfinite(y)):
        fail("decoded final mux audio is empty, malformed, non-mono, or has an unexpected sample rate")
    if len(y) < sample_rate:
        fail("decoded final mux audio is shorter than one second and cannot support beat analysis")
    decoded_duration = len(y) / sample_rate
    analysis = analyze_waveform(y, sample_rate, "auto")

    video_end = mux["videoDurationSec"]
    # The PCM sample index zero is the first video presentation time, not the audio stream's first packet.
    # aresample has already restored any leading/interior PTS silence in that video-local coordinate.
    audio_start = 0.0
    audio_end = decoded_duration
    expected_rows = []
    omitted_outside_video = 0
    omitted_outside_audio = 0
    for index, row in enumerate(reference["beats"]):
        film_time = finite_number(row.get("filmGlobalSec"), f"reference.beats[{index}].filmGlobalSec")
        if film_time < 0 or film_time > video_end:
            omitted_outside_video += 1
            continue
        if film_time < audio_start or film_time > audio_end:
            omitted_outside_audio += 1
            continue
        expected_rows.append({"index": index, "beat": row.get("beat"), "filmGlobalSec": film_time})
    if len(expected_rows) < 2:
        fail("fewer than two source-plan-mapped reference beats overlap the final mux audio/video range")
    expected = np.asarray([row["filmGlobalSec"] for row in expected_rows], dtype=float)
    expected_period = float(np.median(np.diff(expected)))
    if expected_period <= 0:
        fail("reference mapped beats are not strictly increasing")
    diagnostic_tolerance = min(0.08, max(0.03, expected_period * 0.15))

    candidate_rows = []
    for candidate in analysis["candidates"]:
        output_grid = np.asarray(candidate["beatTimesCropSec"], dtype=float)
        output_grid = output_grid[(output_grid >= 0) & (output_grid <= video_end)]
        ref_to_output = residual_summary(expected, output_grid, diagnostic_tolerance)
        output_to_ref = residual_summary(output_grid, expected, diagnostic_tolerance)
        ref_fraction = ref_to_output["fractionWithinDiagnosticTolerance"] or 0.0
        output_fraction = output_to_ref["fractionWithinDiagnosticTolerance"] or 0.0
        mean_abs = (ref_to_output["meanAbsMs"] or 0.0) + (output_to_ref["meanAbsMs"] or 0.0)
        drift = abs(ref_to_output["totalDriftMs"] or 0.0) + abs(output_to_ref["totalDriftMs"] or 0.0)
        candidate_rows.append({
            "id": candidate["id"],
            "bpm": float(candidate["bpm"]),
            "periodSec": float(candidate["periodSec"]),
            "periodDifferenceMsFromMappedPlan": float((candidate["periodSec"] - expected_period) * 1000),
            "referenceToMuxGrid": ref_to_output,
            "muxGridToReference": output_to_ref,
            "interpretationStatus": candidate_interpretation_status(ref_to_output, output_to_ref),
            "_rank": (-min(ref_fraction, output_fraction), mean_abs, drift, abs(candidate["periodSec"] - expected_period), candidate["id"]),
        })
    candidate_rows.sort(key=lambda row: row["_rank"])
    if not candidate_rows or candidate_rows[0]["referenceToMuxGrid"]["meanAbsMs"] is None:
        fail("final mux audio produced no usable output beat grid")
    selected = candidate_rows[0]
    for row in candidate_rows:
        row.pop("_rank", None)

    actual_hits: dict[str, np.ndarray] = {}
    for name in ("kick", "snare", "hihat"):
        hit_times, _strength = detect_transients(analysis["bands"][name]["env"], analysis["bands"][name]["times"], sample_rate)
        actual_hits[name] = hit_times
    reference_event_comparisons = []
    category_summaries = {}
    reference_hits = [row for row in reference.get("hits", []) if row.get("k") in actual_hits]
    for category in actual_hits:
        category_rows = []
        for index, hit in enumerate(reference_hits):
            if hit.get("k") != category or not isinstance(hit.get("filmGlobalSec"), (int, float)):
                continue
            expected_hit = float(hit["filmGlobalSec"])
            if expected_hit < 0 or expected_hit > video_end or expected_hit > audio_end:
                continue
            nearest = nearest_residuals(np.asarray([expected_hit]), actual_hits[category])
            mux_time = expected_hit + float(nearest[0]) if len(nearest) else None
            comparison = {
                "referenceHitIndex": index,
                "kind": category,
                "referenceFilmGlobalSec": expected_hit,
                "nearestMuxBandTransientFilmGlobalSec": mux_time,
                "signedOffsetMsMuxMinusReference": float(nearest[0] * 1000) if len(nearest) else None,
            }
            reference_event_comparisons.append(comparison)
            if len(nearest):
                category_rows.append((expected_hit, float(nearest[0])))
        event_residuals = np.asarray([row[1] for row in category_rows], dtype=float)
        if len(event_residuals) >= 2 and np.ptp(np.asarray([row[0] for row in category_rows])) > 0:
            slope, _ = np.polyfit(np.asarray([row[0] for row in category_rows]), event_residuals, 1)
            drift_ms = float(slope * np.ptp(np.asarray([row[0] for row in category_rows])) * 1000)
        else:
            slope, drift_ms = None, None
        category_summaries[category] = {
            "referenceEventCountInRender": len(category_rows),
            "detectedMuxBandTransientCount": int(len(actual_hits[category])),
            "meanSignedOffsetMsMuxMinusReference": float(np.mean(event_residuals) * 1000) if len(event_residuals) else None,
            "meanAbsOffsetMs": float(np.mean(np.abs(event_residuals)) * 1000) if len(event_residuals) else None,
            "maxAbsOffsetMs": float(np.max(np.abs(event_residuals)) * 1000) if len(event_residuals) else None,
            "driftSlopeMsPerSec": float(slope * 1000) if slope is not None else None,
            "totalDriftMs": drift_ms,
        }

    return {
        "format": "laohu.arrangement.beat-grid-render-check/1",
        "status": "measured-not-a-quality-verdict",
        "reference": {
            "path": str(reference_path),
            "sha256": hashlib.sha256(reference_bytes).hexdigest(),
            "audioPlanPath": reference["source"]["audioPlanPath"],
            "audioPlanSha256": reference["source"]["audioPlanSha256"],
            "trackId": reference["source"]["trackId"],
            "assetSha256": clock["assetSha256"],
            "locked": clock["locked"],
            "mappedBeats": len(reference["beats"]),
            "mappedEvents": len(reference.get("hits", [])),
            "clock": "reference beat/event filmGlobalSec values are reused directly from the same verified audio-plan source result; sourceIn, track speed, timeMap and selected asset hashes are revalidated",
        },
        "render": {
            "path": str(render_path),
            "sha256": sha256_file(render_path),
            "video": mux["video"],
            "audio": mux["audio"],
            "videoStartSec": mux["videoStartSec"],
            "audioStartSec": mux["audioStartSec"],
            "audioOffsetFromVideoStartSec": audio_offset,
            "videoDurationSec": video_end,
            "decodedAudioDurationSec": decoded_duration,
            "decodedSampleRate": sample_rate,
            "decodedFrames": int(len(y)),
            "packetPtsClock": mux["audioPacketClock"],
            "decodedFramePtsClock": mux["decodedAudioFrameClock"],
            "decodedPcmClock": {
                "sampleIndexZeroFilmGlobalSec": 0.0,
                "sampleIndexZeroDefinition": "first video stream presentation timestamp; filter rebases audio timestamps by the actual video stream start_time",
                "filter": timestamp_filter,
                "copyInputTimestamps": True,
                "estimatedLeadingSilenceSec": mux["audioPacketClock"]["estimatedLeadingSilenceFromVideoStartSec"],
                "estimatedLeadingSilenceFrames": mux["audioPacketClock"]["estimatedLeadingSilenceFrames"],
                "interiorPtsGapRanges": mux["decodedAudioFrameClock"]["framePtsGaps"],
                "estimatedInsertedSilenceFrames": mux["audioPacketClock"]["estimatedLeadingSilenceFrames"] + mux["decodedAudioFrameClock"]["estimatedInsertedSilenceFrames"],
                "decodedEndFilmGlobalSec": decoded_duration,
                "audioIsExtendedToVideoEnd": False,
                "note": "Estimated inserted silence restores PTS alignment; these frames are not reported as original encoded payload. Decoding ends with the last real audio frame and does not synthesize a missing audio tail to fill the video.",
            },
            "decodedAudioMethod": "ffmpeg decoded final mux stream 0:a:0 with -copyts; rebased audio PTS against video stream start_time and used aresample async first_pts=0 to preserve leading/interior gaps before project-local float PCM analysis",
        },
        "comparison": {
            "mappedPlanBeatCountInMuxRange": len(expected_rows),
            "referenceBeatsOutsideVideo": omitted_outside_video,
            "referenceBeatsOutsideDecodedAudio": omitted_outside_audio,
            "comparisonClock": "PCM sample index zero is video stream start_time; output beat and transient coordinates are relative to that video origin and are compared directly with filmGlobalSec reference values. The raw stream audio offset is diagnostic metadata, not added a second time.",
            "candidateInterpretation": {
                "status": selected["interpretationStatus"],
                "meaning": "The selected grid is a numerical comparison candidate, not an alignment verdict. If either directional comparison has zero matched grid points, its result is unresolved and requires review.",
                "absoluteOffsetLimit": "Periodic beat grids and same-kind nearest transient matches can have whole-beat or half-beat aliases; their directional mean residuals cannot uniquely recover one absolute source-to-mux track offset and must not be interpreted as a unified offset scalar.",
                "selectedBidirectionalMatchCounts": {
                    "referenceToMux": selected["referenceToMuxGrid"]["matchedCount"],
                    "muxToReference": selected["muxGridToReference"]["matchedCount"],
                },
            },
            "diagnosticToleranceSec": diagnostic_tolerance,
            "selectedMuxGridCandidate": {key: value for key, value in selected.items() if key != "_rank"},
            "allMuxGridCandidates": candidate_rows,
            "referenceEventDetectionMethod": "same-kind 40-160 Hz kick, derived snare body/attack, and available hihat-band onset peaks detected from the final decoded mux; these are acoustic proxies, not semantic event verification",
            "eventsByKind": category_summaries,
            "referenceEventComparisons": reference_event_comparisons,
            "noGlobalPassThreshold": "all offsets, coverage and drift are reported as measurements; this command sets no new universal audio-quality threshold",
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Analyze a selected music track or verify beat and transient timing from a final mux audio stream.")
    subparsers = parser.add_subparsers(dest="command", required=True)
    analyze_parser = subparsers.add_parser("analyze", help="analyze a selected audio-plan music track on source and film clocks")
    analyze_parser.add_argument("--plan", required=True, type=Path, help="absolute audio-plan.v1 JSON")
    analyze_parser.add_argument("--track-id", required=True, help="exact existing music track ID; locked tracks are permitted for read-only analysis")
    analyze_parser.add_argument("--output", required=True, type=Path, help="new project-local JSON result path")
    analyze_parser.add_argument("--project-root", type=Path, help="project root for input/output containment; defaults to the audio-plan directory")
    analyze_parser.add_argument("--hpss", choices=["auto", "always", "off"], default="auto", help="use HPSS percussive stem when full-mix grid quality is poor; default auto")
    render_parser = subparsers.add_parser("verify-render", help="decode and compare the actual final mux audio stream to mapped source-plan beat/event references")
    render_parser.add_argument("--reference", required=True, type=Path, help="previous analyze result from this exact audio-plan/music track")
    render_parser.add_argument("--render", required=True, type=Path, help="actual final mux containing video and rendered audio")
    render_parser.add_argument("--output", required=True, type=Path, help="new project-local JSON measurement result")
    render_parser.add_argument("--project-root", required=True, type=Path, help="project root containing the reference, plan, final mux and output")
    args = parser.parse_args(argv)
    try:
        if args.command == "analyze":
            if not args.plan.is_absolute() or not args.output.is_absolute():
                fail("--plan and --output must be absolute paths")
            configured_ffmpeg = os.environ.get("MOTION_FFMPEG")
            if configured_ffmpeg:
                ffmpeg_path = Path(configured_ffmpeg).resolve(strict=True)
                if not ffmpeg_path.is_file() or not os.access(ffmpeg_path, os.X_OK):
                    fail("MOTION_FFMPEG does not point to an executable file")
                os.environ["PATH"] = str(ffmpeg_path.parent) + os.pathsep + os.environ.get("PATH", "")
            plan_path = args.plan.resolve(strict=True)
            project_root = (args.project_root or plan_path.parent).resolve(strict=True)
            output_parent = args.output.parent.resolve(strict=True)
            if output_parent != args.output.parent:
                fail("beat-grid output parent directory must not redirect through a symlink")
            output_path = output_parent / args.output.name
            if os.path.commonpath([str(project_root), str(plan_path)]) != str(project_root):
                fail("audio plan must stay inside --project-root")
            if os.path.commonpath([str(project_root), str(output_path)]) != str(project_root):
                fail("beat-grid output must stay inside --project-root")
            if output_path == plan_path:
                fail("beat-grid output cannot overwrite the input audio plan")
            payload = analyze_selected_track(plan_path, args.track_id, project_root, args.hpss)
            write_new(output_path, payload)
            print(f"BEAT_GRID {output_path}")
            print(f"TRACK {args.track_id}")
            print(f"WINNER {payload['grid_drift']['winnerId']} bpm={payload['bpm']:.6f} match={payload['grid_drift']['candidates'][0]['metrics']['match']:.6f} status={payload['status']}")
            return 0

        if not args.reference.is_absolute() or not args.render.is_absolute() or not args.output.is_absolute() or not args.project_root.is_absolute():
            fail("--reference, --render, --output, and --project-root must be absolute paths")
        project_root = args.project_root.resolve(strict=True)
        reference_path = args.reference.resolve(strict=True)
        render_path = args.render.resolve(strict=True)
        if os.path.commonpath([str(project_root), str(reference_path)]) != str(project_root):
            fail("reference result must stay inside --project-root")
        if os.path.commonpath([str(project_root), str(render_path)]) != str(project_root):
            fail("final mux must stay inside --project-root")
        output_parent = args.output.parent.resolve(strict=True)
        if output_parent != args.output.parent:
            fail("render-check output parent directory must not redirect through a symlink")
        output_path = output_parent / args.output.name
        if os.path.commonpath([str(project_root), str(output_path)]) != str(project_root):
            fail("render-check output must stay inside --project-root")
        if output_path in {reference_path, render_path}:
            fail("render-check output cannot overwrite the reference or final mux")
        payload = verify_render_audio(reference_path, render_path, output_path, project_root)
        write_new(output_path, payload)
        selected = payload["comparison"]["selectedMuxGridCandidate"]
        forward = selected["referenceToMuxGrid"]
        reverse = selected["muxGridToReference"]
        forward_mean = "n/a" if forward["meanAbsMs"] is None else f"{forward['meanAbsMs']:.3f}"
        reverse_mean = "n/a" if reverse["meanAbsMs"] is None else f"{reverse['meanAbsMs']:.3f}"
        forward_fraction = "n/a" if forward["fractionWithinDiagnosticTolerance"] is None else f"{forward['fractionWithinDiagnosticTolerance']:.3f}"
        reverse_fraction = "n/a" if reverse["fractionWithinDiagnosticTolerance"] is None else f"{reverse['fractionWithinDiagnosticTolerance']:.3f}"
        print(f"RENDER_CHECK {output_path}")
        print(f"RENDER {render_path}")
        print(
            f"NUMERICAL_CANDIDATE {selected['id']} bpm={selected['bpm']:.6f} "
            f"periodDeltaMs={selected['periodDifferenceMsFromMappedPlan']:.3f} "
            f"meanAbsMs(refToMux={forward_mean},muxToRef={reverse_mean}) "
            f"matched={forward['matchedCount']}/{forward['sourceCount']},{reverse['matchedCount']}/{reverse['sourceCount']} "
            f"matchedFractions={forward_fraction}/{reverse_fraction} "
            f"interpretation={selected['interpretationStatus']}"
        )
        print("INTERPRETATION Periodic grids and nearest transients can alias by whole or half beats; these means are not a unique absolute track offset.")
        print(f"MEASUREMENT_STATUS {payload['status']}")
        return 0
    except (ValueError, OSError, json.JSONDecodeError) as error:
        print(f"beat-grid: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
