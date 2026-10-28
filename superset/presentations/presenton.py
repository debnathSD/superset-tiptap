# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
"""
Presenton Cloud (https://presenton.ai) as a deck designer.

Superset sends the brief and the charts' numbers; Presenton designs and
exports a PowerPoint deck. Generation runs as an async Presenton task the
browser polls through Superset, and finished decks are shown inside Superset
through Presenton's scoped, short-lived iframe URLs. The API key stays on the
server: the browser only ever sees task ids and embed URLs.
"""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any

import requests
from flask import current_app

from superset.presentations.ai import _fmt, GenerationError, summarize_chart

logger = logging.getLogger(__name__)

TASK_ID = re.compile(r"^task-[0-9a-f]{16,128}$")
PRESENTATION_ID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")

# Superset's deck tones, in Presenton's vocabulary.
TONES = {
    "executive": "professional",
    "analytical": "educational",
    "storytelling": "default",
    "casual": "casual",
}


def _key() -> str | None:
    return current_app.config.get("PRESENTON_API_KEY") or os.environ.get("PRESENTON_API_KEY") or None


def _base() -> str:
    return str(current_app.config.get("PRESENTON_API_URL") or "https://api.presenton.ai/api/v3").rstrip("/")


def presenton_status() -> dict[str, Any]:
    """Whether Presenton can be used, without revealing the key."""
    if not _key():
        return {"available": False, "reason": "missing_key"}
    return {"available": True, "reason": None}


