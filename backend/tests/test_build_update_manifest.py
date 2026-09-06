"""Unit tests for .github/scripts/build_update_manifest.py — the release-side
``latest.json`` generator gets its own regression floor.

Covers the manifest contract the Tauri updater depends on:

- all six platform legs (windows/darwin/linux x x86_64/aarch64) map to the
  triple-prefixed installer + its ``.sig`` sidecar;
- ``_pick`` never mistakes a ``.sig`` for its installer, prefers the NSIS
  ``setup.exe`` over an MSI decoy, and is deterministic on ties;
- triple-prefix scoping keeps two macOS legs (and windows x64 vs arm64) from
  stealing each other's artifacts — the documented reason the release job
  renames files to ``<triple>-<name>``;
- a leg with no artifacts is *skipped* (partial matrix), but a present
  installer with a missing signature is a *hard error* (rc 1, no manifest);
- an artifact set with nothing updatable fails with rc 1.

The tests drive ``main()`` in-process with monkeypatched argv/env and a
``tmp_path`` artifact tree, so the whole file runs in well under a second.
``_conf_version()`` reads ``tauri/src-tauri/tauri.conf.json`` relative to the
CWD, so main() tests ``monkeypatch.chdir`` to the real repo root; the v-prefix
strip is tested against a fake repo layout instead of the real conf.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent

SCRIPT = REPO_ROOT / ".github" / "scripts" / "build_update_manifest.py"

INSTALLER_NAMES: dict[str, str] = {
    "windows-x86_64": "Otoyin Studio_0.2.0_x64-setup.exe",
    "windows-aarch64": "Otoyin Studio_0.2.0_arm64-setup.exe",
    "darwin-aarch64": "Otoyin Studio.app.tar.gz",
    "darwin-x86_64": "Otoyin Studio.app.tar.gz",
    "linux-x86_64": "otoyin_0.2.0_amd64.AppImage",
    "linux-aarch64": "otoyin_0.2.0_arm64.AppImage",
}

ALL_TRIPLES: dict[str, str] = {
    "windows-x86_64": "x86_64-pc-windows-msvc",
    "windows-aarch64": "aarch64-pc-windows-msvc",
    "darwin-aarch64": "aarch64-apple-darwin",
    "darwin-x86_64": "x86_64-apple-darwin",
    "linux-x86_64": "x86_64-unknown-linux-gnu",
    "linux-aarch64": "aarch64-unknown-linux-gnu",
}


def _load_module():
    """Import build_update_manifest.py (filename has no underscores, so it
    cannot be imported normally)."""
    spec = importlib.util.spec_from_file_location("build_update_manifest", str(SCRIPT))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture
def mod():
    return _load_module()


@pytest.fixture
def main_env(monkeypatch):
    """Env main() needs, plus argv pointing at the caller's artifacts dir."""
    monkeypatch.setenv("GITHUB_REPOSITORY", "otoyin/otoyin")
    monkeypatch.setenv("GITHUB_REF_NAME", "v0.2.0")
    monkeypatch.chdir(REPO_ROOT)  # _conf_version() reads the conf relative to CWD

    def _set_argv(artifacts: Path) -> None:
        monkeypatch.setattr(sys, "argv", ["build_update_manifest.py", str(artifacts)])

    return _set_argv


def _write_leg(artifacts: Path, triple: str, installer_name: str) -> Path:
    """Create a triple-prefixed installer + .sig whose signature content names
    the file it belongs to (so cross-leg mixups are detectable)."""
    prefixed = f"{triple}-{installer_name}"
    installer = artifacts / prefixed
    installer.write_text(f"installer-bytes:{prefixed}", encoding="utf-8")
    sig = artifacts / f"{prefixed}.sig"
    sig.write_text(f"test-sig:{prefixed}\n", encoding="utf-8")
    return installer


def _make_leg(artifacts: Path, platform_key: str) -> Path:
    return _write_leg(artifacts, ALL_TRIPLES[platform_key], INSTALLER_NAMES[platform_key])


# ── _pick: suffix matching, sig exclusion, determinism ────────────────────


