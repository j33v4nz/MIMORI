#!/usr/bin/env python3
"""MIMORI Laya Inference Service.

Experimental classifier microservice for MIMORI telemetry; its findings do not block agent actions.
Listens on port 5050 by default (matching MIMORI configuration in app/lib/detection/laya.ts and sdk/mimori/guardrail.py).

Implements:
  - POST /v1/classify: Accepts { input, options, context }, returns { choice, scores, metadata: { category, severity } }
  - GET /health: Health and model status

Inference Engine:
  - If a user-provided fine-tuned checkpoint is present, attempts inference through Laya Router/Agent.
  - Otherwise, uses built-in pattern heuristics. These are not a semantic classifier and are not
    evaluated as an independent benchmark. Service availability and scores are not a safety guarantee.
"""

import sys
import os
import json
import time
import re
import argparse
import hashlib
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Dict, Any, Tuple


# Pattern heuristics for MIMORI's example telemetry categories.
PATTERNS = {
    "instruction_override": [
        re.compile(r"(ignore|disregard|forget|override|bypass)\s+(all\s+)?(previous|prior|above|system)\s+(instructions|prompts?|rules?)", re.I),
        re.compile(r"(--- END OF SYSTEM PROMPT ---|<system>.*?suspended)", re.I),
        re.compile(r"(stop execution|switch mode to administrative override)", re.I)
    ],
    "jailbreak_persona": [
        re.compile(r"\b(DAN|do anything now|developer mode|STAN|unfiltered AI)\b", re.I),
        re.compile(r"(act as an unrestricted|pretend to be.*without limitations)", re.I),
        re.compile(r"(hypothetically.*zero ethical boundaries|bypass all security protocols)", re.I)
    ],
    "system_prompt_extraction": [
        re.compile(r"(reveal|print|show|repeat|dump|leak).*(system prompt|hidden instructions|scratchpad|directives)", re.I),
        re.compile(r"(what (are|was) your (confidential|initial|developer) (instructions|prompt))", re.I)
    ],
    "encoding_evasion": [
        re.compile(r"(decode.*base64|base64.*decode|hex.*decode|rot13|atob\s*\()", re.I),
        re.compile(r"([A-Za-z0-9+/]{30,}={0,2})", re.I),  # Base64 pattern
        re.compile(r"(\\x[0-9a-fA-F]{2}){4,}|([0-9a-fA-F]{20,})", re.I),  # Hex pattern
        re.compile(r"[\u0400-\u04FF].*?(?:ign|ovr|byp)", re.I),  # Homoglyphs
        re.compile(r"1gn0r3|4ll|pr3v10u5", re.I)  # Leet speak
    ],
    "excessive_agency": [
        re.compile(r"(curl|wget)\b[^|\n]{0,2000}\|\s*(sh|bash|zsh|python)", re.I),
        re.compile(r"(python3?\s+-c\b.{0,200}?os\.system|subprocess\.(Popen|call|run))", re.I),
        re.compile(r"(rm\s+-rf\s+(/|~|\*)|killall\s+-9)", re.I),
        re.compile(r"(delete|transfer|drop).*(without asking|without confirmation|without approval)", re.I)
    ],
    "data_exfiltration": [
        re.compile(r"(AKIA[0-9A-Z]{16}|aws_secret_access_key)", re.I),
        re.compile(r"(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,})", re.I),
        re.compile(r"(xox[bpas]-[A-Za-z0-9\-]{10,}|sk-(proj|ant)-[A-Za-z0-9_\-]{20,})", re.I),
        re.compile(r"(/etc/shadow|/etc/passwd|-----BEGIN [A-Z ]*PRIVATE KEY-----)", re.I)
    ],
    "threat": [
        re.compile(r"\b(UNION\s+SELECT|DROP\s+TABLE|OR\s+1=1|WAITFOR\s+DELAY|BENCHMARK\s*\(|SLEEP\s*\()", re.I),
        re.compile(r"\b(169\.254\.169\.254|metadata\.google\.internal|localhost:2375|0x7f000001|2130706433)\b", re.I),
        re.compile(r"(;\s*(rm -rf|curl|wget|nc -e|bash -i))", re.I)
    ]
}


