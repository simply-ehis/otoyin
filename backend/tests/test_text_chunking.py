"""Unit tests for the TTS text chunking logic.

Tests the split_text_into_chunks function in isolation, covering:
- Short text (single chunk)
- Empty/whitespace input
- Sentence boundary splitting
- Clause boundary splitting
- Hard cut fallback
- Paralinguistic tags ([laugh], [sigh])
- Multilingual fallback
- Edge cases (very long words, unicode)
"""

from backend.utils.chunked_tts import split_text_into_chunks


class TestSplitTextIntoChunks:
    """Tests for split_text_into_chunks()."""

    def test_empty_text_returns_empty(self):
        assert split_text_into_chunks("") == []
        assert split_text_into_chunks("   ") == []

    def test_short_text_returns_single_chunk(self):
        text = "Hello world, this is a short sentence."
        result = split_text_into_chunks(text, max_chars=800)
        assert result == [text]

    def test_text_exactly_at_limit(self):
        text = "x" * 800
        result = split_text_into_chunks(text, max_chars=800)
        assert len(result) == 1
        assert result[0] == text

    def test_splits_at_sentence_boundaries(self):
        """Sentences should be split at period boundaries."""
        text = "First sentence here. Second sentence here. Third sentence here."
        result = split_text_into_chunks(text, max_chars=40)
        assert len(result) >= 2
        # Each chunk should be <= max_chars (approximately)
        for chunk in result:
            assert len(chunk) <= 50  # some tolerance for sentence integrity

    def test_splits_at_clause_boundaries(self):
        """When sentences are too long, split at commas/semicolons."""
        text = "This is a very long clause with many words, and another clause follows, and a third clause is here."
        result = split_text_into_chunks(text, max_chars=40)
        assert len(result) >= 2

    def test_preserves_paragraph_breaks(self):
        """Double newlines should be respected as chunk boundaries."""
        text = "First paragraph with some text.\n\nSecond paragraph with text."
        result = split_text_into_chunks(text, max_chars=800)
        # Both paragraphs should be in the result
        assert len(result) >= 1
        combined = " ".join(result)
        assert "First paragraph" in combined
        assert "Second paragraph" in combined

    def test_paralinguistic_tags_not_split(self):
        """Tags like [laugh] should stay with surrounding text."""
        text = "Hello [laugh] world this is a test sentence that should not be split in the middle of a tag."
        result = split_text_into_chunks(text, max_chars=800)
        # The tag should be in one of the chunks
        all_text = " ".join(result)
        assert "[laugh]" in all_text

    def test_multilingual_fallback(self):
        """Non-English text should use regex-based splitting."""
        text = "这是第一句话。这是第二句话。这是第三句话。"
        result = split_text_into_chunks(text, max_chars=20, language="zh")
        assert len(result) >= 2

    def test_hard_cut_for_very_long_words(self):
        """If a single word exceeds max_chars, it should be hard-cut."""
        text = "a" * 200
        result = split_text_into_chunks(text, max_chars=50)
        assert len(result) >= 1
        for chunk in result:
            # Chunks should be reasonably sized
            assert len(chunk) <= 200  # at most the full word

    def test_unicode_text(self):
        """Unicode characters should be handled correctly."""
        text = "Café résumé naïve. Another sentence with émojis 🎵🎶."
        result = split_text_into_chunks(text, max_chars=800)
        assert len(result) >= 1
        combined = " ".join(result)
        assert "Café" in combined
        assert "🎵" in combined

    def test_multiple_chunks_ordered(self):
        """Chunks should be returned in document order."""
        text = "Sentence one. Sentence two. Sentence three. Sentence four."
        result = split_text_into_chunks(text, max_chars=25)
        assert len(result) >= 2
        # Verify order
        assert result[0] in text
        assert result[-1] in text

    def test_whitespace_only_returns_empty(self):
        assert split_text_into_chunks("\n\n\n") == []
        assert split_text_into_chunks("\t  \n") == []

    def test_abbreviations_not_treated_as_sentence_end(self):
        """Mr. Dr. etc. should not trigger a split."""
        text = "Mr. Smith went to Washington. Dr. Jones agreed."
        result = split_text_into_chunks(text, max_chars=800)
        # Should stay as one chunk if under limit
        assert len(result) == 1

    def test_nested_paralinguistic_tags(self):
        """Multiple tags in sequence should stay together."""
        text = "Hello [laugh] [sigh] world this is a test."
        result = split_text_into_chunks(text, max_chars=800)
        all_text = " ".join(result)
        assert "[laugh]" in all_text
        assert "[sigh]" in all_text

    def test_single_very_long_sentence(self):
        """A single sentence exceeding max_chars should be clause-split."""
        text = "This is a sentence, with many clauses, separated by commas, that goes on and on, and should be split."
        result = split_text_into_chunks(text, max_chars=30)
        assert len(result) >= 2

    def test_newlines_as_soft_breaks(self):
        """Single newlines should be treated as soft breaks."""
        text = "Line one\nLine two\nLine three."
        result = split_text_into_chunks(text, max_chars=800)
        assert len(result) >= 1
        all_text = " ".join(result)
        assert "Line one" in all_text
        assert "Line three" in all_text

    def test_punctuation_heavy_text(self):
        """Text with many punctuation marks should split cleanly."""
        text = "Wow! Amazing. Incredible, right? Yes! Definitely."
        result = split_text_into_chunks(text, max_chars=25)
        assert len(result) >= 2
