from fastapi import APIRouter
from app.api.v1 import (
    auth,
    users,
    tasks,
    meetings,
    chat,
    notifications,
    approvals,
    projects,
    reports,
    storage,
    superadmin,
    integrations,
    sync,
    notes,
)

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
api_router.include_router(users.router, prefix="/users", tags=["Users"])
api_router.include_router(tasks.router, prefix="/tasks", tags=["Tasks"])
api_router.include_router(meetings.router, prefix="/meetings", tags=["Meetings"])
api_router.include_router(chat.router, prefix="/chat", tags=["Chat"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["Notifications"])
api_router.include_router(approvals.router, prefix="/approvals", tags=["Approvals"])
api_router.include_router(projects.router, prefix="/projects", tags=["Projects"])
api_router.include_router(reports.router, prefix="/reports", tags=["Reports"])
api_router.include_router(storage.router, prefix="/storage", tags=["Storage"])
api_router.include_router(superadmin.router, prefix="/superadmin", tags=["SuperAdmin"])
api_router.include_router(integrations.router, prefix="/integrations", tags=["Integrations"])
api_router.include_router(sync.router, prefix="/sync", tags=["OfflineSync"])
api_router.include_router(notes.router, prefix="/notes", tags=["Notes"])
