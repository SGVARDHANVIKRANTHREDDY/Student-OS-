"""
Student-OS FAANG Engineering Evaluation Agent
==============================================
An AI agent that deep-reads the student-os codebase and produces
FAANG-level engineering discipline scores for both Frontend and Backend.

Disciplines scored (0-100 each, mirroring Google/Meta/Amazon L5-L6 bar):
  - Code Quality & Readability
  - Architecture & Design Patterns
  - Security
  - Performance & Scalability
  - Testing & Coverage
  - Error Handling & Resilience
  - API / Interface Design
  - State Management
  - Observability & Monitoring
  - DevOps / Build System

Run modes
---------
  HTTP server (default):  python agent.py --server
  CLI (one-shot):         python agent.py --cli

NOTE: Requires agent-framework-core==1.0.0b260107 (pinned - preview SDK)
"""

import argparse
import asyncio
import json
import os
import pathlib
import sys

from dotenv import load_dotenv

load_dotenv(override=True)

from agent_framework import ChatAgent  # noqa: E402
from agent_framework.azure import AzureOpenAIChatClient  # noqa: E402

try:
    from azure.ai.agentserver.agentframework import from_agent_framework
except ImportError:
    from_agent_framework = None  # type: ignore[assignment]

# --- Configuration ------------------------------------------------------------
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
EVAL_MODEL = os.environ.get("EVAL_MODEL", "openai/gpt-4.1")
WORKSPACE_ROOT = pathlib.Path(
    os.environ.get("WORKSPACE_ROOT", str(pathlib.Path(__file__).parent.parent))
)


# --- File-reading tools (the agent calls these) --------------------------------

def read_source_file(relative_path: str) -> str:
    """Read the content of a source file relative to the workspace root.

    Args:
        relative_path: Path relative to the workspace root, e.g. 'backend/server.js'

    Returns:
        File contents (first 12 KB), or an error message.
    """
    target = (WORKSPACE_ROOT / relative_path).resolve()
    if not str(target).startswith(str(WORKSPACE_ROOT.resolve())):
        return "[ERROR] Access denied: path outside workspace."
    if not target.exists():
        return f"[ERROR] File not found: {relative_path}"
    try:
        return target.read_text(encoding="utf-8", errors="replace")[:12_000]
    except Exception as exc:
        return f"[ERROR] Could not read file: {exc}"


def list_directory(relative_path: str = "") -> str:
    """List files and subdirectories at the given path inside the workspace.

    Args:
        relative_path: Path relative to the workspace root, e.g. 'backend/routes'

    Returns:
        JSON array of entries with 'name' and 'type' (file|dir).
    """
    target = (WORKSPACE_ROOT / relative_path).resolve()
    if not str(target).startswith(str(WORKSPACE_ROOT.resolve())):
        return "[ERROR] Access denied."
    if not target.exists():
        return f"[ERROR] Directory not found: {relative_path}"
    try:
        entries = [
            {"name": item.name, "type": "dir" if item.is_dir() else "file"}
            for item in sorted(target.iterdir())
        ]
        return json.dumps(entries)
    except Exception as exc:
        return f"[ERROR] {exc}"


