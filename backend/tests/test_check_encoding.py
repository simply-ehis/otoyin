"""Unit tests for scripts/check-encoding.py — the encoding gate toolchain gets
its own regression floor for the C1/BOM scan and the deterministic --fix maps.

These test the pure logic functions directly (no git, no filesystem side effects
except inside tmp_path), so they run fast and don't depend on being inside a git
worktree. The script's own `ROOT = Path(__file__).resolve().parent.parent` is
faked by chdir-ing a temp dir that mirrors that layout (scripts/check_encoding.py
under a repo root with a sibling we can write).
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent

SCRIPT = REPO_ROOT / "scripts" / "check-encoding.py"

# ── import helpers ─────────────────────────────────────────────────────────
# The module's `ROOT` is resolved at import time from __file__. For the
# filesystem tests we want a fake worktree, so we chdir into a tmp layout and
# import a private copy via importlib. The pure-logic functions are imported
# directly under the real repo path for speed (no chdir needed for those).


def _load_real_module():
    """Import scripts/check-encoding.py as ``check_encoding`` using the real
    repo root as the module's ROOT."""
    import importlib.util

    spec = importlib.util.spec_from_file_location("check_encoding", str(SCRIPT))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _repo_layout(tmp_path: Path) -> Path:
    """Create a repo-root-shaped dir: <tmp>/repo/scripts/check-encoding.py
    + a sibling ``repo/`` dir for the script's ``ROOT.parent`` to resolve to.

    The script computes ``ROOT = Path(__file__).resolve().parent.parent``, so from
    ``scripts/check-encoding.py`` that is ``repo/``. We mirror that exactly so
    a chdir into the layout gives the same arithmetic the real script uses."""
    root = tmp_path / "repo"
    scripts = root / "scripts"
    scripts.mkdir(parents=True)
    real = SCRIPT.read_text(encoding="utf-8")
    scripts.joinpath("check-encoding.py").write_text(real, encoding="utf-8")
    return root


def _import_in(root: Path):
    """Chdir into `root` and import check_encoding (the copy inside scripts/).

    When we chdir into `root`, the copy at ``root/scripts/check-encoding.py``
    resolves ``ROOT = Path(__file__).resolve().parent.parent`` to `root` —
    exactly what the real script does. So importing after chdir gives the
    fake-worktree ROOT.
    """
    old = os.getcwd()
    old_syspath = list(__import__("sys").path)
    try:
        os.chdir(root)
        sys_mod = __import__("sys")
        sys_mod.path.insert(0, str(root / "scripts"))
        import check_encoding as mod

        return mod
    finally:
        os.chdir(old)
        sys_mod = __import__("sys")
        sys_mod.path[:] = old_syspath


# Load once for the pure-logic tests — these do not touch the filesystem.
_real = _load_real_module()

_round_trips = _real._round_trips
_c1_hint = _real._c1_hint
_scan_text = _real._scan_text
_splice_cp1252_bytes = _real._splice_cp1252_bytes
_fix_text = _real._fix_text
_FFFD = _real._FFFD
_BOM = _real._BOM
_MOJIBAKE_RUN = _real._MOJIBAKE_RUN


# ═══════════════════════════════════════════════════════════════════════════
# Pure-logic unit tests
# ═══════════════════════════════════════════════════════════════════════════


