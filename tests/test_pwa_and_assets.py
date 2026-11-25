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


@pytest.mark.parametrize("manifest_rel", ["manifest.json", "manifest_alphabet.json"])
def test_manifest_valid_and_assets_exist(manifest_rel: str) -> None:
    """Verify PWA manifest standalone config, start_url, and icon files."""
    manifest = json.loads(_read_text(manifest_rel))
    assert manifest.get("display") == "standalone"

    start_url = manifest.get("start_url")
    assert isinstance(start_url, str) and start_url
    start_path = (ROOT / start_url).resolve()
    assert start_path.is_file(), f"Missing {manifest_rel} start_url: {start_url}"

    icons = manifest.get("icons", [])
    assert icons, f"{manifest_rel} must declare at least one icon"
    for icon in icons:
        src = icon.get("src", "")
        icon_path = (ROOT / src).resolve()
        assert icon_path.is_file() and icon_path.stat().st_size > 0, (
            f"Missing or empty {manifest_rel} icon: {src}"
        )


def test_service_worker_assets_and_cache_version_sync() -> None:
    """Verify sw.js CORE_ASSETS exist and CACHE_NAME matches alphabet core & pages."""
    sw_text = _read_text("sw.js")
    cache_match = re.search(r'const\s+CACHE_NAME\s*=\s*"([^"]+)"', sw_text)
    assert cache_match is not None, "CACHE_NAME not found in sw.js"
    cache_name = cache_match.group(1)

    core_js = _read_text("alphabet_core.js")
    assert f'"{cache_name}"' in core_js, (
        f"alphabet_core.js default cache name out of sync with sw.js ({cache_name})"
    )
    for rel_page in ("widget_alphabet.html", "alphabet.html"):
        page_text = _read_text(rel_page)
        assert f'cacheName: "{cache_name}"' in page_text, (
            f"{rel_page} cacheName out of sync with sw.js ({cache_name})"
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
    base_alpha_text = _read_text("alphabet.html")

    manifest_tag = '<link rel="manifest" href="./manifest.json">'
    assert manifest_tag in index_text, "Missing manifest link tag in index.html"
    assert manifest_tag in alpha_text, "Missing manifest link tag in widget_alphabet.html"
    assert '<link rel="manifest" href="./manifest_alphabet.json">' in base_alpha_text, (
        "Missing manifest_alphabet.json link tag in alphabet.html"
    )

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
    """Verify legacy Sayda/SpeechRecognition strings are gone, base alphabet is neutral, and full-glass controls exist."""
    forbidden = [
        "เซด้า",
        "Sayda",
        "sayda",
        "micMedallionStage",
        "SpeechRecognition",
        "currentNameLabel",
    ]
    for rel_path in (
        "widget_alphabet.html",
        "alphabet.html",
        "alphabet_core.js",
        "alphabet_core.css",
        "index.html",
        "sw.js",
    ):
        content = _read_text(rel_path)
        for token in forbidden:
            assert token not in content, f"Stale reference {token!r} found in {rel_path}"

    base_alpha_text = _read_text("alphabet.html")
    for family_token in ("jayda", "dada", "เจด้า", "ดาด้า", "index.html", "landscapeContainer"):
        assert family_token not in base_alpha_text.lower(), (
            f"Family reference {family_token!r} found in base alphabet.html"
        )

    alpha_text = _read_text("widget_alphabet.html")
    for required_token in ("floating-back-btn", "floating-clear-btn"):
        assert required_token in alpha_text, (
            f"Missing full-glass Name Studio token {required_token!r} in widget_alphabet.html"
        )
    assert "100dvh" in _read_text("alphabet_core.css"), (
        "Missing full-glass 100dvh rule in alphabet_core.css"
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
    combined_alpha = _read_text("widget_alphabet.html") + "\n" + _read_text("alphabet_core.js")
    expected_clips = set(re.findall(r'"([a-z0-9_]+\.m4a)"', combined_alpha))
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
    """Verify duplicate widget_numbers_thai.html is removed and MP4/M4A payloads are valid."""
    assert not (ROOT / "widget_numbers_thai.html").exists(), (
        "Duplicate widget_numbers_thai.html must remain deleted"
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


def test_ui_lang_switcher_english_titles_and_hub_layout() -> None:
    """Verify TH/GB flag switcher, English-first titles, and Hub alphabet/audition placement."""
    assert (ROOT / "ui_lang.js").is_file(), "Missing shared ui_lang.js script"

    user_pages = (
        "index.html",
        "alphabet.html",
        "widget_alphabet.html",
        "widget_numbers.html",
        "widget_numbers_bilingual.html",
        "widget_addition.html",
    )
    for rel_page in user_pages:
        html = _read_text(rel_page)
        assert '<script src="./ui_lang.js"></script>' in html, (
            f"Missing ui_lang.js script tag in {rel_page}"
        )
        assert 'data-set-lang="th"' in html and "🇹🇭" in html, (
            f"Missing Thai flag toggle in {rel_page}"
        )
        assert 'data-set-lang="en"' in html and "🇬🇧" in html, (
            f"Missing British English flag toggle in {rel_page}"
        )
        title_match = re.search(r"<title>(.*?)</title>", html)
        assert title_match is not None, f"Missing <title> in {rel_page}"
        assert title_match.group(1)[0].isascii(), (
            f"<title> must start in English/ASCII in {rel_page}: {title_match.group(1)!r}"
        )

    index_html = _read_text("index.html")
    assert 'href="widget_alphabet.html"' in index_html, "Hub missing Jayda & Dada Alphabet link"
    assert 'href="alphabet.html"' in index_html, "Hub missing Generic Alphabet link"

    footer_match = re.search(
        r'<footer class="dev-mini-links">(.*?)</footer>', index_html, re.S
    )
    assert footer_match is not None, "Hub missing dev-mini-links footer"
    footer_html = footer_match.group(1)
    assert 'href="voice_audition/"' in footer_html, "Numbers audition link missing from footer"
    assert 'href="alphabet_audition/"' in footer_html, "Alphabet audition link missing from footer"

    tiles_match = re.search(
        r'<main class="tiles-container">(.*?)</main>', index_html, re.S
    )
    assert tiles_match is not None, "Hub missing tiles-container"
    tiles_html = tiles_match.group(1)
    assert "voice_audition/" not in tiles_html and "alphabet_audition/" not in tiles_html, (
        "Audition labs should be mini footer links, not main kid tiles"
    )

