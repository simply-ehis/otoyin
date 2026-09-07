"""Marketplace license, entitlement, and plugin models."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text

from .base import Base


class License(Base):
    """An installed, signed marketplace license (see docs/MARKETPLACE_PLAN.md §3)."""

    __tablename__ = "licenses"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    product = Column(String, nullable=False)
    device_id = Column(String, nullable=False, default="*")
    purchaser = Column(String, nullable=True)
    issued_at = Column(String, nullable=True)
    expires_at = Column(String, nullable=True)
    signature = Column(String, nullable=False)
    raw_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class Entitlement(Base):
    """One granted entitlement row, denormalized from a License for fast lookup."""

    __tablename__ = "entitlements"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    license_id = Column(String, ForeignKey("licenses.id", ondelete="CASCADE"), nullable=False)
    entitlement = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(UTC))


class InstalledPlugin(Base):
    """A marketplace plugin bundle installed into the app.

    Security: plugins are installed ``enabled=False``. The ``verified`` flag means
    the bundle's Ed25519 signature checked out (executable kinds require it); all
    bundles are checksum-gated at install regardless of this flag.
    """

    __tablename__ = "installed_plugins"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    plugin_id = Column(String, nullable=False, unique=True)
    name = Column(String, nullable=False)
    version = Column(String, nullable=False, default="0.0.0")
    developer = Column(String, nullable=True)
    kind = Column(String, nullable=True)
    manifest_json = Column(Text, nullable=True)
    signature = Column(String, nullable=True)
    verified = Column(Boolean, nullable=False, default=False)
    enabled = Column(Boolean, nullable=False, default=False)
    trust_external = Column(Boolean, nullable=False, default=False)
    install_path = Column(String, nullable=True)
    installed_at = Column(DateTime, default=lambda: datetime.now(UTC))