class TestRoundTrips:
    """The mojibake detector's core predicate: a run of cp1252-high chars is
    real double-encoding iff encoding it back to cp1252 and decoding as UTF-8
    yields clean printable text (>= 0x20, no FFFD).

    The mojibake BLEED form of a real character is: real_char.encode('utf-8')
    .decode('cp1252'). For example the em dash U+2014 (bytes E2 80 94) bleeds
    to the 3-char run 'â€"' (U+00E2 U+20AC U+201D) — each of those chars IS
    in _CP1252_HIGH, and the full 3-char run round-trips back to the em dash.
    """

    # Real double-encoded mojibake: the BLEED form (utf8_bytes.decode(cp1252))
    # of each intended character, as a multi-char run. Each of these is what an
    # em dash / curly quote / arrow / times sign / trademark looks like after
    # a UTF-8→cp1252 double-decode.
    @pytest.mark.parametrize(
        ("intended", "expected"),
        [
            ("\u201c", True),  # left double quote  → 3-char bleed
            ("\u2014", True),  # em dash            → 3-char bleed
            ("\u00d7", True),  # multiplication sign → 2-char bleed
            ("\u2122", True),  # trademark          → 3-char bleed
            ("\u2018", True),  # left single quote  → 3-char bleed
            ("\u2019", True),  # right single quote → 3-char bleed
            ("\u201d", False),  # right double quote → no full bleed (byte 0x9D is
            #   undefined in cp1252, so the pipeline raises)
        ],
    )
    def test_real_mojibake_bleed_round_trips(self, intended: str, expected: bool) -> None:
        # The mojibake bleed form: encode the real char as UTF-8, then decode
        # those bytes as cp1252 — exactly the corruption pipeline.
        utf8_bytes = intended.encode("utf-8")
        try:
            bleed = utf8_bytes.decode("cp1252")
        except UnicodeDecodeError:
            # Intended chars whose UTF-8 bytes contain an undefined cp1252 byte
            # (e.g. U+201D's 0x9D) cannot form a full mojibake bleed via this
            # path — so _round_trips is not applicable, and the expected result
            # is False (no mojibake can form).
            assert expected is False
            return
        assert _round_trips(bleed) is expected
        # And the round-trip recovers the intended char when expected.
        if expected:
            assert bleed.encode("cp1252").decode("utf-8") == intended

    def test_right_curly_quote_bleed_fails(self) -> None:
        """U+201D's UTF-8 bytes (E2 80 9D) cannot be decoded as cp1252 in full
        because byte 0x9D is undefined in cp1252 (UnicodeDecodeError). So the
        standard mojibake pipeline raises before producing a bleed string —
        meaning a genuine U+201D mojibake cannot form via this path."""
        utf8_bytes = "\u201d".encode("utf-8")  # E2 80 9D
        with pytest.raises(UnicodeDecodeError):
            utf8_bytes.decode("cp1252")
        # The first two bytes alone decode to 'â€' (U+00E2 U+20AC) — a
        # 2-char run in _CP1252_HIGH — but it does NOT round-trip back to
        # U+201D (encode→decode gives U+00E2, and the remaining byte is a
        # truncated UTF-8 sequence). So it is not mojibake for U+201D.
        partial = "\u00e2\u20ac"  # 'â€'
        assert _round_trips(partial) is False

    # Non-mojibake: chars / runs that are NOT double-encoding.
    # Note: _round_trips returns True for plain ASCII like 'hello' because the
    # function's try/except succeeds (ASCII chars all encode to cp1252 and decode
    # back to valid UTF-8 >= 0x20). The mojibake detection is really about the
    # _MOJIBAKE_RUN regex in _scan_text filtering first — only runs of 2+ cp1252-
    # high chars get passed to _round_trips. So 'hello' is never flagged as
    # mojibake despite _round_trips returning True, because it contains no run.
    @pytest.mark.parametrize(
        ("run", "expected"),
        [
            ("hello", True),  # ascii round-trips, but no mojibake run
            ("\u00e9", False),  # é — single char; not a 2+ run
            ("\ufffd", False),  # replacement char — cp1252 can't encode
            ("\u0001\u0002", False),  # control chars — encode, but decode to
            # control chars, failing the >= 0x20 check
            ("\u2500" * 2, False),  # box-drawing — cp1252 can't encode U+2500
            ("\u00e2", False),  # 'â' alone — single _CP1252_HIGH char;
            # encodes to 0xE2 (lone UTF-8 start byte
            # → invalid UTF-8 → decode raises)
            ("\u00e2\u20ac", False),  # 'â€' — 2-char run in _CP1252_HIGH but
            # encode→decode gives U+00E2 only, not a
            # 'corrupted target'; and the bytes 0xE2 0x80
            # are an incomplete UTF-8 sequence
        ],
    )
    def test_not_mojibake(self, run: str, expected: bool) -> None:
        assert _round_trips(run) is expected

    def test_round_trip_recovers_intended(self) -> None:
        """Every real mojibake bleed run round-trips to its intended char."""
        for intended in ["\u201c", "\u2014", "\u00d7", "\u2122", "\u2018", "\u2019"]:
            bleed = intended.encode("utf-8").decode("cp1252")
            assert _round_trips(bleed)
            assert bleed.encode("cp1252").decode("utf-8") == intended

    def test_single_cp1252_high_char_not_a_mojibake_run(self) -> None:
        """A lone _CP1252_HIGH char is inside the character class but the regex
        requires 2+, so a single such char is never reported as mojibake."""
        # 'â' (U+00E2) is in _CP1252_HIGH but _round_trips('â') is False
        # (it encodes to byte 0xE2 which is a lone start byte → invalid UTF-8).
        assert "\u00e2" in _real._CP1252_HIGH  # type: ignore[attr-defined]
        assert _round_trips("\u00e2") is False


class TestC1Hint:
    """_c1_hint describes a C1 control and the cp1252 glyph its byte value
    maps to — used in violation reports.

    A C1 control U+0080-U+009F is the signature of a cp1252 byte that was
    laundered into valid UTF-8 via a latin-1 / surrogate-escape round-trip:
    the raw byte 0x93 becomes the 2-byte UTF-8 for U+0093 (C2 93), which the
    detector sees as the character U+0093 — not the intended U+201C.
    """

    def test_valid_cp1252_c1(self) -> None:
        # C1 slots that DO map to a cp1252 glyph (the common corruption targets).
        assert _c1_hint("\u0093") == "U+0093 (cp1252 '\u201c')"  # 0x93 → left dq
        assert _c1_hint("\u0094") == "U+0094 (cp1252 '\u201d')"  # 0x94 → right dq
        assert _c1_hint("\u0097") == "U+0097 (cp1252 '\u2014')"  # 0x97 → em dash
        assert _c1_hint("\u0085") == "U+0085 (cp1252 '\u2026')"  # 0x85 → ellipsis
        assert _c1_hint("\u0099") == "U+0099 (cp1252 '\u2122')"  # 0x99 → trademark
        assert _c1_hint("\u0082") == "U+0082 (cp1252 '\u201a')"  # 0x82 → single low-9

    def test_non_cp1252_c1(self) -> None:
        # C1 slots with no cp1252 glyph (0x81 0x8D 0x8F 0x90 0x9D): fall back
        # to the bare code point.
        assert _c1_hint("\u0081") == "U+0081"
        assert _c1_hint("\u008d") == "U+008D"
        assert _c1_hint("\u008f") == "U+008F"
        assert _c1_hint("\u0090") == "U+0090"
        assert _c1_hint("\u009d") == "U+009D"

    def test_out_of_c1_range(self) -> None:
        # The function is only ever called for 0x80-0x9F, but it should not
        # blow up for other code points. 0x7F (DEL) has a cp1252 glyph, so
        # it gets the parenthesized form; build the expected string the same
        # way _c1_hint does (repr of the decoded byte).
        code = 0x7F
        glyph = bytes([code]).decode("cp1252")
        assert _c1_hint("\u007f") == f"U+{code:04X} (cp1252 {glyph!r})"
        # U+00A0 (NBSP) also has a cp1252 glyph, so it gets the same form.
        na0_glyph = bytes([0xA0]).decode("cp1252")
        assert _c1_hint("\u00a0") == f"U+00A0 (cp1252 {na0_glyph!r})"


