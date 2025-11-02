from __future__ import annotations

import datetime as dt
from typing import List, Optional

from sqlmodel import Field, Relationship, SQLModel


class TaskEventModel(SQLModel, table=True):
  __tablename__ = "agent_task_events"

  id: str = Field(primary_key=True)
  task_id: str = Field(foreign_key="agent_tasks.id", index=True)
  mode: str
  status: str
  message: str
  timestamp: dt.datetime = Field(index=True)

  task: Optional["TaskModel"] = Relationship(back_populates="events")


class TaskModel(SQLModel, table=True):
  __tablename__ = "agent_tasks"

  id: str = Field(primary_key=True)
  status: str = Field(index=True)
  summary: Optional[str] = Field(default=None)
  plan: Optional[str] = Field(default=None)
  code_patch: Optional[str] = Field(default=None)
  fix_patch: Optional[str] = Field(default=None)
  sandbox_logs: Optional[str] = Field(default=None)
  created_at: dt.datetime = Field(default_factory=lambda: dt.datetime.utcnow().replace(tzinfo=dt.timezone.utc))
  updated_at: dt.datetime = Field(default_factory=lambda: dt.datetime.utcnow().replace(tzinfo=dt.timezone.utc), index=True)

  events: List[TaskEventModel] = Relationship(back_populates="task", sa_relationship_kwargs={"cascade": "all, delete-orphan"})
