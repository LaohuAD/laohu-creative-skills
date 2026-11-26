from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import shutil
import sys
import unittest
import wave
import zipfile
from pathlib import Path
from types import SimpleNamespace
from unittest import mock
from uuid import uuid4


PROJECT_ROOT = Path(__file__).resolve().parents[4]
SCRIPTS = PROJECT_ROOT / ".agents" / "skills" / "laohu-arrangement" / "scripts"
sys.path.insert(0, str(SCRIPTS))
from sound import library  # noqa: E402

spec = importlib.util.spec_from_file_location("laohu_sound", SCRIPTS / "laohu-sound.py")
laohu_sound = importlib.util.module_from_spec(spec)
assert spec and spec.loader
sys.modules[spec.name] = laohu_sound
spec.loader.exec_module(laohu_sound)


def freesound_item(sound_id: int, title: str, description: str, downloads: int, duration: float) -> str:
    return (
        '<div class="bw-search__result" '
        f'data-sound-id="{sound_id}" data-username="fixture" data-num-downloads="{downloads}" '
        f'data-title="{title}" data-duration="{duration}" data-mp3="https://cdn.freesound.org/{sound_id}-lq.mp3">'
        '<span title="License: Attribution"></span>'
        '<span aria-label="Average rating of 4.5"></span><span class="bw-rating__count">(8)</span>'
        f'<div class="max-h-60px">{description}</div>'
        f'<a href="/people/fixture/sounds/{sound_id}/">details</a></div>'
    )


def pixabay_item(sound_id: int, title: str, author: str, likes: int, downloads: int, url: str) -> str:
    detail = {
        "@type": "AudioObject",
        "interactionStatistic": [
            {"interactionType": "https://schema.org/LikeAction", "userInteractionCount": likes},
            {"interactionType": "https://schema.org/DownloadAction", "userInteractionCount": downloads},
        ],
        "duration": "PT2S",
        "contentUrl": url,
    }
    return (f'<div class="nameAndTitle"><a href="/sound-effects/{title.replace(" ", "-")}-{sound_id}/" '
            f'class="title x">{title}</a><a href="/users/{author}/" class="name">{author}</a>'
            f'<span counter="{likes}"/></div><script type="application/ld+json">{json.dumps(detail)}</script>')


def pixabay_detail(likes: int, downloads: int, url: str) -> bytes:
    detail = {
        "@type": "AudioObject",
        "interactionStatistic": [
            {"interactionType": "https://schema.org/LikeAction", "userInteractionCount": likes},
            {"interactionType": "https://schema.org/DownloadAction", "userInteractionCount": downloads},
        ],
        "duration": "PT2S",
        "contentUrl": url,
    }
    return f'<script type="application/ld+json">{json.dumps(detail)}</script>'.encode()


def pixabay_music_listing_item(track_id: int, title: str, author: str, duration: str = "1:02") -> str:
    return (f'<div class="nameAndTitle"><a href="/music/{title.replace(" ", "-").lower()}-{track_id}/" '
            f'class="title x">{title}</a><a href="/users/{author}/" class="name">{author}</a>'
            f'<span>{duration}</span><a href="/music/ambient/">ambient</a>'
            f'<a href="/music/loop/">loop</a></div>')


def pixabay_music_detail(likes: int, downloads: int, url: str) -> bytes:
    detail = {
        "@type": "AudioObject",
        "interactionStatistic": [
            {"interactionType": "https://schema.org/LikeAction", "userInteractionCount": likes},
            {"interactionType": "https://schema.org/DownloadAction", "userInteractionCount": downloads},
        ],
        "duration": "PT62S",
        "contentUrl": url,
        "datePublished": "2025-02-03",
    }
    return (f'<meta name="description" content="Instrumental loop with piano">'
            f'<script type="application/ld+json">{json.dumps(detail)}</script>').encode()


def small_wav() -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(48000)
        wav.writeframes(b"\x00\x00" * 2400)
    return buffer.getvalue()


class SoundFoundationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.root = PROJECT_ROOT / ".cache" / "tmp" / "sound-foundation" / f"fixture-{uuid4().hex}"
        self.root.mkdir(parents=True)
        self.cache = self.root / ".cache" / "validation" / "sound-foundation"
        self.cache.mkdir(parents=True)
        library.CACHE = self.cache
        library.INDEX = self.cache / "index.json"
        library.VENV = self.cache / "venv"

    def tearDown(self) -> None:
        shutil.rmtree(self.root)

    def search_args(self, **overrides):
        values = {
            "query": "door close wood",
            "providers": "freesound",
            "role": "general",
            "pack": None,
            "action": "door close",
            "material": "wood",
            "min_duration_sec": None,
            "max_duration_sec": 1.5,
            "freesound_license": "any",
            "limit": 8,
            "pages": 2,
        }
        values.update(overrides)
        return SimpleNamespace(**values)

    def test_default_sound_cache_paths_are_generic_and_workproject_local(self) -> None:
        work = self.root / "portable-default-work"
        work.mkdir()
        cache, tmp = laohu_sound._resolved_cache_paths(work, None, None)
        self.assertEqual(cache, work.resolve() / ".cache" / "sound")
        self.assertEqual(tmp, work.resolve() / ".cache" / "tmp" / "sound")
        self.assertFalse(cache.exists())
        self.assertFalse(tmp.exists())

    def test_freesound_parsing_ranks_action_material_duration_before_popularity(self) -> None:
        page1 = freesound_item(1, "door blast metal", "loud metal impact", 9000, 1.1)
        page2 = freesound_item(2, "door close wood", "soft wood latch", 5, 0.6)

        def fetch(url: str, **_kwargs) -> bytes:
            return (page1 if "page=1" in url else page2).encode()

        with mock.patch.object(library, "fetch", side_effect=fetch):
            result = laohu_sound._search(self.search_args(), self.cache)

        self.assertEqual(result["networkStatus"], "success")
        self.assertEqual(result["providers"]["freesound"]["status"], "success")
        self.assertEqual([row["key"] for row in result["results"][:2]], ["fs:2", "fs:1"])
        self.assertEqual(result["results"][0]["stats"], {"downloads": 5, "rating": 4.5, "votes": 8})
        self.assertEqual(result["results"][0]["sourcePage"], "https://freesound.org/people/fixture/sounds/2/")
        self.assertFalse(result["results"][0]["license"]["exactVersionVerified"])
        json.dumps(result, ensure_ascii=False)

    def test_pixabay_parses_detail_json_and_preserves_likes_downloads(self) -> None:
        search_html = pixabay_item(11, "wood latch", "maker", 3, 7, "https://cdn.example/11.mp3") + pixabay_item(
            12, "wood door", "maker2", 20, 40, "https://cdn.example/12.mp3")

        def fetch(url: str, **_kwargs) -> bytes:
            if "/sound-effects/search/" in url:
                return search_html.encode()
            if "wood-door-12" in url:
                return pixabay_detail(20, 40, "https://cdn.example/12.mp3")
            return pixabay_detail(3, 7, "https://cdn.example/11.mp3")

        with mock.patch.object(laohu_sound.importlib.util, "find_spec", side_effect=lambda name: object()):
            with mock.patch.object(library, "fetch", side_effect=fetch):
                result = laohu_sound._search(self.search_args(providers="pixabay", pages=1, max_duration_sec=None), self.cache)

        self.assertEqual(result["networkStatus"], "success")
        self.assertEqual(result["results"][0]["key"], "px:12")
        self.assertEqual(result["results"][0]["stats"], {"likes": 20, "downloads": 40})
        self.assertEqual(result["results"][0]["preview"]["url"], "https://cdn.example/12.mp3")
        json.dumps(result, ensure_ascii=False)

    def test_mixkit_parser_reports_candidate_without_claiming_exact_license(self) -> None:
        html = ('<div data-audio-player-item-id-value="17"><a href="/free-sound-effects/metal-click/">'
                '</a><h2 class="item-grid-card__title">Metal click</h2>'
                '<div data-test-id="duration">0:02</div></div>')
        with mock.patch.object(library, "fetch", return_value=html.encode()):
            result = laohu_sound._search(self.search_args(providers="mixkit", query="metal click", action="click", material="metal",
                                                         max_duration_sec=None), self.cache)
        self.assertEqual(result["results"][0]["key"], "mk:17")
        self.assertEqual(result["results"][0]["sourcePage"], "https://mixkit.co/free-sound-effects/metal-click/")
        self.assertEqual(result["results"][0]["duration"]["seconds"], 2.0)
        self.assertFalse(result["results"][0]["license"]["exactVersionVerified"])

    def test_mixkit_music_uses_stock_music_endpoint_and_selected_get_resolves_track(self) -> None:
        listing = ('<div class="item-grid__item"><div data-audio-player-item-id-value="17" '
                   'data-audio-player-item-type-value="music" '
                   'data-download--button-modal-url-value="/free-stock-music/download/17/" '
                   'data-audio-player-preview-url-value="https://assets.mixkit.co/music/preview-17.mp3">'
                   '<h2 class="item-grid-card__title">Cinematic Loop</h2>'
                   '<p class="item-grid-music-preview__author">by Source Artist</p>'
                   '<div data-test-id="duration">0:30</div>'
                   '<a href="/free-stock-music/tag/loop/">Loop</a>'
                   '<a href="/free-stock-music/tag/96-bpm/">96 BPM</a>'
                   '<a href="/free-stock-music/tag/guitar/">Guitar</a></div>')
        modal = ('<div data-download--modal-url-value="https://assets.mixkit.co/music/track-17.wav"></div>')
        calls = []

        def fetch(url: str, **_kwargs) -> bytes:
            calls.append(url)
            if "/free-stock-music/download/" in url:
                return modal.encode()
            if url == "https://assets.mixkit.co/music/track-17.wav":
                return small_wav()
            if "/free-stock-music/" in url:
                return listing.encode()
            self.fail(f"unexpected Mixkit music URL {url}")

        args = self.search_args(providers="mixkit", role="music", query="loop", max_duration_sec=None,
                                use_case="tense-reveal", track_type="loop", source_in_sec=0,
                                source_out_sec=25, voice_context="narration-present",
                                visual_context="cinematic dramatic reveal under dialogue")
        with mock.patch.object(library, "fetch", side_effect=fetch):
            result = laohu_sound._search(args, self.cache)
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["results"][0]["key"], "mk:17")
        self.assertEqual(result["results"][0]["sourcePage"], "https://mixkit.co/free-stock-music/cinematic-loop/")
        self.assertTrue(all("/free-stock-music/" in url for url in calls))
        self.assertFalse(any("/free-sound-effects/" in url for url in calls))
        self.assertFalse(any("/download/" in url for url in calls), "search should not resolve each track detail")
        metadata = result["results"][0]["musicMetadata"]
        self.assertEqual(metadata["trackType"], {"value": "loop", "status": "source-claim", "basis": "Mixkit music listing tags/title"})
        self.assertEqual(metadata["voice"]["status"], "unknown")
        self.assertEqual(metadata["tempoBpm"]["value"], 96)
        self.assertEqual(result["results"][0]["rights"]["packageBoundary"], "work-cache-only")
        self.assertEqual(result["results"][0]["musicContext"]["applicabilityStatus"], "unconfirmed-by-listening")
        self.assertEqual(result["results"][0]["musicFit"]["useCaseEvidence"]["status"], "source-text-overlap")
        self.assertEqual(result["results"][0]["musicFit"]["sourceRangeEvidence"]["status"], "duration-covers-requested-range")
        self.assertEqual(result["results"][0]["musicFit"]["voiceContextEvidence"]["status"], "unknown-source-voice; audition-required")
        self.assertEqual(result["results"][0]["musicFit"]["visualContextEvidence"]["status"], "source-text-overlap")
        self.assertIn("do not rank acoustic", result["results"][0]["musicFit"]["selectionBoundary"])

        with mock.patch.object(library, "fetch", side_effect=fetch), \
                mock.patch.object(laohu_sound, "_probe_audio", return_value={"status": "unavailable", "reason": "fixture"}):
            got = laohu_sound._download(SimpleNamespace(key=["mk:17"], out_dir="assets/audio/music"), self.root, self.cache)
        self.assertEqual(got["results"][0]["status"], "downloaded")
        asset = got["results"][0]["asset"]
        self.assertTrue((self.root / asset["path"]).is_file())
        self.assertEqual(asset["reviewStatus"], "candidate-unreviewed")
        self.assertEqual(asset["rightsBoundary"]["redistribution"], "not-authorized-for-redistribution")
        self.assertTrue(any("/free-stock-music/download/17/" in url for url in calls))
        self.assertIn("https://assets.mixkit.co/music/track-17.wav", calls)

    def test_pixabay_music_search_is_light_and_get_checks_selected_individual_page(self) -> None:
        listing = pixabay_music_listing_item(12345, "ambient loop", "Fixture Artist")
        detail_url = "https://pixabay.com/music/ambient-loop-12345/"
        audio_url = "https://cdn.pixabay.com/audio/2025/02/03/audio-12345.mp3"
        calls = []

        def fetch(url: str, **_kwargs) -> bytes:
            calls.append(url)
            if url == "https://pixabay.com/music/search/ambient%20loop/":
                return listing.encode()
            if url == detail_url:
                return pixabay_music_detail(13, 29, audio_url)
            if url == audio_url:
                return small_wav()
            self.fail(f"unexpected Pixabay music URL {url}")

        with mock.patch.object(laohu_sound.importlib.util, "find_spec", side_effect=lambda _name: object()), \
                mock.patch.object(library, "fetch", side_effect=fetch):
            result = laohu_sound._search(
                self.search_args(providers="pixabay", role="music", query="ambient loop", max_duration_sec=None,
                                 pages=1, use_case="narration-bed-light-advance", track_type="loop",
                                 source_in_sec=10, source_out_sec=20, voice_context="narration-present",
                                 visual_context="ambient loop under narration"), self.cache)
        self.assertEqual(result["status"], "success")
        candidate = result["results"][0]
        self.assertEqual(candidate["key"], "px:12345")
        self.assertEqual(candidate["sourcePage"], detail_url)
        self.assertEqual(candidate["musicMetadata"]["trackType"]["value"], "loop")
        self.assertEqual(candidate["musicMetadata"]["voice"]["status"], "unknown")
        self.assertFalse(any(url == detail_url for url in calls), "search should defer individual detail fetch")
        self.assertEqual(candidate["rights"]["packageBoundary"], "work-cache-only")
        self.assertEqual(candidate["musicFit"]["sourceRangeEvidence"]["status"], "duration-covers-requested-range")
        self.assertEqual(candidate["musicFit"]["voiceContextEvidence"]["status"], "unknown-source-voice; audition-required")
        self.assertEqual(candidate["musicFit"]["visualContextEvidence"]["status"], "source-text-overlap")

        with mock.patch.object(laohu_sound.importlib.util, "find_spec", side_effect=lambda _name: object()), \
                mock.patch.object(library, "fetch", side_effect=fetch), \
                mock.patch.object(laohu_sound, "_probe_audio", return_value={"status": "unavailable", "reason": "fixture"}):
            got = laohu_sound._download(SimpleNamespace(key=["px:12345"], out_dir="assets/audio/music"), self.root, self.cache)
        self.assertEqual(got["results"][0]["status"], "downloaded")
        asset = got["results"][0]["asset"]
        self.assertTrue((self.root / asset["path"]).is_file())
        self.assertEqual(asset["community"]["trackStatistics"], {"likes": 13, "downloads": 29})
        self.assertEqual(asset["community"]["publishedDate"], "2025-02-03")
        self.assertEqual(asset["reviewStatus"], "candidate-unreviewed")
        self.assertEqual(calls.count(detail_url), 1)
        self.assertIn(audio_url, calls)

    def test_music_context_evidence_is_returned_without_scoring_or_reordering_candidates(self) -> None:
        def row(key: str, title: str, voice: str | None, tags: list[str]) -> dict:
            return {
                "key": key, "title": title, "dur": "1:00", "author": "fixture",
                "page": f"https://freesound.org/sounds/{key.split(':')[1]}/", "url": None,
                "preview": None, "license": "CC0", "stats": "", "desc": "",
                "tags": tags,
                "musicMetadata": {
                    "trackType": {"value": "fulltrack", "status": "source-claim", "basis": "fixture source page"},
                    "voice": {"value": voice, "status": "source-claim" if voice else "unknown", "basis": "fixture source page" if voice else None},
                    "instruments": {"value": None, "status": "unknown", "basis": None},
                    "density": {"value": None, "status": "unknown", "basis": None},
                    "tempoBpm": {"value": None, "status": "unknown", "basis": None},
                    "sourceRange": {"inSec": None, "outSec": None, "status": "not-selected"},
                },
            }

        candidates = [
            row("fs:1", "unknown tone", None, []),
            row("fs:2", "instrumental piano", "instrumental", ["soft", "piano"]),
            row("fs:3", "vocal chorus", "vocal-present", ["fun", "bright"]),
        ]
        with mock.patch.object(laohu_sound, "_capture_provider", return_value=candidates):
            result = laohu_sound._search(
                self.search_args(providers="freesound", role="music", query="unmatched-query",
                                 action="", material="", max_duration_sec=None, pages=1,
                                 use_case="lively-explanation", track_type="any",
                                 voice_context="narration-present", visual_context="fun bright montage"),
                self.cache,
            )
        self.assertEqual(result["status"], "success")
        self.assertEqual([candidate["key"] for candidate in result["results"]], ["fs:1", "fs:2", "fs:3"])
        self.assertEqual(result["results"][0]["musicFit"]["voiceContextEvidence"]["status"], "unknown-source-voice; audition-required")
        self.assertEqual(result["results"][1]["musicFit"]["voiceContextEvidence"]["status"], "source-claim-instrumental; audition-required")
        self.assertEqual(result["results"][2]["musicFit"]["voiceContextEvidence"]["status"], "source-claim-vocal-present; check-masking-by-audition")
        self.assertEqual(result["results"][2]["musicFit"]["visualContextEvidence"]["status"], "source-text-overlap")

    def test_kenney_coherent_pack_lists_local_preview_and_get_preserves_extension_and_hash(self) -> None:
        pack_file = self.cache / "kenney" / "interface-sounds" / "UI" / "button.wav"
        pack_file.parent.mkdir(parents=True)
        pack_file.write_bytes(small_wav())
        args = self.search_args(providers="kenney", pack="interface-sounds", query="button click")
        result = laohu_sound._search(args, self.cache)
        self.assertFalse(result["networkAttempted"])
        self.assertEqual(result["results"][0]["key"], "kn:interface-sounds/UI/button.wav")

        got = laohu_sound._download(SimpleNamespace(key=[result["results"][0]["key"],], out_dir="assets/audio/sfx"),
                                    self.root, self.cache)
        asset = got["results"][0]["asset"]
        self.assertEqual(asset["path"], "assets/audio/sfx/kn_interface-sounds_UI_button.wav")
        self.assertEqual(asset["sha256"], laohu_sound._sha256(self.root / asset["path"]))
        self.assertEqual(asset["preview"]["localPath"], asset["path"])
        self.assertEqual(asset["reviewStatus"], "candidate-unreviewed")
        self.assertEqual(asset["sourcePage"], "https://kenney.nl/assets/interface-sounds")
        if asset["probe"]["status"] == "success":
            self.assertAlmostEqual(asset["duration"]["seconds"], 0.05, places=3)
        else:
            self.assertEqual(asset["probe"]["status"], "unavailable")
            self.assertTrue(asset["probe"]["reason"])
        self.assertIsNone(asset["sourceHitpointSec"])
        self.assertEqual(asset["clipOperations"], [])
        self.assertFalse(got["networkAttempted"])
        self.assertEqual(got["networkStatus"], "not_attempted")
        conflict = laohu_sound._download(SimpleNamespace(key=[result["results"][0]["key"]], out_dir="assets/audio/sfx"),
                                         self.root, self.cache)
        self.assertEqual(conflict["status"], "output_conflict")

    def test_kenney_signed_download_link_is_resolved_and_cached_with_referer(self) -> None:
        pack = "interface-sounds"
        page = f"https://kenney.nl/assets/{pack}"
        download_id = "6173736574732f696e746572666163652d736f756e6473"
        signed_url = f"https://kenney.nl/download/{download_id}/signature?expires=123"
        archive_buffer = io.BytesIO()
        with zipfile.ZipFile(archive_buffer, "w") as archive:
            archive.writestr("Audio/button.wav", small_wav())
        calls = []

        def fetch(url: str, **kwargs) -> bytes:
            calls.append((url, kwargs))
            if url == page:
                return f'<a data-download-id="{download_id}">Download</a>'.encode()
            if url == f"https://kenney.nl/download-link/{download_id}":
                self.assertEqual(kwargs.get("headers", {}).get("Referer"), page)
                return json.dumps({"url": signed_url}).encode()
            if url == signed_url:
                self.assertEqual(kwargs.get("headers", {}).get("Referer"), page)
                return archive_buffer.getvalue()
            self.fail(f"unexpected fetch URL {url}")

        with mock.patch.object(library, "fetch", side_effect=fetch), contextlib.redirect_stdout(io.StringIO()) as output:
            library.kenney(SimpleNamespace(pack=pack))

        self.assertTrue((self.cache / "kenney" / pack / "Audio" / "button.wav").is_file())
        self.assertIn(f"kn:{pack}/", output.getvalue())
        self.assertEqual([url for url, _ in calls], [page, f"https://kenney.nl/download-link/{download_id}", signed_url])

    def test_provider_download_returns_asset_metadata_and_explicit_network_status(self) -> None:
        library.save_index([{"key": "fs:77", "title": "Wood door click", "url": "https://cdn.freesound.org/77.mp3",
                             "preview": "https://cdn.freesound.org/77.mp3", "page": "https://freesound.org/sounds/77/",
                             "author": "fixture", "license": "CC0", "dur": "0:01", "stats": "↓12"}])
        with mock.patch.object(library, "fetch", return_value=b"fixture-audio-bytes"):
            result = laohu_sound._download(SimpleNamespace(key=["fs:77"], out_dir="assets/audio/sfx"),
                                           self.root, self.cache)
        asset = result["results"][0]["asset"]
        self.assertEqual(result["networkStatus"], "success")
        self.assertTrue(result["networkAttempted"])
        self.assertEqual(asset["path"], "assets/audio/sfx/fs_77_Wood-door-click.mp3")
        self.assertEqual(asset["stats"], {"downloads": 12})
        self.assertEqual(asset["reviewStatus"], "candidate-unreviewed")
        self.assertIsNone(asset["sourceHitpointSec"])
        self.assertEqual(asset["clipOperations"], [])
        self.assertTrue(asset["sha256"])
        json.dumps(result, ensure_ascii=False)

    def test_provider_download_error_does_not_claim_empty_or_success(self) -> None:
        library.save_index([{"key": "fs:78", "title": "Metal click", "url": "https://cdn.freesound.org/78.mp3",
                             "preview": None, "page": "https://freesound.org/sounds/78/", "author": "fixture",
                             "license": "CC0", "dur": "1s", "stats": ""}])
        with mock.patch.object(library, "fetch", side_effect=OSError("fixture download failed")):
            result = laohu_sound._download(SimpleNamespace(key=["fs:78"], out_dir="assets/audio/sfx"),
                                           self.root, self.cache)
        self.assertEqual(result["networkStatus"], "error")
        self.assertEqual(result["status"], "download_error")
        self.assertEqual(result["results"][0]["status"], "download_error")
        json.dumps(result, ensure_ascii=False)

    def test_get_rejects_malformed_provider_key_before_network_or_output_writes(self) -> None:
        work = self.root / "malformed-key-work"
        work.mkdir()
        cache = work / ".cache" / "validation" / "sound-foundation"
        out_dir = work / "assets"
        out_dir.mkdir()
        outside = self.root / "malformed-key-escape"
        outside.mkdir()
        (out_dir / "mk_probe").symlink_to(outside, target_is_directory=True)
        args = SimpleNamespace(key=["mk:probe/escaped"], out_dir="assets")
        with mock.patch.object(library, "fetch") as fetch:
            result = laohu_sound._download(args, work, cache)
        self.assertEqual(result["status"], "invalid_key")
        self.assertFalse(result["networkAttempted"])
        self.assertEqual(result["networkStatus"], "not_attempted")
        fetch.assert_not_called()
        self.assertFalse((outside / "escaped.wav").exists())
        self.assertFalse(cache.exists())

    def test_supported_get_cli_rejects_malformed_key_before_cache_or_output_creation(self) -> None:
        work = self.root / "cli-malformed-key-work"
        work.mkdir()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            code = laohu_sound.main([
                "--work-root", str(work), "get", "--key", "mk:probe/escaped", "--out-dir", "assets",
            ])
        report = json.loads(output.getvalue())
        self.assertEqual(code, 2)
        self.assertEqual(report["status"], "invalid_key")
        self.assertFalse((work / ".cache").exists())
        self.assertFalse((work / "assets").exists())

    def test_get_rejects_symlinked_final_destination_before_fetch(self) -> None:
        work = self.root / "destination-symlink-work"
        work.mkdir()
        cache = work / ".cache" / "validation" / "sound-foundation"
        out_dir = work / "assets"
        out_dir.mkdir()
        outside = self.root / "destination-symlink-escape.wav"
        (out_dir / "mk_123.wav").symlink_to(outside)
        with mock.patch.object(library, "fetch") as fetch:
            result = laohu_sound._download(SimpleNamespace(key=["mk:123"], out_dir="assets"), work, cache)
        self.assertEqual(result["status"], "path_outside_work_root")
        self.assertFalse(result["networkAttempted"])
        fetch.assert_not_called()
        self.assertFalse(outside.exists())
        self.assertFalse(cache.exists())

    def test_get_rejects_symlinked_part_intermediate_before_fetch(self) -> None:
        work = self.root / "part-symlink-work"
        work.mkdir()
        cache = work / ".cache" / "validation" / "sound-foundation"
        out_dir = work / "assets"
        out_dir.mkdir()
        library.CACHE = cache
        library.INDEX = cache / "index.json"
        library.save_index([{"key": "fs:123", "title": "Wood click", "url": "https://cdn.freesound.org/123.wav",
                             "page": "https://freesound.org/sounds/123/", "license": "CC0", "stats": ""}])
        outside = self.root / "part-symlink-escape.wav"
        (out_dir / "fs_123_Wood-click.wav.part").symlink_to(outside)
        with mock.patch.object(library, "fetch") as fetch:
            result = laohu_sound._download(SimpleNamespace(key=["fs:123"], out_dir="assets"), work, cache)
        self.assertEqual(result["status"], "path_outside_work_root")
        self.assertFalse(result["networkAttempted"])
        fetch.assert_not_called()
        self.assertFalse(outside.exists())

    def test_main_rejects_workroot_cache_symlink_escape_before_mkdir(self) -> None:
        work = self.root / "cache-symlink-work"
        work.mkdir()
        outside = self.root / "cache-symlink-target"
        outside.mkdir()
        (work / ".cache").symlink_to(outside, target_is_directory=True)
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            code = laohu_sound.main(["--work-root", str(work), "doctor"])
        report = json.loads(output.getvalue())
        self.assertEqual(code, 2)
        self.assertEqual(report["status"], "path_outside_project_cache")
        self.assertFalse((outside / "sound").exists())
        self.assertFalse((outside / "tmp" / "sound").exists())

    def test_preserved_library_get_rejects_malformed_key_before_cache_creation(self) -> None:
        work = self.root / "library-malformed-key-work"
        work.mkdir()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            code = laohu_sound.main([
                "--work-root", str(work), "library", "get", "assets", "mk:probe/escaped",
            ])
        report = json.loads(output.getvalue())
        self.assertEqual(code, 2)
        self.assertEqual(report["status"], "invalid_key")
        self.assertFalse((work / ".cache").exists())
        self.assertFalse((work / "assets").exists())

    def test_main_rejects_tmp_symlink_escape_before_creating_cache(self) -> None:
        work = self.root / "tmp-symlink-work"
        (work / ".cache").mkdir(parents=True)
        outside = self.root / "tmp-symlink-target"
        outside.mkdir()
        (work / ".cache" / "tmp").symlink_to(outside, target_is_directory=True)
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            code = laohu_sound.main(["--work-root", str(work), "doctor"])
        report = json.loads(output.getvalue())
        self.assertEqual(code, 2)
        self.assertEqual(report["status"], "path_outside_project_cache")
        self.assertFalse((work / ".cache" / "sound").exists())
        self.assertFalse((outside / "sound").exists())

    def test_main_rejects_explicit_cache_symlink_escape_before_mkdir(self) -> None:
        work = self.root / "explicit-cache-symlink-work"
        (work / ".cache").mkdir(parents=True)
        outside = self.root / "explicit-cache-symlink-target"
        outside.mkdir()
        (work / ".cache" / "sound").symlink_to(outside, target_is_directory=True)
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            code = laohu_sound.main([
                "--work-root", str(work), "--cache-dir", str(work / ".cache" / "sound"),
                "doctor",
            ])
        report = json.loads(output.getvalue())
        self.assertEqual(code, 2)
        self.assertEqual(report["status"], "path_outside_project_cache")
        self.assertFalse(any(outside.iterdir()))

    def test_probe_uses_explicit_configured_ffprobe_and_parses_stream_metadata(self) -> None:
        ffprobe = str(self.root / "configured-ffprobe")
        payload = {"streams": [{"codec_name": "vorbis", "sample_rate": "48000", "channels": 2,
                                "channel_layout": "stereo", "duration": "0.750000"}],
                   "format": {"format_name": "ogg", "duration": "0.750000"}}
        with mock.patch.object(laohu_sound.subprocess, "run", return_value=SimpleNamespace(
                stdout=json.dumps(payload))) as run:
            result = laohu_sound._probe_audio(self.root / "candidate.ogg", ffprobe)
        self.assertEqual(result, {"status": "success", "codec": "vorbis", "sampleRate": 48000,
                                  "channels": 2, "channelLayout": "stereo", "durationSec": 0.75,
                                  "container": "ogg"})
        self.assertEqual(run.call_args.args[0][0], ffprobe)
        self.assertIn(str(self.root / "candidate.ogg"), run.call_args.args[0])

    def test_media_tool_resolution_uses_explicit_env_configuration(self) -> None:
        ffmpeg = str(self.root / "configured-ffmpeg")
        ffprobe = str(self.root / "configured-ffprobe")
        args = SimpleNamespace(ffmpeg=None, ffprobe=None)
        with mock.patch.dict(laohu_sound.os.environ,
                             {"LAOHU_FFMPEG": ffmpeg, "LAOHU_FFPROBE": ffprobe,
                              "MOTION_FFMPEG": "/ignored/motion-ffmpeg"}, clear=True):
            result = laohu_sound._media_tool_paths(args)
        self.assertEqual(result, (str(Path(ffmpeg).resolve()), str(Path(ffprobe).resolve())))

        motion_ffmpeg = str(self.root / "motion-ffmpeg")
        motion_ffprobe = str(self.root / "motion-ffprobe")
        with mock.patch.dict(laohu_sound.os.environ,
                             {"MOTION_FFMPEG": motion_ffmpeg, "MOTION_FFPROBE": motion_ffprobe}, clear=True):
            result = laohu_sound._media_tool_paths(args)
        self.assertEqual(result, (str(Path(motion_ffmpeg).resolve()), str(Path(motion_ffprobe).resolve())))

        explicit_ffmpeg = str(self.root / "explicit-ffmpeg")
        explicit_ffprobe = str(self.root / "explicit-ffprobe")
        args = SimpleNamespace(ffmpeg=explicit_ffmpeg, ffprobe=explicit_ffprobe)
        with mock.patch.dict(laohu_sound.os.environ,
                             {"LAOHU_FFMPEG": ffmpeg, "LAOHU_FFPROBE": ffprobe}, clear=True):
            result = laohu_sound._media_tool_paths(args)
        self.assertEqual(result, (str(Path(explicit_ffmpeg).resolve()), str(Path(explicit_ffprobe).resolve())))

    def test_media_tool_resolution_can_find_ffprobe_beside_configured_ffmpeg(self) -> None:
        bin_dir = self.root / "media-bin"
        bin_dir.mkdir()
        ffmpeg_path = bin_dir / "ffmpeg"
        ffprobe_path = bin_dir / "ffprobe"
        ffmpeg_path.touch()
        ffprobe_path.touch()
        args = SimpleNamespace(ffmpeg=str(ffmpeg_path), ffprobe=None)
        with mock.patch.dict(laohu_sound.os.environ, {}, clear=True):
            result = laohu_sound._media_tool_paths(args)
        self.assertEqual(result, (str(ffmpeg_path.resolve()), str(ffprobe_path.resolve())))

    def test_ui_route_prioritizes_kenney_but_keeps_requested_alternatives(self) -> None:
        calls = []

        def fake_capture(_library, name, *_args, **_kwargs):
            calls.append(name)
            return []

        with mock.patch.object(laohu_sound, "_kenney_catalog", return_value=["button-interface"]), \
                mock.patch.object(laohu_sound, "_capture_provider", side_effect=fake_capture), \
                mock.patch.object(laohu_sound.importlib.util, "find_spec", side_effect=lambda name: object()):
            result = laohu_sound._search(
                self.search_args(providers="pixabay,kenney,mixkit", role="ui", query="button"), self.cache
            )
        self.assertEqual(result["providerSearchOrder"], ["kenney", "pixabay", "mixkit"])
        self.assertEqual(calls, ["pixabay", "mixkit"])
        self.assertEqual(result["results"][0]["provider"], "kenney")

    def test_ui_route_does_not_invent_a_kenney_match_and_keeps_provider_fallback(self) -> None:
        def fake_capture(_library, name, *_args, **_kwargs):
            return [{"key": "mk:3", "title": "Soft button click", "desc": "interface button", "dur": "0:01",
                     "author": "source", "page": "https://mixkit.co/example", "preview": None, "url": "https://example.test/3.wav",
                     "license": "unknown", "stats": ""}] if name == "mixkit" else []

        with mock.patch.object(laohu_sound, "_kenney_catalog", return_value=["ambient-drone"]), \
                mock.patch.object(laohu_sound, "_capture_provider", side_effect=fake_capture):
            result = laohu_sound._search(
                self.search_args(providers="mixkit", role="ui", query="interface button", action="click", material="plastic"), self.cache
            )
        self.assertEqual(result["providerSearchOrder"], ["kenney", "mixkit"])
        self.assertEqual([row["provider"] for row in result["results"]], ["mixkit"])

    def test_ui_route_keeps_kenney_pack_and_fit_matched_fallback_visible(self) -> None:
        def fake_capture(_library, name, *_args, **_kwargs):
            return [{"key": "fs:3", "title": "button click plastic", "desc": "interface close click",
                     "dur": "0:01", "author": "source", "page": "https://freesound.org/example",
                     "preview": None, "url": "https://example.test/3.mp3", "license": "CC0", "stats": "↓1"}]

        with mock.patch.object(laohu_sound, "_kenney_catalog", return_value=["interface-sounds"]), \
                mock.patch.object(laohu_sound, "_capture_provider", side_effect=fake_capture):
            result = laohu_sound._search(
                self.search_args(providers="freesound", role="ui", query="interface button",
                                 action="click", material="plastic", limit=4), self.cache
            )
        self.assertEqual({row["provider"] for row in result["results"]}, {"kenney", "freesound"})
        self.assertEqual(result["providerSearchOrder"], ["kenney", "freesound"])

    def test_source_native_popularity_statistics_are_not_collapsed(self) -> None:
        freesound = laohu_sound._canonical_row(
            "freesound", {"key": "fs:4", "title": "wood door", "stats": "↓900", "dur": "1s"},
            "door", "close", "wood", None, None, 0, 1,
        )
        pixabay = laohu_sound._canonical_row(
            "pixabay", {"key": "px:5", "title": "wood door", "stats": "♥20 ↓40", "dur": "1s"},
            "door", "close", "wood", None, None, 1, 1,
        )
        self.assertEqual(freesound["stats"], {"downloads": 900})
        self.assertEqual(pixabay["stats"], {"likes": 20, "downloads": 40})
        self.assertIn("not compared across providers", freesound["providerRankBasis"])
        self.assertIn("not compared across providers", pixabay["providerRankBasis"])
        self.assertNotIn("providerPopularityRank", freesound)
        self.assertNotIn("providerPopularityRank", pixabay)

    def test_pixabay_missing_dependency_is_explicit_and_does_not_claim_network_attempt(self) -> None:
        with mock.patch.object(laohu_sound.importlib.util, "find_spec", return_value=None):
            result = laohu_sound._search(self.search_args(providers="pixabay"), self.cache)
        self.assertEqual(result["status"], "dependency_missing")
        self.assertFalse(result["networkAttempted"])
        self.assertEqual(result["providers"]["pixabay"]["status"], "dependency_missing")

    def test_invalid_provider_and_unsafe_kenney_pack_return_json_without_network(self) -> None:
        unknown = laohu_sound._search(self.search_args(providers="made-up"), self.cache)
        unsafe_pack = laohu_sound._search(self.search_args(providers="kenney", pack="../outside"), self.cache)
        self.assertEqual(unknown["status"], "invalid_provider")
        self.assertEqual(unsafe_pack["status"], "invalid_pack")
        self.assertFalse(unknown["networkAttempted"])
        self.assertFalse(unsafe_pack["networkAttempted"])
        json.dumps(unknown, ensure_ascii=False)
        json.dumps(unsafe_pack, ensure_ascii=False)

    def test_live_network_failure_is_not_reported_as_empty(self) -> None:
        with mock.patch.object(library, "fetch", side_effect=OSError("fixture timeout")):
            result = laohu_sound._search(self.search_args(providers="mixkit"), self.cache)
        self.assertEqual(result["status"], "network_error")
        self.assertEqual(result["networkStatus"], "error")
        self.assertEqual(result["providers"]["mixkit"]["status"], "network_error")
        self.assertTrue(result["networkAttempted"])


if __name__ == "__main__":
    unittest.main()