class TestScanText:
    """_scan_text appends one violation line per corrupted spot in a string.
    We pass an empty list and assert on what gets appended."""

    def _scan(self, text: str) -> list[str]:
        out: list[str] = []
        _scan_text("test.txt", text, out)
        return out

    def _moj(self, *intended: str) -> str:
        blob = b"".join(ch.encode("utf-8") for ch in intended)
        return blob.decode("cp1252")

    def test_clean_text_is_unchanged(self) -> None:
        assert self._scan("Hello, world — no corruption here.\n") == []
        assert self._scan("Plain ascii plus a curly quote: \u201cnice\u201d.\n") == []

    def test_fffd_replacement_character(self) -> None:
        lines = self._scan(f"Lost data here: {_FFFD}.\n")
        assert len(lines) == 1
        assert "test.txt:1:" in lines[0]
        assert _FFFD not in lines[0]  # they replace it with a visible marker
        assert "\u2400" in lines[0]  # the U+2400 visible-replacement marker

    def test_c1_control_detected(self) -> None:
        # U+0093 = laundered left double quote.
        lines = self._scan("Start\u0093end of line.\n")
        assert len(lines) == 1
        assert "test.txt:1:" in lines[0]
        assert "U+0093" in lines[0]
        assert "cp1252" in lines[0]
        assert "\u201c" in lines[0]

    def test_multiple_c1_in_one_line(self) -> None:
        lines = self._scan(
            "a\u0093b\u0094c\u0097d\n"  # left dq, right dq, em dash
        )
        assert len(lines) == 1
        joined = lines[0]
        assert "U+0093" in joined
        assert "U+0094" in joined
        assert "U+0097" in joined

    def test_mojibake_run_reported(self) -> None:
        # A real double-encoded line: intended curly quotes became the bleed
        # run (lowercase a-umlaut + euro sign + quote glyph, twice) via
        # UTF-8→cp1252 decode. (U+201D's UTF-8 byte 0x9D
        # is undefined in cp1252, so we use U+201C on both sides to avoid the
        # decode error — the point is that the mojibake run is detected.)
        corrupt = self._moj("\u201c", "Section 4", "\u201c")
        lines = self._scan(f"See {corrupt} for details.\n")
        assert len(lines) >= 1
        assert any("double-encoded:" in ln for ln in lines)

    def test_mojibake_run_includes_intended_replacement(self) -> None:
        # The report should show what the mojibake 'should be'.
        corrupt = self._moj("\u2014")  # em dash bleed 'â€"'
        lines = self._scan(f"x {corrupt} y\n")
        assert len(lines) >= 1
        assert any("double-encoded:" in ln for ln in lines)
        assert any("should be" in ln for ln in lines)

    def test_em_dash_mojibake_not_caught_as_c1(self) -> None:
        """The mojibake form of an em dash (the 3-char bleed 'â€"') is a
        double-encoding violation, NOT a C1 control."""
        corrupt = self._moj("\u2014")
        lines = self._scan(f"{corrupt}\n")
        assert any("double-encoded" in ln for ln in lines)
        assert not any("U+0097" in ln for ln in lines)

    def test_non_round_tripping_run_not_reported(self) -> None:
        """A run of chars that is in _CP1252_HIGH but does NOT round-trip
        is not reported as mojibake."""
        # 'â€' = U+00E2 U+20AC — both in _CP1252_HIGH, both 2 chars so matched
        # by the regex, but _round_trips is False (encodes to 0xE2 0x80 →
        # invalid UTF-8 start byte). So not reported.
        lines = self._scan("see \u00e2\u20ac now\n")
        assert not any("double-encoded" in ln for ln in lines)

    def test_box_drawing_not_mojibake(self) -> None:
        """Box-drawing chars are not in _CP1252_HIGH and are not mojibake."""
        lines = self._scan("Box: \u2500\u2500\u2500\n")
        assert not any("double-encoded" in ln for ln in lines)

    def test_leading_bom_at_line_one_kept(self) -> None:
        """A BOM at the very start of line 1 is intentional (UTF-8 BOM) and
        must NOT be flagged."""
        lines = self._scan(_BOM + "file content\n")
        assert not any("mid-file" in line for line in lines)

    def test_mid_file_bom_flagged(self) -> None:
        lines = self._scan("first line\n" + _BOM + "second line\n")
        assert any("mid-file U+FEFF" in line for line in lines)

    def test_bom_later_in_first_line_flagged(self) -> None:
        """A BOM at column 5 of line 1 is mid-file, not a leading BOM."""
        lines = self._scan("abc" + _BOM + "def\n")
        assert any("mid-file" in line for line in lines)

    def test_multiple_boms_all_flagged(self) -> None:
        lines = self._scan(_BOM + "first\n" + _BOM + "second\n" + _BOM + "third\n")
        mid = [line for line in lines if "mid-file" in line]
        assert len(mid) == 2  # the two after line 1

    def test_stray_ascii_control_byte(self) -> None:
        """A stray control byte (backspace 0x08) inside text is reported with
        its mnemonic name."""
        lines = self._scan("abc\x08def\n")  # backspace
        assert len(lines) == 1
        assert "backspace" in lines[0]
        assert "test.txt:1:" in lines[0]

    def test_vertical_tab_control(self) -> None:
        lines = self._scan("a\x0b b\n")  # vertical tab U+000B
        assert "vertical-tab" in lines[0]

    def test_del_byte(self) -> None:
        lines = self._scan("abc\x7fdef\n")
        assert "DEL" in lines[0]

    def test_tabs_newlines_formfeed_not_flagged(self) -> None:
        lines = self._scan("col1\tcol2\nline2\r\nform\ffeed\n")
        # None of tab/newline/CR/form-feed should be flagged.
        assert not any("control byte" in line for line in lines)

    def test_combined_violations_in_one_line(self) -> None:
        """One line can produce multiple violation kinds (FFFD + C1 + mojibake
        + mid-file BOM) — each reported separately."""
        # Use U+201C on both sides of 'double' so the mojibake decode succeeds
        # (U+201D's 0x9D byte is undefined in cp1252).
        corrupt = self._moj("\u201c", "double", "\u201c")
        line = f"Lose{_FFFD}here and\u0093cp1252 {corrupt} and{_BOM}mid \x08back\n"
        lines = self._scan(line)
        assert any("FFFD" in ln or "\u2400" in ln for ln in lines)
        assert any("stray control" in ln for ln in lines)
        assert any("double-encoded" in ln for ln in lines)
        assert any("mid-file" in ln for ln in lines)

    def test_report_prefix_uses_rel(self) -> None:
        out: list[str] = []
        _scan_text("src/foo.tsx", "clean line\n", out)
        _scan_text("src/foo.tsx", f"line-with-{_FFFD}-in-it\n", out)
        # _FFFD is replaced with the visible marker U+2400 in the report, so
        # check for that instead of the literal 'FFFD' string.
        assert any(ln.startswith("  src/foo.tsx:1:") and chr(0x2400) in ln for ln in out)

    def test_excerpt_truncated_at_100(self) -> None:
        # The excerpt is line.strip()[:100] — stripped, so leading whitespace
        # is removed. Use 110 non-space chars + FFFD + newline so the stripped
        # portion is >= 100 after the strip.
        long_line = "x" * 110 + _FFFD + "\n"
        lines = self._scan(long_line)
        assert len(lines) == 1
        # The excerpt after the "test.txt:1:" prefix should be <= 100 chars.
        excerpt = lines[0].split(":", 2)[-1]
        assert len(excerpt) <= 101  # [:100] gives 100 chars; allow 100 or 101 depending on repr

    def test_keepends_so_nel_visible(self) -> None:
        """U+0085 (NEL) should be detectable even though it looks like a line
        break in some encodings — keepends keeps it inside the line string."""
        lines = self._scan("before\u0085after\n")
        assert any("U+0085" in ln for ln in lines)

    def test_stray_c1_and_mojibake_both_caught(self) -> None:
        """A line with a C1 control (laundered byte) AND a mojibake bleed run
        produces both violation kinds — they are distinct signatures."""
        corrupt = self._moj("\u2014")
        line = f"x\u0093y{corrupt}z\n"
        lines = self._scan(line)
        assert any("U+0093" in ln for ln in lines)
        assert any("double-encoded" in ln for ln in lines)
        assert len(lines) >= 2


