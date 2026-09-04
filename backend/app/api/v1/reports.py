import json
from typing import List, Dict, Any, Optional
from uuid import UUID
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.task import Task
from app.schemas.report import (
    EmployeeMetricsResponse,
    ManagerProjectMetric,
    TeamWorkloadMetric,
)

router = APIRouter()


@router.get("/employee-metrics", response_model=EmployeeMetricsResponse)
async def get_employee_metrics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        res = await db.execute(
            text("SELECT public.get_employee_dashboard_metrics(:u_id)"),
            {"u_id": str(current_user.id)},
        )
        val = res.scalar()
        if val:
            data = val if isinstance(val, dict) else json.loads(val)
            return EmployeeMetricsResponse(
                total_open_tasks=data.get("total_open_tasks", 0),
                tasks_due_this_week=data.get("tasks_due_this_week", 0),
                completion_percentage=float(data.get("completion_percentage", 0.0)),
            )
    except Exception:
        await db.rollback()

    # Fallback SQLAlchemy query
    now = datetime.now(timezone.utc)
    week_end = now + timedelta(days=7)

    open_res = await db.execute(
        select(func.count()).select_from(Task).where(Task.user_id == current_user.id, Task.status != "Done")
    )
    total_open = open_res.scalar() or 0

    due_res = await db.execute(
        select(func.count()).select_from(Task).where(
            Task.user_id == current_user.id,
            Task.status != "Done",
            Task.due_date >= now,
            Task.due_date <= week_end,
        )
    )
    due_week = due_res.scalar() or 0

    all_res = await db.execute(
        select(func.count()).select_from(Task).where(Task.user_id == current_user.id)
    )
    all_count = all_res.scalar() or 0

    done_res = await db.execute(
        select(func.count()).select_from(Task).where(Task.user_id == current_user.id, Task.status == "Done")
    )
    done_count = done_res.scalar() or 0

    pct = (done_count / all_count * 100.0) if all_count > 0 else 0.0

    return EmployeeMetricsResponse(
        total_open_tasks=total_open,
        tasks_due_this_week=due_week,
        completion_percentage=round(pct, 1),
    )


@router.get("/manager-analytics")
async def get_manager_analytics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        res = await db.execute(text("SELECT public.get_manager_project_analytics()"))
        val = res.scalar()
        if val:
            return val if isinstance(val, (dict, list)) else json.loads(val)
    except Exception:
        await db.rollback()

    return {"status": "success", "analytics": []}


@router.get("/team-workload")
async def get_team_workload(
    department_id: Optional[UUID] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    target_dept = department_id or current_user.department_id
    if not target_dept:
        return []

    try:
        now = datetime.now(timezone.utc)
        start = now - timedelta(days=30)
        end = now + timedelta(days=30)
        res = await db.execute(
            text("SELECT public.get_team_workload(:dept, :start, :end)"),
            {"dept": str(target_dept), "start": start, "end": end},
        )
        val = res.scalar()
        if val:
            return val if isinstance(val, list) else json.loads(val)
    except Exception:
        await db.rollback()

    return []
