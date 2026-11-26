#!/usr/bin/env python3
"""Search and download source SFX through the Arrangement CLI.

Stdlib-only providers are Mixkit, Kenney and Freesound. Pixabay uses curl_cffi
inside a project-cache venv. The original provider algorithms and CLI arguments
remain available via `scripts/laohu-sound.py library`.

  laohu-sound.py library mixkit <keyword> [-n N]
  laohu-sound.py library kenney [pack]
  laohu-sound.py library freesound "<query>" [--license cc0|by|any] [--sort relevance|downloads|rating|short] [-n N] [-p PAGE] [--pages K]
  laohu-sound.py library pixabay "<query>" [-n N] [-p PAGE] [--pages K]
  laohu-sound.py library get <out_dir> <key>...  keys: mk:<id> fs:<id> kn:<pack>/<file> px:<id>
"""
# Source-preserved from sxhzju/sound at 2287e2bc92ce22dc0008307ea3d25571ce3e8b81.
# Upstream had no LICENSE file; local-use authority and publication boundary are in ../../SOURCES.md.
import argparse, html, json, os, re, shutil, ssl, subprocess, sys, time, urllib.parse, urllib.request, zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) sfx-sources"}
PROJECT_ROOT = Path(__file__).resolve().parents[5]
# Keep search indexes, Kenney packs, and the optional Pixabay venv on the selected
# work project's external cache instead of the user's home directory.
CACHE = Path(os.environ.get(
    "LAOHU_SOUND_CACHE_DIR",
    str(PROJECT_ROOT / ".cache" / "sound"),
)).expanduser().resolve()
INDEX = CACHE / "index.json"  # search results, so `get` knows title + download url
VENV = CACHE / "venv"  # curl_cffi for Pixabay
FS_LICENSE = {"cc0": '"Creative Commons 0"', "by": '("Attribution" OR "Creative Commons 0")', "any": None}
FS_LIC_SHORT = {"Creative Commons 0": "CC0", "Attribution": "BY", "Attribution NonCommercial": "BY-NC", "Sampling+": "Sampling+"}
FS_SORT = {"downloads": "Downloads (most first)", "rating": "Rating (highest first)",
           "relevance": "Automatic by relevance", "short": "Duration (shortest first)"}


def fetch(url, timeout=60, tries=3, headers=None):
    for n in range(tries):
        try:
            if "pixabay.com" in url:  # Cloudflare 403s plain urllib
                from curl_cffi import requests as cr
                r = cr.get(url, impersonate="chrome", timeout=timeout,
                           headers={"Referer": "https://pixabay.com/", **(headers or {})})
                if r.status_code != 200:
                    raise OSError(f"HTTP {r.status_code} {url}")
                return r.content
            with urllib.request.urlopen(urllib.request.Request(url, headers={**UA, **(headers or {})}), timeout=timeout) as r:
                return r.read()
        except Exception as e:
            reason = getattr(e, "reason", None)
            if isinstance(reason, ssl.SSLCertVerificationError):
                # Some macOS Python builds lack the system Keychain roots while
                # curl uses them. Keep certificate verification enabled and use
                # the system TLS store only for this local trust-store failure.
                curl = shutil.which("curl")
                parsed = urllib.parse.urlsplit(url)
                if curl and parsed.scheme == "https" and parsed.hostname:
                    command = [curl, "--fail", "--silent", "--show-error", "--location",
                               "--proto", "=https", "--proto-redir", "=https",
                               "--max-time", str(timeout), "--max-filesize", str(256 * 1024 * 1024)]
                    for key, value in {**UA, **(headers or {})}.items():
                        command.extend(["--header", f"{key}: {value}"])
                    command.append(url)
                    fallback = subprocess.run(command, capture_output=True, check=False, timeout=timeout + 5)
                    if fallback.returncode == 0:
                        return fallback.stdout
                    e = OSError(f"verified system curl fallback failed: {fallback.stderr.decode('utf-8', 'replace')[-1000:]}")
            if n == tries - 1:
                raise e if isinstance(e, OSError) else OSError(repr(e))
            time.sleep(1 + n)  # Cloudflare 403s are sporadic; a short pause usually clears them


