"""Download reference voice clips from HuggingFace.

Run this script once to populate backend/data/reference_voices/ with
the bundled celebrity voice library.

Usage:
    python -m backend.scripts.download_reference_voices
"""

import json
import logging
import sys
import zipfile
from pathlib import Path

logger = logging.getLogger(__name__)

# HuggingFace repo hosting the voice clips (MIT licensed)
HF_REPO = "ABUS-AI/CosyVoice"
HF_FILE = "celebrities30s.zip"

_DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "reference_voices"

# Metadata mapping: original filename → clean metadata
VOICE_MANIFEST = {
    "English": [
        {
            "file": "Andrew_Bustamante.wav",
            "name": "Andrew Bustamante",
            "category": "education",
            "description": "Former CIA intelligence officer and podcast host",
        },
        {
            "file": "Andrew_Huberman.wav",
            "name": "Andrew Huberman",
            "category": "science",
            "description": "Neuroscientist and podcast host",
        },
        {"file": "Avi_Loeb.wav", "name": "Avi Loeb", "category": "science", "description": "Harvard astrophysicist"},
        {
            "file": "Ben_Shapiro.wav",
            "name": "Ben Shapiro",
            "category": "politics",
            "description": "Conservative political commentator",
        },
        {
            "file": "Brett_Johnson.wav",
            "name": "Brett Johnson",
            "category": "tech",
            "description": "Former internet criminal turned security consultant",
        },
        {
            "file": "Brian_Keating.wav",
            "name": "Brian Keating",
            "category": "science",
            "description": "Cosmologist and podcast host",
        },
        {
            "file": "Coffeezilla.wav",
            "name": "Coffeezilla",
            "category": "tech",
            "description": "Investigative journalist covering scams",
        },
        {
            "file": "Dan_Carlin.wav",
            "name": "Dan Carlin",
            "category": "entertainment",
            "description": "Historian and podcast host",
        },
        {
            "file": "David_Buss.wav",
            "name": "David Buss",
            "category": "science",
            "description": "Evolutionary psychologist",
        },
        {
            "file": "David_Fravor.wav",
            "name": "David Fravor",
            "category": "military",
            "description": "Former Navy pilot, UFO/UAP witness",
        },
        {
            "file": "David_Kipping.wav",
            "name": "David Kipping",
            "category": "science",
            "description": "Astrophysicist and YouTuber",
        },
        {
            "file": "Dennis_Whyte.wav",
            "name": "Dennis Whyte",
            "category": "science",
            "description": "Nuclear engineer and professor",
        },
        {
            "file": "Donald_Hoffman.wav",
            "name": "Donald Hoffman",
            "category": "science",
            "description": "Cognitive scientist and author",
        },
        {
            "file": "Donald_Trump.wav",
            "name": "Donald Trump",
            "category": "politics",
            "description": "45th President of the United States",
        },
        {
            "file": "Douglas_Murray.wav",
            "name": "Douglas Murray",
            "category": "politics",
            "description": "British author and political commentator",
        },
        {
            "file": "Duncan_Trussell.wav",
            "name": "Duncan Trussell",
            "category": "entertainment",
            "description": "Comedian and podcast host",
        },
        {"file": "Elon_Musk.wav", "name": "Elon Musk", "category": "tech", "description": "CEO of Tesla and SpaceX"},
        {
            "file": "Garry_Nolan.wav",
            "name": "Garry Nolan",
            "category": "science",
            "description": "Stanford immunologist and UAP researcher",
        },
        {
            "file": "Jack_Barsky.wav",
            "name": "Jack Barsky",
            "category": "politics",
            "description": "Former KGB spy turned American citizen",
        },
        {
            "file": "James_Sexton.wav",
            "name": "James Sexton",
            "category": "education",
            "description": "Attorney and author",
        },
        {"file": "Jeff_Bezos.wav", "name": "Jeff Bezos", "category": "tech", "description": "Founder of Amazon"},
        {
            "file": "Joe_Rogan.wav",
            "name": "Joe Rogan",
            "category": "entertainment",
            "description": "Podcast host and comedian",
        },
        {
            "file": "John_Mearsheimer.wav",
            "name": "John Mearsheimer",
            "category": "politics",
            "description": "Political scientist and international relations scholar",
        },
        {
            "file": "Jordan_Peterson.wav",
            "name": "Jordan Peterson",
            "category": "education",
            "description": "Clinical psychologist and author",
        },
        {
            "file": "Kanye_West.wav",
            "name": "Kanye West",
            "category": "entertainment",
            "description": "Rapper and fashion designer",
        },
        {"file": "Mark_Zuckerberg.wav", "name": "Mark Zuckerberg", "category": "tech", "description": "CEO of Meta"},
        {
            "file": "Michael_Levin.wav",
            "name": "Michael Levin",
            "category": "science",
            "description": "Biologist and professor at Tufts University",
        },
        {
            "file": "Michael_Saylor.wav",
            "name": "Michael Saylor",
            "category": "tech",
            "description": "Bitcoin advocate and MicroStrategy executive",
        },
        {
            "file": "Michio_Kaku.wav",
            "name": "Michio Kaku",
            "category": "science",
            "description": "Theoretical physicist and futurist",
        },
        {
            "file": "MrBeast.wav",
            "name": "MrBeast",
            "category": "entertainment",
            "description": "YouTuber and philanthropist",
        },
        {"file": "Nick_Lane.wav", "name": "Nick Lane", "category": "science", "description": "Biochemist and author"},
        {
            "file": "Paul_Rosolie.wav",
            "name": "Paul Rosolie",
            "category": "science",
            "description": "Naturalist and conservationist",
        },
        {
            "file": "Ryan_Graves.wav",
            "name": "Ryan Graves",
            "category": "military",
            "description": "Former Navy pilot, UAP disclosure advocate",
        },
        {"file": "Sam_Altman.wav", "name": "Sam Altman", "category": "tech", "description": "CEO of OpenAI"},
        {
            "file": "Sam_Harris.wav",
            "name": "Sam Harris",
            "category": "education",
            "description": "Neuroscientist, philosopher, and author",
        },
        {
            "file": "Stephen_Wolfram.wav",
            "name": "Stephen Wolfram",
            "category": "tech",
            "description": "Mathematician and founder of Wolfram Research",
        },
        {
            "file": "Tucker_Carlson.wav",
            "name": "Tucker Carlson",
            "category": "politics",
            "description": "Political commentator and television host",
        },
        {
            "file": "Vitalik_Buterin.wav",
            "name": "Vitalik Buterin",
            "category": "tech",
            "description": "Ethereum co-founder",
        },
        {
            "file": "Yuval_Harari.wav",
            "name": "Yuval Harari",
            "category": "education",
            "description": "Historian and author of Sapiens",
        },
        {
            "file": "Tyler_Joseph.wav",
            "name": "Tyler Joseph",
            "category": "entertainment",
            "description": "Twenty One Pilots lead vocalist and songwriter",
        },
        {
            "file": "Josh_Dun.wav",
            "name": "Josh Dun",
            "category": "entertainment",
            "description": "Twenty One Pilots drummer",
        },
    ],
    "Chinese": [
        {
            "file": "Dilraba_Dilmurat.wav",
            "name": "Dilraba Dilmurat",
            "category": "entertainment",
            "description": "Chinese actress and singer",
        },
        {
            "file": "Jolin_Tsai.wav",
            "name": "Jolin Tsai",
            "category": "entertainment",
            "description": "Taiwanese pop singer",
        },
        {
            "file": "Kris_Wu.wav",
            "name": "Kris Wu",
            "category": "entertainment",
            "description": "Chinese-Canadian singer and actor",
        },
        {
            "file": "Li_Yifeng.wav",
            "name": "Li Yifeng",
            "category": "entertainment",
            "description": "Chinese actor and singer",
        },
        {
            "file": "Yang_Mi.wav",
            "name": "Yang Mi",
            "category": "entertainment",
            "description": "Chinese actress and singer",
        },
        {
            "file": "Zhao_Liying.wav",
            "name": "Zhao Liying",
            "category": "entertainment",
            "description": "Chinese actress",
        },
    ],
    "Korean": [
        {"file": "BTS_Jin.wav", "name": "BTS Jin", "category": "entertainment", "description": "BTS member and singer"},
        {"file": "BTS_RM.wav", "name": "BTS RM", "category": "entertainment", "description": "BTS leader and rapper"},
        {"file": "IU.wav", "name": "IU", "category": "entertainment", "description": "Korean singer and actress"},
        {
            "file": "Lee_Byung_Hun.wav",
            "name": "Lee Byung-hun",
            "category": "entertainment",
            "description": "Korean actor",
        },
        {
            "file": "Lee_Jung_Jae.wav",
            "name": "Lee Jung-jae",
            "category": "entertainment",
            "description": "Korean actor, Squid Game star",
        },
        {
            "file": "Yoo_Jae_Suk.wav",
            "name": "Yoo Jae-suk",
            "category": "entertainment",
            "description": "Korean comedian and television host",
        },
    ],
    "Japanese": [
        {
            "file": "Ayase_Haruka.wav",
            "name": "Ayase Haruka",
            "category": "entertainment",
            "description": "Japanese singer and songwriter",
        },
    ],
}


