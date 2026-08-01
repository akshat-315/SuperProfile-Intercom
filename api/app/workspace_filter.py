from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar, Token

from sqlalchemy import event
from sqlalchemy.orm import ORMExecuteState, Session, with_loader_criteria

from app.logging import get_logger
from app.models.base import WorkspaceOwned

log = get_logger(__name__)

_ALL = -1

_active: ContextVar[int | None] = ContextVar("active_workspace_id", default=None)
_reason: ContextVar[str | None] = ContextVar("all_workspaces_reason", default=None)


class NoActiveWorkspace(RuntimeError):
    pass


def active_workspace_id() -> int | None:
    value = _active.get()
    return None if value == _ALL else value


def require_workspace_id() -> int:
    workspace_id = active_workspace_id()
    if workspace_id is None:
        raise NoActiveWorkspace(
            "a workspace-owned row was created with no active workspace. "
            "Add the sign-in dependency, or enter use_workspace()."
        )
    return workspace_id


@contextmanager
def use_workspace(workspace_id: int) -> Iterator[None]:
    token = _active.set(workspace_id)
    try:
        yield
    finally:
        _active.reset(token)


@contextmanager
def all_workspaces(*, reason: str) -> Iterator[None]:
    active_token: Token[int | None] = _active.set(_ALL)
    reason_token: Token[str | None] = _reason.set(reason)
    try:
        yield
    finally:
        _reason.reset(reason_token)
        _active.reset(active_token)


def _owned_tables(state: ORMExecuteState) -> list[type[WorkspaceOwned]]:
    return [
        mapper.class_ for mapper in state.all_mappers if issubclass(mapper.class_, WorkspaceOwned)
    ]


@event.listens_for(Session, "do_orm_execute")
def _apply_filter(state: ORMExecuteState) -> None:
    if state.is_column_load or state.is_relationship_load or state.is_insert:
        return

    tables = _owned_tables(state)
    if not tables:
        return

    workspace_id = _active.get()

    if workspace_id == _ALL:
        log.debug(
            "query.all_workspaces",
            reason=_reason.get(),
            tables=[table.__tablename__ for table in tables],  # type: ignore[attr-defined]
        )
        return

    if workspace_id is None:
        names = ", ".join(table.__name__ for table in tables)
        raise NoActiveWorkspace(
            f"query touched {names} with no active workspace. "
            "Add the sign-in dependency, or wrap a deliberate cross-workspace "
            "read in all_workspaces(reason=...)."
        )

    for table in tables:
        state.statement = state.statement.options(
            with_loader_criteria(
                table,
                table.workspace_filter(workspace_id),
                include_aliases=True,
            )
        )
