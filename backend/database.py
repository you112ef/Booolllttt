from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Iterator

from sqlmodel import Session, SQLModel, create_engine


DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./opendevagent.db")

engine = create_engine(DATABASE_URL, echo=False, pool_pre_ping=True)


def init_db() -> None:
  # Import models so SQLModel is aware of tables before creating them.
  from . import models  # noqa: F401

  SQLModel.metadata.create_all(engine)


@contextmanager
def get_session() -> Iterator[Session]:
  with Session(engine) as session:
    yield session