class TestPick:
    def test_installer_selected_and_sig_never_is(self, mod, tmp_path):
        """The .sig sidecar ends with '<suffix>.sig' and must never satisfy
        the '<suffix>' match — a classic updater-manifest bug."""
        leg = [
            tmp_path / "x86_64-pc-windows-msvc-Otoyin Studio_0.2.0_x64-setup.exe",
            tmp_path / "x86_64-pc-windows-msvc-Otoyin Studio_0.2.0_x64-setup.exe.sig",
        ]
        for p in leg:
            p.write_text("x", encoding="utf-8")
        picked = mod._pick(leg, ("setup.exe",))
        assert picked is not None
        assert picked.name.endswith("setup.exe")
        assert not picked.name.endswith(".sig")

    def test_sig_only_leg_returns_none(self, mod, tmp_path):
        leg = [tmp_path / "x86_64-pc-windows-msvc-app.tar.gz.sig"]
        leg[0].write_text("x", encoding="utf-8")
        assert mod._pick(leg, (".app.tar.gz",)) is None

    def test_windows_prefers_nsis_over_msi_decoy(self, mod, tmp_path):
        """The release job renames MSI decoys alongside installers; the NSIS
        setup.exe must win because Tauri only uploads updater artifacts for it."""
        msi = tmp_path / "x86_64-pc-windows-msvc-Otoyin Studio_0.2.0_x64_en-US.msi"
        nsis = tmp_path / "x86_64-pc-windows-msvc-Otoyin Studio_0.2.0_x64-setup.exe"
        for p in (msi, nsis):
            p.write_text("x", encoding="utf-8")
        # ("setup.exe",) is the windows suffix list; the MSI alone never matches.
        assert mod._pick([msi], ("setup.exe",)) is None
        assert mod._pick([msi, nsis], ("setup.exe",)) == nsis

    def test_tie_broken_alphabetically(self, mod, tmp_path):
        """Two installers for one leg: sorted() makes the pick deterministic
        regardless of rglob order."""
        a = tmp_path / "aarch64-apple-darwin-aaa.app.tar.gz"
        z = tmp_path / "aarch64-apple-darwin-zzz.app.tar.gz"
        for p in (z, a):
            p.write_text("x", encoding="utf-8")
        assert mod._pick([z, a], (".app.tar.gz",)) == a

    def test_empty_leg_returns_none(self, mod):
        assert mod._pick([], (".AppImage",)) is None


# ── main(): the six-leg manifest ──────────────────────────────────────────


class TestMainAllSixLegs:
    def test_all_six_platforms_present(self, mod, tmp_path, main_env, capsys):
        for key in INSTALLER_NAMES:
            _make_leg(tmp_path, key)
        main_env(tmp_path)

        assert mod.main() == 0
        manifest = json.loads((tmp_path / "latest.json").read_text(encoding="utf-8"))
        assert set(manifest["platforms"]) == set(INSTALLER_NAMES)
        assert manifest["notes"]
        # Version comes from the repo conf (v-prefix stripped).
        conf = json.loads((REPO_ROOT / "tauri/src-tauri/tauri.conf.json").read_text(encoding="utf-8"))
        assert manifest["version"] == conf["version"].lstrip("v")

    def test_signature_lands_on_its_own_leg(self, mod, tmp_path, main_env):
        """Each leg's embedded signature marker must surface verbatim — this
        catches any prefix-scoping bug that swaps artifacts between legs."""
        for key in INSTALLER_NAMES:
            _make_leg(tmp_path, key)
        main_env(tmp_path)

        assert mod.main() == 0
        manifest = json.loads((tmp_path / "latest.json").read_text(encoding="utf-8"))
        for key, triple in ALL_TRIPLES.items():
            expected = f"test-sig:{triple}-{INSTALLER_NAMES[key]}"
            assert manifest["platforms"][key]["signature"] == expected, key

    def test_urls_point_at_the_release_asset(self, mod, tmp_path, main_env):
        for key in INSTALLER_NAMES:
            _make_leg(tmp_path, key)
        main_env(tmp_path)

        assert mod.main() == 0
        manifest = json.loads((tmp_path / "latest.json").read_text(encoding="utf-8"))
        url = manifest["platforms"]["linux-x86_64"]["url"]
        assert url == (
            "https://github.com/otoyin/otoyin/releases/download/v0.2.0/"
            "x86_64-unknown-linux-gnu-otoyin_0.2.0_amd64.AppImage"
        )

    def test_url_quotes_spaces_in_darwin_names(self, mod, tmp_path, main_env):
        """'Otoyin Studio.app.tar.gz' has a space; the URL must percent-encode
        it or GitHub's static asset endpoint 404s."""
        _make_leg(tmp_path, "darwin-aarch64")
        main_env(tmp_path)

        assert mod.main() == 0
        manifest = json.loads((tmp_path / "latest.json").read_text(encoding="utf-8"))
        url = manifest["platforms"]["darwin-aarch64"]["url"]
        assert "aarch64-apple-darwin-Otoyin%20Studio.app.tar.gz" in url

    def test_decoys_and_strays_are_ignored(self, mod, tmp_path, main_env):
        """MSI decoys (with their own sigs) and unrelated release files must
        not perturb the manifest."""
        for key in ("windows-x86_64", "linux-x86_64"):
            _make_leg(tmp_path, key)
        msi = "Otoyin Studio_0.2.0_x64_en-US.msi"
        _write_leg(tmp_path, ALL_TRIPLES["windows-x86_64"], msi)
        (tmp_path / "x86_64-pc-windows-msvc-README.txt").write_text("hi", encoding="utf-8")
        (tmp_path / "STRAY-no-triple.txt").write_text("hi", encoding="utf-8")
        main_env(tmp_path)

        assert mod.main() == 0
        manifest = json.loads((tmp_path / "latest.json").read_text(encoding="utf-8"))
        assert set(manifest["platforms"]) == {"windows-x86_64", "linux-x86_64"}
        assert manifest["platforms"]["windows-x86_64"]["url"].endswith("-setup.exe")


