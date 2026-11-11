"""
Ollama HTTP client with structured (JSON-schema) output, retries and timing.

One OllamaClient is created per call, so timings never mix between calls.
Every request uses the same num_ctx on purpose: changing it makes Ollama reload the model.
"""

import json
import socket
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional


class OllamaUnavailableError(ConnectionError):
    """Ollama is not reachable or returned an HTTP error -> stop the phase."""


def _ns_to_s(value) -> float:
    try:
        return round(float(value) / 1e9, 3)
    except (TypeError, ValueError):
        return 0.0


class OllamaClient:
    def __init__(self, cfg: Dict[str, Any], log):
        o = cfg["phase5"]["ollama"]
        self.url = o.get("url", "http://localhost:11434/api/generate")
        self.model = o.get("model", "gemma3:12b")
        self.seed = int(o.get("seed", 0))
        self.num_ctx = int(o.get("num_ctx", 12288))
        self.num_predict = int(o.get("num_predict", 1500))
        self.fallback_num_ctx = int(o.get("fallback_num_ctx", 8192))
        self.fallback_num_predict = int(o.get("fallback_num_predict", 1200))
        self.timeout = int(o.get("request_timeout", 1200))
        self.fallback_timeout = int(o.get("fallback_timeout", 600))
        self.prompt_warn_chars = int(o.get("prompt_warn_chars", 20000))
        self.log = log
        self.timings: List[Dict[str, Any]] = []

    # ---------------- timing ----------------
    def _record(self, stage, attempt, temperature, status, wall, num_ctx, result=None) -> Dict[str, Any]:
        result = result or {}
        rec = {
            "stage": stage, "attempt": attempt, "temperature": temperature, "status": status,
            "num_ctx": num_ctx, "wall_seconds": round(wall, 3),
            "model_load_seconds": _ns_to_s(result.get("load_duration")),
            "prompt_eval_seconds": _ns_to_s(result.get("prompt_eval_duration")),
            "generation_seconds": _ns_to_s(result.get("eval_duration")),
            "ollama_total_seconds": _ns_to_s(result.get("total_duration")),
            "prompt_tokens": result.get("prompt_eval_count"),
            "output_tokens": result.get("eval_count"),
        }
        self.timings.append(rec)
        return rec

    def timing_summary(self, pipeline_seconds: float) -> Dict[str, Any]:
        by_stage: Dict[str, Dict[str, float]] = {}
        keys = ("model_load_seconds", "prompt_eval_seconds", "generation_seconds", "wall_seconds")
        for r in self.timings:
            st = by_stage.setdefault(r["stage"], {"calls": 0, **{k: 0.0 for k in keys}})
            st["calls"] += 1
            for k in keys:
                st[k] += r[k]
        for st in by_stage.values():
            for k in keys:
                st[k] = round(st[k], 3)
        return {
            "total_pipeline_seconds": round(pipeline_seconds, 3),
            "total_model_load_seconds": round(sum(r["model_load_seconds"] for r in self.timings), 3),
            "total_prompt_eval_seconds": round(sum(r["prompt_eval_seconds"] for r in self.timings), 3),
            "total_generation_seconds": round(sum(r["generation_seconds"] for r in self.timings), 3),
            "total_ollama_wall_seconds": round(sum(r["wall_seconds"] for r in self.timings), 3),
            "ollama_call_count": len(self.timings),
            "by_stage": by_stage,
            "calls": self.timings,
        }

    # ---------------- one request ----------------
    def call(self, prompt: str, schema: Dict[str, Any], temperature: float, stage: str, attempt: int = 1,
             num_ctx: Optional[int] = None, num_predict: Optional[int] = None,
             timeout: Optional[int] = None) -> Dict[str, Any]:
        num_ctx = num_ctx or self.num_ctx
        num_predict = num_predict or self.num_predict
        timeout = timeout or self.timeout

        payload = {
            "model": self.model, "prompt": prompt, "stream": False, "format": schema,
            "options": {"temperature": temperature, "seed": self.seed, "num_ctx": num_ctx,
                        "num_predict": num_predict, "repeat_penalty": 1.1, "repeat_last_n": 256},
        }
        request = urllib.request.Request(self.url, data=json.dumps(payload).encode("utf-8"),
                                         headers={"Content-Type": "application/json"}, method="POST")
        start = time.monotonic()
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                result = json.loads(response.read().decode("utf-8"))
        except (TimeoutError, socket.timeout) as e:
            self._record(stage, attempt, temperature, "timeout", time.monotonic() - start, num_ctx)
            raise TimeoutError(f"Ollama did not respond within {timeout}s") from e
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="replace")
            raise OllamaUnavailableError(f"Ollama returned HTTP {e.code}: {body[:500]}") from e
        except urllib.error.URLError as e:
            raise OllamaUnavailableError(
                f"Could not connect to Ollama at {self.url}. Is 'ollama serve' running and "
                f"'{self.model}' pulled? Details: {e}") from e

        elapsed = time.monotonic() - start
        status = "token_limit" if result.get("done_reason") == "length" else "ok"
        t = self._record(stage, attempt, temperature, status, elapsed, num_ctx, result)
        self.log.info(f"[{stage}] Ollama {elapsed:.1f}s | load {t['model_load_seconds']:.2f}s | "
                      f"prompt {t['prompt_eval_seconds']:.2f}s ({t['prompt_tokens']} tok) | "
                      f"gen {t['generation_seconds']:.2f}s ({t['output_tokens']} tok)")

        if status == "token_limit":
            raise RuntimeError("Output hit the token limit (num_predict)")
        text = result.get("response", "").strip()
        if not text:
            self.timings[-1]["status"] = "empty_response"
            raise RuntimeError("Ollama returned an empty response")
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            self.timings[-1]["status"] = "invalid_json"
            raise RuntimeError("Ollama did not return valid JSON: " + text[:300]) from e

    # ---------------- retries ----------------
    def generate(self, prompt: str, schema: Dict[str, Any], temperatures: List[float], stage: str,
                 num_predict: Optional[int] = None) -> Dict[str, Any]:
        """Retries on bad output; after a timeout retries ONCE with smaller context/output limits."""
        num_predict = num_predict or self.num_predict
        if len(prompt) > self.prompt_warn_chars:
            self.log.warning(f"[{stage}] prompt is {len(prompt)} chars; may exceed num_ctx={self.num_ctx}")

        last_error: Optional[Exception] = None
        fallback_used = False
        for attempt, temperature in enumerate(temperatures, start=1):
            try:
                return self.call(prompt, schema, temperature, stage, attempt, num_predict=num_predict)
            except TimeoutError as e:
                last_error = e
                if fallback_used:
                    raise RuntimeError("Ollama timed out again after the reduced-resource retry") from e
                fallback_used = True
                self.log.warning(f"[{stage}] timeout - retrying once with reduced context/output limits")
                try:
                    return self.call(prompt, schema, temperatures[0], stage, attempt,
                                     num_ctx=self.fallback_num_ctx,
                                     num_predict=min(self.fallback_num_predict, num_predict),
                                     timeout=self.fallback_timeout)
                except TimeoutError as e2:
                    raise RuntimeError("The reduced-resource request also timed out") from e2
            except OllamaUnavailableError:
                raise
            except RuntimeError as e:
                last_error = e
                self.log.warning(f"[{stage}] attempt {attempt} failed: {e}")
        raise RuntimeError(f"All {len(temperatures)} attempts failed. Last error: {last_error}")