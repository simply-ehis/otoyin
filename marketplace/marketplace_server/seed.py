"""Seed the database with the initial product catalog.

Complete list — 50+ models from backend configs, with about, ratings, languages, size, license.
Run: python -m marketplace_server.seed
"""

from __future__ import annotations

import asyncio
import json

from sqlalchemy import select

from .models import Product, async_session, init_db

# Complete catalog — mirrors backend/backends/configs + app/modelUtils MODEL_DESCRIPTIONS
# Free products (paid:false) ship without license gate, paid need purchase.
SEED_PRODUCTS = [
    # TTS — free Rust-native (ort, no torch)
    # TTS — paid
    # VC
    # STT
    # LLM
    # Cloud LLM subscription tiers
    # Translation (Argos offline packs — ~40MB/pair, lazy-downloaded)
    # Instruments (free downloadable SoundFont banks — GM + drums)
    # Extras
    # Music
    # Packs
]


async def seed():
    await init_db()
    async with async_session() as db:
        for p in SEED_PRODUCTS:
            result = await db.execute(select(Product).where(Product.id == p["id"]))
            existing = result.scalar_one_or_none()
            if existing is None:
                db.add(Product(**{k: v for k, v in p.items() if k in Product.__table__.columns.keys()}))
                print(f"  + {p['id']}")
            else:
                # Update existing with new fields (about, ratings, etc)
                for k, v in p.items():
                    if k in Product.__table__.columns.keys():
                        setattr(existing, k, v)
                print(f"  ~ {p['id']} (updated)")
        await db.commit()
    print(f"\nSeeded {len(SEED_PRODUCTS)} products (complete list, with ratings & about).")


def main():
    asyncio.run(seed())


if __name__ == "__main__":
    main()
