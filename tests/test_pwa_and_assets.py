"""PWA, asset integrity, and embedded audio validation tests."""

from __future__ import annotations

import base64
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import subprocess

import pytest

ROOT = Path(__file__).resolve().parent.parent


def _read_text(rel_path: str) -> str:
    return (ROOT / rel_path).read_text(encoding="utf-8")


def _probe_aac(path: Path) -> tuple[str, str, float]:
    """Run ffprobe on an audio file and return (name, codec_name, duration)."""
    res = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "a:0",
            "-show_entries",
            "stream=codec_name:format=duration",
            "-of",
            "json",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    info = json.loads(res.stdout)
    streams = info.get("streams", [])
    codec = streams[0].get("codec_name", "") if streams else ""
    duration = float(info.get("format", {}).get("duration", 0.0))
    return path.name, codec, duration


def test_manifest_valid_and_assets_exist() -> None:
    """Verify manifest.json standalone config, start_url, and icon files."""
    manifest = json.loads(_read_text("manifest.json"))
    assert manifest.get("display") == "standalone"

    start_url = manifest.get("start_url")
    assert isinstance(start_url, str) and start_url
    start_path = (ROOT / start_url).resolve()
    assert start_path.is_file(), f"Missing manifest start_url: {start_url}"

    icons = manifest.get("icons", [])
    assert icons, "manifest.json must declare at least one icon"
    for icon in icons:
        src = icon.get("src", "")
        icon_path = (ROOT / src).resolve()
        assert icon_path.is_file() and icon_path.stat().st_size > 0, (
            f"Missing or empty manifest icon: {src}"
        )


def test_service_worker_assets_and_cache_version_sync() -> None:
    """Verify sw.js CORE_ASSETS exist and CACHE_NAME matches widget_alphabet.html."""
    sw_text = _read_text("sw.js")
    cache_match = re.search(r'const\s+CACHE_NAME\s*=\s*"([^"]+)"', sw_text)
    assert cache_match is not None, "CACHE_NAME not found in sw.js"
    cache_name = cache_match.group(1)

    alpha_text = _read_text("widget_alphabet.html")
    assert f'caches.open("{cache_name}")' in alpha_text, (
        f"widget_alphabet.html cache name out of sync with sw.js ({cache_name})"
    )

    assets_match = re.search(r"const\s+CORE_ASSETS\s*=\s*\[(.*?)\];", sw_text, re.S)
    assert assets_match is not None, "CORE_ASSETS array not found in sw.js"
    asset_entries = re.findall(r'"([^"]+)"', assets_match.group(1))
    assert asset_entries, "CORE_ASSETS must not be empty"

    for entry in asset_entries:
        target = (ROOT / entry).resolve()
        if entry in ("./", "."):
            assert target.is_dir(), f"Missing root directory entry: {entry}"
        else:
            assert target.is_file(), f"Missing sw.js CORE_ASSETS file: {entry}"


def test_portal_links_and_manifest_tags() -> None:
    """Verify all relative portal links exist and manifest link tags are present."""
    index_text = _read_text("index.html")
    alpha_text = _read_text("widget_alphabet.html")

    manifest_tag = '<link rel="manifest" href="./manifest.json">'
    assert manifest_tag in index_text, "Missing manifest link tag in index.html"
    assert manifest_tag in alpha_text, "Missing manifest link tag in widget_alphabet.html"

    hrefs = re.findall(r'<a\b[^>]*\bhref="([^"]+)"', index_text)
    assert hrefs, "Expected <a> links in index.html"
    for href in hrefs:
        if href.startswith(("http://", "https://", "#", "mailto:")):
            continue
        target = (ROOT / href).resolve()
        if href.endswith("/"):
            assert (target / "index.html").is_file(), (
                f"Portal folder link missing index.html: {href}"
            )
        else:
            assert target.is_file(), f"Broken portal link in index.html: {href}"


def test_no_stale_references_and_full_glass_markup() -> None:
    """Verify legacy Sayda/SpeechRecognition strings are gone and full-glass controls exist."""
    forbidden = [
        "เซด้า",
        "Sayda",
        "sayda",
        "micMedallionStage",
        "SpeechRecognition",
        "currentNameLabel",
    ]
    for rel_path in ("widget_alphabet.html", "index.html", "sw.js"):
        content = _read_text(rel_path)
        for token in forbidden:
            assert token not in content, f"Stale reference {token!r} found in {rel_path}"

    alpha_text = _read_text("widget_alphabet.html")
    for required_token in ("floating-back-btn", "floating-clear-btn", "100dvh"):
        assert required_token in alpha_text, (
            f"Missing full-glass Name Studio token {required_token!r} in widget_alphabet.html"
        )


