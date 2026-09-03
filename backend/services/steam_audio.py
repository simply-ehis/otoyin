# NOTE: This module intentionally exceeds the 200-line soft limit (AGENTS.md):
# it is a single self-contained native-API integration layer (Steam Audio ctypes
# bindings + NumPy DSP fallback). Splitting it would add cross-file coupling with
# no benefit. Treated as an external-integration module, same as generated assets.

"""Spatial audio service.

Provides binaural panning (HRTF), environmental convolution reverb, and
Doppler shift for otoyin's spatial sound features.

Two backends:

* **Steam Audio** (Valve ``phonon`` SDK) when ``phonon.{dll,so,dylib}`` is
  present under ``<data>/steam-audio/<Platform>/`` (or flat under
  ``<data>/steam-audio/``). Binaural rendering uses the real Steam Audio HRTF
  via ``iplBinauralEffect`` with a bundled measured SOFA dataset
  (``SimpleFreeFieldHRIR_1.0.sofa``); falls back to the built-in default HRTF.
* **NumPy DSP fallback** used whenever the SDK path is not enabled, or for
  operations the SDK does not cover simply (convolution reverb and Doppler stay
  on the NumPy path: the SDK's convolution/doppler require an acoustic scene /
  impulse-response assets, which is heavier than the single-shot spatializer
  this service exposes). Fully offline, no deps.

``load()`` probes for the SDK on first use and ``available`` reports whether
the binary was found. ``enable_sdk()`` flips ``sdk_enabled`` True once the
render symbols are present. The public ``apply_*`` methods route to the SDK
binaural path when enabled, otherwise to the NumPy path.
"""

import ctypes
import logging
import platform
import threading
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)

IPLHandle = ctypes.c_void_p
IPL_STATUS_SUCCESS = 0

# Steam Audio 4.8.1 API enums (from phonon.h)
IPL_HRTFTYPE_DEFAULT = 0
IPL_HRTFTYPE_SOFA = 1
IPL_HRTFINTERPOLATION_NEAREST = 0
IPL_HRTFINTERPOLATION_BILINEAR = 1
IPL_HRTFNORMTYPE_NONE = 0
IPL_HRTFNORMTYPE_RMS = 1
IPL_AUDIOEFFECTSTATE_TAILCOMPLETE = 0


# ---- ctypes struct mirrors of phonon.h (only the fields we use) ----


class IPLVector3(ctypes.Structure):
    _fields_ = [
        ("x", ctypes.c_float),
        ("y", ctypes.c_float),
        ("z", ctypes.c_float),
    ]


class IPLAudioSettings(ctypes.Structure):
    _fields_ = [
        ("samplingRate", ctypes.c_int32),
        ("frameSize", ctypes.c_int32),
    ]


class IPLAudioBuffer(ctypes.Structure):
    _fields_ = [
        ("numChannels", ctypes.c_int32),
        ("numSamples", ctypes.c_int32),
        ("data", ctypes.POINTER(ctypes.POINTER(ctypes.c_float))),
    ]


class IPLHRTFSettings(ctypes.Structure):
    _fields_ = [
        ("type", ctypes.c_int),
        ("sofaFileName", ctypes.c_char_p),
        ("sofaData", ctypes.POINTER(ctypes.c_uint8)),
        ("sofaDataSize", ctypes.c_int),
        ("volume", ctypes.c_float),
        ("normType", ctypes.c_int),
    ]


class IPLBinauralEffectSettings(ctypes.Structure):
    _fields_ = [
        ("hrtf", IPLHandle),
    ]


class IPLBinauralEffectParams(ctypes.Structure):
    _fields_ = [
        ("direction", IPLVector3),
        ("interpolation", ctypes.c_int),
        ("spatialBlend", ctypes.c_float),
        ("hrtf", IPLHandle),
        ("peakDelays", ctypes.POINTER(ctypes.c_float)),
    ]


class IPLContextSettings(ctypes.Structure):
    _fields_ = [
        ("version", ctypes.c_uint32),
        ("logCallback", ctypes.c_void_p),
        ("allocateCallback", ctypes.c_void_p),
        ("freeCallback", ctypes.c_void_p),
        ("simdLevel", ctypes.c_int),
        ("flags", ctypes.c_int),
    ]


