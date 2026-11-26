"""Bundled offline renderer; configure downloads via SOUND_* environment variables.

See ../../references/sound-editing-and-mixing.md. No separate local_music installation is required.
The plugin-state adapter targets Surge XT 1.3.4, sfizz 1.2.3 and Pedalboard 0.9.26.
"""
# Source-preserved from sxhzju/sound at 2287e2bc92ce22dc0008307ea3d25571ce3e8b81.
# Upstream had no LICENSE file; local-use authority and publication boundary are in ../../SOURCES.md.
from pathlib import Path
import argparse
import os
import sys
import struct
import xml.etree.ElementTree as ET

import numpy as np
from mido import Message
from pedalboard import load_plugin
import soundfile as sf


def _configured_path(name, default):
    return Path(os.environ.get(name, str(default))).expanduser().resolve()


HOME = Path.home()
if sys.platform == "darwin":
    _plugin_dirs = [HOME / "Library/Audio/Plug-Ins/VST3", Path("/Library/Audio/Plug-Ins/VST3")]
    _data_dirs = [Path("/Library/Application Support/Surge XT"), HOME / "Library/Application Support/Surge XT"]
elif sys.platform == "win32":
    _plugin_dirs = [Path(os.environ.get("COMMONPROGRAMFILES", "C:/Program Files/Common Files")) / "VST3"]
    _data_dirs = [Path(os.environ.get("PROGRAMDATA", "C:/ProgramData")) / "Surge XT"]
else:
    _plugin_dirs = [HOME / ".vst3", Path("/usr/lib/vst3"), Path("/usr/local/lib/vst3")]
    _data_dirs = [Path("/usr/share/surge-xt"), Path("/usr/local/share/surge-xt")]


def _first_existing(paths):
    return next((p for p in paths if p.exists()), paths[0])


SURGE_DATA = _configured_path("SOUND_SURGE_DATA", _first_existing(_data_dirs))
SAMPLE_DIR = _configured_path("SOUND_SAMPLE_DIR", Path.cwd() / "audio-assets")
SURGE_PLUGIN = _configured_path("SOUND_SURGE_PLUGIN", _first_existing([p / "Surge XT.vst3" for p in _plugin_dirs]))
SFIZZ_PLUGIN = _configured_path("SOUND_SFIZZ_PLUGIN", _first_existing([p / "sfizz.vst3" for p in _plugin_dirs]))


def _plugin_path(path, setting):
    if not path.exists():
        raise FileNotFoundError(
            f"Plugin not found: {path}. Install the matching VST3 into an explicitly selected local path, "
            f"set {setting}, and verify it with `scripts/laohu-sound.py doctor`; "
            "see `references/sound-editing-and-mixing.md`."
        )
    return str(path)


def doctor():
    """Check paths without loading native plugins; return missing optional resources."""
    missing = 0
    for name, path, ready in (
        ("SOUND_SURGE_PLUGIN", SURGE_PLUGIN, SURGE_PLUGIN.exists()),
        ("SOUND_SFIZZ_PLUGIN", SFIZZ_PLUGIN, SFIZZ_PLUGIN.exists()),
        ("SOUND_SURGE_DATA", SURGE_DATA, next(SURGE_DATA.rglob("*.fxp"), None) is not None),
        ("SOUND_SAMPLE_DIR", SAMPLE_DIR, next(SAMPLE_DIR.rglob("*.sfz"), None) is not None),
    ):
        print(f"{'OK' if ready else 'MISSING'} {name}={path}")
        missing += not ready
    print("Only install the resources your task needs; use probe to verify actual rendering.")
    return missing


_JUCE_ALPHABET = ".ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+"


def find_sounds(query="", kind="all"):
    """Return installed preset paths; kind is all, surge, or sfz."""
    if kind not in ("all", "surge", "sfz"):
        raise ValueError("kind must be all, surge, or sfz")
    paths = []
    if kind in ("all", "surge"):
        paths.extend(SURGE_DATA.rglob("*.fxp"))
    if kind in ("all", "sfz"):
        paths.extend(SAMPLE_DIR.rglob("*.sfz"))
    return sorted(p for p in paths if query.casefold() in str(p).casefold())


def _resolve_sound(value, kind):
    path = Path(value).expanduser()
    if path.is_file():
        return path.resolve()
    matches = find_sounds(str(value), kind)
    if len(matches) != 1:
        preview = "\n".join(str(p) for p in matches[:12])
        raise ValueError(f"Expected one sound, found {len(matches)} for {value!r}. "
                         f"Use find_sounds() and pass a full path.\n{preview}")
    return matches[0]


def _decode_juce(value):
    length, encoded = value.split(".", 1)
    result = bytearray(int(length))
    for i, char in enumerate(encoded):
        bits = _JUCE_ALPHABET.index(char)
        index, shift = divmod(i * 6, 8)
        if index < len(result):
            result[index] |= (bits << shift) & 255
        if shift > 2 and index + 1 < len(result):
            result[index + 1] |= bits >> (8 - shift)
    return bytes(result)