def need_cffi():
    """Re-exec this script under the private venv unless curl_cffi is already importable."""
    try:
        import curl_cffi  # noqa: F401
        return
    except ImportError:
        pass
    py = VENV / "bin" / "python"
    if not py.exists() or subprocess.run([str(py), "-c", "import curl_cffi"], check=False,
                                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        print("setting up curl_cffi venv for Pixabay (one-time)…", file=sys.stderr)
        VENV.parent.mkdir(parents=True, exist_ok=True)
        env = {**os.environ, "PIP_CACHE_DIR": str(CACHE / "pip-cache")}
        try:
            if not py.exists():
                subprocess.run([sys.executable, "-m", "venv", str(VENV)], check=True, env=env)
            subprocess.run([str(py), "-m", "pip", "-q", "install", "curl_cffi"], check=True, env=env)
        except (OSError, subprocess.CalledProcessError) as e:
            sys.exit(f"Pixabay needs curl_cffi in the isolated cache venv {VENV}; "
                     f"setup failed ({e}). Run `laohu-sound.py setup pixabay` and retry.")
    os.execv(str(py), [str(py), os.path.abspath(__file__), *sys.argv[1:]])


def load_index():
    try:
        return json.loads(INDEX.read_text())
    except (OSError, ValueError):
        return {}


def save_index(rows):
    CACHE.mkdir(parents=True, exist_ok=True)
    idx = load_index()
    idx.update({r["key"]: r for r in rows})
    INDEX.write_text(json.dumps(idx, ensure_ascii=False))


def show(rows, a, lic=False, hint=""):
    save_index(rows)
    for r in rows:
        print("\t".join([r["key"], r["title"], r["dur"]] + ([r["stats"]] if "stats" in r else []) + [r["license"]] * lic + ([r["desc"]] if r.get("desc") else []) + [r["preview"]] * a.urls))
    if not rows:
        print("(none)" + hint)


def mixkit(a):
    kw = re.sub(r"\s+", "-", a.keyword.strip().lower())
    h = fetch(f"https://mixkit.co/free-sound-effects/discover/{urllib.parse.quote(kw)}/").decode()
    rows = []
    for blk in h.split('data-audio-player-item-id-value="')[1:]:
        i = blk.split('"', 1)[0]
        t = re.search(r'item-grid-card__title">\s*(.*?)\s*</h2>', blk, re.S)
        d = re.search(r'data-test-id="duration">\s*([\d:]+)', blk)
        page = re.search(r'href="(/free-sound-effects/[^"?#]+)"', blk)
        rows.append({"key": f"mk:{i}", "title": html.unescape(t.group(1)) if t else "", "dur": d.group(1) if d else "",
                     "license": "Mixkit", "preview": f"https://assets.mixkit.co/active_storage/sfx/{i}/{i}-preview.mp3",
                     "url": f"https://assets.mixkit.co/active_storage/sfx/{i}/{i}.wav",
                     "page": urllib.parse.urljoin("https://mixkit.co", page.group(1)) if page else None})
    show(rows[: a.n], a, hint=" try a broader tag, or freesound")


def _claim(value, basis):
    """Keep source assertions separate from measurements and listening judgments."""
    if value in (None, "", [], {}):
        return {"value": None, "status": "unknown", "basis": None}
    return {"value": value, "status": "source-claim", "basis": basis}


_MUSIC_INSTRUMENTS = (
    "accordion", "banjo", "bass", "cello", "clarinet", "drums", "flute", "guitar", "orchestral",
    "harp", "horn", "keyboard", "piano", "saxophone", "strings", "synth", "trumpet",
    "ukulele", "violin", "voice",
)
_DENSITY_PHRASES = (
    "sparse", "minimal", "minimalist", "subtle", "non-intrusive", "non intrusive",
    "lightly arranged", "full arrangement", "dense", "busy",
)


def music_metadata(title, description="", tags=None, basis="source page"):
    """Build source-claim fields only; unknown acoustic facts remain explicitly unset."""
    tags = [str(tag).strip() for tag in (tags or []) if str(tag).strip()]
    title_text = html.unescape(str(title or ""))
    description_text = html.unescape(str(description or ""))
    combined = " ".join([title_text, description_text, *tags]).casefold()
    token_text = " " + re.sub(r"[^\w]+", " ", combined, flags=re.UNICODE) + " "
    track_type = None
    type_basis = None
    for value, pattern in (
        ("loop", r"\bloop(?:s|ed)?\b"),
        ("cue", r"\b(?:cue|sting|intro|outro)\b"),
        ("fulltrack", r"\bfull[ -]?track\b"),
    ):
        if re.search(pattern, combined, flags=re.IGNORECASE):
            track_type, type_basis = value, basis
            break

    voice = None
    voice_basis = None
    if re.search(r"\binstrumental\b", combined):
        voice, voice_basis = "instrumental", basis
    elif re.search(r"\b(?:vocals?|singer|singing|lyrics|voice)\b", combined):
        voice, voice_basis = "vocal-present", basis

    instruments = [name for name in _MUSIC_INSTRUMENTS
                   if re.search(r"\b" + re.escape(name) + r"\b", combined)]
    density = next((phrase for phrase in _DENSITY_PHRASES if phrase in combined), None)
    tempo_match = re.search(r"\b(\d{2,3})\s*(?:bpm|beats?\s+per\s+minute)\b", combined, flags=re.IGNORECASE)
    tempo = int(tempo_match.group(1)) if tempo_match else None
    return {
        "trackType": _claim(track_type, type_basis),
        "voice": _claim(voice, voice_basis),
        "instruments": _claim(instruments, basis),
        "density": _claim(density, basis),
        "tempoBpm": _claim(tempo, basis),
        "sourceRange": {"inSec": None, "outSec": None, "status": "not-selected"},
    }


def _music_tag_values(block, provider):
    if provider == "mixkit":
        tags = re.findall(r'href="/free-stock-music/[^\"]+"[^>]*>(.*?)</a>', block, re.S)
        return [html.unescape(re.sub(r"<[^>]+>", "", tag)).strip() for tag in tags]
    tags = re.findall(r'<a\b[^>]*href="/music/[^\"]+"[^>]*>(.*?)</a>', block, re.S)
    return list(dict.fromkeys(html.unescape(re.sub(r"<[^>]+>", "", tag)).strip()
                              for tag in tags if re.sub(r"<[^>]+>", "", tag).strip()))


def mixkit_music(a):
    """Search real Mixkit stock-music pages; never route music through SFX cards."""
    terms = [part for part in re.findall(r"[\w-]+", a.query.strip().casefold()) if part]
    page_slug = "-".join(terms)
    urls = []
    if len(terms) == 1:
        urls.append(f"https://mixkit.co/free-stock-music/tag/{urllib.parse.quote(page_slug)}/")
    urls.append("https://mixkit.co/free-stock-music/")
    html_pages = []
    seen_page_urls = set()
    for url in urls:
        if url in seen_page_urls:
            continue
        seen_page_urls.add(url)
        try:
            html_pages.append((url, fetch(url, timeout=20, tries=1).decode("utf-8", "replace")))
        except OSError:
            if url == urls[-1]:
                raise

    rows, seen = [], set()
    for source_listing, page_html in html_pages:
        for block in page_html.split('<div class="item-grid__item">')[1:]:
            item_match = re.search(r'data-audio-player-item-id-value="([^"]+)"', block)
            item_id = item_match.group(1) if item_match else ""
            if not re.fullmatch(r"[0-9]{1,20}", item_id) or item_id in seen:
                continue
            if not re.search(r'data-audio-player-item-type-value="music"', block):
                continue
            title_match = re.search(r'<h2[^>]*class="item-grid-card__title"[^>]*>(.*?)</h2>', block, re.S)
            author_match = re.search(r'<p[^>]*class="item-grid-music-preview__author"[^>]*>\s*by\s+(.*?)\s*</p>', block, re.S)
            duration_match = re.search(r'data-test-id="duration">\s*([^<]+)', block)
            title = html.unescape(re.sub(r"<[^>]+>", "", title_match.group(1))).strip() if title_match else ""
            if not title:
                continue
            slug = re.sub(r"[^a-z0-9]+", "-", title.casefold()).strip("-")
            detail_page = f"https://mixkit.co/free-stock-music/{slug}/"
            download_page = re.search(r'data-download--button-modal-url-value="([^"]+)"', block)
            preview_match = re.search(r'data-audio-player-preview-url-value="([^"]+)"', block)
            tags = _music_tag_values(block, "mixkit")
            author = html.unescape(author_match.group(1)).strip() if author_match else None
            duration = html.unescape(duration_match.group(1)).strip() if duration_match else ""
            rows.append({
                "key": f"mk:{item_id}", "title": title, "dur": duration, "author": author,
                "license": "Mixkit Stock Music Free License",
                "preview": html.unescape(preview_match.group(1)) if preview_match else None,
                # Search stays at listing-page cost. Resolve the full-track URL only
                # when this exact candidate is selected for source-get.
                "url": None,
                "downloadPage": urllib.parse.urljoin("https://mixkit.co", html.unescape(download_page.group(1))) if download_page else None,
                "page": detail_page, "listingPage": source_listing,
                "tags": tags,
                "musicMetadata": music_metadata(title, "", tags, "Mixkit music listing tags/title"),
                "rights": {"licenseUrl": "https://mixkit.co/license/modal/musicFree/",
                           "redistribution": "not-authorized-for-redistribution",
                           "syncUse": "allowed", "packageBoundary": "work-cache-only"},
                "providerRankBasis": "Mixkit stock-music listing order; no per-track popularity metric",
            })
            seen.add(item_id)
    terms_set = set(terms)
    if terms_set:
        exact = [row for row in rows if terms_set & set(re.findall(r"[\w-]+", (row["title"] + " " + " ".join(row["tags"])).casefold()))]
        if exact:
            rows = exact
    show(rows[:a.n], a, hint=" no tracks on the Mixkit stock-music endpoint; try a broader source-page term")


def _pixabay_audio_object(page_html):
    for raw in re.findall(r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>', page_html, re.S | re.I):
        try:
            node = json.loads(html.unescape(raw))
        except (TypeError, ValueError):
            continue
        nodes = node if isinstance(node, list) else node.get("@graph", [node]) if isinstance(node, dict) else []
        for item in nodes:
            item_type = item.get("@type") if isinstance(item, dict) else None
            if item_type == "AudioObject" or (isinstance(item_type, list) and "AudioObject" in item_type):
                return item
    return {}


def pixabay_music_detail(card):
    """Fetch and parse one selected Pixabay music page for its direct audio URL and source claims."""
    page_url = card.get("page")
    if not isinstance(page_url, str) or not page_url.startswith("https://pixabay.com/music/"):
        raise OSError("selected Pixabay music candidate has no approved individual music page")
    page_html = fetch(page_url, timeout=20, tries=1).decode("utf-8", "replace")
    audio = _pixabay_audio_object(page_html)
    text = html.unescape(re.sub(r"<[^>]+>", " ", page_html))
    duration = card.get("dur") or ""
    raw_duration = audio.get("duration")
    if isinstance(raw_duration, str):
        match = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?", raw_duration)
        if match:
            seconds = int(match.group(1) or 0) * 3600 + int(match.group(2) or 0) * 60 + float(match.group(3) or 0)
            duration = f"{seconds:.3f}s".rstrip("0").rstrip(".")
    stats = {}
    for item in audio.get("interactionStatistic", []) if isinstance(audio.get("interactionStatistic"), list) else []:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("interactionType", "")).rsplit("/", 1)[-1]
        value = item.get("userInteractionCount")
        if kind and isinstance(value, (int, float)):
            stats[kind] = value
    description_match = re.search(r'<meta\s+name="description"\s+content="([^"]*)"', page_html, re.I)
    description = html.unescape(description_match.group(1)) if description_match else ""
    extra_tags = re.findall(
        r"\b(?:instrumental|voiceover|background music|intro/outro|explainer|tutorial|ambient|suspense|upbeat|cinematic)\b",
        text, re.I,
    )
    tags = list(dict.fromkeys([*card.get("tags", []), *[value.strip() for value in extra_tags]]))
    metadata = music_metadata(card["title"], description, tags, "Pixabay individual music page")
    published = audio.get("datePublished")
    if not published:
        published_match = re.search(r"Published date\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})", text)
        published = published_match.group(1) if published_match else None
    content_url = audio.get("contentUrl")
    if not isinstance(content_url, str) or not content_url.startswith("https://cdn.pixabay.com/"):
        content_url = None
    editor_choice = bool(re.search(r"editor['’]s\s+choice", text, re.I))
    content_id_registered = bool(re.search(r"content\s+id\s+registered", text, re.I))
    track_stats = {
        "likes": stats.get("LikeAction"),
        "downloads": stats.get("DownloadAction"),
        "plays": stats.get("ListenAction"),
    }
    playlist = card.get("curatedPlaylist")
    return {
        **card, "dur": duration, "license": "Pixabay Content License",
        "preview": content_url, "url": content_url, "desc": description or None,
        "tags": tags, "musicMetadata": metadata,
        "community": {
            "trackStatistics": {key: value for key, value in track_stats.items() if value is not None},
            "publishedDate": published,
            "editorChoice": editor_choice,
            "editorChoiceBasis": "individual track page label" if editor_choice else "not shown on captured individual track page",
            "contentIdRegistered": content_id_registered,
            "curatedPlaylist": playlist,
            "listingOrderBasis": "Pixabay music search relevance order" if not playlist else "Pixabay curated playlist order",
        },
        "stats": {key: value for key, value in track_stats.items() if value is not None},
        "rights": {
            "licenseUrl": "https://pixabay.com/service/license-summary/",
            "redistribution": "not-authorized-for-redistribution",
            "syncUse": "allowed", "packageBoundary": "work-cache-only",
            "contentIdRegistered": content_id_registered,
        },
        "providerRankBasis": "Pixabay music search or curated playlist order; track statistics are reported separately",
    }


def pixabay_music(a):
    """Use the actual Pixabay music search or curated-playlist pages."""
    query = a.query.strip()
    playlist = getattr(a, "playlist", None)
    if playlist:
        playlist_slug = re.sub(r"[^a-z0-9-]+", "-", playlist.casefold()).strip("-")
        if not playlist_slug:
            raise ValueError("Pixabay playlist slug is empty after normalization")
        listing_url = f"https://pixabay.com/playlists/{urllib.parse.quote(playlist_slug)}/"
        html_pages = [(listing_url, fetch(listing_url).decode("utf-8", "replace"))]
    else:
        if not query:
            raise ValueError("Pixabay music search requires a non-empty query")
        encoded = urllib.parse.quote(query)
        first_page = getattr(a, "page", 1)
        page_count = getattr(a, "pages", 1)
        urls = [f"https://pixabay.com/music/search/{encoded}/" + (f"?pagi={page}" if page > 1 else "")
                for page in range(first_page, first_page + page_count)]
        with ThreadPoolExecutor(max_workers=min(6, len(urls))) as pool:
            html_pages = list(pool.map(lambda url: (url, fetch(url).decode("utf-8", "replace")), urls))

    cards, seen = [], set()
    for listing_url, page_html in html_pages:
        for block in page_html.split('<div class="nameAndTitle')[1:]:
            title_link = re.search(
                r'<a\b[^>]*href="(/music/[^"?#]*?-(\d+)/)"[^>]*class="title[^"]*"[^>]*>(.*?)</a>',
                block, re.S,
            )
            if not title_link:
                title_link = re.search(
                    r'<a\b[^>]*class="title[^"]*"[^>]*href="(/music/[^"?#]*?-(\d+)/)"[^>]*>(.*?)</a>',
                    block, re.S,
                )
            if not title_link:
                continue
            track_id = title_link.group(2)
            if track_id in seen:
                continue
            seen.add(track_id)
            author_match = re.search(
                r'<a\b[^>]*href="/users/[^"]+"[^>]*class="name[^"]*"[^>]*>(.*?)</a>', block, re.S,
            )
            title = html.unescape(re.sub(r"<[^>]+>", "", title_link.group(3))).strip()
            author = html.unescape(re.sub(r"<[^>]+>", "", author_match.group(1))).strip() if author_match else None
            duration_match = re.search(r"(?<!\d)(\d{1,2}:\d{2})(?!\d)", block)
            cards.append({
                "key": f"px:{track_id}", "title": title, "author": author,
                "page": urllib.parse.urljoin("https://pixabay.com", title_link.group(1)),
                "listingPage": listing_url, "dur": duration_match.group(1) if duration_match else "",
                "tags": _music_tag_values(block, "pixabay"), "curatedPlaylist": playlist,
            })
    rows = []
    for card in cards[:a.n]:
        rows.append({
            **card, "license": "Pixabay Content License", "url": None, "preview": None,
            "musicMetadata": music_metadata(card["title"], "", card.get("tags", []), "Pixabay music listing title/tags"),
            "community": {"trackStatistics": {}, "publishedDate": None, "editorChoice": None,
                          "contentIdRegistered": None, "curatedPlaylist": playlist,
                          "listingOrderBasis": "Pixabay music search relevance order" if not playlist else "Pixabay curated playlist order"},
            "rights": {"licenseUrl": "https://pixabay.com/service/license-summary/",
                       "redistribution": "not-authorized-for-redistribution", "syncUse": "allowed",
                       "packageBoundary": "work-cache-only", "contentIdRegistered": None},
            "providerRankBasis": "Pixabay music search or curated playlist order; per-track detail is checked only after selection",
        })
    show(rows, a, hint=" no tracks on the Pixabay music endpoint; try another music term or curated playlist")


def resolve_selected_music_download(row):
    """Resolve one selected stock-music candidate's direct URL and retain its detail claims."""
    if not isinstance(row, dict):
        return row, "selected music candidate metadata is invalid"
    provider = str(row.get("key", "")).partition(":")[0]
    if row.get("rights", {}).get("packageBoundary") != "work-cache-only" or row.get("url"):
        return row, None
    if provider == "mk":
        modal_url = row.get("downloadPage")
        if not isinstance(modal_url, str) or not modal_url.startswith("https://mixkit.co/free-stock-music/download/"):
            return row, "selected Mixkit music candidate has no approved download-detail page"
        try:
            modal = fetch(modal_url, timeout=20, tries=1).decode("utf-8", "replace")
        except OSError as exc:
            return row, f"selected Mixkit music detail request failed: {exc}"
        full_match = re.search(r'data-download--modal-url-value="([^"]+)"', modal)
        if not full_match:
            return row, "selected Mixkit music detail page has no downloadable track URL"
        resolved_url = html.unescape(full_match.group(1))
        parsed = urllib.parse.urlsplit(resolved_url)
        if parsed.scheme != "https" or parsed.hostname not in {"mixkit.co", "assets.mixkit.co"}:
            return row, "selected Mixkit music download URL is outside the approved HTTPS hosts"
        return {**row, "url": resolved_url}, None
    if provider == "px":
        try:
            resolved = pixabay_music_detail(row)
        except OSError as exc:
            return row, f"selected Pixabay music detail request failed: {exc}"
        if not resolved.get("url"):
            return resolved, "selected Pixabay music detail page has no downloadable audio URL"
        return resolved, None
    return row, "selected music provider is not supported for detail resolution"


def freesound(a):
    # Like pixabay(): pull several relevance pages and rank them by downloads, since sorting by downloads
    # server-side lets globally popular but off-topic sounds (gunshots, ambiences) win on a loose tag match.
    q = {"q": a.query, "s": FS_SORT[a.sort]}
    if FS_LICENSE[a.license]:
        q["f"] = "license:" + FS_LICENSE[a.license]
    pages = range(a.page, a.page + a.pages)
    with ThreadPoolExecutor(len(pages)) as ex:
        htmls = list(ex.map(lambda n: fetch("https://freesound.org/search/?" + urllib.parse.urlencode({**q, "page": n})).decode(), pages))
    rows = []
    for blk in (b for h in htmls for b in h.split('class="bw-search__result"')[1:]):
        g = lambda k: (re.search(rf'data-{k}="([^"]*)"', blk) or [None, ""])[1]
        lic = re.search(r'title="License: ([^"]+)"', blk)
        rt = re.search(r'aria-label="Average rating of ([\d.]+)"', blk)
        rn = re.search(r'bw-rating__count[^>]*>\((\d+)\)', blk)
        desc = re.search(r'<div class="max-h-60px[^"]*"\s*>\s*(.*?)\s*</div>', blk, re.S)
        raw_tags = g("tags")
        tags = [html.unescape(value.strip()) for value in re.split(r"[,|]", raw_tags) if value.strip()]
        page = re.search(r'href="([^"#?]+/sounds/\d+/?)"', blk)
        sid, user, dl = g("sound-id"), g("username"), int(g("num-downloads") or 0)
        title = html.unescape(g("title"))
        description = html.unescape(re.sub(r"<[^>]+>|\s+", " ", desc[1])).strip() if desc else ""
        rows.append({"key": f"fs:{sid}", "title": title, "dur": f"{float(g('duration') or 0):.1f}s",
                     "author": user, "license": FS_LIC_SHORT.get(lic.group(1), lic.group(1)) if lic else "?", "preview": g("mp3").replace("-lq.mp3", "-hq.mp3"),
                     "url": g("mp3").replace("-lq.mp3", "-hq.mp3"),
                     "page": urllib.parse.urljoin("https://freesound.org", page.group(1)) if page else None,
                     "downloads": dl, "tags": tags, "desc": description,
                     "rating": float(rt[1]) if rt else None, "ratingCount": int(rn[1]) if rn else None,
                     "stats": f"↓{dl} ★{rt[1]}({rn[1]})" if rt and rn else f"↓{dl} ★-",
                     "musicMetadata": music_metadata(title, description, tags, "Freesound search result"),
                     # the uploader's own words (mic, source, processing) are the closest thing to hearing it
                     "musicSearchBoundary": "metadata is source-page/search metadata; no audio audition is implied"})
    if a.sort == "relevance":
        rows.sort(key=lambda r: -r["downloads"])
    show(rows[: a.n], a, lic=a.license != "cc0")


def k_num(t):  # "2.4K" -> 2400
    m = re.match(r"([\d.]+)\s*([KM]?)", t or "")
    return int(float(m[1]) * {"": 1, "K": 1e3, "M": 1e6}[m[2]]) if m else 0


def kenney_download_url(pack, page, page_html):
    """Resolve either an older static Kenney zip or the current signed download flow."""
    static = re.search(r"https://kenney\.nl/media/[^\"']+\.zip", page_html)
    if static:
        return static.group(0)
    download_id = re.search(r"data-download-id=['\"]([0-9a-f]+)['\"]", page_html)
    if not download_id:
        raise OSError(f"no Kenney download link found for pack {pack!r}")
    endpoint = f"https://kenney.nl/download-link/{download_id.group(1)}"
    payload = json.loads(fetch(endpoint, headers={"Referer": page, "Accept": "application/json"}))
    url = payload.get("url") if isinstance(payload, dict) else None
    parsed = urllib.parse.urlparse(url or "")
    if parsed.scheme != "https" or parsed.netloc.casefold() != "kenney.nl":
        raise OSError(f"Kenney returned an invalid download URL for pack {pack!r}")
    return url


def pixabay(a):
    # Pixabay can't sort by likes server-side, so pull several relevance pages, rank their cards by
    # the rounded like counter, then open only the top n detail pages for exact numbers + mp3.
    q = urllib.parse.quote(a.query.strip())
    pages = range(a.page, a.page + a.pages)
    with ThreadPoolExecutor(len(pages)) as ex:
        htmls = list(ex.map(lambda n: fetch(f"https://pixabay.com/sound-effects/search/{q}/" + (f"?pagi={n}" if n > 1 else "")).decode(), pages))
    seen, cards = set(), []
    for h in htmls:
        for blk in h.split('<div class="nameAndTitle')[1:]:
            t = re.search(r'<a href="(/sound-effects/[^"]*?-(\d+)/)" class="title[^"]*">(.*?)</a><a href="/users/[^"]*" class="name[^"]*">(.*?)</a>', blk)
            if t and t[2] not in seen:
                seen.add(t[2])
                cards.append((t[1], t[2], html.unescape(t[3]), html.unescape(t[4]), k_num((re.search(r'counter="([^"]*)"', blk) or [0, ""])[1])))
    cards.sort(key=lambda c: -c[4])

    def detail(c):  # duration, exact likes/downloads and mp3 url only live in the detail page's JSON-LD
        path, sid, title, user, likes = c
        dl, dur, url = 0, "?", ""
        try:
            d = fetch("https://pixabay.com" + path).decode()
            j = next(x for x in map(json.loads, re.findall(r'<script type="application/ld\+json">(.*?)</script>', d, re.S))
                     if x.get("@type") == "AudioObject")
            st = {i["interactionType"].rsplit("/", 1)[-1]: i["userInteractionCount"] for i in j.get("interactionStatistic", [])}
            likes, dl = st.get("LikeAction", likes), st.get("DownloadAction", 0)
            m = re.match(r"PT(?:(\d+)M)?(\d+)S", j.get("duration", ""))
            dur, url = f"{int(m[1] or 0) * 60 + int(m[2])}s" if m else "", j["contentUrl"]
        except Exception:
            pass
        return {"key": f"px:{sid}", "title": title, "dur": dur, "author": user, "license": "Pixabay", "likes": likes,
                "stats": f"♥{likes} ↓{dl}", "page": "https://pixabay.com" + path, "preview": url, "url": url}

    with ThreadPoolExecutor(6) as ex:
        rows = [r for r in ex.map(detail, cards[: a.n]) if r["url"]]
    rows.sort(key=lambda r: -r["likes"])
    show(rows, a, hint=" try a broader English query")


def kenney(a):
    if not a.pack:
        h = fetch("https://kenney.nl/assets/category:Audio").decode()
        packs = sorted({p for p in re.findall(r"kenney\.nl/assets/([a-z0-9-]+)['\"]", h)})
        print(" ".join(packs))
        return
    if not re.fullmatch(r"[a-z0-9-]+", a.pack):
        sys.exit("Kenney pack must be a lowercase alphanumeric slug with hyphens")
    d = CACHE / "kenney" / a.pack
    if not d.exists():
        page = f"https://kenney.nl/assets/{a.pack}"
        h = fetch(page).decode()
        zip_url = kenney_download_url(a.pack, page, h)
        zp = d.with_suffix(".zip")
        zp.parent.mkdir(parents=True, exist_ok=True)
        zp.write_bytes(fetch(zip_url, timeout=300, headers={"Referer": page}))
        with zipfile.ZipFile(zp) as archive:
            root = d.resolve()
            for member in archive.infolist():
                target = (d / member.filename).resolve()
                try:
                    target.relative_to(root)
                except ValueError:
                    sys.exit(f"unsafe path in Kenney pack archive: {member.filename}")
            archive.extractall(d)
    files = sorted(p.relative_to(d).as_posix() for p in d.rglob("*") if p.suffix.lower() in (".ogg", ".wav", ".mp3"))
    groups = {}
    for f in files:  # collapse click_001..click_005 into one line to keep output short
        m = re.match(r"(.*?)(\d+)(\.\w+)$", f)
        groups.setdefault((m[1], m[3]) if m else (f, ""), []).append(m[2] if m else "")
    top = {f.split("/")[0] for f in files}
    pre = next(iter(top)) + "/" if len(top) == 1 and all("/" in f for f in files) else ""
    exts = {e for _, e in groups}
    ext = exts.pop() if len(exts) == 1 else ""  # print a shared extension once
    print(f"key kn:{a.pack}/{pre}<name>{ext}")
    print(" ".join(stem[len(pre):] + (f"{{{n[0]}..{n[-1]}}}" if len(n) > 1 else n[0]) + (e if not ext else "")
                   for (stem, e), n in groups.items()))


def get(a):
    out = Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    idx = load_index()

    def one(key):
        src, _, ref = key.partition(":")
        if src == "kn":
            p = CACHE / "kenney" / ref
            if not p.exists():
                return key, None, "not cached — run `kenney <pack>` first"
            try:
                p.resolve().relative_to((CACHE / "kenney").resolve())
            except ValueError:
                return key, None, "invalid Kenney path"
            dst = out / f"kn_{ref.replace('/', '_')}"
            if dst.exists():
                return key, None, f"output already exists: {dst}"
            shutil.copy(p, dst)
            return key, dst, None
        r = idx.get(key)
        if not r and src == "px":
            return key, None, "unknown key — run `pixabay <query>` first"
        if not r and src == "mk":
            r = {"title": "", "url": f"https://assets.mixkit.co/active_storage/sfx/{ref}/{ref}.wav"}
        if not r:
            return key, None, "unknown key — search first"
        if src in {"mk", "px"} and not r.get("url") and r.get("rights", {}).get("packageBoundary") == "work-cache-only":
            r, error = resolve_selected_music_download(r)
            if error:
                return key, None, error
            idx[key] = r
            save_index([r])
        slug = re.sub(r"[^\w]+", "-", r["title"]).strip("-")[:40]
        dst = out / f"{src}_{ref}{'_' + slug if slug else ''}{Path(urllib.parse.urlparse(r['url']).path).suffix}"
        if dst.exists():
            return key, None, f"output already exists: {dst}"
        tmp = dst.with_suffix(dst.suffix + ".part")
        tmp.write_bytes(fetch(r["url"], timeout=300))
        tmp.rename(dst)
        lic = r.get("license", "CC0")
        return key, dst, f"credit {r.get('author', '?')}" if src == "fs" and lic != "CC0" else None

    def safe(key):
        try:
            return one(key)
        except Exception as e:  # one bad file shouldn't sink the batch
            return key, None, repr(e)

    # Freesound caps ~80 KB/s per connection, so parallelism is the only speed lever.
    with ThreadPoolExecutor(6) as ex:
        for key, dst, note in ex.map(safe, a.keys):
            print(f"FAIL {key}: {note}" if not dst else f"{dst.name}  [{note}]" if note else dst.name)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    m = sp.add_parser("mixkit"); m.add_argument("keyword"); m.add_argument("-n", type=int, default=10); m.add_argument("--urls", action="store_true"); m.set_defaults(fn=mixkit)
    k = sp.add_parser("kenney"); k.add_argument("pack", nargs="?"); k.set_defaults(fn=kenney)
    f = sp.add_parser("freesound"); f.add_argument("query"); f.add_argument("--license", choices=FS_LICENSE, default="any")
    f.add_argument("--sort", choices=FS_SORT, default="relevance"); f.add_argument("-n", type=int, default=8); f.add_argument("--urls", action="store_true")
    f.add_argument("-p", "--page", type=int, default=1)
    f.add_argument("--pages", type=int, default=3, help="relevance pages (15 each) to rank by downloads"); f.set_defaults(fn=freesound)
    x = sp.add_parser("pixabay"); x.add_argument("query"); x.add_argument("-n", type=int, default=8); x.add_argument("--urls", action="store_true")
    x.add_argument("-p", "--page", type=int, default=1)
    x.add_argument("--pages", type=int, default=3, help="relevance pages (20 each) to rank by likes"); x.set_defaults(fn=pixabay)
    g = sp.add_parser("get"); g.add_argument("out_dir"); g.add_argument("keys", nargs="+"); g.set_defaults(fn=get)
    a = ap.parse_args()
    if a.cmd == "pixabay" or (a.cmd == "get" and any(k.startswith("px:") for k in a.keys)):
        need_cffi()
    try:
        a.fn(a)
    except OSError as e:
        sys.exit(f"{a.cmd} network error: {getattr(e, 'reason', e)}")


if __name__ == "__main__":
    main()