# ── prefix collisions: legs must not steal each other's files ─────────────


class TestPrefixCollisions:
    def test_windows_x64_and_arm64_stay_separate(self, mod, tmp_path, main_env):
        """'x86_64-pc-windows-msvc' vs 'aarch64-pc-windows-msvc' share the
        '-pc-windows-msvc' tail but not the prefix — each leg must bind to
        its own installer, not the other's."""
        for key in ("windows-x86_64", "windows-aarch64"):
            _make_leg(tmp_path, key)
        main_env(tmp_path)

        assert mod.main() == 0
        manifest = json.loads((tmp_path / "latest.json").read_text(encoding="utf-8"))
        x64 = manifest["platforms"]["windows-x86_64"]
        arm = manifest["platforms"]["windows-aarch64"]
        assert "x86_64-pc-windows-msvc-" in x64["url"]
        assert "aarch64-pc-windows-msvc-" in arm["url"]
        assert x64["signature"].startswith("test-sig:x86_64-pc-windows-msvc-")
        assert arm["signature"].startswith("test-sig:aarch64-pc-windows-msvc-")

    def test_darwin_two_legs_no_collision(self, mod, tmp_path, main_env):
        """The documented reason for the rename scheme: both macOS legs emit
        an identically-named 'Otoyin Studio.app.tar.gz'."""
        for key in ("darwin-aarch64", "darwin-x86_64"):
            _make_leg(tmp_path, key)
        main_env(tmp_path)

        assert mod.main() == 0
        manifest = json.loads((tmp_path / "latest.json").read_text(encoding="utf-8"))
        assert manifest["platforms"]["darwin-aarch64"]["signature"].startswith("test-sig:aarch64-apple-darwin-")
        assert manifest["platforms"]["darwin-x86_64"]["signature"].startswith("test-sig:x86_64-apple-darwin-")

    def test_wrong_family_name_under_prefix_does_not_satisfy_leg(self, mod, tmp_path, main_env):
        """A darwin-style '.app.tar.gz' carrying a windows prefix must not
        satisfy the darwin legs — matching is prefix-scoped, not suffix-global."""
        _write_leg(
            tmp_path,
            ALL_TRIPLES["windows-x86_64"],
            "Otoyin Studio.app.tar.gz",
        )
        main_env(tmp_path)

        assert mod.main() == 1  # nothing updatable for any leg
        assert not (tmp_path / "latest.json").exists()


# ── missing artifacts: skip vs hard error ─────────────────────────────────


