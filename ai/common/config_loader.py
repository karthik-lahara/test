import os
from copy import deepcopy
from typing import Any, Dict, Optional
 
import yaml

try:  # load .env (gitignored) so STATIC_AUDIO_URL / HF_TOKEN can live there
    from dotenv import load_dotenv
except ImportError:  # python-dotenv is optional
    load_dotenv = None
 
from common.exceptions import ConfigError, ErrorCode
 
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_CONFIG_PATH = os.path.join(PROJECT_ROOT, "config", "config.yaml")
 
_cache: Optional[Dict[str, Any]] = None
 
 
def _apply_env_overrides(cfg):
    env = os.environ
    if env.get("HF_TOKEN"):
        cfg["phase2"]["hf_token"] = env["HF_TOKEN"]
    if env.get("DEVICE"):
        cfg["runtime"]["device"] = env["DEVICE"]
    if env.get("DIARIZATION_MODEL"):
        cfg["phase2"]["model_name"] = env["DIARIZATION_MODEL"]
    if env.get("NUM_SPEAKERS"):
        cfg["phase2"]["num_speakers"] = int(env["NUM_SPEAKERS"])
    if env.get("DENOISE_METHOD"):
        cfg["phase1"]["denoise"]["method"] = env["DENOISE_METHOD"]
    if env.get("PARAKEET_PYTHON"):  # e.g. Windows: <project>\.venv_parakeet\Scripts\python.exe
        cfg["phase3"]["parakeet"]["python_executable"] = env["PARAKEET_PYTHON"]
    if env.get("STATIC_AUDIO_URL"):
        cfg.setdefault("source", {})["static_audio_url"] = env["STATIC_AUDIO_URL"]
    return cfg
 
 
def _resolve_paths(cfg):
    for key, value in cfg.get("paths", {}).items():
        if not os.path.isabs(value):
            value = os.path.join(PROJECT_ROOT, value)
        cfg["paths"][key] = value
        os.makedirs(value, exist_ok=True)
    return cfg
 
 
def _validate(cfg):
    for section in ("paths", "runtime", "phase1", "phase2"):
        if section not in cfg:
            raise ConfigError(ErrorCode.GEN_002_CONFIG_INVALID, f"Missing section '{section}' in config")
 
 
def load_config(path: Optional[str] = None, reload: bool = False) -> Dict[str, Any]:
    global _cache
    if _cache is not None and not reload and path is None:
        return deepcopy(_cache)
 
    if load_dotenv is not None:
        load_dotenv(os.path.join(PROJECT_ROOT, ".env"), override=False)
    path = path or os.getenv("CONFIG_PATH", DEFAULT_CONFIG_PATH)
    if not os.path.isfile(path):
        raise ConfigError(ErrorCode.GEN_001_CONFIG_NOT_FOUND, f"Config not found: {path}")
    try:
        with open(path, "r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}
    except yaml.YAMLError as e:
        raise ConfigError(ErrorCode.GEN_002_CONFIG_INVALID, f"Invalid YAML: {e}") from e
 
    _validate(cfg)
    cfg = _apply_env_overrides(cfg)
    cfg = _resolve_paths(cfg)
    _cache = cfg
    return deepcopy(cfg)


