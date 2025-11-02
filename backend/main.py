from __future__ import annotations

import asyncio
import dataclasses
import datetime as dt
import uuid
from threading import RLock
from typing import Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from agent_logic.software_engineer_crew import SoftwareEngineerCrew, TaskEvent, TaskSnapshot


class TaskSubmission(BaseModel):
  api_key: str = Field(..., min_length=10, description="OpenRouter API key van de gebruiker")
  feature_description: str = Field(..., min_length=5)
  target_language: str = Field(..., min_length=2)


class TaskStatusResponse(BaseModel):
  task_id: str
  status: str
  summary: str | None = None
  plan: str | None = None
  code_patch: str | None = None
  fix_patch: str | None = None
  sandbox_logs: str | None = None
  history: list[dict]
  created_at: str
  updated_at: str


class TaskManager:
  def __init__(self) -> None:
    self._tasks: Dict[str, TaskSnapshot] = {}
    self._lock = RLock()

  def create_task(self, task_id: str) -> TaskSnapshot:
    snapshot = TaskSnapshot(task_id=task_id, status="queued")
    with self._lock:
      self._tasks[task_id] = snapshot
    return snapshot

  def update_task(self, snapshot: TaskSnapshot) -> None:
    with self._lock:
      self._tasks[snapshot.task_id] = snapshot

  def get_task(self, task_id: str) -> TaskSnapshot:
    with self._lock:
      if task_id not in self._tasks:
        raise KeyError(task_id)
      return self._tasks[task_id]

  def serialize(self, task_id: str) -> TaskStatusResponse:
    with self._lock:
      if task_id not in self._tasks:
        raise KeyError(task_id)
      data = dataclasses.asdict(self._tasks[task_id])
    return TaskStatusResponse(**data)


task_manager = TaskManager()

app = FastAPI(
  title="OpenDevAgent Kilo-Inspired Orchestrator",
  description="FastAPI backend dat multi-agent planning, sandbox executie en debugging beheert.",
  version="0.1.0",
)

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)


@app.post("/api/submit_task")
async def submit_task(payload: TaskSubmission):
  task_id = str(uuid.uuid4())
  snapshot = task_manager.create_task(task_id)

  async def orchestrate() -> None:
    crew = SoftwareEngineerCrew(api_key=payload.api_key)

    def handle_update(updated_snapshot: TaskSnapshot) -> None:
      task_manager.update_task(updated_snapshot)

    try:
      await asyncio.to_thread(
        crew.run_task,
        snapshot,
        payload.feature_description,
        payload.target_language,
        handle_update,
      )
    except Exception as exc:  # noqa: BLE001
      snapshot.status = "failed"
      snapshot.history.append(
        TaskEvent(
          id=str(uuid.uuid4()),
          mode="debugger",
          status="failed",
          message=f"Taak beeindigd door fout: {exc}",
          timestamp=dt.datetime.utcnow().isoformat() + "Z",
        )
      )
      task_manager.update_task(snapshot)

  asyncio.create_task(orchestrate())

  return {"task_id": task_id}


@app.get("/api/task_status/{task_id}", response_model=TaskStatusResponse)
async def task_status(task_id: str):
  try:
    return task_manager.serialize(task_id)
  except KeyError as exc:
    raise HTTPException(status_code=404, detail=f"Taak {task_id} niet gevonden") from exc


@app.get("/health")
async def healthcheck():
  return {"status": "ok"}