class TestMissingArtifacts:
    def test_single_leg_build_produces_single_platform_manifest(self, mod, tmp_path, main_env, capsys):
        """A windows-only release: the five absent legs are skipped with a
        notice, the manifest still ships."""
        _make_leg(tmp_path, "windows-x86_64")
        main_env(tmp_path)

        assert mod.main() == 0
        manifest = json.loads((tmp_path / "latest.json").read_text(encoding="utf-8"))
        assert set(manifest["platforms"]) == {"windows-x86_64"}
        skipped = capsys.readouterr().err
        assert "skipping darwin-aarch64" in skipped
        assert "skipping linux-x86_64" in skipped

    def test_partial_matrix_manifest(self, mod, tmp_path, main_env, capsys):
        _make_leg(tmp_path, "windows-x86_64")
        _make_leg(tmp_path, "linux-x86_64")
        main_env(tmp_path)

        assert mod.main() == 0
        manifest = json.loads((tmp_path / "latest.json").read_text(encoding="utf-8"))
        assert set(manifest["platforms"]) == {"windows-x86_64", "linux-x86_64"}
        assert "skipping darwin-x86_64" in capsys.readouterr().err

    def test_missing_signature_is_a_hard_error(self, mod, tmp_path, main_env, capsys):
        """An installer without its .sig would produce an uninstallable
        manifest — rc 1, no latest.json, message names the signing env."""
        triple = ALL_TRIPLES["darwin-aarch64"]
        installer = tmp_path / f"{triple}-{INSTALLER_NAMES['darwin-aarch64']}"
        installer.write_text("installer-bytes", encoding="utf-8")
        main_env(tmp_path)

        assert mod.main() == 1
        err = capsys.readouterr().err  # readouterr drains — capture once
        assert "missing signature" in err
        assert "TAURI_SIGNING_PRIVATE_KEY" in err
        assert not (tmp_path / "latest.json").exists()

    def test_no_updatable_artifacts_fails(self, mod, tmp_path, main_env, capsys):
        """An empty artifact dir (or one with only stray files) must fail the
        release job loudly, not publish an empty-platforms manifest."""
        (tmp_path / "unrelated.txt").write_text("hi", encoding="utf-8")
        main_env(tmp_path)

        assert mod.main() == 1
        assert "no updatable artifacts" in capsys.readouterr().err
        assert not (tmp_path / "latest.json").exists()


# ── env / argv contract ───────────────────────────────────────────────────


class TestEnvAndArgs:
    def test_missing_repo_env_exits_2(self, mod, tmp_path, monkeypatch):
        _make_leg(tmp_path, "windows-x86_64")
        monkeypatch.setenv("GITHUB_REF_NAME", "v0.2.0")
        monkeypatch.delenv("GITHUB_REPOSITORY", raising=False)
        monkeypatch.chdir(REPO_ROOT)
        monkeypatch.setattr(sys, "argv", ["build_update_manifest.py", str(tmp_path)])

        with pytest.raises(SystemExit) as exc:
            mod.main()
        assert exc.value.code == 2

    def test_usage_error_without_artifacts_dir(self, mod, monkeypatch):
        monkeypatch.setattr(sys, "argv", ["build_update_manifest.py"])
        assert mod.main() == 2

    def test_version_v_prefix_stripped(self, mod, tmp_path, monkeypatch):
        """_conf_version() reads tauri/src-tauri/tauri.conf.json relative to
        the CWD and main() strips a leading 'v' — exercised end-to-end on a
        fake repo, because the real conf's '0.1.0' would hide the strip."""
        fake_repo = tmp_path / "repo"
        conf_dir = fake_repo / "tauri" / "src-tauri"
        conf_dir.mkdir(parents=True)
        (conf_dir / "tauri.conf.json").write_text(json.dumps({"version": "v3.4.5"}), encoding="utf-8")
        artifacts = fake_repo / "artifacts"
        artifacts.mkdir()
        _write_leg(
            artifacts,
            ALL_TRIPLES["windows-x86_64"],
            INSTALLER_NAMES["windows-x86_64"],
        )
        monkeypatch.setenv("GITHUB_REPOSITORY", "otoyin/otoyin")
        monkeypatch.setenv("GITHUB_REF_NAME", "v3.4.5")
        monkeypatch.chdir(fake_repo)
        monkeypatch.setattr(sys, "argv", ["build_update_manifest.py", str(artifacts)])

        assert mod.main() == 0
        manifest = json.loads((artifacts / "latest.json").read_text(encoding="utf-8"))
        assert manifest["version"] == "3.4.5"
