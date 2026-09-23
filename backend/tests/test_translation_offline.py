"""Translation prefers offline Argos packs, falls back to online Google."""

import sys
import types

import pytest

from backend.services.translation import get_argos_translator, translate_batch, translate_text


def _install_fake_argos(monkeypatch, pairs=("en", "es")):
    src_code, tgt_code = pairs

    class _Lang:
        def __init__(self, code):
            self.code = code

        def get_translation(self, other):
            class _T:
                def translate(self, text):
                    return f"[{tgt_code}]{text}"

            return _T()

    fake_translate = types.ModuleType("argostranslate.translate")
    fake_translate.get_installed_languages = lambda: [_Lang(src_code), _Lang(tgt_code)]
    fake_pkg = types.ModuleType("argostranslate")
    fake_pkg.translate = fake_translate
    monkeypatch.setitem(sys.modules, "argostranslate", fake_pkg)
    monkeypatch.setitem(sys.modules, "argostranslate.translate", fake_translate)


async def test_argos_offline_wins_when_pack_installed(monkeypatch):
    _install_fake_argos(monkeypatch)
    result = await translate_text("hello", "en", "es")
    assert result.translated_text == "[es]hello"
    assert result.engine == "argos"


async def test_argos_missing_pair_falls_back_to_google(monkeypatch):
    _install_fake_argos(monkeypatch, ("en", "es"))

    class _Google:
        def __init__(self, source, target):
            pass

        def translate(self, text):
            return f"g:{text}"

    fake_dt = types.ModuleType("deep_translator")
    fake_dt.GoogleTranslator = _Google
    monkeypatch.setitem(sys.modules, "deep_translator", fake_dt)
    result = await translate_text("hello", "en", "fr")
    assert result.translated_text == "g:hello"
    assert result.engine == "google"


async def test_no_backend_raises_actionable_error(monkeypatch):
    monkeypatch.setitem(sys.modules, "argostranslate", None)
    monkeypatch.setitem(sys.modules, "deep_translator", None)
    with pytest.raises(RuntimeError, match="No translation backend"):
        await translate_text("hello", "en", "es")


async def test_batch_uses_offline_pair(monkeypatch):
    _install_fake_argos(monkeypatch)
    results = await translate_batch(["a", "b"], "en", "es")
    assert [r.translated_text for r in results] == ["[es]a", "[es]b"]
    assert all(r.engine == "argos" for r in results)


def test_get_argos_translator_rejects_auto():
    assert get_argos_translator("auto", "en") is None
