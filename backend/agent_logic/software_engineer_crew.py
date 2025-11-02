"""Kilo-inspired multi-agent orchestrator for the OpenDevAgent prototype."""

from __future__ import annotations

import datetime as dt
import textwrap
import uuid
from dataclasses import dataclass, field
from typing import Callable, Dict, Iterable, List, Literal, Optional

from openai import OpenAI

from .tools.sandbox_executor import SandboxExecutor, SandboxExecutionResult, SandboxFile


AgentMode = Literal["architect", "coder", "observer", "debugger"]
TaskLifecycle = Literal["queued", "planning", "coding", "observing", "debugging", "completed", "failed"]
FALLBACK_MODEL = "meta-llama/llama-3.1-70b"


ARCHITECT_SYSTEM_PROMPT = textwrap.dedent(
  """
  Je bent de Architect Agent binnen een Kilo-geinspireerd engineering-team. Analyseer de
  gewenste feature en produceer een concreet plan met:
  - stap-voor-stap aanpak
  - afhankelijkheden / tooling
  - validatiecriteria (tests, linters, e2e)
  Houd rekening met het bestaande project en beperkingen.
  Retourneer het plan als duidelijke markdown met genummerde stappen.
  """
).strip()

CODER_SYSTEM_PROMPT = textwrap.dedent(
  """
  Je bent de Coder Agent. Gebruik het Architect-plan om code aan te leveren. Geef een
  compacte patch of bestandsinhoud terug in een fenced code block (met taal). Focus op de
  belangrijkste bestanden die nodig zijn om de feature te bouwen. Leg kort uit hoe de code
  de stappen van het plan implementeert.
  """
).strip()

DEBUGGER_SYSTEM_PROMPT = textwrap.dedent(
  """
  Je bent de Debugger Agent. Analyseer sandbox logs en fouten, en geef een patch of
  verbeterde instructies zodat de taak kan worden afgerond. Geef het antwoord als tekst met
  duidelijke aanpassingen of extra tests.
  """
).strip()


@dataclass
class TaskEvent:
  id: str
  mode: AgentMode
  status: Literal["pending", "running", "completed", "failed"]
  message: str
  timestamp: str


@dataclass
class TaskSnapshot:
  task_id: str
  status: TaskLifecycle
  summary: Optional[str] = None
  plan: Optional[str] = None
  code_patch: Optional[str] = None
  fix_patch: Optional[str] = None
  sandbox_logs: Optional[str] = None
  history: List[TaskEvent] = field(default_factory=list)
  created_at: str = field(default_factory=lambda: dt.datetime.utcnow().isoformat() + "Z")
  updated_at: str = field(default_factory=lambda: dt.datetime.utcnow().isoformat() + "Z")


