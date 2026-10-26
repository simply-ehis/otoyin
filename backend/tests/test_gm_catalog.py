"""Tests for the structured GM program catalog (pure data, no SoundFont needed)."""

from backend.services.gm_instrument import gm_program_catalog


def test_catalog_covers_all_128_programs():
    programs = gm_program_catalog()
    assert len(programs) == 128
    assert [entry["program"] for entry in programs] == list(range(128))


def test_catalog_groups_families_by_eight():
    programs = gm_program_catalog()
    assert programs[0] == {"program": 0, "name": "Acoustic Grand Piano", "family": "Piano"}
    assert programs[32]["family"] == "Bass"
    assert programs[127] == {"program": 127, "name": "Gunshot", "family": "Sound Effects"}
