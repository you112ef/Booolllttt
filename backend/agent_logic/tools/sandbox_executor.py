"""Sandbox executor for running agent-generated code inside isolated Docker containers.

This module provides a small abstraction for executing shell commands with resource
constraints. It mirrors the "Act" + "Observe" phases of the Kilo-inspired loop by
returning stdout/stderr/exit codes for downstream Debugger agents.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Sequence


SANDBOX_IMAGE_NAME = "opendevagent-python"
DEFAULT_TEMPLATE_PATH = Path(__file__).resolve().parents[2] / ".." / "sandbox_templates"


@dataclass
class SandboxFile:
  """Representation of a file that must exist inside the sandbox before execution."""

  path: str
  content: str


@dataclass
class SandboxExecutionResult:
  """Result payload produced after running commands inside the sandbox."""

  commands: Sequence[str]
  succeeded: bool
  exit_code: int
  stdout: str
  stderr: str
  runtime_seconds: float | None = None
  note: str | None = None


class SandboxExecutor:
  """Runs terminal commands inside a Docker sandbox with strict isolation."""

  def __init__(self, template_dir: Path | None = None, image_name: str = SANDBOX_IMAGE_NAME):
    self.template_dir = Path(template_dir) if template_dir else DEFAULT_TEMPLATE_PATH.resolve()
    self.image_name = image_name

  def ensure_image(self) -> None:
    """Builds the sandbox image if it doesn't exist yet."""

    if shutil.which("docker") is None:
      raise RuntimeError("Docker CLI is not available on this host; sandboxing is disabled.")

    inspect = subprocess.run(
      ["docker", "image", "inspect", self.image_name],
      stdout=subprocess.DEVNULL,
      stderr=subprocess.DEVNULL,
      check=False,
    )
    if inspect.returncode == 0:
      return

    dockerfile = self.template_dir / "Dockerfile.python"
    if not dockerfile.exists():
      raise FileNotFoundError(f"Dockerfile template not found at {dockerfile}")

    build = subprocess.run(
      [
        "docker",
        "build",
        "-t",
        self.image_name,
        "-f",
        str(dockerfile),
        str(self.template_dir),
      ],
      stdout=subprocess.PIPE,
      stderr=subprocess.PIPE,
      text=True,
      check=False,
    )
    if build.returncode != 0:
      raise RuntimeError(
        "Failed to build sandbox image",
        build.stderr,
      )

  def execute(
    self,
    commands: Iterable[str],
    files: Iterable[SandboxFile] | None = None,
    workdir: str = "/workspace",
    timeout_seconds: int = 60,
  ) -> SandboxExecutionResult:
    """Run commands inside the sandbox and capture their output."""

    command_sequence = list(commands)
    if not command_sequence:
      raise ValueError("At least one command must be provided to the sandbox executor.")

    if shutil.which("docker") is None:
      # Fall back to local execution to keep prototypes runnable without Docker.
      return self._execute_without_docker(command_sequence, files, timeout_seconds)

    self.ensure_image()

    with tempfile.TemporaryDirectory() as tmp_dir:
      tmp_path = Path(tmp_dir)

      if files:
        self._materialize_files(tmp_path, files)

      docker_command = [
        "docker",
        "run",
        "--rm",
        "--network",
        "none",
        "--memory",
        "2g",
        "--cpus",
        "2",
        "--pids-limit",
        "256",
        "-v",
        f"{tmp_path}:{workdir}",
        self.image_name,
        "bash",
        "-lc",
        " && ".join(command_sequence),
      ]

      completed = subprocess.run(
        docker_command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=timeout_seconds,
        check=False,
      )

      stdout = completed.stdout or ""
      stderr = completed.stderr or ""

      return SandboxExecutionResult(
        commands=command_sequence,
        succeeded=completed.returncode == 0,
        exit_code=completed.returncode,
        stdout=stdout,
        stderr=stderr,
      )

  def _materialize_files(self, root: Path, files: Iterable[SandboxFile]) -> None:
    for file in files:
      destination = root / file.path
      destination.parent.mkdir(parents=True, exist_ok=True)
      destination.write_text(file.content, encoding="utf-8")

  def _execute_without_docker(
    self,
    commands: Sequence[str],
    files: Iterable[SandboxFile] | None,
    timeout_seconds: int,
  ) -> SandboxExecutionResult:
    """Local execution fallback used when Docker is unavailable (for dev/testing)."""

    with tempfile.TemporaryDirectory() as tmp_dir:
      tmp_path = Path(tmp_dir)

      if files:
        self._materialize_files(tmp_path, files)

      env = os.environ.copy()
      env["PYTHONPATH"] = f"{tmp_path}:{env.get('PYTHONPATH', '')}"

      joined_command = " && ".join(commands)
      completed = subprocess.run(
        joined_command,
        cwd=tmp_path,
        shell=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=timeout_seconds,
        check=False,
        env=env,
      )

      note = (
        "Docker niet gevonden; commando lokaal uitgevoerd. Voor volledige isolatie Docker installeren."
      )

      return SandboxExecutionResult(
        commands=commands,
        succeeded=completed.returncode == 0,
        exit_code=completed.returncode,
        stdout=completed.stdout or "",
        stderr=completed.stderr or "",
        note=note,
      )


__all__ = [
  "SandboxExecutor",
  "SandboxExecutionResult",
  "SandboxFile",
]