# --- System prompt ------------------------------------------------------------
SYSTEM_PROMPT = (
    "You are a FAANG Principal Engineer (Google L6 / Meta E6 / Amazon L6) specialising in "
    "holistic code reviews. Evaluate the student-os codebase and produce SEPARATE, DETAILED "
    "engineering scores for the FRONTEND (React/Vite) and BACKEND (Node.js/Express/SQLite/BullMQ).\n\n"
    "## Evaluation Dimensions (score each 0-100)\n"
    "Score against the bar expected from a Senior/Staff engineer at Google, Meta, Amazon, "
    "Apple, Netflix, or Microsoft:\n"
    "1. Code Quality & Readability   - naming, structure, DRY, complexity, comments\n"
    "2. Architecture & Design        - separation of concerns, patterns, modularity, scalability\n"
    "3. Security                     - OWASP Top-10, secrets handling, input validation, auth\n"
    "4. Performance & Scalability    - caching, N+1, connection pooling, bundle size, lazy loading\n"
    "5. Testing & Coverage           - unit, integration, coverage breadth, test quality\n"
    "6. Error Handling & Resilience  - graceful errors, retries, circuit-breakers, fallback UX\n"
    "7. API / Interface Design       - REST conventions (backend) / component APIs (frontend)\n"
    "8. State Management             - React context/hooks (frontend) / queues/worker state (backend)\n"
    "9. Observability & Monitoring   - logging, metrics, tracing, error boundaries, alerting\n"
    "10. DevOps & Build System       - scripts, CI hints, build config, dependency hygiene\n\n"
    "## Grading Scale\n"
    " 90-100 => FAANG-ready (L5+): production-grade, minimal debt\n"
    " 75-89  => Strong (L4): solid but a few gaps\n"
    " 60-74  => Competent (L3): works but notable issues\n"
    " 40-59  => Needs Work: foundational problems\n"
    "  0-39  => Critical Issues: major rewrites needed\n\n"
    "## Instructions\n"
    "1. Use list_directory and read_source_file to sample at least 6 backend files and 6 frontend files.\n"
    "   Prioritise: server.js, middleware/, routes/auth.js, a few other routes, key lib/ files, workers/,\n"
    "   App.jsx, a few pages/components, context/AuthContext.jsx, lib/apiClient.js\n"
    "2. After reading, produce ONLY a single JSON object matching the schema below. No markdown.\n"
    "3. Be brutally honest. Base scores only on what you have actually read.\n\n"
    "## Output Schema (strict JSON, no markdown wrapping)\n"
    '{\n'
    '  "frontend": {\n'
    '    "overall": <int 0-100>,\n'
    '    "faang_level": "<L3|L4|L5|L6>",\n'
    '    "dimensions": {\n'
    '      "code_quality":             { "score": <int>, "summary": "<2-3 sentences>", "top_issues": ["..."], "top_strengths": ["..."] },\n'
    '      "architecture_design":      { "score": <int>, "summary": "...", "top_issues": [...], "top_strengths": [...] },\n'
    '      "security":                 { "score": <int>, "summary": "...", "top_issues": [...], "top_strengths": [...] },\n'
    '      "performance_scalability":  { "score": <int>, "summary": "...", "top_issues": [...], "top_strengths": [...] },\n'
    '      "testing_coverage":         { "score": <int>, "summary": "...", "top_issues": [...], "top_strengths": [...] },\n'
    '      "error_handling":           { "score": <int>, "summary": "...", "top_issues": [...], "top_strengths": [...] },\n'
    '      "api_interface_design":     { "score": <int>, "summary": "...", "top_issues": [...], "top_strengths": [...] },\n'
    '      "state_management":         { "score": <int>, "summary": "...", "top_issues": [...], "top_strengths": [...] },\n'
    '      "observability_monitoring": { "score": <int>, "summary": "...", "top_issues": [...], "top_strengths": [...] },\n'
    '      "devops_build":             { "score": <int>, "summary": "...", "top_issues": [...], "top_strengths": [...] }\n'
    '    },\n'
    '    "executive_summary": "<4-5 sentences overall verdict>",\n'
    '    "top_3_priorities": ["<action>", "<action>", "<action>"]\n'
    '  },\n'
    '  "backend": {\n'
    '    "overall": <int 0-100>,\n'
    '    "faang_level": "<L3|L4|L5|L6>",\n'
    '    "dimensions": { <same structure as frontend.dimensions> },\n'
    '    "executive_summary": "...",\n'
    '    "top_3_priorities": ["...", "...", "..."]\n'
    '  },\n'
    '  "combined_overall": <int 0-100>,\n'
    '  "combined_faang_level": "<L3|L4|L5|L6>",\n'
    '  "evaluation_notes": "<caveats about sampling coverage>"\n'
    '}'
)


# --- Build evaluation agent ---------------------------------------------------