class LayaModelRunner:
    """Uses an optional supplied Laya checkpoint or built-in pattern heuristics."""

    def __init__(self, model_path: str = "scripts/laya/checkpoint", require_model: bool = False):
        self.task_schema = None
        schema_path = os.path.join(model_path, "task-schema.json")
        if os.path.exists(schema_path):
            from task_schema import SCHEMA_VERSION, TASK_QUESTIONS
            with open(schema_path) as schema_file:
                self.task_schema = json.load(schema_file)
            if self.task_schema != {"version": SCHEMA_VERSION, "questions": TASK_QUESTIONS}:
                raise ValueError("Unsupported task-response checkpoint schema")
            require_model = True
        self.require_model = require_model
        self.model_path = model_path
        weights_path = os.path.join(model_path, "model.safetensors")
        self.model_sha256 = None
        if os.path.exists(weights_path):
            with open(weights_path, "rb") as weights:
                self.model_sha256 = hashlib.file_digest(weights, "sha256").hexdigest()
        self.router = None
        self.is_loaded = False
        self._init_model()
        if require_model and not self.is_loaded:
            raise RuntimeError("Required Laya checkpoint could not be loaded; refusing heuristic fallback")

    def _init_model(self):
        try:
            if os.path.exists(os.path.join(self.model_path, "model.safetensors")):
                from laya import Router
                print(f"[*] Loading fine-tuned Laya model from {self.model_path}...")
                self.router = Router(
                    models={"english": self.model_path},
                    default="english",
                    max_loaded=1,
                )
                self.router.preload(["english"])
                self.is_loaded = True
                print("[+] Fine-tuned Laya model loaded successfully!")
            else:
                print(f"[*] Fine-tuned checkpoint not found at {self.model_path}. Using the built-in pattern heuristic fallback.")
        except Exception as e:
            print(f"[!] Could not load Laya model ({e}). Falling back to System 1 heuristic engine.")
            self.is_loaded = False

    def classify(self, text: str, *, user_request: str = "", tool_name: str = "") -> Dict[str, Any]:
        """Classify input text and return structured verdict, scores, and metadata."""
        t0 = time.perf_counter()
        if self.task_schema:
            from task_schema import task_state
            state = task_state(text, user_request, tool_name)
            questions = self.task_schema["questions"]

        # 1. Fine-tuned Laya route (if model checkpoint is available)
        if self.is_loaded and self.router:
            try:
                # Match the training questions and state exactly.
                try:
                    from dataset_generator import LAYA_QUESTIONS
                except ImportError:
                    from scripts.laya.dataset_generator import LAYA_QUESTIONS
                if not self.task_schema:
                    questions = {k: LAYA_QUESTIONS[k] for k in ("verdict", "category")}
                    state = {"input": text, "domain": "ai_agent_security", "telemetry_type": "event_payload"}
                else:
                    # A short encoder cannot silently discard the injected tail.
                    from laya.common import build_sequence
                    agent = self.router.load("english")
                    for question in questions.values():
                        _, _, stats = build_sequence(agent.tok, state,
                            {"t": question["type"], "ins": question["instructions"], "crit": question["criteria"]},
                            agent.cfg.get("max_len", 512), agent.cfg.get("head_max_len", 192), return_truncation_stats=True)
                        if stats["truncated"]:
                            raise RuntimeError("Task-aware input exceeds the encoder context")
                res = self.router.predict(state, questions, model="english")
                choice = res["answers"]["verdict"]["choice"]
                answer = res["answers"]["verdict"]
                scores = answer.get("probabilities", answer.get("scores"))
                if not isinstance(scores, dict) or not all(
                    label in scores for label in ("benign", "suspicious", "malicious")
                ):
                    raise ValueError("Laya verdict is missing option probabilities")
                category = res["answers"].get("category", {"choice": "other"})["choice"]
                if category == "none":
                    category = "other"

                latency_ms = (time.perf_counter() - t0) * 1000
                return {
                    "choice": choice,
                    "scores": scores,
                    "metadata": {
                        "category": category,
                        "latency_ms": round(latency_ms, 2),
                        "engine": "laya_finetuned",
                        "model_sha256": self.model_sha256,
                        "task_context_used": self.task_schema is not None,
                        "task_schema_version": self.task_schema["version"] if self.task_schema else None,
                        "state_truncated": False if self.task_schema else None
                    }
                }
            except Exception as e:
                if self.require_model:
                    raise RuntimeError("Required Laya inference failed") from e
                print(f"[!] Laya inference failed: {e}. Falling back to heuristic.")

        # 2. Fast System 1 Heuristic Engine
        detected_category = None
        for cat, patterns in PATTERNS.items():
            for p in patterns:
                if p.search(text):
                    detected_category = cat
                    break
            if detected_category:
                break

        latency_ms = (time.perf_counter() - t0) * 1000

        if detected_category:
            # Pattern match result; the returned score is a routing value, not calibration.
            return {
                "choice": "malicious",
                "scores": {
                    "benign": 0.02,
                    "suspicious": 0.06,
                    "malicious": 0.92
                },
                "metadata": {
                    "category": detected_category,
                    "latency_ms": round(latency_ms, 2),
                    "engine": "system1_heuristic"
                }
            }

        # Check for suspicious ambiguity
        suspicious_words = ["hypothetical", "simulate", "hack", "bypass", "unfiltered", "admin", "debug mode"]
        if any(w in text.lower() for w in suspicious_words):
            return {
                "choice": "suspicious",
                "scores": {
                    "benign": 0.15,
                    "suspicious": 0.75,
                    "malicious": 0.10
                },
                "metadata": {
                    "category": "other",
                    "latency_ms": round(latency_ms, 2),
                    "engine": "system1_heuristic"
                }
            }

        # Benign
        return {
            "choice": "benign",
            "scores": {
                "benign": 0.96,
                "suspicious": 0.03,
                "malicious": 0.01
            },
            "metadata": {
                "category": "other",
                "latency_ms": round(latency_ms, 2),
                "engine": "system1_heuristic"
            }
        }


