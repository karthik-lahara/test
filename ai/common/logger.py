import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from typing import Optional
 
_LOG_FORMAT = "%(asctime)s | %(levelname)-7s | %(call_id)s | %(name)s | %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"
 
_root_configured = False
_log_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "logs")
 
 
class _CallIdFilter(logging.Filter):
    def filter(self, record):
        if not hasattr(record, "call_id"):
            record.call_id = "-"
        return True
 
 
class _OnlyThisCall(logging.Filter):
    def __init__(self, call_id: str):
        super().__init__()
        self.call_id = call_id
 
    def filter(self, record):
        return getattr(record, "call_id", None) == self.call_id
 
 
def setup_logging(log_dir: Optional[str] = None, level: str = None) -> None:
    global _root_configured, _log_dir
    if _root_configured:
        return
 
    log_dir = log_dir or _log_dir
    _log_dir = log_dir
    os.makedirs(os.path.join(log_dir, "calls"), exist_ok=True)
    level = (level or os.getenv("LOG_LEVEL", "INFO")).upper()
 
    root = logging.getLogger("callmon")
    root.setLevel(level)
    root.propagate = False
    formatter = logging.Formatter(_LOG_FORMAT, _DATE_FORMAT)
 
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(formatter)
    console.addFilter(_CallIdFilter())
    root.addHandler(console)
 
    file_handler = RotatingFileHandler(os.path.join(log_dir, "pipeline.log"),
                                       maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8")
    file_handler.setFormatter(formatter)
    file_handler.addFilter(_CallIdFilter())
    root.addHandler(file_handler)
 
    _root_configured = True
 
 
def attach_call_log(call_id: str) -> logging.Handler:
    """Writes logs/calls/<call_id>.log"""
    setup_logging(_log_dir)
    path = os.path.join(_log_dir, "calls", f"{call_id}.log")
    handler = logging.FileHandler(path, encoding="utf-8")
    handler.setFormatter(logging.Formatter(_LOG_FORMAT, _DATE_FORMAT))
    handler.addFilter(_OnlyThisCall(call_id))
    logging.getLogger("callmon").addHandler(handler)
    return handler
 
 
def detach_call_log(handler: logging.Handler) -> None:
    logging.getLogger("callmon").removeHandler(handler)
    handler.close()
 
 
def get_logger(name: str, call_id: Optional[str] = None) -> logging.LoggerAdapter:
    setup_logging(_log_dir)
    short = name.split(".")[-1] if name else "app"
    logger = logging.getLogger(f"callmon.{short}")
    return logging.LoggerAdapter(logger, {"call_id": call_id or "-"})