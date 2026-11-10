"""Multi-language text translation via Google Translate (free endpoint).

Uses deep-translator for 100+ language support with automatic retry on rate limits.
"""

import asyncio
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)

SUPPORTED_LANGUAGES: dict[str, str] = {
    "af": "Afrikaans",
    "sq": "Albanian",
    "am": "Amharic",
    "ar": "Arabic",
    "hy": "Armenian",
    "az": "Azerbaijani",
    "eu": "Basque",
    "be": "Belarusian",
    "bn": "Bengali",
    "bs": "Bosnian",
    "bg": "Bulgarian",
    "ca": "Catalan",
    "ceb": "Cebuano",
    "zh-CN": "Chinese (Simplified)",
    "zh-TW": "Chinese (Traditional)",
    "co": "Corsican",
    "hr": "Croatian",
    "cs": "Czech",
    "da": "Danish",
    "nl": "Dutch",
    "en": "English",
    "eo": "Esperanto",
    "et": "Estonian",
    "fi": "Finnish",
    "fr": "French",
    "fy": "Frisian",
    "gl": "Galician",
    "ka": "Georgian",
    "de": "German",
    "el": "Greek",
    "gu": "Gujarati",
    "ht": "Haitian Creole",
    "ha": "Hausa",
    "haw": "Hawaiian",
    "he": "Hebrew",
    "hi": "Hindi",
    "hmn": "Hmong",
    "hu": "Hungarian",
    "is": "Icelandic",
    "ig": "Igbo",
    "id": "Indonesian",
    "ga": "Irish",
    "it": "Italian",
    "ja": "Japanese",
    "jv": "Javanese",
    "kn": "Kannada",
    "kk": "Kazakh",
    "km": "Khmer",
    "rw": "Kinyarwanda",
    "ko": "Korean",
    "ku": "Kurdish",
    "ky": "Kyrgyz",
    "lo": "Lao",
    "la": "Latin",
    "lv": "Latvian",
    "lt": "Lithuanian",
    "lb": "Luxembourgish",
    "mk": "Macedonian",
    "mg": "Malagasy",
    "ms": "Malay",
    "ml": "Malayalam",
    "mt": "Maltese",
    "mi": "Maori",
    "mr": "Marathi",
    "mn": "Mongolian",
    "my": "Myanmar (Burmese)",
    "ne": "Nepali",
    "no": "Norwegian",
    "ny": "Chichewa",
    "or": "Odia",
    "ps": "Pashto",
    "fa": "Persian",
    "pl": "Polish",
    "pt": "Portuguese",
    "pa": "Punjabi",
    "ro": "Romanian",
    "ru": "Russian",
    "sm": "Samoan",
    "gd": "Scots Gaelic",
    "sr": "Serbian",
    "st": "Sesotho",
    "sn": "Shona",
    "sd": "Sindhi",
    "si": "Sinhala",
    "sk": "Slovak",
    "sl": "Slovenian",
    "so": "Somali",
    "es": "Spanish",
    "su": "Sundanese",
    "sw": "Swahili",
    "sv": "Swedish",
    "tl": "Filipino (Tagalog)",
    "tg": "Tajik",
    "ta": "Tamil",
    "tt": "Tatar",
    "te": "Telugu",
    "th": "Thai",
    "tr": "Turkish",
    "tk": "Turkmen",
    "uk": "Ukrainian",
    "ur": "Urdu",
    "ug": "Uyghur",
    "uz": "Uzbek",
    "vi": "Vietnamese",
    "cy": "Welsh",
    "xh": "Xhosa",
    "yi": "Yiddish",
    "yo": "Yoruba",
    "zu": "Zulu",
}


@dataclass
class TranslationResult:
    translated_text: str
    source_lang: str
    detected_lang: str
    engine: str = "google"  # "argos" (offline pack) or "google" (online)


def _is_available() -> bool:
    """Check if deep-translator is installed."""
    try:
        from deep_translator import GoogleTranslator  # noqa: F401

        return True
    except ImportError:
        return False


def get_argos_translator(source_lang: str, target_lang: str) -> object | None:
    """Offline Argos translator for an INSTALLED language pack, else None.

    Never downloads: packs come from the Store (``translate-*`` models).
    Returns None when argostranslate is missing, the pair is not installed,
    or source is ``auto`` (Argos needs an explicit source language).
    """
    if source_lang == "auto":
        return None
    try:
        import argostranslate.translate
    except ImportError:
        return None
    try:
        installed = argostranslate.translate.get_installed_languages()
        src = next((lang for lang in installed if lang.code == source_lang), None)
        tgt = next((lang for lang in installed if lang.code == target_lang), None)
        if src is None or tgt is None:
            return None
        return src.get_translation(tgt)
    except Exception as exc:
        logger.debug("Argos offline lookup failed for %s->%s: %s", source_lang, target_lang, exc)
        return None


def argos_packs_installed() -> bool:
    """True when argostranslate is importable with ≥1 installed language pack.

    Never raises — a missing import or a broken package index means 'no
    offline packs', not a server error.
    """
    try:
        import argostranslate.translate

        return bool(argostranslate.translate.get_installed_languages())
    except Exception:
        return False


def _validate_lang(code: str) -> str:
    c = code.strip()
    if c == "auto":
        return c
    if c not in SUPPORTED_LANGUAGES:
        raise ValueError(f"Unsupported language code: {code}")
    return c


