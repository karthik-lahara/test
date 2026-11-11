"""
Download a call recording from a URL (e.g. an S3 presigned GET URL) into data/input/<call_id><ext>.

The returned local path is what Phase 1 decodes, so the rest of the pipeline is unchanged.
"""

import os
from typing import Any, Dict, Optional
from urllib.parse import unquote, urlparse

import httpx

from common.exceptions import AudioPreparationError, ErrorCode
from common.logger import get_logger


def _redact(url: str) -> str:
    """Drop the query string (signature / credential) before logging."""
    p = urlparse(url)
    return f"{p.scheme}://{p.netloc}{p.path}"


def _extension_from_url(url: str, cfg: Dict[str, Any]) -> str:
    ext = os.path.splitext(unquote(urlparse(url).path))[1].lower()
    allowed = cfg["phase1"]["validation"].get("allowed_extensions", [])
    if ext in allowed:
        return ext
    return cfg.get("source", {}).get("default_extension", ".m4a")


def download_audio(url: str, call_id: str, cfg: Dict[str, Any], dest_dir: Optional[str] = None) -> str:
    log = get_logger(__name__, call_id)
    src_cfg = cfg.get("source", {})
    timeout = float(src_cfg.get("download_timeout_sec", 120))
    max_bytes = int(cfg["phase1"]["validation"].get("max_file_size_mb", 500)) * 1024 * 1024

    dest_dir = dest_dir or cfg["paths"]["input_dir"]
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, f"{call_id}{_extension_from_url(url, cfg)}")
    tmp = dest + ".part"
    safe_url = _redact(url)

    log.info(f"Downloading audio: {safe_url}")
    written = 0
    try:
        with httpx.stream("GET", url, timeout=timeout, follow_redirects=True) as resp:
            if resp.status_code == 403:
                body = resp.read().decode("utf-8", errors="ignore")
                code = ErrorCode.P1_015_URL_EXPIRED if "expired" in body.lower() else ErrorCode.P1_014_DOWNLOAD_FAILED
                raise AudioPreparationError(code, "Audio URL rejected (403) - presigned URL expired or invalid",
                                            {"url": safe_url, "status": 403})
            if resp.status_code != 200:
                raise AudioPreparationError(ErrorCode.P1_014_DOWNLOAD_FAILED,
                                            f"Audio download failed with HTTP {resp.status_code}",
                                            {"url": safe_url, "status": resp.status_code})
            with open(tmp, "wb") as f:
                for chunk in resp.iter_bytes(chunk_size=1024 * 1024):
                    written += len(chunk)
                    if written > max_bytes:
                        raise AudioPreparationError(ErrorCode.P1_003_FILE_TOO_LARGE,
                                                    "Downloaded audio exceeds max_file_size_mb",
                                                    {"url": safe_url, "max_bytes": max_bytes})
                    f.write(chunk)
    except AudioPreparationError:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise
    except httpx.HTTPError as e:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise AudioPreparationError(ErrorCode.P1_014_DOWNLOAD_FAILED, f"Audio download failed: {e}",
                                    {"url": safe_url, "type": type(e).__name__}) from e

    if written == 0:
        os.remove(tmp)
        raise AudioPreparationError(ErrorCode.P1_004_FILE_EMPTY, "Downloaded audio is empty", {"url": safe_url})

    os.replace(tmp, dest)
    log.info(f"Downloaded {written / 1024 / 1024:.2f} MB -> {dest}")
    return dest
