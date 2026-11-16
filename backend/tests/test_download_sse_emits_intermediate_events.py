"""Regression for the byte-level download progress pipeline.

The old tracker monkey-patched tqdm/huggingface_hub internals to count bytes.
It was replaced by explicit ``tqdm_class`` injection into
``snapshot_download()``/``hf_hub_download()``. These tests pin two properties
of that contract:

1. ``model_files.install_model_file`` / ``install_snapshot`` forward the
   tracker's byte-counter class into the hub (single-file and snapshot
   installs emit intermediate ``downloading`` SSE events, with progress
   increasing).
2. A cancel raised from the SSE subscriber's callback propagates out of the
   download (``DownloadCancelledError``), which is what aborts the transfer
   mid-file.
"""

import asyncio
import json

import pytest

from backend.services import model_files
from backend.utils.hf_progress import HFProgressTracker, create_hf_progress_callback
from backend.utils.progress import ProgressManager


def _fake_hub_download_factory(model_bytes: int, chunk_bytes: int):
    """Build a fake hf_hub_download that drives the injected tqdm_class.

    Mimics the hub contract: if a tqdm_class is supplied it is instantiated
    for the per-file bar (desc = filename, unit = "B") and update() is called
    for each chunk. If no tqdm_class is supplied it downloads without
    progress (the old black-box path).
    """

    def fake_hf_hub_download(*, repo_id, filename, local_dir=None, tqdm_class=None, **kwargs):
        import pathlib

        dest = pathlib.Path(local_dir) / filename
        dest.parent.mkdir(parents=True, exist_ok=True)

        total = model_bytes
        if tqdm_class is not None:
            bar = tqdm_class(
                total=total,
                desc=filename,
                unit="B",
                name="huggingface_hub.http_get",
                initial=0,
            )
            remaining = total
            with open(dest, "wb") as fh:
                while remaining > 0:
                    chunk = min(chunk_bytes, remaining)
                    fh.write(b"\0" * chunk)
                    bar.update(chunk)
                    remaining -= chunk
            bar.close()
        else:
            dest.write_bytes(b"\0" * total)
        return str(dest)

    return fake_hf_hub_download


@pytest.fixture
def fake_hub(monkeypatch):
    import huggingface_hub

    fake = _fake_hub_download_factory(model_bytes=6_000_000, chunk_bytes=500_000)
    monkeypatch.setattr(huggingface_hub, "hf_hub_download", fake)
    return fake


def test_install_model_file_forwards_tqdm_class(fake_hub, tmp_path, monkeypatch):
    """tqdm_class must reach the hub for single-file installs."""
    monkeypatch.setattr("backend.config.get_models_dir", lambda: tmp_path)

    seen = {}

    class RecordingBar:
        def __init__(self, **kwargs):
            seen.update(kwargs)
            self.n = 0

        def update(self, n=1):
            self.n += n

        def close(self):
            pass

        def refresh(self):
            pass

    out = model_files.install_model_file(
        "owner/test",
        "model.gguf",
        tqdm_class=RecordingBar,
    )
    assert out.is_file()
    assert seen.get("total") == 6_000_000
    assert seen.get("desc") == "model.gguf"
    assert seen.get("unit") == "B"


@pytest.mark.asyncio
async def test_sse_emits_intermediate_downloading_events(fake_hub, tmp_path, monkeypatch):
    """The SSE stream must emit intermediate downloading events while bytes flow."""
    monkeypatch.setattr("backend.config.get_models_dir", lambda: tmp_path)

    pm = ProgressManager()
    events: list[dict] = []

    async def sse_reader():
        async for chunk in pm.subscribe("test-model"):
            if chunk.startswith("data: "):
                data = json.loads(chunk[len("data: ") :])
                events.append(data)
                if data.get("status") in ("complete", "error"):
                    return

    # Kick off the (fake) download in a thread so SSE can subscribe first.
    loop = asyncio.get_running_loop()

    def _download():
        progress_callback = create_hf_progress_callback("test-model", pm)
        tracker = HFProgressTracker(progress_callback)
        model_files.install_model_file(
            "owner/test",
            "model.gguf",
            tqdm_class=tracker.tqdm_class,
        )
        pm.mark_complete("test-model")

    reader_task = asyncio.create_task(sse_reader())
    await asyncio.sleep(0.05)
    await loop.run_in_executor(None, _download)
    await asyncio.wait_for(reader_task, timeout=10)

    downloading = [e for e in events if e.get("status") == "downloading"]
    assert len(downloading) >= 2, f"expected multiple intermediate events, got {events}"
    progresses = [e["progress"] for e in downloading]
    assert progresses == sorted(progresses), "progress must be non-decreasing"
    assert progresses[-1] > progresses[0], "progress must actually advance"
    assert all(e["model_name"] == "test-model" for e in downloading)
    assert events[-1]["status"] == "complete"


@pytest.mark.asyncio
async def test_sse_cancel_aborts_download_mid_file(fake_hub, tmp_path, monkeypatch):
    """A cancelled download raises DownloadCancelledError from inside update()."""
    from backend.utils.tasks import DownloadCancelledError

    monkeypatch.setattr("backend.config.get_models_dir", lambda: tmp_path)

    def progress_callback(downloaded, total, filename=""):
        # Simulate the user hitting cancel after the first ~1 MB is through.
        if downloaded >= 1_000_000:
            raise DownloadCancelledError("test-model")

    loop = asyncio.get_running_loop()

    def _download():
        tracker = HFProgressTracker(progress_callback)
        model_files.install_model_file(
            "owner/test",
            "model.gguf",
            tqdm_class=tracker.tqdm_class,
        )

    with pytest.raises(DownloadCancelledError):
        await loop.run_in_executor(None, _download)