def _build_manifest() -> dict:
    """Build the voices.json manifest."""
    voices = []
    for lang, entries in VOICE_MANIFEST.items():
        lang_code = {"English": "en", "Chinese": "zh", "Korean": "ko", "Japanese": "ja"}[lang]
        for entry in entries:
            voices.append(
                {
                    "id": entry["file"].replace(".wav", "").lower().replace("_", "_"),
                    "name": entry["name"],
                    "language": lang_code,
                    "category": entry["category"],
                    "file": f"{lang_code}/{entry['file']}",
                    "duration": 30.0,
                    "description": entry["description"],
                }
            )
    return {"voices": voices}


def download_voices():
    """Download the voice clips zip from HuggingFace and extract."""
    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        logger.error("huggingface_hub not installed. Run: pip install huggingface_hub")
        sys.exit(1)

    logger.info("Downloading reference voices from %s/%s...", HF_REPO, HF_FILE)
    zip_path = hf_hub_download(repo_id=HF_REPO, filename=HF_FILE)
    logger.info("Downloaded to %s", zip_path)

    # Extract relevant files
    with zipfile.ZipFile(zip_path) as zf:
        for name in zf.namelist():
            # Match files like celebrities30s/English/Elon Musk.wav
            for lang_code, lang_name in [("en", "English"), ("zh", "Chinese"), ("ko", "Korean"), ("ja", "Japanese")]:
                prefix = f"celebrities30s/{lang_name}/"
                if name.startswith(prefix) and (name.endswith((".wav", ".jpg"))):
                    filename = Path(name).name.replace(" ", "_")
                    target = _DATA_DIR / lang_code / filename
                    target.parent.mkdir(parents=True, exist_ok=True)
                    if not target.exists():
                        with zf.open(name) as src, open(target, "wb") as dst:
                            dst.write(src.read())
                        logger.info("Extracted: %s → %s", name, target)

    # Write manifest
    manifest = _build_manifest()
    manifest_path = _DATA_DIR / "voices.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info("Manifest written to %s", manifest_path)

    # Standalone script (no package context): clear the HF zip from the
    # cache directly so only the extracted app-folder copies remain.
    try:
        import shutil

        from huggingface_hub import constants as hf_constants

        repo_cache = Path(hf_constants.HF_HUB_CACHE) / ("models--" + HF_REPO.replace("/", "--"))
        if repo_cache.is_dir():
            shutil.rmtree(repo_cache, ignore_errors=True)
    except Exception:
        logger.debug("Reference-voices cache cleanup skipped", exc_info=True)

    count = len(manifest["voices"])
    logger.info("Done! %d reference voices ready.", count)
    return count


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    download_voices()