def _call(method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
    key = _key()
    if not key:
        raise GenerationError("Presenton is not configured: set PRESENTON_API_KEY.", 503)
    try:
        response = requests.request(
            method,
            f"{_base()}{path}",
            json=body,
            headers={"Authorization": f"Bearer {key}"},
            timeout=current_app.config.get("PRESENTON_TIMEOUT", 60),
        )
    except requests.RequestException as ex:
        logger.warning("Presenton request failed: %s", type(ex).__name__)
        raise GenerationError("Could not reach Presenton. Try again in a moment.", 502) from ex
    if response.status_code == 401:
        raise GenerationError("Presenton rejected the API key (PRESENTON_API_KEY).", 502)
    if response.status_code == 402:
        raise GenerationError("The Presenton account is out of credits.", 402)
    if response.status_code == 429:
        raise GenerationError("Presenton is rate limiting requests. Try again shortly.", 429)
    if response.status_code >= 400:
        logger.warning("Presenton %s %s returned %s: %s", method, path, response.status_code, response.text[:300])
        raise GenerationError(f"Presenton could not complete the request ({response.status_code}).", 502)
    return response.json()


def _table(chart: dict[str, Any], max_rows: int) -> str:
    columns = [str(c) for c in chart.get("columns") or [] if not str(c).endswith("__contribution")]
    keep = [i for i, c in enumerate(chart.get("columns") or []) if not str(c).endswith("__contribution")]
    rows = (chart.get("rows") or [])[:max_rows]
    cell = lambda v: "" if v is None else str(v).replace("|", "/").replace("\n", " ")  # noqa: E731
    lines = ["| " + " | ".join(columns) + " |", "|" + "---|" * len(columns)]
    lines += ["| " + " | ".join(cell(row[i]) if i < len(row) else "" for i in keep) + " |" for row in rows]
    return "\n".join(lines)


def build_content(payload: dict[str, Any]) -> str:
    """The brief and every chart as Markdown tables with their key facts."""
    max_rows = current_app.config.get("PRESENTATIONS_AI_MAX_ROWS", 40)
    parts = [payload["brief"].strip()]
    if payload.get("audience"):
        parts.append(f"Audience: {payload['audience'].strip()}")
    parts.append("The data below comes from Apache Superset charts.")
    for chart in payload["charts"]:
        summary = summarize_chart(chart)
        facts = []
        for name, s in list(summary["stats"].items())[:4]:
            fact = f"- {name}: total {_fmt(s['total'])}, average {_fmt(s['mean'])}"
            if summary["label_column"] and s["max"] is not None:
                fact += f", highest {s['max_at']} ({_fmt(s['max'])}), lowest {s['min_at']} ({_fmt(s['min'])})"
            facts.append(fact)
        shown = min(len(chart.get("rows") or []), max_rows)
        header = f"## {chart['name']}"
        if chart.get("dataset"):
            header += f" (dataset: {chart['dataset']})"
        block = [header]
        if chart.get("description"):
            block.append(chart["description"])
        block.append(_table(chart, max_rows))
        if chart.get("row_count", 0) > shown:
            block.append(f"(first {shown} of {chart['row_count']} rows)")
        if facts:
            block.append("Key facts:\n" + "\n".join(facts))
        parts.append("\n\n".join(block))
    return "\n\n".join(parts)


INSTRUCTIONS = (
    "Build the deck only from the data provided. Quote numbers exactly as given and never invent "
    "figures, dates or names. Turn the tables into charts or tables where that helps the point, "
    "lead each slide with its takeaway, and end with clear next steps."
)


def start_generation(payload: dict[str, Any]) -> str:
    """Start an async Presenton generation; returns the task id."""
    body: dict[str, Any] = {
        "content": build_content(payload),
        "n_slides": payload.get("n_slides", 8),
        "instructions": INSTRUCTIONS,
        "tone": TONES.get(payload.get("tone", "executive"), "professional"),
        "language": "English",
        "export_as": "pptx",
        "include_title_slide": True,
        "web_search": False,
        "allow_access_to_user_info": False,
    }
    if template := current_app.config.get("PRESENTON_TEMPLATE"):
        body["standard_template"] = template
    task = _call("POST", "/presentation/generate/async", body)
    task_id = str(task.get("id") or "")
    if not TASK_ID.match(task_id):
        raise GenerationError("Presenton did not return a task.", 502)
    logger.info("Presenton generation started: %s", task_id)
    return task_id


def task_status(task_id: str) -> dict[str, Any]:
    """A generation task's state; on completion, the deck's id, file and editor links."""
    if not TASK_ID.match(task_id):
        raise GenerationError("Unknown task.", 404)
    task = _call("GET", f"/async-task/status/{task_id}")
    status = task.get("status") or "pending"
    result: dict[str, Any] = {"status": status, "message": str(task.get("message") or "")[:300]}
    if status == "completed":
        data = task.get("data") or {}
        presentation_id = str(data.get("presentation_id") or "")
        if not PRESENTATION_ID.match(presentation_id):
            raise GenerationError("Presenton finished without a presentation.", 502)
        result.update(
            presentation_id=presentation_id,
            file_url=data.get("path"),
            edit_url=data.get("edit_path"),
            credits=data.get("credits_consumed"),
        )
        logger.info("Presenton generation completed: %s (%s credits)", task_id, data.get("credits_consumed"))
    elif status == "error":
        error = task.get("error") or {}
        result["message"] = str(error.get("detail") or error.get("message") or result["message"] or "Generation failed")[:300]
    return result


def embed_url(presentation_id: str, can_edit: bool) -> dict[str, Any]:
    """A scoped, short-lived URL that shows (and for owners, edits) the deck in an iframe."""
    if not PRESENTATION_ID.match(presentation_id):
        raise GenerationError("Not a Presenton presentation.", 404)
    scopes = ["presentation:read", "presentation:export"]
    if can_edit:
        scopes.append("presentation:edit")
    hours = current_app.config.get("PRESENTON_EMBED_HOURS", 2)
    expires = datetime.now(timezone.utc) + timedelta(hours=hours)
    token = _call(
        "POST",
        "/presentation/integrate",
        {"presentation": presentation_id, "scopes": scopes, "expires_at": expires.isoformat()},
    )
    url = str(token.get("frontend_url") or "")
    if not url.startswith("https://"):
        raise GenerationError("Presenton did not return an embed link.", 502)
    return {"url": url, "expires_at": token.get("expires_at"), "can_edit": can_edit}