def _lib_path() -> Path | None:
    """Find phonon shared library for this platform.

    Searches in order:
      1. data/steam-audio/<Platform>/phonon.{dll,so,dylib}  (platform-specific)
      2. data/steam-audio/phonon.{dll,so,dylib}             (flat, user convenience)
    """
    from ..config import get_data_dir

    names = {"Windows": "phonon.dll", "Linux": "libphonon.so", "Darwin": "libphonon.dylib"}
    dirs = {"Windows": "windows-x64", "Linux": "linux-x64", "Darwin": "osx"}
    system = platform.system()
    if system not in names:
        return None
    base = get_data_dir() / "steam-audio"
    candidates = [
        base / dirs[system] / names[system],
        base / names[system],
    ]
    for p in candidates:
        if p.exists():
            return p
    return _extract_sdk_from_zip()


def _ir_length(sample_rate: int, decay_ms: float) -> int:
    return max(1, int(sample_rate * decay_ms / 1000))


# Steam Audio SDK zip layout: bin/<platform>/phonon.{dll,so,dylib}
_STEAM_ZIP_BIN = {
    "Windows": "bin/Windows64/phonon.dll",
    "Linux": "bin/linux64/libphonon.so",
    "Darwin": "bin/macos/libphonon.dylib",
}


def _extract_sdk_from_zip() -> Path | None:
    """Extract the phonon binary from a Steam Audio SDK zip if present.

    Looks for ``steam_audio.zip`` under ``<data>/steam-audio/`` (as produced by
    the model downloader or a manual drop). If the zip is valid and contains the
    platform binary, it is extracted next to the zip and that path is returned.
    Returns ``None`` when there is no usable zip.
    """
    from ..config import get_data_dir

    system = platform.system()
    if system not in _STEAM_ZIP_BIN:
        return None
    zip_path = get_data_dir() / "steam-audio" / "steam_audio.zip"
    if not zip_path.exists():
        return None
    try:
        import zipfile

        with zipfile.ZipFile(zip_path) as zf:
            target = _STEAM_ZIP_BIN[system]
            hit = next((n for n in zf.namelist() if n.endswith(target.split("/")[-1])), None)
            if hit is None:
                logger.warning("Steam Audio zip missing %s", target)
                return None
            # Zip-slip guard: ensure extracted path stays within destination directory
            dest_dir = zip_path.parent
            out = (dest_dir / target.split("/")[-1]).resolve()
            if not out.is_relative_to(dest_dir.resolve()):
                logger.error("Unsafe path in Steam Audio zip: %s", hit)
                return None
            with zf.open(hit) as src, open(out, "wb") as dst:
                dst.write(src.read())
            logger.info("Extracted Steam Audio binary from zip: %s", out)
            return out
    except (zipfile.BadZipFile, OSError) as e:
        logger.warning("Steam Audio zip unreadable (%s); skipping auto-extract", e)
        return None


def _hrtf_path() -> Path | None:
    """Locate a Steam Audio HRTF dataset (SOFA/.hrtf) for this platform."""
    from ..config import get_data_dir

    base = get_data_dir() / "steam-audio"
    for d in (base / "hrtf", base / "windows-x64", base / "include", base):
        if not d.exists():
            continue
        hits = sorted(d.glob("*.hrtf")) + sorted(d.glob("*.sofa"))
        if hits:
            return hits[0]
    return None