def test_portrait_images_valid_jpeg() -> None:
    """Verify portrait images exist, are non-trivial, and start with JPEG magic bytes."""
    for rel_path in ("img/jayda.jpg", "img/dada.jpg"):
        img_path = ROOT / rel_path
        assert img_path.is_file(), f"Missing portrait image: {rel_path}"
        data = img_path.read_bytes()
        assert len(data) > 10_000, f"Portrait image unexpectedly small: {rel_path}"
        assert data.startswith(b"\xff\xd8\xff"), f"Invalid JPEG header in {rel_path}"


def test_alphabet_and_name_audio_clips_valid_aac() -> None:
    """Verify every Leda alphabet and Name Studio .m4a clip exists and decodes as AAC."""
    alpha_text = _read_text("widget_alphabet.html")
    expected_clips = set(re.findall(r'"([a-z0-9_]+\.m4a)"', alpha_text))
    for i in range(1, 45):
        expected_clips.add(f"short_alpha_{i:02d}.m4a")
        expected_clips.add(f"coach_alpha_{i:02d}.m4a")

    expected_clips.update(
        {
            "greet_jayda.m4a",
            "greet_dada.m4a",
            "praise_jayda.m4a",
            "praise_dada.m4a",
            "name_jayda.m4a",
            "name_dada.m4a",
        }
    )

    audio_dir = ROOT / "audio_leda"
    paths: list[Path] = []
    for fname in sorted(expected_clips):
        clip_path = audio_dir / fname
        assert clip_path.is_file(), f"Missing Leda audio clip: {fname}"
        assert clip_path.stat().st_size > 1500, f"Truncated audio clip: {fname}"
        paths.append(clip_path)

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(_probe_aac, paths))

    for fname, codec, duration in results:
        assert codec == "aac", f"Unexpected codec {codec!r} for {fname}"
        assert duration > 0.25, f"Duration too short ({duration:.3f}s) for {fname}"


@pytest.mark.parametrize(
    ("rel_path", "expected_keys"),
    [
        (
            "widget_numbers.html",
            {f"th_{i}" for i in range(1, 11)}
            | {f"coach_th_{i}" for i in range(1, 11)}
            | {"th_praise", "th_tooktong"},
        ),
        (
            "widget_numbers_bilingual.html",
            {f"th_{i}" for i in range(1, 11)}
            | {f"en_{i}" for i in range(1, 11)}
            | {f"both_{i}" for i in range(1, 11)}
            | {f"coach_th_{i}" for i in range(1, 11)}
            | {f"coach_en_{i}" for i in range(1, 11)}
            | {"th_praise", "en_praise", "th_tooktong"},
        ),
        (
            "widget_addition.html",
            {f"th_{i}" for i in range(1, 11)}
            | {f"en_{i}" for i in range(1, 11)}
            | {"th_praise", "en_praise", "th_tooktong"},
        ),
    ],
)
def test_numbers_widgets_parity_and_embedded_audio_valid(
    rel_path: str, expected_keys: set[str]
) -> None:
    """Verify number widget mirror parity and valid MP4/M4A base64 payloads."""
    if rel_path == "widget_numbers.html":
        assert _read_text("widget_numbers.html") == _read_text("widget_numbers_thai.html"), (
            "widget_numbers.html and widget_numbers_thai.html must remain byte-identical"
        )

    html = _read_text(rel_path)
    match = re.search(r"const\s+EMBEDDED_AUDIO\s*=\s*(\{.*?\});", html)
    assert match is not None, f"EMBEDDED_AUDIO object not found in {rel_path}"

    embedded = json.loads(match.group(1))
    assert set(embedded.keys()) == expected_keys, (
        f"Unexpected EMBEDDED_AUDIO keys in {rel_path}: "
        f"missing={expected_keys - set(embedded.keys())}, "
        f"extra={set(embedded.keys()) - expected_keys}"
    )

    prefix = "data:audio/mp4;base64,"
    for key, uri in embedded.items():
        assert isinstance(uri, str) and uri.startswith(prefix), (
            f"Invalid audio data URI prefix for {rel_path}:{key}"
        )
        raw = base64.b64decode(uri[len(prefix) :], validate=True)
        assert b"ftyp" in raw[:32], f"Missing MP4 ftyp header for {rel_path}:{key}"
