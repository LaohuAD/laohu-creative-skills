"""Source-preserved synth, one-shot, timeline and analysis helpers.

Use `scripts/laohu-sound.py` for the supported CLI: doctor, find, probe,
sfzmap, render and check. Python callers may import these helpers as
`from sound import kit` after adding `scripts/` to `sys.path`.
"""
# Source-preserved from sxhzju/sound at 2287e2bc92ce22dc0008307ea3d25571ce3e8b81.
# Upstream had no LICENSE file; local-use authority and publication boundary are in ../../SOURCES.md.
from contextlib import contextmanager
from pathlib import Path
import os
import re
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[5]
_TMP_ROOT = Path(os.environ.get(
    "LAOHU_SOUND_TMPDIR",
    str(PROJECT_ROOT / ".cache" / "tmp" / "sound"),
)).expanduser().resolve()
_TMP_ROOT.mkdir(parents=True, exist_ok=True)
os.environ.setdefault("TMPDIR", str(_TMP_ROOT))

import tempfile
tempfile.tempdir = None

import numpy as np
import soundfile as sf
if __package__:
    from . import backend as lm
else:
    import backend as lm

SR = 48000
LEAD = 0.5   # Surge drops notes at t=0 while the preset state loads
_TMP = Path(tempfile.mkdtemp(prefix="laohu_sound_kit_", dir=str(_TMP_ROOT)))


@contextmanager
def _quiet():
    """Silence the plugins' C++ chatter ([sfizz] new synth ...) at the fd level."""
    sys.stdout.flush()
    sys.stderr.flush()
    saved = [os.dup(1), os.dup(2)]
    null = os.open(os.devnull, os.O_WRONLY)
    os.dup2(null, 1)
    os.dup2(null, 2)
    try:
        yield
    finally:
        os.dup2(saved[0], 1)
        os.dup2(saved[1], 2)
        for fd in (*saved, null):
            os.close(fd)


# ---------------------------------------------------------------- sounds
def load(spec):
    """Return a loaded plugin for "Category/Name" (Surge) or "*.sfz" (sfizz)."""
    if spec.endswith(".sfz"):
        with _quiet():
            return lm.sfizz(spec)
    category, name = spec.split("/", 1)
    for p in lm.find_sounds(name, "surge"):
        if p.stem.strip() == name and p.parent.name == category:
            with _quiet():
                return lm.surge(p)
    raise LookupError(f"No unique Surge preset {spec!r}; try `scripts/laohu-sound.py find {spec!r} --kind surge`.")


def spec_of(path):
    path = Path(path)
    if path.suffix == ".sfz":
        try:
            return str(path.relative_to(lm.SAMPLE_DIR))
        except ValueError:
            return str(path.resolve())
    return f"{path.parent.name}/{path.stem.strip()}"


def render(plugin, notes, tail=2.0):
    """Render [(midi, start_s, length_s, velocity)] -> peak-normalised (2, n) float32.

    Adds the LEAD offset internally and crops it, so start times are exact.
    Reuse the same plugin object for several renders if you like.
    """
    shifted = [(p, t + LEAD, d, v) for p, t, d, v in notes]
    with _quiet():
        audio = lm.render_notes(plugin, shifted, _TMP / "render.wav", SR, tail=tail)
    audio = audio[:, int(LEAD * SR):]
    return audio / np.max(np.abs(audio))


# -------------------------------------------------------------- timeline
def timeline(seconds):
    return np.zeros((2, int(seconds * SR)), dtype=np.float32)


def db(x):
    return 10 ** (x / 20)


def place(dst, audio, at, gain_db=0.0):
    """Mix `audio` into `dst` starting at `at` seconds (may be negative)."""
    start = int(round(at * SR))
    src = audio[:, max(0, -start):]
    s = max(start, 0)
    n = min(src.shape[1], dst.shape[1] - s)
    if n > 0:
        dst[:, s:s + n] += src[:, :n] * db(gain_db)
    return dst


def trim(audio, threshold=1e-3):
    idx = np.nonzero(np.max(np.abs(audio), axis=0) > threshold)[0]
    return audio[:, idx[0]:idx[-1] + 1]


def reverse(audio):
    """Reverse a one-shot. Trims silence on both ends first, so the swell
    ends exactly where you place its end (place at: hit_time - len/SR)."""
    return trim(audio)[:, ::-1].copy()


def fade(audio, fade_in=0.0, fade_out=0.0):
    a = audio.copy()
    i, o = int(fade_in * SR), int(fade_out * SR)
    if i:
        a[:, :i] *= np.linspace(0, 1, i)
    if o:
        a[:, -o:] *= np.linspace(1, 0, o) ** 2
    return a


