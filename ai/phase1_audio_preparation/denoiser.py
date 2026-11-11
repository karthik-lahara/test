"""
Noise reduction.
    deepfilternet -> neural denoiser on GPU (best)
    spectral      -> numpy/scipy spectral gating (automatic fallback)
    none          -> pass-through
"""

import sys
import types
from typing import Any, Dict, Optional, Tuple

import numpy as np

from common.exceptions import AudioPreparationError, ErrorCode
from common.logger import get_logger
from phase1_audio_preparation.resampler import resample

_DF_CACHE: Dict[str, Any] = {}


def _patch_torchaudio_for_deepfilternet() -> None:
    """DeepFilterNet 0.5.x imports torchaudio.backend.common (removed in torchaudio >= 2.1)."""
    try:
        import torchaudio.backend.common  # noqa: F401
        return
    except Exception:
        pass
    try:
        from torchaudio import AudioMetaData
    except Exception:
        class AudioMetaData:
            pass
    backend = sys.modules.get("torchaudio.backend") or types.ModuleType("torchaudio.backend")
    common = types.ModuleType("torchaudio.backend.common")
    common.AudioMetaData = AudioMetaData
    backend.common = common
    sys.modules["torchaudio.backend"] = backend
    sys.modules["torchaudio.backend.common"] = common


def _get_deepfilternet(log):
    if "model" in _DF_CACHE:
        return _DF_CACHE["model"], _DF_CACHE["state"]
    _patch_torchaudio_for_deepfilternet()
    from df.enhance import init_df
    log.info("Loading DeepFilterNet model (first call only)...")
    model, df_state, _ = init_df(log_level="ERROR")
    model.eval()
    _DF_CACHE["model"], _DF_CACHE["state"] = model, df_state
    log.info(f"DeepFilterNet ready on {next(model.parameters()).device}, sr={df_state.sr()}")
    return model, df_state


def _denoise_deepfilternet(audio, sr, dcfg, log):
    import torch
    from df.enhance import enhance

    model, df_state = _get_deepfilternet(log)
    df_sr = int(df_state.sr())
    x = resample(audio, sr, df_sr)

    chunk = int(dcfg.get("chunk_seconds", 60) * df_sr)
    overlap = int(0.5 * df_sr)
    atten = dcfg.get("attenuation_limit_db")

    def _run(segment):
        t = torch.from_numpy(segment).float().unsqueeze(0)
        with torch.no_grad():
            y = enhance(model, df_state, t, atten_lim_db=atten)
        return y.squeeze(0).cpu().numpy().astype(np.float32)

    if len(x) <= chunk:
        y = _run(x)
    else:
        y = np.zeros_like(x)
        weight = np.zeros_like(x)
        fade_in = np.linspace(0.0, 1.0, overlap, dtype=np.float32)
        start = 0
        while start < len(x):
            end = min(start + chunk, len(x))
            seg = _run(x[start:end])[: end - start]
            w = np.ones(len(seg), dtype=np.float32)
            if start > 0:
                n = min(overlap, len(w))
                w[:n] = fade_in[:n]
            if end < len(x):
                n = min(overlap, len(w))
                w[-n:] = np.minimum(w[-n:], fade_in[:n][::-1])
            y[start:end] += seg * w
            weight[start:end] += w
            if end == len(x):
                break
            start = end - overlap
        y = y / np.maximum(weight, 1e-6)
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    return resample(y, df_sr, sr)


def _denoise_spectral(audio, sr, log):
    from scipy.signal import istft, stft

    n_fft = 512 if sr <= 16000 else 1024
    hop = n_fft // 4
    _, _, Z = stft(audio, fs=sr, nperseg=n_fft, noverlap=n_fft - hop)
    mag, phase = np.abs(Z), np.angle(Z)

    frame_energy = mag.mean(axis=0)
    quiet = frame_energy <= np.percentile(frame_energy, 10)
    if quiet.sum() < 5:
        log.warning("Not enough quiet frames for noise profile, skipping spectral denoise")
        return audio

    threshold = mag[:, quiet].mean(axis=1, keepdims=True) + 1.5 * mag[:, quiet].std(axis=1, keepdims=True)
    mask = np.clip((mag - threshold) / (mag + 1e-10), 0.0, 1.0)
    kernel = np.ones(5, dtype=np.float32) / 5.0
    mask = np.apply_along_axis(lambda m: np.convolve(m, kernel, mode="same"), 1, mask)
    mask = 0.1 + 0.9 * mask

    _, y = istft(mag * mask * np.exp(1j * phase), fs=sr, nperseg=n_fft, noverlap=n_fft - hop)
    y = y[: len(audio)]
    if len(y) < len(audio):
        y = np.pad(y, (0, len(audio) - len(y)))
    return y.astype(np.float32)


def denoise(audio: np.ndarray, sr: int, cfg: Dict[str, Any],
            call_id: Optional[str] = None) -> Tuple[np.ndarray, Dict[str, Any]]:
    """Returns (denoised_audio, info)."""
    log = get_logger(__name__, call_id)
    dcfg = cfg["phase1"]["denoise"]

    if not dcfg.get("enabled", True) or dcfg.get("method", "none") == "none":
        log.info("Denoising disabled")
        return audio, {"method": "none", "fallback_used": False}

    method = dcfg["method"]
    info = {"method": method, "fallback_used": False}

    if method == "deepfilternet":
        try:
            out = _denoise_deepfilternet(audio, sr, dcfg, log)
            log.info("Denoised with DeepFilterNet")
            return out, info
        except Exception as e:
            fallback = dcfg.get("fallback_method", "spectral")
            log.warning(f"DeepFilterNet failed ({type(e).__name__}: {e}); falling back to '{fallback}'")
            info.update({"fallback_used": True, "fallback_reason": f"{type(e).__name__}: {e}", "method": fallback})
            method = fallback
            if method == "none":
                return audio, info

    if method == "spectral":
        try:
            out = _denoise_spectral(audio, sr, log)
            log.info("Denoised with spectral gating")
            return out, info
        except Exception as e:
            raise AudioPreparationError(ErrorCode.P1_010_DENOISE_FAILED,
                                        "Spectral denoising failed", {"error": str(e)}) from e

    raise AudioPreparationError(ErrorCode.P1_010_DENOISE_FAILED,
                                f"Unknown denoise method '{method}'", {"method": method})