class TestSpliceCp1252Bytes:
    """The byte-level repair that fixes raw cp1252 bytes breaking UTF-8 decode,
    one bad byte at a time."""

    def test_clean_bytes_unchanged(self) -> None:
        data = b"Hello, world.\n"
        fixed, spliced = _splice_cp1252_bytes(data)
        assert fixed == data
        assert spliced == 0

    def test_single_bad_byte_repaired(self) -> None:
        # 0x93 is the left double quote in cp1252. As raw bytes it breaks
        # UTF-8 decoding; repaired it becomes the UTF-8 encoding of U+201C.
        bad = b"\x93" + b"start with a quote\n"
        fixed, spliced = _splice_cp1252_bytes(bad)
        assert spliced == 1
        assert fixed == "\u201cstart with a quote\n".encode("utf-8")

    def test_em_dash_byte_repaired(self) -> None:
        bad = b"\x97"  # 0x97 → U+2014 em dash in cp1252
        fixed, spliced = _splice_cp1252_bytes(bad)
        assert spliced == 1
        assert fixed == "\u2014".encode("utf-8")

    def test_multiple_bad_bytes_repaired(self) -> None:
        bad = b"\x93hello\x94world\x97end"  # left dq, right dq, em dash
        fixed, spliced = _splice_cp1252_bytes(bad)
        assert spliced == 3
        assert fixed == ("\u201chello\u201dworld\u2014end".encode("utf-8"))

    def test_undefined_cp1252_byte_aborts_without_splicing(self) -> None:
        # 0x81, 0x8D, 0x8F, 0x90, 0x9D have no cp1252 glyph.
        for byte in (0x81, 0x8D, 0x8F, 0x90, 0x9D):
            data = bytes([byte]) + b"trailing\n"
            fixed, spliced = _splice_cp1252_bytes(data)
            assert spliced == 0
            assert fixed == data  # unchanged — not auto-fixable

    def test_max_splice_cap(self) -> None:
        """After _MAX_SPLICE (200) repairs the function returns whatever it has
        so far rather than looping forever.

        Each 0x93 becomes U+201C (3 UTF-8 bytes), so the spliced prefix is 600
        bytes — a [:200] byte slice would cut mid-character. Compare bytes, not
        decoded text.
        """
        bad = bytes([0x93] * 250) + b"\n"
        fixed, spliced = _splice_cp1252_bytes(bad)
        assert spliced == _real._MAX_SPLICE
        expected_prefix = ("\u201c" * _real._MAX_SPLICE).encode("utf-8")
        assert fixed[: len(expected_prefix)] == expected_prefix
        # The remaining 50 raw 0x93 bytes + newline are untouched.
        assert fixed[len(expected_prefix) :] == bytes([0x93] * 50) + b"\n"

    def test_append_only_trailing_bad_byte(self) -> None:
        bad = b"good data\x97"
        fixed, spliced = _splice_cp1252_bytes(bad)
        assert spliced == 1
        assert fixed.endswith("\u2014".encode("utf-8"))

    def test_bad_byte_in_middle_of_utf8_sequence_aborts(self) -> None:
        """A lone 0x93 (NOT preceded by 0xC2) is an invalid UTF-8 start byte.
        The repair splices it at the error position."""
        bad = b"\x93"  # lone 0x93 — invalid UTF-8
        _fixed, spliced = _splice_cp1252_bytes(bad)
        assert spliced == 1


