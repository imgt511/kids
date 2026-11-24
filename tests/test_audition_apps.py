"""Audition PWA integrity, markup, and audio asset coverage tests."""

from __future__ import annotations

import json
from pathlib import Path
import re

import pytest

ROOT = Path(__file__).resolve().parent.parent


def _read_text(rel_path: str) -> str:
    return (ROOT / rel_path).read_text(encoding="utf-8")


def _assert_valid_m4a(path: Path) -> None:
    assert path.is_file(), f"Missing audio clip: {path.relative_to(ROOT)}"
    assert path.stat().st_size > 1000, f"Audio clip unexpectedly small: {path.relative_to(ROOT)}"
    header = path.read_bytes()[:32]
    assert b"ftyp" in header, f"Missing MP4 ftyp header: {path.relative_to(ROOT)}"


@pytest.mark.parametrize("folder", ["voice_audition", "alphabet_audition"])
def test_audition_manifests_and_sw_cache_sync(folder: str) -> None:
    """Verify audition manifest, back-link to Hub, and sw.js cache alignment."""
    app_dir = ROOT / folder
    manifest = json.loads(_read_text(f"{folder}/manifest.json"))
    assert manifest.get("display") == "standalone"

    start_url = manifest.get("start_url")
    assert isinstance(start_url, str) and start_url
    assert (app_dir / start_url).resolve().is_file(), f"Missing start_url in {folder}"

    html = _read_text(f"{folder}/index.html")
    assert '<link rel="manifest" href="./manifest.json"' in html
    assert 'href="../index.html"' in html

    sw_text = _read_text(f"{folder}/sw.js")
    cache_match = re.search(r'const\s+CACHE_NAME\s*=\s*"([^"]+)"', sw_text)
    assert cache_match is not None, f"CACHE_NAME missing in {folder}/sw.js"
    cache_name = cache_match.group(1)
    assert f'caches.open("{cache_name}")' in html, (
        f"{folder}/index.html cache name out of sync with sw.js ({cache_name})"
    )

    add_all_match = re.search(r"cache\.addAll\(\[(.*?)\]\)", sw_text, re.S)
    assert add_all_match is not None, f"cache.addAll missing in {folder}/sw.js"
    entries = re.findall(r'"([^"]+)"', add_all_match.group(1))
    assert entries
    for entry in entries:
        target = (app_dir / entry).resolve()
        if entry in ("./", "."):
            assert target.is_dir()
        else:
            assert target.is_file(), f"Missing precached asset {entry} in {folder}"


def test_alphabet_audition_no_duplicate_offline_installer() -> None:
    """Verify duplicate nested installAllOffline and serviceWorker.register block was removed."""
    html = _read_text("alphabet_audition/index.html")
    assert html.count("function installAllOffline()") == 1
    assert html.count('serviceWorker.register("./sw.js")') == 1


def test_alphabet_audition_audio_coverage_and_headers() -> None:
    """Verify all 30 voices x 46 clips exist for alphabet_audition with valid M4A headers."""
    html = _read_text("alphabet_audition/index.html")
    voices_block = re.search(r"const\s+VOICES\s*=\s*\[(.*?)\];", html, re.S)
    assert voices_block is not None
    voice_names = [m.lower() for m in re.findall(r'\["([A-Za-z]+)","[MF]"\]', voices_block.group(1))]
    assert len(voice_names) == 30

    expected_clips = ["master_p1.m4a", "master_p2.m4a"] + [
        f"alpha_{i:02d}.m4a" for i in range(1, 45)
    ]

    audio_root = ROOT / "alphabet_audition/audio"
    for voice in voice_names:
        voice_dir = audio_root / voice
        assert voice_dir.is_dir(), f"Missing alphabet_audition audio folder: {voice}"
        for clip in expected_clips:
            _assert_valid_m4a(voice_dir / clip)


def test_voice_audition_audio_coverage_and_headers() -> None:
    """Verify all 33 voice_audition folders, Thai clips, and all English clips."""
    html = _read_text("voice_audition/index.html")
    voices_block = re.search(r"const\s+VOICES\s*=\s*\[(.*?)\];", html, re.S)
    assert voices_block is not None

    v30_names = [
        "v30_" + name.lower()
        for name in re.findall(r'\["([A-Za-z]+)",\s*"[MF]"\]', voices_block.group(1))
    ]
    assert len(v30_names) == 30
    all_voices = v30_names + ["leda_raw", "leda_norm", "leda"]

    audio_root = ROOT / "voice_audition/audio"
    thai_required = ["master.m4a"] + [f"num_{i:02d}.m4a" for i in range(1, 11)]
    for voice in all_voices:
        voice_dir = audio_root / voice
        assert voice_dir.is_dir(), f"Missing voice_audition audio folder: {voice}"
        for clip in thai_required:
            _assert_valid_m4a(voice_dir / clip)

    for voice in v30_names:
        voice_dir = audio_root / voice
        for i in range(1, 11):
            _assert_valid_m4a(voice_dir / f"en_{i:02d}.m4a")