# ------------------------------------------------------- synthesized FX
def noise_sweep(seconds, f0=400, f1=9000, width_oct=1.1, curve=2.2, seed=0):
    """Band-passed noise whose centre glides f0 -> f1 (riser if f1 > f0,
    falling whoosh if f1 < f0); level rises with (t/T)**curve (0 = flat)."""
    from scipy.signal import stft, istft
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    out = []
    for _ in range(2):
        f, t, Z = stft(rng.standard_normal(n), SR, nperseg=2048)
        x = np.clip(t / seconds, 0, 1)
        centre = f0 * (f1 / f0) ** x
        dist = np.log2(np.maximum(f[:, None], 20) / centre[None, :])
        Z *= np.exp(-0.5 * (dist / width_oct) ** 2) * (x ** curve)[None, :]
        out.append(istft(Z, SR, nperseg=2048)[1][:n])
    a = np.array(out, dtype=np.float32)
    return a / np.max(np.abs(a))


def sub_drop(seconds=1.3, f0=73.42, f1=36.71, glide=0.7, decay=0.45, drive=1.5):
    """Sine falling f0 -> f1 over `glide` s with exponential decay (boom/impact low end)."""
    t = np.arange(int(seconds * SR)) / SR
    freq = f0 * (f1 / f0) ** np.minimum(t / glide, 1.0)
    mono = np.tanh(drive * np.sin(2 * np.pi * np.cumsum(freq) / SR))
    mono *= np.exp(-t / decay) * np.minimum(t / 0.004, 1)
    return np.vstack([mono, mono]).astype(np.float32) / np.tanh(drive)


# ------------------------------------------------------------- analysis
def kweighted_db(audio, start=0.0, end=None):
    """Mean K-weighted power (dB, ~LUFS + 0.7) of a section; works on short spans."""
    import pyloudnorm as pyln
    seg = audio[:, int(start * SR):None if end is None else int(end * SR)].T
    for f in pyln.Meter(SR)._filters.values():
        seg = f.apply_filter(seg)
    return 10 * np.log10(np.mean(seg ** 2) + 1e-12)


def master(mix, peak_db=-1.0, limiter_drive_db=2.0):
    """Drive a limiter by a fixed amount on the loudest transient, then peak-normalise.
    (Normalising first keeps the limiter from flattening the biggest hit.)"""
    from pedalboard import Limiter
    mix = mix * db(peak_db + limiter_drive_db) / np.max(np.abs(mix))
    mix = Limiter(threshold_db=peak_db, release_ms=100)(mix, SR)
    return mix * db(peak_db) / np.max(np.abs(mix))


def write(path, audio):
    sf.write(str(path), audio.T, SR, subtype="PCM_24")


def check(path, bpm=None, png=None):
    import pyloudnorm as pyln
    x, sr = sf.read(str(path), always_2d=True)
    assert sr == SR, f"expected {SR} Hz"
    a = x.T
    m = np.max(np.abs(a), axis=0)
    dur = a.shape[1] / SR
    lufs = pyln.Meter(SR).integrated_loudness(x) if dur >= 0.4 else float("nan")
    corr = np.corrcoef(a[0], a[1])[0, 1] if a.shape[0] == 2 else 1.0
    print(f"{dur:.2f} s  peak {20 * np.log10(m.max() + 1e-12):.2f} dBFS  "
          f"clipped {int(np.sum(m >= 0.999))}  {lufs:.1f} LUFS  L/R corr {corr:.2f}")
    step = 60 / bpm if bpm else 0.25
    edges = np.arange(0, dur, step)
    vals = [kweighted_db(a, s, min(s + step, dur)) for s in edges]
    label = "beat" if bpm else "0.25 s"
    print(f"loudness per {label} (K-weighted dB):")
    for i in range(0, len(vals), 8):
        print(f"  {edges[i]:6.2f}s  " + " ".join(f"{v:6.1f}" for v in vals[i:i + 8]))
    if png:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        fig, (w, s) = plt.subplots(2, 1, figsize=(12, 6), sharex=True,
                                   gridspec_kw={"height_ratios": [1, 2.2]})
        w.plot(np.arange(a.shape[1]) / SR, a[0], lw=0.3, color="#333")
        w.set_ylim(-1, 1)
        s.specgram(a.mean(0), NFFT=2048, Fs=SR, noverlap=1536, cmap="magma", vmin=-120)
        s.set_yscale("symlog", linthresh=200)
        s.set_ylim(30, 16000)
        if bpm:
            for i, t in enumerate(np.arange(0, dur, step)):
                for ax in (w, s):
                    ax.axvline(t, color="w" if i % 4 == 0 else "c", lw=0.6, alpha=0.6)
        plt.tight_layout()
        plt.savefig(png, dpi=90)
        print(f"spectrogram -> {png}")