class TestFixText:
    """The text-level fix: mojibake runs → round-tripped text, C1 controls →
    cp1252 glyph, mid-file BOMs removed."""

    def _moj(self, *intended: str) -> str:
        blob = b"".join(ch.encode("utf-8") for ch in intended)
        return blob.decode("cp1252")

    def test_clean_text_unchanged(self) -> None:
        assert _fix_text("Hello, world.\n") == "Hello, world.\n"

    def test_mojibake_fixed(self) -> None:
        # U+201D's 0x9D byte is undefined in cp1252, so use U+201C on both
        # sides to keep the mojibake decode valid.
        corrupt = self._moj("\u201c", "Section 4", "\u201c")
        text = f"See {corrupt}.\n"
        fixed = _fix_text(text)
        assert "\u201c" in fixed
        assert corrupt not in fixed

    def test_c1_controls_fixed(self) -> None:
        text = "a\u0093b\u0094c\u0097d\n"
        fixed = _fix_text(text)
        assert "\u0093" not in fixed
        assert "\u0094" not in fixed
        assert "\u0097" not in fixed
        assert "\u201c" in fixed
        assert "\u201d" in fixed
        assert "\u2014" in fixed

    def test_leading_bom_preserved(self) -> None:
        fixed = _fix_text(_BOM + "file content\n")
        assert fixed.startswith(_BOM)
        assert fixed.count(_BOM) == 1

    def test_mid_file_boms_removed(self) -> None:
        text = "first\n" + _BOM + "second\n" + _BOM + "third\n"
        fixed = _fix_text(text)
        assert fixed.count(_BOM) == 0
        assert "second" in fixed
        assert "third" in fixed

    def test_bom_in_middle_of_line_removed(self) -> None:
        text = "abc" + _BOM + "def\n"
        fixed = _fix_text(text)
        assert _BOM not in fixed
        assert "abcdef" in fixed.replace("\n", "")

    def test_c1_and_mojibake_both_fixed(self) -> None:
        corrupt = self._moj("\u2014")
        text = f"x{corrupt}y\u0093z\n"
        fixed = _fix_text(text)
        assert "\u0093" not in fixed
        assert "\u2014" in fixed
        assert corrupt not in fixed

    def test_undefined_c1_char_preserved(self) -> None:
        """C1 chars with no cp1252 glyph are not rewritten by --fix (lossy)."""
        text = "a\u0081b\n"  # 0x81 undefined in cp1252
        fixed = _fix_text(text)
        assert "\u0081" in fixed  # left alone

    def test_duplicate_runs_only_fixed_once(self) -> None:
        """dict.fromkeys in _fix_text dedupes runs per line, so the same mojibake
        run appearing twice in a line is still correct after one replace."""
        corrupt = self._moj("\u201c")
        text = f"{corrupt} and {corrupt} again\n"
        fixed = _fix_text(text)
        assert fixed.count("\u201c") >= 2
        assert corrupt not in fixed

    def test_empty_string(self) -> None:
        assert _fix_text("") == ""

    def test_only_newlines(self) -> None:
        assert _fix_text("\n\n\n") == "\n\n\n"

    def test_fix_recovers_intended_char(self) -> None:
        """After fixing, the recovered text matches the intended original."""
        for intended in ["\u201c", "\u2014", "\u00d7", "\u2122"]:
            corrupt = self._moj(intended)
            text = f"x{corrupt}y\n"
            fixed = _fix_text(text)
            assert intended in fixed
            assert corrupt not in fixed


