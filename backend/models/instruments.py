"""
Instrument pack models — pack registration, upload, and inventory.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class InstrumentPackInstrument(BaseModel):
    """A single instrument entry within a pack."""

    id: str
    name: str
    family: str = ""
    variant: str | None = None
    program: int = 0
    bank_msb: int = Field(default=0, alias="bankMSB")
    bank_lsb: int = Field(default=0, alias="bankLSB")
    percussion: bool = False
    format: str = "soundfont"


class InstrumentPackCreate(BaseModel):
    """Request to register a new instrument pack after upload."""

    name: str = Field(..., min_length=1, max_length=200)
    version: str = Field(default="1.0.0", max_length=50)
    format: str = Field(default="soundfont", max_length=50)
    source: str | None = Field(None, max_length=500)


class InstrumentPackResponse(BaseModel):
    """Response model for an installed instrument pack."""

    id: str
    name: str
    version: str
    format: str
    bytes: int
    source: str | None = None
    instruments: list[InstrumentPackInstrument]
    installed_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InstrumentUploadResponse(BaseModel):
    """Response after uploading and installing an instrument pack."""

    pack: InstrumentPackResponse
    instrument_count: int
