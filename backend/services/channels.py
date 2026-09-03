"""
Audio channel management module.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from ..database import (
    AudioChannel as DBAudioChannel,
    ChannelDeviceMapping as DBChannelDeviceMapping,
    ProfileChannelMapping as DBProfileChannelMapping,
    VoiceProfile as DBVoiceProfile,
)
from ..models import (
    AudioChannelCreate,
    AudioChannelResponse,
    AudioChannelUpdate,
    ChannelVoiceAssignment,
    ProfileChannelAssignment,
)


async def list_channels(db: Session) -> list[AudioChannelResponse]:
    """List all audio channels."""
    channels = db.query(DBAudioChannel).all()

    # Batch-load all device mappings to avoid N+1 queries
    channel_ids = [c.id for c in channels]
    all_mappings = db.query(DBChannelDeviceMapping).filter(DBChannelDeviceMapping.channel_id.in_(channel_ids)).all()
    mappings_by_channel: dict[str, list[str]] = {}
    for m in all_mappings:
        mappings_by_channel.setdefault(m.channel_id, []).append(m.device_id)

    result = []
    for channel in channels:
        device_ids = mappings_by_channel.get(channel.id, [])
        result.append(
            AudioChannelResponse(
                id=channel.id,
                name=channel.name,
                is_default=channel.is_default,
                device_ids=device_ids,
                created_at=channel.created_at,
            )
        )

    return result


async def get_channel(channel_id: str, db: Session) -> AudioChannelResponse | None:
    """Get a channel by ID."""
    channel = db.query(DBAudioChannel).filter_by(id=channel_id).first()
    if not channel:
        return None

    # Get device IDs
    device_mappings = db.query(DBChannelDeviceMapping).filter_by(channel_id=channel.id).all()
    device_ids = [m.device_id for m in device_mappings]

    return AudioChannelResponse(
        id=channel.id,
        name=channel.name,
        is_default=channel.is_default,
        device_ids=device_ids,
        created_at=channel.created_at,
    )


async def create_channel(
    data: AudioChannelCreate,
    db: Session,
) -> AudioChannelResponse:
    """Create a new audio channel."""
    # Check if name already exists
    existing = db.query(DBAudioChannel).filter_by(name=data.name).first()
    if existing:
        raise ValueError(f"Channel with name '{data.name}' already exists")

    # Create channel
    channel = DBAudioChannel(
        id=str(uuid.uuid4()),
        name=data.name,
        is_default=False,
        created_at=datetime.now(UTC),
    )
    db.add(channel)
    db.flush()

    # Add device mappings
    for device_id in data.device_ids:
        mapping = DBChannelDeviceMapping(
            id=str(uuid.uuid4()),
            channel_id=channel.id,
            device_id=device_id,
        )
        db.add(mapping)

    db.commit()
    db.refresh(channel)

    return AudioChannelResponse(
        id=channel.id,
        name=channel.name,
        is_default=channel.is_default,
        device_ids=data.device_ids,
        created_at=channel.created_at,
    )


async def update_channel(
    channel_id: str,
    data: AudioChannelUpdate,
    db: Session,
) -> AudioChannelResponse | None:
    """Update an audio channel."""
    channel = db.query(DBAudioChannel).filter_by(id=channel_id).first()
    if not channel:
        return None

    if channel.is_default:
        raise ValueError("Cannot modify the default channel")

    # Update name if provided
    if data.name is not None:
        # Check if name already exists (excluding current channel)
        existing = (
            db.query(DBAudioChannel).filter(DBAudioChannel.name == data.name, DBAudioChannel.id != channel_id).first()
        )
        if existing:
            raise ValueError(f"Channel with name '{data.name}' already exists")
        channel.name = data.name

    # Update device mappings if provided
    if data.device_ids is not None:
        # Delete existing mappings
        db.query(DBChannelDeviceMapping).filter_by(channel_id=channel_id).delete()

        # Add new mappings
        for device_id in data.device_ids:
            mapping = DBChannelDeviceMapping(
                id=str(uuid.uuid4()),
                channel_id=channel.id,
                device_id=device_id,
            )
            db.add(mapping)

    db.commit()
    db.refresh(channel)

    # Get updated device IDs
    device_mappings = db.query(DBChannelDeviceMapping).filter_by(channel_id=channel.id).all()
    device_ids = [m.device_id for m in device_mappings]

    return AudioChannelResponse(
        id=channel.id,
        name=channel.name,
        is_default=channel.is_default,
        device_ids=device_ids,
        created_at=channel.created_at,
    )


async def delete_channel(channel_id: str, db: Session) -> bool:
    """Delete an audio channel."""
    channel = db.query(DBAudioChannel).filter_by(id=channel_id).first()
    if not channel:
        return False

    if channel.is_default:
        raise ValueError("Cannot delete the default channel")

    # Delete device mappings
    db.query(DBChannelDeviceMapping).filter_by(channel_id=channel_id).delete()

    # Delete profile-channel mappings
    db.query(DBProfileChannelMapping).filter_by(channel_id=channel_id).delete()

    # Delete channel
    db.delete(channel)
    db.commit()

    return True


async def get_channel_voices(channel_id: str, db: Session) -> list[str]:
    """Get list of profile IDs assigned to a channel."""
    mappings = db.query(DBProfileChannelMapping).filter_by(channel_id=channel_id).all()
    return [m.profile_id for m in mappings]


async def set_channel_voices(
    channel_id: str,
    data: ChannelVoiceAssignment,
    db: Session,
) -> None:
    """Set which voices are assigned to a channel."""
    # Verify channel exists
    channel = db.query(DBAudioChannel).filter_by(id=channel_id).first()
    if not channel:
        raise ValueError(f"Channel {channel_id} not found")

    # Batch-verify all profiles exist
    if data.profile_ids:
        existing = db.query(DBVoiceProfile.id).filter(DBVoiceProfile.id.in_(data.profile_ids)).all()
        existing_ids = {p.id for p in existing}
        missing = set(data.profile_ids) - existing_ids
        if missing:
            raise ValueError(f"Profiles not found: {', '.join(missing)}")

    # Delete existing mappings for this channel
    db.query(DBProfileChannelMapping).filter_by(channel_id=channel_id).delete()

    # Add new mappings
    for profile_id in data.profile_ids:
        mapping = DBProfileChannelMapping(
            profile_id=profile_id,
            channel_id=channel_id,
        )
        db.add(mapping)

    db.commit()


async def get_profile_channels(profile_id: str, db: Session) -> list[str]:
    """Get list of channel IDs assigned to a profile."""
    mappings = db.query(DBProfileChannelMapping).filter_by(profile_id=profile_id).all()
    return [m.channel_id for m in mappings]


async def set_profile_channels(
    profile_id: str,
    data: ProfileChannelAssignment,
    db: Session,
) -> None:
    """Set which channels a profile is assigned to."""
    # Verify profile exists
    profile = db.query(DBVoiceProfile).filter_by(id=profile_id).first()
    if not profile:
        raise ValueError(f"Profile {profile_id} not found")

    # Batch-verify all channels exist
    if data.channel_ids:
        existing = db.query(DBAudioChannel.id).filter(DBAudioChannel.id.in_(data.channel_ids)).all()
        existing_ids = {c.id for c in existing}
        missing = set(data.channel_ids) - existing_ids
        if missing:
            raise ValueError(f"Channels not found: {', '.join(missing)}")

    # Delete existing mappings for this profile
    db.query(DBProfileChannelMapping).filter_by(profile_id=profile_id).delete()

    # Add new mappings
    for channel_id in data.channel_ids:
        mapping = DBProfileChannelMapping(
            profile_id=profile_id,
            channel_id=channel_id,
        )
        db.add(mapping)

    db.commit()