class SoftwareEngineerCrew:
  """Multi-agent orchestrator implementing the Plan-Act-Observe-Fix loop."""

  def __init__(self, api_key: str, base_url: str = "https://openrouter.ai/api/v1") -> None:
    if not api_key:
      raise ValueError("OpenRouter API key is vereist voor het initialiseren van de crew.")

    self.client = OpenAI(api_key=api_key, base_url=base_url)

  def run_task(
    self,
    snapshot: TaskSnapshot,
    feature_description: str,
    target_language: str,
    on_update: Callable[[TaskSnapshot], None],
  ) -> TaskSnapshot:
    """Execute the full agentic loop and emit updates after each phase."""

    def emit(mode: AgentMode, status: Literal["running", "completed", "failed"], message: str, **updates: str | None) -> None:
      snapshot.history.append(
        TaskEvent(
          id=str(uuid.uuid4()),
          mode=mode,
          status=status,
          message=message,
          timestamp=dt.datetime.utcnow().isoformat() + "Z",
        )
      )
      for key, value in updates.items():
        setattr(snapshot, key, value)
      snapshot.updated_at = dt.datetime.utcnow().isoformat() + "Z"
      on_update(snapshot)

    try:
      # Architect phase
      snapshot.status = "planning"
      emit("architect", "running", "Architect agent start met het opstellen van een plan.")
      plan = self._call_model(
        model="openai/gpt-4o",
        system_prompt=ARCHITECT_SYSTEM_PROMPT,
        user_prompt=f"Feature omschrijving:\n{feature_description}\n\nDoeltaal/framework: {target_language}",
      )
      summary = plan.splitlines()[0] if plan else "Plan opgesteld"
      emit("architect", "completed", "Plan afgerond.", plan=plan, summary=summary, status="coding")

      # Coder phase
      emit("coder", "running", "Coder agent genereert implementatie.")
      coder_prompt = textwrap.dedent(
        f"""
        Gebruik het onderstaande plan om de gevraagde functionaliteit te implementeren.
        Focus op bestanden en code die noodzakelijk zijn voor een prototype.

        --- Architect plan ---
        {plan}
        """
      ).strip()
      code_patch = self._call_model(
        model="mistral/codestral-22b",
        system_prompt=CODER_SYSTEM_PROMPT,
        user_prompt=coder_prompt,
      )
      emit("coder", "completed", "Implementatie gegenereerd.", code_patch=code_patch, status="observing")

      # Sandbox execution
      emit("observer", "running", "Sandbox executor voert tests uit.")
      sandbox_result = self._run_sandbox(code_patch, target_language)
      sandbox_message = (
        "Sandbox voltooid zonder fouten." if sandbox_result.succeeded else "Sandbox meldde fouten - debugger wordt geactiveerd."
      )
      emit(
        "observer",
        "completed" if sandbox_result.succeeded else "failed",
        sandbox_message,
        sandbox_logs=self._format_sandbox_logs(sandbox_result),
        status="completed" if sandbox_result.succeeded else "debugging",
      )

      if sandbox_result.succeeded:
        return snapshot

      # Debugger phase
      emit("debugger", "running", "Debugger analyseert sandbox logs.")
      debugger_prompt = textwrap.dedent(
        f"""
        Architect plan:
        {plan}

        Coder output:
        {code_patch}

        Sandbox logs:
        {sandbox_result.stdout}\n{sandbox_result.stderr}
        """
      ).strip()
      fix_patch = self._call_model(
        model="anthropic/claude-3-5-sonnet",
        system_prompt=DEBUGGER_SYSTEM_PROMPT,
        user_prompt=debugger_prompt,
      )
      emit("debugger", "completed", "Debugger stelde verbeteringen voor.", fix_patch=fix_patch)
      snapshot.status = "failed"
      on_update(snapshot)
      return snapshot

    except Exception as exc:  # noqa: BLE001
      snapshot.status = "failed"
      emit("debugger", "failed", f"Onverwachte fout: {exc}")
      return snapshot

  def _call_model(self, model: str, system_prompt: str, user_prompt: str) -> str:
    last_error: Exception | None = None
    models = [model] + ([FALLBACK_MODEL] if model != FALLBACK_MODEL else [])

    for candidate in models:
      try:
        response = self.client.responses.create(
          model=candidate,
          max_output_tokens=1600,
          temperature=0.2,
          input=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
          ],
        )
        if hasattr(response, "output_text"):
          text = getattr(response, "output_text") or ""
          if text:
            return text.strip()
        # Fallback for older SDKs
        chunks: List[str] = []
        for item in getattr(response, "output", []) or []:
          text_segments = getattr(item, "content", [])
          if isinstance(text_segments, list):
            chunks.extend(segment.text for segment in text_segments if hasattr(segment, "text"))
        combined = "\n".join(chunks).strip()
        if combined:
          return combined
      except Exception as exc:  # noqa: BLE001
        last_error = exc
        continue

    return f"[LLM-call mislukt: {last_error}]"

  def _run_sandbox(self, code_patch: str | None, target_language: str) -> SandboxExecutionResult:
    executor = SandboxExecutor()

    files: List[SandboxFile] = []
    commands: List[str] = []

    if target_language.lower().startswith("python"):
      files.append(
        SandboxFile(
          path="main.py",
          content=self._extract_code_block(code_patch, fallback_language="python"),
        )
      )
      commands = ["python -m compileall ."]
    elif target_language.lower().startswith("typescript"):
      files.append(
        SandboxFile(
          path="index.ts",
          content=self._extract_code_block(code_patch, fallback_language="typescript"),
        )
      )
      commands = ["npx --yes tsx index.ts"]
    else:
      files.append(
        SandboxFile(
          path="snippet.txt",
          content=self._extract_code_block(code_patch, fallback_language="text"),
        )
      )
      commands = ["cat snippet.txt"]

    return executor.execute(commands=commands, files=files)

  def _extract_code_block(self, content: str | None, fallback_language: str) -> str:
    if not content:
      return f"# Geen code ontvangen van de Coder agent. ({fallback_language})"

    lines = content.splitlines()
    extracted: List[str] = []
    inside_block = False
    for line in lines:
      if line.strip().startswith("```"):
        if inside_block:
          break
        inside_block = True
        continue
      if inside_block:
        extracted.append(line)

    if extracted:
      return "\n".join(extracted)
    return content

  def _format_sandbox_logs(self, result: SandboxExecutionResult) -> str:
    output = ["$ " + " && ".join(result.commands), ""]
    if result.stdout:
      output.append(result.stdout)
    if result.stderr:
      output.append("[stderr]")
      output.append(result.stderr)
    if result.note:
      output.append("[note]")
      output.append(result.note)
    output.append(f"Exit code: {result.exit_code}")
    return "\n".join(output).strip()


__all__ = [
  "AgentMode",
  "SoftwareEngineerCrew",
  "TaskEvent",
  "TaskLifecycle",
  "TaskSnapshot",
]