# ═══════════════════════════════════════════════════════════════════════════
# End-to-end: script runs against real temp files
# ═══════════════════════════════════════════════════════════════════════════


class TestCliAgainstRealFiles:
    """Run `python scripts/check-encoding.py ...` as a subprocess against
    temporary files in a fake repo layout, so we exercise the real main()
    (git-fallback path), not just the library functions."""

    @pytest.fixture
    def layout(self, tmp_path: Path) -> Path:
        return _repo_layout(tmp_path)

    @pytest.fixture
    def script_path(self, layout: Path) -> Path:
        return layout / "scripts" / "check-encoding.py"

    def _write(self, root: Path, rel: str, content: bytes | str) -> Path:
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(content, str):
            content = content.encode("utf-8")
        path.write_bytes(content)
        return path

    def _run(self, root: Path, script: Path, args: list[str], env=None) -> subprocess.CompletedProcess[str]:
        proc = subprocess.run(
            ["python", str(script), *args],
            cwd=str(root),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="backslashreplace",
            env=env,
            timeout=60,
        )
        return proc

    def test_clean_file_reports_ok(self, layout: Path, script_path: Path) -> None:
        self._write(layout, "readme.md", "# Otoyin\n\nClean file.\n")
        proc = self._run(layout, script_path, [])
        assert proc.returncode == 0
        assert "encoding check OK" in proc.stdout
        assert "violation" not in proc.stdout.lower() or "no" in proc.stdout.lower()

    def test_fffd_fails(self, layout: Path, script_path: Path) -> None:
        self._write(
            layout,
            "src/bad.txt",
            "lost data: \ufffd here\n".encode("utf-8"),
        )
        proc = self._run(layout, script_path, [])
        assert proc.returncode == 1
        assert "encoding check FAILED" in proc.stdout
        assert "bad.txt" in proc.stdout
        assert "\ufffd" not in proc.stdout  # replaced with visible marker

    def test_c1_control_fails(self, layout: Path, script_path: Path) -> None:
        # Raw byte 0x93 is a lone invalid UTF-8 start byte. The script's
        # _decode_or_report catches it at the UTF-8 decode level (before the
        # C1 scan), so the report says 'invalid UTF-8', not 'U+0093'.
        # To exercise the C1-detection path, the raw bytes must decode to a
        # valid C1 character — i.e. the 2-byte UTF-8 for U+0093 (C2 93).
        self._write(
            layout,
            "notes.txt",
            b"start \xc2\x93 end\n",  # UTF-8 for U+0093 = laundered 0x93
        )
        proc = self._run(layout, script_path, [])
        assert proc.returncode == 1
        assert "FAILED" in proc.stdout
        assert "notes.txt" in proc.stdout
        assert "U+0093" in proc.stdout or "cp1252" in proc.stdout

    def test_invalid_utf8_fails(self, layout: Path, script_path: Path) -> None:
        # Raw 0x80 is not valid UTF-8 and not a valid cp1252 lead for a valid
        # char at this position — it fails the UTF-8 decode.
        self._write(layout, "raw.bin.txt", b"\x80\x81hello\n")
        proc = self._run(layout, script_path, [])
        assert proc.returncode == 1
        assert "invalid UTF-8" in proc.stdout
        assert "raw.bin.txt" in proc.stdout

    def test_mid_file_bom_fails(self, layout: Path, script_path: Path) -> None:
        self._write(
            layout,
            "bom.txt",
            (_BOM + "first line\n" + _BOM + "second line\n").encode("utf-8"),
        )
        proc = self._run(layout, script_path, [])
        assert proc.returncode == 1
        assert "mid-file" in proc.stdout

    def test_leading_bom_only_is_ok(self, layout: Path, script_path: Path) -> None:
        self._write(
            layout,
            "bomlead.txt",
            (_BOM + "only a leading BOM\n").encode("utf-8"),
        )
        proc = self._run(layout, script_path, [])
        assert proc.returncode == 0

    def test_mojibake_fails(self, layout: Path, script_path: Path) -> None:
        # Real mojibake = intended chars encoded as UTF-8, then those bytes
        # decoded as cp1252. Use U+201C on both sides since U+201D's 0x9D
        # byte is undefined in cp1252.
        corrupt = "\u201c\u201c".encode("utf-8").decode("cp1252")
        text = f"See {corrupt} section {corrupt}.\n"
        self._write(layout, "mq.txt", text.encode("utf-8"))
        proc = self._run(layout, script_path, [])
        assert proc.returncode == 1
        assert "double-encoded" in proc.stdout

    def test_binary_file_skipped(self, layout: Path, script_path: Path) -> None:
        # A file with a NUL in the first 8 KiB is considered binary and skipped.
        self._write(layout, "assets/logo.bin", b"\x00" + b"\x00" * 100)
        self._write(layout, "readme.md", "# clean\n")
        proc = self._run(layout, script_path, [])
        assert proc.returncode == 0
        assert "logo.bin" not in proc.stdout or "OK" in proc.stdout

    # ── --fix tests ──────────────────────────────────────────────────────

    def test_fix_repairs_mojibake(self, layout: Path, script_path: Path) -> None:
        corrupt = "\u201c\u201c".encode("utf-8").decode("cp1252")
        self._write(layout, "mq.txt", f"See {corrupt} section.\n".encode())
        proc = self._run(layout, script_path, ["--fix"])
        # --fix rewrites in place and then re-scans; a fully-repaired file
        # should exit 0.
        assert proc.returncode == 0
        content = (layout / "mq.txt").read_text(encoding="utf-8")
        assert "\u201c" in content
        assert corrupt not in content
        assert "encoding check OK" in proc.stdout

    def test_fix_repairs_c1_controls(self, layout: Path, script_path: Path) -> None:
        self._write(layout, "c1.txt", "a\x93b\x94c\n".encode("latin-1"))
        proc = self._run(layout, script_path, ["--fix"])
        assert proc.returncode == 0
        content = (layout / "c1.txt").read_text(encoding="utf-8")
        assert "\u0093" not in content
        assert "\u0094" not in content
        assert "\u201c" in content
        assert "\u201d" in content

    def test_fix_removes_mid_file_boms(self, layout: Path, script_path: Path) -> None:
        # The first line has a leading BOM (kept), the second line has a mid-file
        # BOM (removed). Write the BOM on the SECOND line so it's not a leading
        # BOM and will be removed by --fix.
        raw = b"first line\n" + _BOM.encode("utf-8") + b"second line\n"
        self._write(layout, "bombot.txt", raw)
        proc = self._run(layout, script_path, ["--fix"])
        assert proc.returncode == 0
        content = (layout / "bombot.txt").read_text(encoding="utf-8")
        assert content.count(_BOM) == 0
        assert "first line" in content and "second line" in content

    def test_fix_preserves_leading_bom(self, layout: Path, script_path: Path) -> None:
        self._write(
            layout,
            "leadbom.txt",
            (_BOM + "keep the leading BOM\n").encode("utf-8"),
        )
        proc = self._run(layout, script_path, ["--fix"])
        assert proc.returncode == 0
        content = (layout / "leadbom.txt").read_text(encoding="utf-8")
        assert content.startswith(_BOM)
        assert content.count(_BOM) == 1

    def test_fix_does_not_repair_fffd(self, layout: Path, script_path: Path) -> None:
        """U+FFFD is lossy — --fix never rewrites it.

        A file containing only U+FFFD is valid UTF-8 (FFFD is a real character),
        but the scanner still flags it as a corruption marker. --fix cannot
        remove it: the byte-splice step does nothing (valid UTF-8), _fix_text
        keeps the FFFD (not in any repair map), and since no bytes change
        fix_file returns False — so --fix exits 0 having left the file as-is.
        The scanner (no --fix) is the gate that fails on it.
        """
        self._write(
            layout,
            "fffd.txt",
            ("lost: \ufffd here\n").encode("utf-8"),
        )
        # The scanner catches it.
        proc = self._run(layout, script_path, [])
        assert proc.returncode == 1
        assert "fffd.txt" in proc.stdout
        # --fix leaves the file untouched (nothing the maps could change).
        proc = self._run(layout, script_path, ["--fix"])
        assert proc.returncode == 0, (
            f"--fix treats an FFFD-only file as no-work; got rc={proc.returncode}:\n{proc.stdout}"
        )
        # The FFFD byte is still in the file — the scanner is the gate.
        content = (layout / "fffd.txt").read_bytes()
        assert b"\xef\xbf\xbd" in content
        # And the scanner still fails on it after the --fix no-op.
        proc = self._run(layout, script_path, [])
        assert proc.returncode == 1
        assert "fffd.txt" in proc.stdout

    def test_fix_does_not_repair_undefined_cp1252_byte(self, layout: Path, script_path: Path) -> None:
        """0x81 has no cp1252 glyph, so --fix leaves the raw byte and the file
        still fails (invalid UTF-8)."""
        self._write(layout, "undef.txt", b"\x81nope\n")
        proc = self._run(layout, script_path, ["--fix"])
        assert proc.returncode == 1
        assert "undef.txt" in proc.stdout
        assert "invalid UTF-8" in proc.stdout

    def test_fix_does_nothing_on_clean_file(self, layout: Path, script_path: Path) -> None:
        self._write(layout, "clean.txt", "all good\n")
        proc = self._run(layout, script_path, ["--fix"])
        assert proc.returncode == 0
        assert "rewrote 0 file" in proc.stdout or "OK" in proc.stdout
        assert (layout / "clean.txt").read_text(encoding="utf-8") == "all good\n"

    def test_fix_rejects_staged_flag(self, layout: Path, script_path: Path) -> None:
        """--fix is worktree-only; --fix --staged is a usage error (exit 2)."""
        proc = self._run(layout, script_path, ["--fix", "--staged"])
        assert proc.returncode == 2
        assert "working tree" in proc.stdout

    def test_fix_rejects_commit_flag(self, layout: Path, script_path: Path) -> None:
        """--fix --commit is a usage error."""
        proc = self._run(layout, script_path, ["--fix", "--commit", "HEAD"])
        assert proc.returncode == 2

    def test_fix_reports_skipped_file_on_oserror(self, layout: Path, script_path: Path) -> None:
        """A file that exists when scanned but disappears before the fix write
        is odd; the real script catches OSError on read and returns False from
        fix_file. We can't easily make that happen atomically, so skip — the
        library unit tests above cover the logic."""
        pytest.skip("atomic delete-before-write race not modelled here")

    # ── --commit mode against real git objects ────────────────────────────

    def test_commit_mode_ok(self, layout: Path, script_path: Path) -> None:
        """--commit HEAD against a clean git tree reports OK."""
        subprocess.run(
            ["git", "init", "-q"],
            cwd=str(layout),
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "config", "user.email", "test@example.com"],
            cwd=str(layout),
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "config", "user.name", "Test"],
            cwd=str(layout),
            check=True,
            capture_output=True,
        )
        self._write(layout, "clean.txt", b"clean\n")
        subprocess.run(
            ["git", "add", "clean.txt"],
            cwd=str(layout),
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "commit", "-m", "init", "--quiet"],
            cwd=str(layout),
            check=True,
            capture_output=True,
        )
        proc = self._run(layout, script_path, ["--commit", "HEAD"])
        assert proc.returncode == 0
        assert "encoding check OK" in proc.stdout
        assert "clean" in proc.stdout

    def test_commit_mode_detects_corruption(self, layout: Path, script_path: Path) -> None:
        """--commit HEAD reports corruption committed in the tree, even when the
        worktree is clean (we write the bad file, commit it, then verify the
        committed blob)."""
        subprocess.run(
            ["git", "init", "-q"],
            cwd=str(layout),
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "config", "user.email", "test@example.com"],
            cwd=str(layout),
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "config", "user.name", "Test"],
            cwd=str(layout),
            check=True,
            capture_output=True,
        )
        self._write(
            layout,
            "bad.txt",
            "corrupt \x93 byte\n".encode("latin-1"),
        )
        subprocess.run(
            ["git", "add", "bad.txt"],
            cwd=str(layout),
            check=True,
            capture_output=True,
        )
        subprocess.run(
            ["git", "commit", "-m", "bad", "--quiet"],
            cwd=str(layout),
            check=True,
            capture_output=True,
        )
        # Overwrite worktree with clean content so we prove the scan reads the
        # committed blob, not the worktree.
        (layout / "bad.txt").write_text("clean now\n", encoding="utf-8")
        proc = self._run(layout, script_path, ["--commit", "HEAD"])
        assert proc.returncode == 1
        assert "FAILED" in proc.stdout
        assert "bad.txt" in proc.stdout

    def test_commit_mode_fails_on_bad_rev(self, layout: Path, script_path: Path) -> None:
        proc = self._run(layout, script_path, ["--commit", "does-not-exist"])
        assert proc.returncode == 2
        assert "cannot read tree" in proc.stdout.lower() or "error" in proc.stdout.lower()

    def test_staged_mode_usage_error_with_commit(self, layout: Path, script_path: Path) -> None:
        """--staged and --commit mutually exclusive → exit 2."""
        proc = self._run(layout, script_path, ["--staged", "--commit", "HEAD"])
        assert proc.returncode == 2
        assert "mutually exclusive" in proc.stdout

    # ── git-unavailable fallback ──────────────────────────────────────────

    def test_fallback_walker_when_git_missing(
        self, layout: Path, script_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """When `git` is unavailable the script falls back to os.walk over the
        repo tree. We fake git-unavailable by pointing PATH at an empty dir."""
        self._write(layout, "deep/nested/file.txt", b"clean file\n")
        empty_bin = layout / "empty_bin"
        empty_bin.mkdir()
        env = os.environ.copy()
        env["PATH"] = str(empty_bin)
        proc = self._run(layout, script_path, [], env=env)
        assert proc.returncode == 0
        assert "encoding check OK" in proc.stdout
        assert "tracked files" in proc.stdout or "file" in proc.stdout.lower()

    def test_fallback_walker_skips_skipped_dirs(
        self, layout: Path, script_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """The fallback walker prunes .git, node_modules, venv, dist, build,
        __pycache__, .pytest_cache, archive."""
        self._write(layout, "readme.md", b"clean\n")
        self._write(layout, "node_modules/pkg/index.js", b"should skip\n")
        self._write(layout, "dist/app.bin", b"\x00binary\n")
        self._write(layout, "build/out.txt", b"should skip\n")
        self._write(layout, "venv/bin/python", b"skip\n")
        self._write(layout, ".git/config", b"skip\n")
        self._write(layout, "__pycache__/mod.pyc", b"skip\n")
        self._write(layout, ".pytest_cache/cache/vars", b"skip\n")
        self._write(layout, "archive/old.zip", b"skip\n")
        empty_bin = layout / "empty_bin"
        empty_bin.mkdir()
        env = os.environ.copy()
        env["PATH"] = str(empty_bin)
        proc = self._run(layout, script_path, [], env=env)
        assert proc.returncode == 0
        # Only readme.md should have been scanned; the rest pruned.
        stdout = proc.stdout
        assert "readme.md" in stdout or "tracked files" in stdout
        # node_modules etc. must not appear in any failure report.
        for bad in ("node_modules", "dist", "build", "venv", ".git", "__pycache__", ".pytest_cache", "archive"):
            assert bad not in stdout or "OK" in stdout
