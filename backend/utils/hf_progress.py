"""HuggingFace Hub download progress tracking.

Progress is tracked *natively*: a tqdm-shaped byte-counter class is passed as
the ``tqdm_class`` argument to ``snapshot_download()`` / ``hf_hub_download()``.
The Hub instantiates that class for its aggregate transfer/reconstruct bars
(snapshot downloads) and its per-file bar (single-file downloads), so progress
rides the exact same code path bytes move through — including cancellation,
which is raised from inside ``update()``.

No monkey-patching: tqdm, huggingface_hub, and sys.modules are never touched.
"""

import logging
import threading

logger = logging.getLogger(__name__)

# Don't report until the expected total is at least this large; avoids the
# "100% at 0 MB" phase when small config files are accounted before the real
# weight files.
MIN_TOTAL_BYTES = 1_000_000  # 1 MB

# Bar names used by huggingface_hub for the aggregate bars of a snapshot
# download. The transfer bar ("Downloading bytes") receives the same updates
# as the reconstruct bar ("Reconstructing (incomplete total...)"), so only
# the reconstruct bar is counted for byte progress.
_TRANSFER_BAR_NAME = "huggingface_hub.snapshot_download.transfer"
_RECONSTRUCT_BAR_NAME = "huggingface_hub.snapshot_download"
_HTTP_BAR_NAME = "huggingface_hub.http_get"


def _make_bar_class(tracker: "HFProgressTracker") -> type:
    """Bind a byte-counter bar class to a tracker instance."""

    class _ByteCounter:
        """tqdm-compatible byte counter used as huggingface_hub's tqdm_class.

        Unit == "B" bars are tracked in the shared ``_bars`` list; aggregate
        totals/downloaded counts are computed across them on every ``update``.
        Other bars (e.g. the "Fetching N files" bar, unit ``it``) are ignored.

        Bar names are used to avoid double counting: only the reconstruct bar
        (snapshot) or per-file http bars (single-file) are aggregated; the
        transfer bar receives duplicate updates and is excluded.
        """

        _lock = threading.Lock()

        def __init__(self, *args, **kwargs):
            desc = kwargs.get("desc")
            if not desc and args and isinstance(args[0], str):
                desc = args[0]
            self.desc = str(desc or "")
            self.total = int(kwargs.get("total") or 0)
            self.initial = int(kwargs.get("initial") or 0)
            self.n = self.initial
            self.unit = kwargs.get("unit", "it")
            self.unit_scale = bool(kwargs.get("unit_scale", False))
            self._name = kwargs.get("name", "")
            self._is_byte_bar = self.unit == "B"
            self._count_this_bar = self._is_byte_bar and self._name != _TRANSFER_BAR_NAME
            if self._count_this_bar:
                with self._lock:
                    tracker._bars.append(self)

        # --- tqdm API surface huggingface_hub touches ---
        @classmethod
        def get_lock(cls):
            return cls._lock

        @classmethod
        def set_lock(cls, lock):
            cls._lock = lock

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_val, exc_tb):
            self.close()
            return False

        def __iter__(self):
            return iter(())

        def update(self, n: int | float = 1):
            with self._lock:
                self.n += int(n)
                bars = list(tracker._bars)
                total = sum(b.total or 0 for b in bars)
                current = sum(b.n for b in bars)

            # No meaningful total yet (all bars still at 0/unknown) or below
            # the reporting threshold - stay quiet.
            if total < MIN_TOTAL_BYTES:
                return

            filename = self._filename() if self._is_byte_bar else ""
            tracker._emit(current, total, filename)

        def refresh(self):
            pass

        def set_postfix_str(self, postfix: str, refresh: bool = False):
            pass

        def set_transfer_postfix_str(self, postfix: str, refresh: bool = False):
            pass

        def set_description_str(self, desc: str, refresh: bool = False):
            self.desc = str(desc)

        def set_description(self, desc: str, refresh: bool = False):
            self.set_description_str(desc, refresh)

        def write(self, s, *args, **kwargs):
            return None

        def close(self):
            if not self._count_this_bar:
                return
            with self._lock:
                if self in tracker._bars:
                    tracker._bars.remove(self)

        # --- helpers ---
        def _filename(self) -> str:
            desc = self.desc.strip()
            if not desc or " " in desc.split()[0]:
                return ""
            # http bars carry the raw file name; snapshot bars carry fixed
            # labels which are not filenames.
            if desc in (_RECONSTRUCT_BAR_NAME,):
                return ""
            return desc

    return _ByteCounter


class HFProgressTracker:
    """Collects byte progress from huggingface_hub downloads.

    Kept as the class the download pipeline constructs (``HFProgressTracker()``)
    and as the holder of the callback and the bar list. ``tqdm_class`` is the
    injection point passed to ``snapshot_download()``/``hf_hub_download()``.
    """

    def __init__(self, progress_callback=None, filter_non_downloads: bool = False):
        self.progress_callback = progress_callback
        self.filter_non_downloads = filter_non_downloads
        self._bars: list = []
        self._lock = threading.Lock()

    @property
    def tqdm_class(self) -> type:
        """Byte-counter bar class bound to this tracker."""
        return _make_bar_class(self)

    def patch_download(self):
        """Kept for call-site compatibility; nothing is monkey-patched."""
        import contextlib

        return contextlib.nullcontext()

    def _emit(self, downloaded: int, total: int, filename: str):
        cb = self.progress_callback
        if cb is None:
            return
        cb(downloaded, total, filename)


def create_hf_progress_callback(model_name: str, progress_manager):
    """Create a progress callback for HuggingFace downloads."""

    def callback(downloaded: int, total: int, filename: str = ""):
        """Progress callback.

        Note: We send updates even when total=0 (unknown) to provide feedback
        during the "incomplete total" phase of huggingface_hub downloads.
        The frontend handles total=0 gracefully.
        """
        progress_manager.update_progress(
            model_name=model_name,
            current=downloaded,
            total=total,
            filename=filename or "",
            status="downloading",
        )

    return callback
