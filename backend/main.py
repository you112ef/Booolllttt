from __future__ import annotations

import asyncio
import datetime as dt
import uuid
from threading import RLock
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlmodel import select

from agent_logic.software_engineer_crew import SoftwareEngineerCrew, TaskEvent, TaskSnapshot
from database import get_session, init_db
from models import TaskEventModel, TaskModel


class TaskSubmission(BaseModel):
  api_key: str = Field(..., min_length=10, description="OpenRouter API key van de gebruiker")
  feature_description: str = Field(..., min_length=5)
  target_language: str = Field(..., min_length=2)


class TaskEventPayload(BaseModel):
  id: str
  mode: str
  status: str
  message: str
  timestamp: str


class TaskStatusResponse(BaseModel):
  task_id: str
  status: str
  summary: str | None = None
  plan: str | None = None
  code_patch: str | None = None
  fix_patch: str | None = None
  sandbox_logs: str | None = None
  history: List[TaskEventPayload]
  created_at: str
  updated_at: str


def _iso_to_datetime(value: str) -> dt.datetime:
  if value.endswith("Z"):
    value = value[:-1] + "+00:00"
  return dt.datetime.fromisoformat(value)


def _datetime_to_iso(value: dt.datetime) -> str:
  if value.tzinfo is None:
    value = value.replace(tzinfo=dt.timezone.utc)
  else:
    value = value.astimezone(dt.timezone.utc)
  return value.isoformat().replace("+00:00", "Z")


def _utc_now_iso() -> str:
  return _datetime_to_iso(dt.datetime.utcnow().replace(tzinfo=dt.timezone.utc))


class TaskManager:
  def __init__(self) -> None:
    self._lock = RLock()

  def create_task(self, task_id: str) -> TaskSnapshot:
    snapshot = TaskSnapshot(task_id=task_id, status="queued")
    self._persist_snapshot(snapshot)
    return snapshot

  def update_task(self, snapshot: TaskSnapshot) -> None:
    self._persist_snapshot(snapshot)

  def _persist_snapshot(self, snapshot: TaskSnapshot) -> None:
    with self._lock:
      with get_session() as session:
        task = session.get(TaskModel, snapshot.task_id)
        if task is None:
          task = TaskModel(
            id=snapshot.task_id,
            status=snapshot.status,
            summary=snapshot.summary,
            plan=snapshot.plan,
            code_patch=snapshot.code_patch,
            fix_patch=snapshot.fix_patch,
            sandbox_logs=snapshot.sandbox_logs,
            created_at=_iso_to_datetime(snapshot.created_at),
            updated_at=_iso_to_datetime(snapshot.updated_at),
          )
        else:
          task.status = snapshot.status
          task.summary = snapshot.summary
          task.plan = snapshot.plan
          task.code_patch = snapshot.code_patch
          task.fix_patch = snapshot.fix_patch
          task.sandbox_logs = snapshot.sandbox_logs
          task.updated_at = _iso_to_datetime(snapshot.updated_at)

        session.add(task)

        existing_event_ids = set(
          session.exec(
            select(TaskEventModel.id).where(TaskEventModel.task_id == snapshot.task_id)
          ).all()
        )

        for event in snapshot.history:
          if event.id in existing_event_ids:
            continue
          session.add(
            TaskEventModel(
              id=event.id,
              task_id=snapshot.task_id,
              mode=event.mode,
              status=event.status,
              message=event.message,
              timestamp=_iso_to_datetime(event.timestamp),
            )
          )

        session.commit()

  def serialize(self, task_id: str) -> TaskStatusResponse:
    with get_session() as session:
      task = session.get(TaskModel, task_id)
      if task is None:
        raise KeyError(task_id)

      events = session.exec(
        select(TaskEventModel).where(TaskEventModel.task_id == task_id).order_by(TaskEventModel.timestamp.desc())
      ).all()

    return TaskStatusResponse(
      task_id=task.id,
      status=task.status,
      summary=task.summary,
      plan=task.plan,
      code_patch=task.code_patch,
      fix_patch=task.fix_patch,
      sandbox_logs=task.sandbox_logs,
      history=[
        TaskEventPayload(
          id=event.id,
          mode=event.mode,
          status=event.status,
          message=event.message,
          timestamp=_datetime_to_iso(event.timestamp),
        )
        for event in events
      ],
      created_at=_datetime_to_iso(task.created_at),
      updated_at=_datetime_to_iso(task.updated_at),
    )


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


@app.on_event("startup")
def on_startup() -> None:
  init_db()


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
          timestamp=_utc_now_iso(),
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