# Global model runner instance
MODEL_RUNNER = None


class LayaRequestHandler(BaseHTTPRequestHandler):
    """HTTP Request Handler for MIMORI Laya Service."""

    def log_message(self, format, *args):
        # Override to suppress default noisy logging, print only errors
        if args and str(args[1]) >= "400":
            sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), format % args))

    def _send_json(self, status: int, data: Dict[str, Any]):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self):
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return None, "Invalid Content-Length"
        if content_length <= 0:
            return None, "Empty request body"
        if content_length > 1_000_000:
            return None, "Request body exceeds 1000000 bytes"
        try:
            return json.loads(self.rfile.read(content_length).decode("utf-8")), None
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None, "Invalid JSON"

    def do_GET(self):
        if self.path in ("/health", "/v1/health", "/"):
            self._send_json(200, {
                "status": "healthy",
                "service": "mimori-laya-classifier",
                "layer": "1.5",
                "loaded_model": MODEL_RUNNER.is_loaded,
                "engine": "laya_finetuned" if MODEL_RUNNER.is_loaded else "system1_heuristic",
                "model_sha256": getattr(MODEL_RUNNER, "model_sha256", None),
                "task_schema_version": MODEL_RUNNER.task_schema["version"] if getattr(MODEL_RUNNER, "task_schema", None) else None
            })
        else:
            self._send_json(404, {"error": "Not found"})

    def do_POST(self):
        if self.path in ("/v1/classify", "/classify"):
            payload, error = self._read_json_body()
            if error:
                status = 413 if error.startswith("Request body exceeds") else 400
                self._send_json(status, {"error": error})
                return
            if not isinstance(payload, dict):
                self._send_json(400, {"error": "JSON body must be an object"})
                return

            text = payload.get("input", "")
            if not isinstance(text, str):
                text = str(text)

            try:
                if "original_user_request" in payload or getattr(MODEL_RUNNER, "task_schema", None):
                    result = MODEL_RUNNER.classify(text, user_request=payload.get("original_user_request", ""), tool_name=payload.get("tool_name", ""))
                else:
                    result = MODEL_RUNNER.classify(text)
            except ValueError:
                self._send_json(400, {"error": "Invalid task-response context"})
                return
            except RuntimeError:
                self._send_json(503, {"error": "Required model inference unavailable"})
                return
            self._send_json(200, result)

        elif self.path in ("/predict", "/v1/predict"):
            # Laya native predict route
            payload, error = self._read_json_body()
            if error:
                status = 413 if error.startswith("Request body exceeds") else 400
                self._send_json(status, {"error": error})
                return
            if not isinstance(payload, dict):
                self._send_json(400, {"error": "JSON body must be an object"})
                return
            text = str(payload.get("state", ""))

            try:
                result = MODEL_RUNNER.classify(text)
            except ValueError:
                self._send_json(400, {"error": "Invalid task-response context"})
                return
            except RuntimeError:
                self._send_json(503, {"error": "Required model inference unavailable"})
                return
            self._send_json(200, {
                "answers": {
                    "verdict": {"choice": result["choice"], "scores": result["scores"]},
                    "category": {"choice": result["metadata"]["category"]}
                }
            })
        else:
            self._send_json(404, {"error": f"Path {self.path} not supported"})


def main():
    global MODEL_RUNNER
    parser = argparse.ArgumentParser(description="Run MIMORI Laya Inference Service")
    parser.add_argument("--port", type=int, default=5050, help="Port to listen on (default: 5050)")
    parser.add_argument("--host", default="127.0.0.1", help="Host address (default: loopback; service has no authentication)")
    parser.add_argument("--model-path", default="scripts/laya/checkpoint", help="Path to fine-tuned Laya checkpoint")
    parser.add_argument("--require-model", action="store_true", help="Refuse startup/inference fallback when a checkpoint is required")
    parser.add_argument("--threads", type=int, default=4, help="CPU inference threads")
    args = parser.parse_args()

    if args.threads <= 0:
        parser.error("threads must be positive")
    if os.path.exists(os.path.join(args.model_path, "model.safetensors")):
        import torch
        torch.set_num_threads(args.threads)

    MODEL_RUNNER = LayaModelRunner(model_path=args.model_path, require_model=args.require_model)
    server_address = (args.host, args.port)
    httpd = HTTPServer(server_address, LayaRequestHandler)

    print("=" * 65)
    print(f"[*] MIMORI Laya Service running at http://{args.host}:{args.port}")
    print(f"    Endpoint   : POST /v1/classify")
    print(f"    Health     : GET /health")
    print(f"    Engine     : {'Laya ModernBERT' if MODEL_RUNNER.is_loaded else 'System 1 Fast Heuristic'}")
    print("=" * 65)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Shutting down Laya service...")
        httpd.server_close()


if __name__ == "__main__":
    main()