def probe(spec, notes=(60,), length=2.0, velocity=110):
    """Print attack, decay and spectral peaks (as MIDI numbers) per note.

    Peaks are compared early (0.03-0.28 s) and late (last 0.5 s of the note),
    so slow pitch drift shows up; keep `length` long for pads."""
    plugin = load(spec)
    for note in notes:
        a = render(plugin, [(note, 0.0, length, velocity)], tail=2.0)
        m = np.max(np.abs(a), axis=0)
        w = int(0.01 * SR)
        env = np.array([m[i:i + w].max() for i in range(0, len(m) - w, w)])
        attack = np.argmax(env > 0.7) * 0.01
        decay = (len(env) - np.argmax(env[::-1] > 0.1)) * 0.01
        early = _peaks(a, 0.03, 0.28)
        late = _peaks(a, max(0.3, length - 0.5), max(0.55, length))
        print(f"{spec} note {note}: attack {attack:.2f}s  above -20dB until {decay:.2f}s  "
              f"peaks early {early}  late {late}")


def _peaks(a, t0, t1, count=4):
    seg = a[0, int(t0 * SR):int(t1 * SR)]
    if len(seg) < 256 or np.max(np.abs(seg)) < 1e-4:
        return []
    seg = np.pad(seg * np.hanning(len(seg)), (0, 7 * len(seg)))
    spec = np.abs(np.fft.rfft(seg))
    freqs = np.fft.rfftfreq(len(seg), 1 / SR)
    found = []
    for i in np.argsort(spec)[::-1]:
        f = freqs[i]
        if f < 25 or any(abs(12 * np.log2(f / g)) < 0.6 for g in found):
            continue
        found.append(f)
        if len(found) == count:
            break
    return [round(float(69 + 12 * np.log2(f / 440)), 1) for f in found]


def sfzmap(spec):
    """Print key range, velocity range and sample for every region of an SFZ."""
    path = Path(spec).expanduser()
    if not path.is_file():
        path = lm._resolve_sound(spec, "sfz")
    text = re.sub(r"//[^\n]*", "", path.read_text(errors="ignore"))
    tokens = re.finditer(r"<(\w+)>|(\w+)=(.*?)(?=\s+\w+=|\s*<\w+>|\s*\Z)", text, re.S)
    scopes = {"global": {}, "master": {}, "group": {}}
    current = target = None
    rows = []

    def flush():
        if current is not None and "sample" in current:
            r = {**scopes["global"], **scopes["master"], **scopes["group"], **current}
            keys = r.get("key") or f"{r.get('lokey', '0')}-{r.get('hikey', '127')}"
            vel = f"{r.get('lovel', '1')}-{r.get('hivel', '127')}"
            rows.append((keys, vel, Path(r["sample"].replace("\\", "/")).name))

    for t in tokens:
        if t.group(1):
            flush()
            head = t.group(1)
            current = {} if head == "region" else None
            if head in scopes:
                scopes[head] = {}
                if head == "global":
                    scopes["master"], scopes["group"] = {}, {}
                if head == "master":
                    scopes["group"] = {}
            target = head if head in scopes else None
            continue
        key, value = t.group(2), t.group(3).strip()
        if current is not None:
            current[key] = value
        elif target:
            scopes[target][key] = value
    flush()
    print(path)
    for keys, vel, sample in rows:
        print(f"  key {keys:>8}  vel {vel:>7}  {sample}")


def main(argv):
    import argparse
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("doctor")
    f = sub.add_parser("find")
    f.add_argument("query")
    f.add_argument("--kind", default="all", choices=["all", "surge", "sfz"])
    p = sub.add_parser("probe")
    p.add_argument("spec")
    p.add_argument("notes", nargs="*", type=int, default=[60])
    p.add_argument("--length", type=float, default=2.0)
    s = sub.add_parser("sfzmap")
    s.add_argument("spec")
    c = sub.add_parser("check")
    c.add_argument("wav")
    c.add_argument("--bpm", type=float)
    c.add_argument("--png")
    args = ap.parse_args(argv)
    if args.cmd == "doctor":
        lm.doctor()
    elif args.cmd == "find":
        for path in lm.find_sounds(args.query, args.kind):
            print(spec_of(path))
    elif args.cmd == "probe":
        probe(args.spec, args.notes, args.length)
    elif args.cmd == "sfzmap":
        sfzmap(args.spec)
    else:
        check(args.wav, args.bpm, args.png)


if __name__ == "__main__":
    main(sys.argv[1:])
