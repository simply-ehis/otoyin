"""Translation endpoints for multi-language text translation."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class TranslateRequest(BaseModel):
    text: str
    source_lang: str = "auto"
    target_lang: str = "en"


class TranslateBatchRequest(BaseModel):
    texts: list[str]
    source_lang: str = "auto"
    target_lang: str = "en"


@router.post("/translate")
async def translate_text(data: TranslateRequest):
    """Translate text between languages."""
    from ..services.translation import translate_text as do_translate

    if not data.text.strip():
        return {"translated_text": "", "source_lang": data.source_lang, "detected_lang": data.source_lang}

    try:
        result = await do_translate(data.text, data.source_lang, data.target_lang)
    except (RuntimeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return {
        "translated_text": result.translated_text,
        "source_lang": result.source_lang,
        "detected_lang": result.detected_lang,
        "engine": result.engine,
    }


@router.post("/translate/batch")
async def translate_batch(data: TranslateBatchRequest):
    """Translate multiple texts between languages."""
    from ..services.translation import translate_batch as do_translate_batch

    if not data.texts:
        return {"results": []}

    try:
        results = await do_translate_batch(data.texts, data.source_lang, data.target_lang)
    except (RuntimeError, ValueError) as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return {
        "results": [
            {
                "translated_text": r.translated_text,
                "source_lang": r.source_lang,
                "detected_lang": r.detected_lang,
                "engine": r.engine,
            }
            for r in results
        ]
    }


@router.get("/translate/languages")
async def list_languages():
    """List all supported translation languages."""
    from ..services.translation import SUPPORTED_LANGUAGES, argos_packs_installed

    return {"languages": SUPPORTED_LANGUAGES, "argos_packs_available": argos_packs_installed()}