# Global chunking for huge text — Google limit is 5000, Argos varies.
# We split on sentence boundaries (period/newline) to stay under limit.
_MAX_CHUNK = 4000


def _chunk_text(text: str, limit: int = _MAX_CHUNK) -> list[str]:
    """Split *text* into <=limit chunks on sentence boundaries."""
    if len(text) <= limit:
        return [text]
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + limit, len(text))
        if end < len(text):
            # Try to break on sentence/paragraph boundary
            for sep in ("\n\n", "\n", ". ", "! ", "? ", "; ", ", ", " "):
                idx = text.rfind(sep, start, end)
                if idx != -1 and idx > start + limit // 2:
                    end = idx + len(sep)
                    break
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start = end
    return chunks if chunks else [text]


async def translate_text(
    text: str,
    source_lang: str = "auto",
    target_lang: str = "en",
) -> TranslationResult:
    """Translate text between languages.

    Args:
        text: Text to translate
        source_lang: Source language code ("auto" for detection)
        target_lang: Target language code
    """
    source_lang = _validate_lang(source_lang)
    target_lang = _validate_lang(target_lang)
    if source_lang == target_lang and source_lang != "auto":
        return TranslationResult(translated_text=text, source_lang=source_lang, detected_lang=source_lang)
    if not text.strip():
        return TranslationResult(translated_text="", source_lang=source_lang, detected_lang=source_lang)

    # Offline first: an installed Argos pack wins over the online endpoint,
    # so the offline claim holds whenever the user downloaded the pair.
    argos = get_argos_translator(source_lang, target_lang)
    if argos is not None:
        parts: list[str] = []
        for ch in _chunk_text(text):
            try:
                out = await asyncio.to_thread(argos.translate, ch)
            except Exception as exc:
                logger.warning("Argos offline translate failed: %s", exc)
                argos = None
                break
            if not out:
                argos = None
                break
            parts.append(out.strip())
        if argos is not None and parts:
            sep = "\n\n" if "\n\n" in text else "\n" if "\n" in text else " "
            return TranslationResult(
                translated_text=sep.join(parts),
                source_lang=source_lang,
                detected_lang=source_lang,
                engine="argos",
            )

    if not _is_available():
        raise RuntimeError(
            "No translation backend available: install the offline Argos pack "
            f"for {source_lang}->{target_lang} from the Store, or pip install deep-translator"
        )

    if not text.strip():
        return TranslationResult(translated_text="", source_lang=source_lang, detected_lang=source_lang)

    # Global chunking — no hard limit. Huge text is split into _MAX_CHUNK pieces
    # and translated sequentially, then rejoined. Applies to any supported
    # text place so callers never see a limit (preserves paragraphs).
    chunks = _chunk_text(text)
    if len(chunks) > 1:
        parts: list[str] = []
        detected: str = source_lang
        for ch in chunks:
            r = await translate_text(ch, source_lang, target_lang)
            parts.append(r.translated_text.strip())
            detected = r.detected_lang
            await asyncio.sleep(0.2)  # gentle pacing for huge docs
        # Preserve paragraph breaks if original had them, else join with space.
        sep = "\n\n" if "\n\n" in text else "\n" if "\n" in text else " "
        return TranslationResult(
            translated_text=sep.join(parts),
            source_lang=source_lang,
            detected_lang=detected,
        )

    from deep_translator import GoogleTranslator

    translator = GoogleTranslator(source=source_lang, target=target_lang)

    # Retry with exponential backoff on rate limits
    last_error = None
    for attempt in range(3):
        try:
            result = await asyncio.to_thread(translator.translate, chunks[0])
            detected = (
                source_lang
                if source_lang != "auto"
                else translator._translator._detected_source_language
                if hasattr(translator, "_translator")
                else source_lang
            )
            return TranslationResult(
                translated_text=result,
                source_lang=source_lang,
                detected_lang=detected,
            )
        except Exception as e:
            last_error = e
            if "429" in str(e) or "rate" in str(e).lower():
                wait = 2**attempt
                logger.warning("Translation rate limited, retrying in %ds", wait)
                await asyncio.sleep(wait)
            else:
                break

    raise RuntimeError(f"Translation failed: {last_error}")


async def translate_batch(
    texts: list[str],
    source_lang: str = "auto",
    target_lang: str = "en",
) -> list[TranslationResult]:
    """Translate multiple texts with rate-limit-aware chunking.

    No hard limit — huge batches are chunked globally (100 per page + per-text
    chunking via translate_text) so any supported text place works without limits.
    """
    source_lang = _validate_lang(source_lang)
    target_lang = _validate_lang(target_lang)
    if not _is_available() and get_argos_translator(source_lang, target_lang) is None:
        raise RuntimeError(
            "No translation backend available: install the offline Argos pack "
            f"for {source_lang}->{target_lang} from the Store, or pip install deep-translator"
        )

    results = []
    chunk_size = 5

    for i in range(0, len(texts), chunk_size):
        chunk = texts[i : i + chunk_size]
        chunk_results = await asyncio.gather(*[translate_text(t, source_lang, target_lang) for t in chunk])
        results.extend(chunk_results)

        # Brief pause between chunks to avoid rate limiting
        if i + chunk_size < len(texts):
            await asyncio.sleep(0.5)

    return results