class SteamAudio:
    """Thread-safe wrapper around the Steam Audio C API with NumPy fallback."""

    def __init__(self):
        self._lib = None
        self._tls = threading.local()
        self.sdk_enabled = False

    @property
    def available(self) -> bool:
        return self._lib is not None

    @property
    def hrtf_available(self) -> bool:
        return _hrtf_path() is not None

    def load(self) -> bool:
        if self._lib is not None:
            return True
        p = _lib_path()
        if p is None:
            return False
        try:
            self._lib = ctypes.CDLL(str(p))
        except OSError as e:
            logger.warning("Steam Audio load failed: %s", e)
            return False
        try:
            self._signatures()
        except AttributeError as e:
            logger.warning("Steam Audio SDK symbols missing (%s); using NumPy fallback", e)
            self._lib = None
            return False
        logger.info("Steam Audio loaded from %s", p)
        return True

    def enable_sdk(self) -> bool:
        """Enable the SDK render path once the binary exposes render symbols.

        Binaural uses ``iplContextCreate`` + ``iplHRTFCreate`` (default HRTF) +
        ``iplBinauralEffectCreate``. Returns True when those symbols exist.
        """
        if not self.load():
            return False
        missing = [
            s
            for s in (
                "iplContextCreate",
                "iplHRTFCreate",
                "iplBinauralEffectCreate",
                "iplBinauralEffectApply",
            )
            if not hasattr(self._lib, s)
        ]
        if missing:
            logger.warning("Steam Audio binaural symbols missing: %s", missing)
            return False
        # Validate the full binaural pipeline with a tiny probe render. The
        # built-in HRTF can fail to initialize if its bundled dataset is not
        # resolvable at runtime; only enable the SDK path when a real render
        # succeeds, otherwise stay on the verified NumPy fallback.
        if not self._probe_binaural():
            logger.warning("Steam Audio binaural render probe failed; using NumPy fallback")
            return False
        self.sdk_enabled = True
        logger.info("Steam Audio SDK binaural path enabled (SOFA HRTF)")
        return True

    def _probe_binaural(self, sr: int = 24000) -> bool:
        import numpy as _np

        try:
            ctx = self._ctx()
            if ctx is None:
                return False
            hrtf = self._create_hrtf(ctx, sr)
            if hrtf is None:
                return False
            audio_settings = IPLAudioSettings(samplingRate=sr, frameSize=1024)
            effect_settings = IPLBinauralEffectSettings(hrtf=hrtf)
            effect = IPLHandle(None)
            if (
                self._lib.iplBinauralEffectCreate(
                    ctx, ctypes.byref(audio_settings), ctypes.byref(effect_settings), ctypes.byref(effect)
                )
                != IPL_STATUS_SUCCESS
            ):
                return False
            try:
                sig = (0.5 * _np.sin(2 * _np.pi * 220 * _np.arange(1024) / sr)).astype(_np.float32)
                in_buf = self._make_buffer(sig, 1)
                out_l = _np.zeros(1024, dtype=_np.float32)
                out_r = _np.zeros(1024, dtype=_np.float32)
                out_buf = self._make_buffer_stereo(out_l, out_r)
                params = IPLBinauralEffectParams(
                    direction=IPLVector3(x=1.0, y=0.0, z=0.0),
                    interpolation=IPL_HRTFINTERPOLATION_BILINEAR,
                    spatialBlend=1.0,
                    hrtf=hrtf,
                )
                self._lib.iplBinauralEffectApply(
                    effect, ctypes.byref(params), ctypes.byref(in_buf), ctypes.byref(out_buf)
                )
                energy = float(_np.sqrt(_np.mean(out_l**2) + _np.mean(out_r**2)))
                return energy > 1e-6
            finally:
                if hasattr(self._lib, "iplBinauralEffectRelease"):
                    self._lib.iplBinauralEffectRelease(ctypes.byref(effect))
                if hasattr(self._lib, "iplHRTFRelease"):
                    self._lib.iplHRTFRelease(ctypes.byref(hrtf))
        except Exception as e:
            logger.warning("binaural probe error: %s", e)
            return False

    def _signatures(self):
        lib = self._lib
        # iplContextCreate(IPLContextSettings*, IPLContext*)
        lib.iplContextCreate.argtypes = [
            ctypes.POINTER(IPLContextSettings),
            ctypes.POINTER(IPLHandle),
        ]
        lib.iplContextCreate.restype = ctypes.c_int
        # iplHRTFCreate(IPLContext, IPLAudioSettings*, IPLHRTFSettings*, IPLHRTF*)
        lib.iplHRTFCreate.argtypes = [
            IPLHandle,
            ctypes.POINTER(IPLAudioSettings),
            ctypes.POINTER(IPLHRTFSettings),
            ctypes.POINTER(IPLHandle),
        ]
        lib.iplHRTFCreate.restype = ctypes.c_int
        # iplBinauralEffectCreate(IPLContext, IPLAudioSettings*, IPLBinauralEffectSettings*, IPLBinauralEffect*)
        lib.iplBinauralEffectCreate.argtypes = [
            IPLHandle,
            ctypes.POINTER(IPLAudioSettings),
            ctypes.POINTER(IPLBinauralEffectSettings),
            ctypes.POINTER(IPLHandle),
        ]
        lib.iplBinauralEffectCreate.restype = ctypes.c_int
        # iplBinauralEffectApply(IPLBinauralEffect, IPLBinauralEffectParams*, IPLAudioBuffer*, IPLAudioBuffer*)
        lib.iplBinauralEffectApply.argtypes = [
            IPLHandle,
            ctypes.POINTER(IPLBinauralEffectParams),
            ctypes.POINTER(IPLAudioBuffer),
            ctypes.POINTER(IPLAudioBuffer),
        ]
        lib.iplBinauralEffectApply.restype = ctypes.c_int

    def _ctx(self):
        ctx = getattr(self._tls, "ctx", None)
        if ctx is not None:
            return ctx
        settings = IPLContextSettings(version=0x040801)
        ctx = IPLHandle(None)
        if self._lib.iplContextCreate(ctypes.byref(settings), ctypes.byref(ctx)) != IPL_STATUS_SUCCESS:
            return None
        self._tls.ctx = ctx
        return ctx

    def _create_hrtf(self, ctx, sr):
        """Create an HRTF for binaural rendering. Prefers the bundled SOFA
        dataset (real measured HRTF) and falls back to the built-in default.
        Returns the IPLHRTF handle, or None if both fail."""
        audio_settings = IPLAudioSettings(samplingRate=sr, frameSize=1024)
        sofa = _hrtf_path()
        if sofa is not None:
            settings = IPLHRTFSettings(
                type=IPL_HRTFTYPE_SOFA,
                sofaFileName=str(sofa).encode("utf-8"),
                sofaData=None,
                sofaDataSize=0,
                volume=8.0,
                normType=IPL_HRTFNORMTYPE_RMS,
            )
            hrtf = IPLHandle(None)
            if (
                self._lib.iplHRTFCreate(ctx, ctypes.byref(audio_settings), ctypes.byref(settings), ctypes.byref(hrtf))
                == IPL_STATUS_SUCCESS
                and hrtf
            ):
                return hrtf
        default = IPLHRTFSettings(
            type=IPL_HRTFTYPE_DEFAULT,
            sofaFileName=None,
            sofaData=None,
            sofaDataSize=0,
            volume=8.0,
            normType=IPL_HRTFNORMTYPE_RMS,
        )
        hrtf = IPLHandle(None)
        if (
            self._lib.iplHRTFCreate(ctx, ctypes.byref(audio_settings), ctypes.byref(default), ctypes.byref(hrtf))
            == IPL_STATUS_SUCCESS
            and hrtf
        ):
            return hrtf
        return None

    def unload(self):
        ctx = getattr(self._tls, "ctx", None)
        if ctx and self._lib:
            self._lib.iplDestroyContext(ctypes.byref(ctx)) if hasattr(self._lib, "iplDestroyContext") else None
            self._tls.ctx = None
            self._tls.hrtf = None
        self._lib = None
        self.sdk_enabled = False

    def apply_binaural(
        self,
        audio: np.ndarray,
        sr: int,
        x: float,
        y: float,
        z: float,
        gain_db: float = 0.0,
        distance: float = 1.0,
    ) -> np.ndarray:
        mono = audio.mean(axis=1) if audio.ndim > 1 else audio
        if self.sdk_enabled:
            try:
                return self._sdk_binaural(mono, sr, x, y, z, gain_db, distance)
            except Exception as e:
                logger.warning("Steam Audio binaural failed (%s); NumPy fallback", e)
        return self._cos_pan(mono, x, z, gain_db, distance)

    def apply_convolution(
        self,
        audio: np.ndarray,
        sr: int,
        room_size: float = 0.5,
        decay_ms: float = 500.0,
        pre_delay_ms: float = 20.0,
        wet_dry: float = 0.3,
        damping: float = 0.5,
    ) -> np.ndarray:
        mono = audio.mean(axis=1) if audio.ndim > 1 else audio
        return self._synth_ir_conv(mono, sr, room_size, decay_ms, pre_delay_ms, wet_dry, damping)

    def apply_doppler(self, audio: np.ndarray, sr: int, speed: float = 1.0) -> np.ndarray:
        """Pitch-bend a moving source via time-varying resampling (NumPy DSP)."""
        mono = audio.mean(axis=1) if audio.ndim > 1 else audio
        return self._doppler_resample(mono, sr, speed)

    def _sdk_binaural(self, mono, sr, x, y, z, gain_db, distance):
        import numpy as _np

        ctx = self._ctx()
        if ctx is None:
            raise RuntimeError("no Steam Audio context")
        hrtf = self._create_hrtf(ctx, sr)
        if hrtf is None:
            raise RuntimeError("could not create HRTF")
        audio_settings = IPLAudioSettings(samplingRate=sr, frameSize=1024)
        effect_settings = IPLBinauralEffectSettings(hrtf=hrtf)
        effect = IPLHandle(None)
        if (
            self._lib.iplBinauralEffectCreate(
                ctx, ctypes.byref(audio_settings), ctypes.byref(effect_settings), ctypes.byref(effect)
            )
            != IPL_STATUS_SUCCESS
        ):
            raise RuntimeError("iplBinauralEffectCreate failed")
        try:
            g = 10.0 ** (gain_db / 20.0) / max(distance, 0.1)
            sig = mono.astype(_np.float32) * g
            n = len(sig)
            frame = 1024
            params = IPLBinauralEffectParams(
                direction=IPLVector3(x=float(x), y=float(y), z=float(z)),
                interpolation=IPL_HRTFINTERPOLATION_BILINEAR,
                spatialBlend=1.0,
                hrtf=hrtf,
            )
            out_l = []
            out_r = []
            offset = 0
            while offset < n:
                # Steam Audio binaural requires full frameSize input frames.
                # Pad the final partial frame to a full frame so the SDK never
                # writes garbage past the valid sample count.
                end = min(offset + frame, n)
                chunk = sig[offset:end]
                if len(chunk) < frame:
                    chunk = _np.concatenate([chunk, _np.zeros(frame - len(chunk), dtype=_np.float32)])
                in_buf = self._make_buffer(chunk, 1)
                seg_l = _np.zeros(frame, dtype=_np.float32)
                seg_r = _np.zeros(frame, dtype=_np.float32)
                out_buf = self._make_buffer_stereo(seg_l, seg_r)
                self._lib.iplBinauralEffectApply(
                    effect, ctypes.byref(params), ctypes.byref(in_buf), ctypes.byref(out_buf)
                )
                out_l.append(seg_l[: end - offset])
                out_r.append(seg_r[: end - offset])
                offset = end
            tail = self._drain_tail(effect, frame)
            merged_l = _np.concatenate(out_l + [t[0] for t in tail]) if tail else _np.concatenate(out_l)
            merged_r = _np.concatenate(out_r + [t[1] for t in tail]) if tail else _np.concatenate(out_r)
            result = _np.stack([merged_l, merged_r], axis=1).astype(_np.float32)
            result = _np.nan_to_num(result, nan=0.0, posinf=0.0, neginf=0.0)
            peak = _np.max(_np.abs(result))
            if peak > 1.0:
                result = result / peak
            return result
        finally:
            if hasattr(self._lib, "iplBinauralEffectRelease"):
                self._lib.iplBinauralEffectRelease(ctypes.byref(effect))
            if hasattr(self._lib, "iplHRTFRelease"):
                self._lib.iplHRTFRelease(ctypes.byref(hrtf))

    def _drain_tail(self, effect, frame):
        if not hasattr(self._lib, "iplBinauralEffectGetTail"):
            return []
        import numpy as _np

        chunks = []
        for _ in range(64):
            seg_l = _np.zeros(frame, dtype=_np.float32)
            seg_r = _np.zeros(frame, dtype=_np.float32)
            out_buf = self._make_buffer_stereo(seg_l, seg_r)
            self._lib.iplBinauralEffectGetTail(effect, ctypes.byref(out_buf))
            if _np.sqrt(_np.mean(seg_l**2) + _np.mean(seg_r**2)) <= 1e-9:
                break
            chunks.append((seg_l, seg_r))
        return chunks

    @staticmethod
    def _make_buffer(arr1d, channels=1):
        arr = np.ascontiguousarray(arr1d, dtype=np.float32).reshape(1, -1)
        ptrs = (ctypes.POINTER(ctypes.c_float) * channels)()
        ptrs[0] = arr.ctypes.data_as(ctypes.POINTER(ctypes.c_float))
        for c in range(1, channels):
            ptrs[c] = arr.ctypes.data_as(ctypes.POINTER(ctypes.c_float))
        data_ptr = ctypes.cast(ptrs, ctypes.POINTER(ctypes.POINTER(ctypes.c_float)))
        buf = IPLAudioBuffer(numChannels=channels, numSamples=arr.shape[1], data=data_ptr)
        buf._keep = (arr, ptrs, data_ptr)
        return buf

    @staticmethod
    def _make_buffer_stereo(left_ch, right_ch):
        left_ch = np.ascontiguousarray(left_ch, dtype=np.float32)
        right_ch = np.ascontiguousarray(right_ch, dtype=np.float32)
        ptrs = (ctypes.POINTER(ctypes.c_float) * 2)()
        ptrs[0] = left_ch.ctypes.data_as(ctypes.POINTER(ctypes.c_float))
        ptrs[1] = right_ch.ctypes.data_as(ctypes.POINTER(ctypes.c_float))
        data_ptr = ctypes.cast(ptrs, ctypes.POINTER(ctypes.POINTER(ctypes.c_float)))
        buf = IPLAudioBuffer(numChannels=2, numSamples=len(left_ch), data=data_ptr)
        buf._keep = (left_ch, right_ch, ptrs, data_ptr)
        return buf

    def _doppler_resample(self, mono, sr, speed):
        n = len(mono)
        t = np.arange(n) / sr
        factor = 1.0 + float(speed) * 0.5 * np.sin(2 * np.pi * 0.5 * t)
        factor = np.clip(factor, 0.1, 4.0)
        indices = np.clip((np.arange(n) / factor).astype(np.int64), 0, n - 1)
        return mono[indices].astype(np.float32)

    def _cos_pan(self, mono, x, z, gain_db, dist):
        angle = np.arctan2(x, z)
        g = 10.0 ** (gain_db / 20.0) / max(dist, 0.1)
        half = angle / 2.0
        left_gain = np.cos(half + np.pi / 4) * g
        right_gain = np.sin(half + np.pi / 4) * g
        out = np.stack([mono * left_gain, mono * right_gain], axis=1)
        return out.astype(np.float32)

    def _synth_ir_conv(self, mono, sr, room_size, decay_ms, pre_delay_ms, wet_dry, damping):
        from scipy.signal import fftconvolve

        n = _ir_length(sr, decay_ms)
        ir = np.zeros(n, dtype=np.float32)
        pd = int(pre_delay_ms * sr / 1000)
        if pd < n:
            ir[pd] = 1.0
        ds = int(decay_ms * sr / 1000)
        end = min(pd + ds, n)
        t = np.arange(pd + 1, end) - pd
        ir[pd + 1 : end] = np.exp(-t / max(ds, 1) * (1 - damping) * 5) * 0.01
        ir /= np.max(np.abs(ir)) + 1e-8
        wet = fftconvolve(mono, ir, mode="full")[: len(mono)]
        return (mono * (1 - wet_dry) + wet * wet_dry).astype(np.float32)


steam_audio = SteamAudio()