def _build_agent() -> ChatAgent:
    """Create and return the evaluation ChatAgent backed by GitHub Models."""
    if not GITHUB_TOKEN:
        raise RuntimeError(
            "GITHUB_TOKEN is not set. Add it to eval/.env "
            "(get a free PAT at https://github.com/settings/tokens)"
        )
    chat_client = AzureOpenAIChatClient(
        api_key=GITHUB_TOKEN,
        base_url="https://models.github.ai/inference",
        deployment_name=EVAL_MODEL,
    )
    return ChatAgent(
        chat_client=chat_client,
        instructions=SYSTEM_PROMPT,
        tools=[read_source_file, list_directory],
    )


# --- CLI mode -----------------------------------------------------------------

async def _cli_main() -> None:
    agent = _build_agent()
    trigger = (
        "Please evaluate the student-os codebase. "
        "Use your tools to read both frontend and backend files, "
        "then output the full FAANG-level evaluation JSON."
    )
    print("\n  Scanning codebase - this may take 30-90 seconds...\n")
    result = await agent.run(trigger)
    raw = result.messages[-1].contents[-1].text if result.messages else "{}"

    try:
        data = json.loads(raw)
        _render_report(data)
    except json.JSONDecodeError:
        print(raw)


# --- Report renderer ----------------------------------------------------------

def _render_report(data: dict) -> None:
    bars = {"L6": "##########", "L5": "########--", "L4": "######----", "L3": "####------"}

    def score_bar(s: int) -> str:
        filled = round(s / 10)
        return "#" * filled + "-" * (10 - filled)

    def section(title: str, tier: dict) -> None:
        lvl = tier.get("faang_level", "?")
        overall = tier.get("overall", 0)
        print(f"\n{'=' * 72}")
        print(f"  {title}")
        print(f"  Overall: {overall}/100  [{score_bar(overall)}]  Level: {lvl} {bars.get(lvl, '')}")
        print(f"{'=' * 72}")
        for dim, ddata in tier.get("dimensions", {}).items():
            s = ddata.get("score", 0)
            print(f"\n  {dim.replace('_', ' ').title():<32} {s:>3}/100  [{score_bar(s)}]")
            print(f"    {ddata.get('summary', '')}")
            for issue in ddata.get("top_issues", []):
                print(f"      [!] {issue}")
            for strength in ddata.get("top_strengths", []):
                print(f"      [+] {strength}")
        print(f"\n{'-' * 72}")
        print(f"  Executive Summary:")
        print(f"  {tier.get('executive_summary', '')}")
        print(f"\n  Top 3 Priorities:")
        for i, p in enumerate(tier.get("top_3_priorities", []), 1):
            print(f"  {i}. {p}")

    print("\n")
    print("+" + "=" * 70 + "+")
    print("|   STUDENT-OS  -  FAANG Engineering Evaluation Report" + " " * 16 + "|")
    combined = data.get("combined_overall", 0)
    clvl = data.get("combined_faang_level", "?")
    line = f"|   Combined Score: {combined}/100  Level: {clvl}  {bars.get(clvl, '')}"
    print(line + " " * (71 - len(line)) + "|")
    print("+" + "=" * 70 + "+")

    if "frontend" in data:
        section("FRONTEND  (React / Vite)", data["frontend"])
    if "backend" in data:
        section("BACKEND   (Node.js / Express / SQLite / BullMQ)", data["backend"])

    notes = data.get("evaluation_notes", "")
    if notes:
        print(f"\n  Notes: {notes}")
    print()


# --- Entry point --------------------------------------------------------------

async def main() -> None:
    parser = argparse.ArgumentParser(description="Student-OS FAANG Evaluation Agent")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--server", action="store_true", help="Run as HTTP server (default)")
    group.add_argument("--cli", action="store_true", help="Run CLI one-shot evaluation")
    args = parser.parse_args()

    if args.cli:
        await _cli_main()
        return

    # Default: HTTP server mode
    if from_agent_framework is None:
        print("[ERROR] azure-ai-agentserver-agentframework is not installed.")
        sys.exit(1)

    agent = _build_agent()
    print("FAANG Evaluation Agent - HTTP server starting on port 8087")
    print("  Chat with the agent to trigger an evaluation.")
    await from_agent_framework(agent).run_async()


if __name__ == "__main__":
    asyncio.run(main())
