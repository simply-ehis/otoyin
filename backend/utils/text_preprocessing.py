"""Text preprocessing utilities for TTS input normalization and sentence splitting.

Provides text normalization (whitespace, control chars, Unicode) and
spaCy-based sentence splitting for English with regex fallback for other languages.
"""

import logging
import re
import unicodedata

logger = logging.getLogger(__name__)

# Lazy-loaded spaCy model (English sentencizer only)
_spacy_nlp = None
_spacy_loaded = False


def _get_spacy_nlp():
    """Lazy-load spaCy English model with sentencizer."""
    global _spacy_nlp, _spacy_loaded
    if _spacy_loaded:
        return _spacy_nlp
    _spacy_loaded = True
    try:
        import spacy

        _spacy_nlp = spacy.load("en_core_web_sm", disable=["ner", "parser"])
        _spacy_nlp.add_pipe("sentencizer")
        logger.info("spaCy English sentencizer loaded for TTS text splitting")
    except (ImportError, OSError) as e:
        logger.debug("spaCy not available for sentence splitting: %s", e)
        _spacy_nlp = None
    return _spacy_nlp


def normalize_text(text: str) -> str:
    """Normalize text for TTS input.

    - Collapse multiple whitespace to single space
    - Remove control characters (keep newlines as paragraph breaks)
    - Normalize Unicode to NFC form
    - Fix common artifacts (double spaces, smart quotes)
    """
    if not text:
        return text

    # Normalize Unicode
    text = unicodedata.normalize("NFC", text)

    # Replace smart quotes with straight quotes
    text = text.replace("\u2018", "'").replace("\u2019", "'")
    text = text.replace("\u201c", '"').replace("\u201d", '"')
    text = text.replace("\u2013", "-").replace("\u2014", " - ")

    # Remove control characters except newlines and tabs
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]", "", text)

    # Collapse multiple spaces (but preserve newlines)
    text = re.sub(r"[^\S\n]+", " ", text)

    # Collapse multiple newlines to double newline (paragraph break)
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Strip leading/trailing whitespace per line
    lines = text.split("\n")
    lines = [line.strip() for line in lines]
    text = "\n".join(lines)

    return text.strip()


def split_sentences_regex(text: str) -> list[str]:
    """Split text into sentences using regex (fallback for non-English).

    Handles ASCII sentence endings and CJK punctuation.
    """
    # Split on sentence-ending punctuation followed by whitespace
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    # Also split on CJK sentence endings
    result = []
    for part in parts:
        subparts = re.split(r"(?<=[\u3002\uff01\uff1f])", part)
        result.extend(subparts)
    return [p.strip() for p in result if p.strip()]


def split_sentences_spacy(text: str) -> list[str]:
    """Split text into sentences using spaCy (English)."""
    nlp = _get_spacy_nlp()
    if nlp is None:
        return split_sentences_regex(text)

    doc = nlp(text)
    sentences = [sent.text.strip() for sent in doc.sents if sent.text.strip()]
    return sentences if sentences else [text]


def split_sentences(text: str, language: str = "en") -> list[str]:
    """Split text into sentences, using spaCy for English, regex for others."""
    if language == "en":
        return split_sentences_spacy(text)
    return split_sentences_regex(text)