def _encode_juce(data):
    chars = []
    for offset in range(0, len(data) * 8, 6):
        index, shift = divmod(offset, 8)
        value = data[index] >> shift
        if index + 1 < len(data):
            value |= data[index + 1] << (8 - shift)
        chars.append(_JUCE_ALPHABET[value & 63])
    return f"{len(data)}." + "".join(chars)


def _read_component(plugin):
    state = plugin.raw_state
    if state[:4] != b"VC2!":
        raise RuntimeError("Unexpected Pedalboard state format")
    root = ET.fromstring(state[8:].rstrip(b"\0"))
    node = root.find("IComponent")
    if node is None or node.text is None:
        raise RuntimeError("VST3 component state is missing")
    return root, _decode_juce(node.text)


def _write_component(plugin, root, component):
    root.find("IComponent").text = _encode_juce(component)
    xml = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    plugin.raw_state = b"VC2!" + struct.pack("<I", len(xml)) + xml + b"\0"


def surge(preset=None):
    """Load Surge XT; optionally select a full .fxp path or a unique search."""
    plugin = load_plugin(_plugin_path(SURGE_PLUGIN, "SOUND_SURGE_PLUGIN"),
                         initialization_timeout=0)
    if preset is not None:
        path = _resolve_sound(preset, "surge")
        data = path.read_bytes()
        if data[:4] != b"CcnK" or data[8:12] != b"FPCh" or data[60:64] != b"sub3":
            raise ValueError(f"Unsupported Surge preset format: {path}")
        size = struct.unpack_from(">I", data, 56)[0]
        if size != len(data) - 60:
            raise ValueError(f"Incomplete Surge preset: {path}")
        root, _ = _read_component(plugin)
        _write_component(plugin, root, data[60:])
    return plugin


def sfizz(instrument):
    """Load an SFZ file in sfizz without opening its editor."""
    path = _resolve_sound(instrument, "sfz")
    plugin = load_plugin(_plugin_path(SFIZZ_PLUGIN, "SOUND_SFIZZ_PLUGIN"), plugin_name="sfizz",
                         initialization_timeout=0)
    root, component = _read_component(plugin)
    version, = struct.unpack_from("<Q", component)
    if version != 5:
        raise RuntimeError(f"Unsupported sfizz state version: {version}")
    old_size, = struct.unpack_from("<I", component, 8)
    encoded = str(path).encode("utf-8") + b"\0"
    component = (component[:8] + struct.pack("<I", len(encoded)) + encoded
                 + component[12 + old_size:])
    # Use the bundled 12-tone equal-temperament scale when no tuning is selected.
    scala_offset = 12 + len(encoded) + 16
    scala_size, = struct.unpack_from("<I", component, scala_offset)
    scala = Path(__file__).resolve().parents[2] / "assets/EqualTemperament.scl"
    if scala_size <= 1 and scala.is_file():
        encoded_scala = str(scala).encode("utf-8") + b"\0"
        component = (component[:scala_offset] + struct.pack("<I", len(encoded_scala))
                     + encoded_scala + component[scala_offset + 4 + scala_size:])
    _write_component(plugin, root, component)
    return plugin


def render_notes(plugin, notes, output, sample_rate=48000, tail=2.0):
    """Write a stereo 24-bit WAV from (pitch, start_s, duration_s, velocity).

    Returns (channels, samples) float32 audio. Notes use absolute seconds.
    Output is attenuated only when needed to keep the peak at or below 0.95.
    """
    events = []
    end = 0.0
    if tail < 0 or sample_rate <= 0:
        raise ValueError("tail must be nonnegative and sample_rate positive")
    for pitch, start, length, velocity in notes:
        if not (0 <= pitch <= 127 and 1 <= velocity <= 127 and start >= 0 and length > 0):
            raise ValueError("Invalid note; use MIDI pitch 0..127 and velocity 1..127")
        events.extend([
            Message("note_on", note=int(pitch), velocity=int(velocity), time=float(start)),
            Message("note_off", note=int(pitch), velocity=0, time=float(start + length)),
        ])
        end = max(end, start + length)
    if not events:
        raise ValueError("At least one note is required")
    events.sort(key=lambda m: (m.time, m.type == "note_on"))
    # sfizz 1.2.3 needs blocks <= 1024; 512 also works reliably with Surge XT.
    audio = plugin(events, duration=end + tail, sample_rate=sample_rate,
                   num_channels=2, buffer_size=512)
    if not np.isfinite(audio).all():
        raise RuntimeError("Plugin produced non-finite audio")
    peak = float(np.max(np.abs(audio)))
    if peak < 1e-7:
        raise RuntimeError("Silent render: check instrument path and note range")
    if peak > 0.95:
        audio *= 0.95 / peak
    path = Path(output).expanduser()
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), audio.T, sample_rate, subtype="PCM_24")
    return audio


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query", nargs="?", default="")
    parser.add_argument("--kind", choices=["all", "surge", "sfz"], default="all")
    args = parser.parse_args()
    paths = find_sounds(args.query, args.kind)
    for path in paths:
        print(path)
    print(f"{len(paths)} sounds")


if __name__ == "__main__":
    main()
