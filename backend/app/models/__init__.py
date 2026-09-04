from app.core.database import Base
from app.models.base import UUIDMixin, TimestampMixin
from app.models.company import Company
from app.models.user import (
    Department,
    Designation,
    User,
    UserCredential,
    UserRefreshToken,
    UserPushToken,
    UserIntegration,
    UserNote,
)
from app.models.task import (
    Task,
    TaskAssignee,
    TaskFile,
    TaskAttachment,
    TaskVoiceNote,
    TaskMilestone,
    Comment,
    ActivityComment,
    ExecutionActivity,
)
from app.models.project import (
    Project,
    ProjectMember,
    ProjectMilestone,
    DepartmentMilestone,
)
from app.models.meeting import (
    Meeting,
    MeetingParticipant,
    MeetingFile,
    MeetingAttachment,
    MeetingRequest,
    MeetingApproval,
)
from app.models.chat import (
    ChatChannel,
    ChatMessage,
)
from app.models.notification import (
    Notification,
    InAppNotification,
    SystemAlert,
)
from app.models.approval import (
    Approval,
    RegistrationRequest,
    PasswordReset,
    PhoneChangeRequest,
)
from app.models.misc import (
    AuditLog,
    ActivityLog,
    SystemConfig,
)

__all__ = [
    "Base",
    "UUIDMixin",
    "TimestampMixin",
    "Company",
    "Department",
    "Designation",
    "User",
    "UserCredential",
    "UserRefreshToken",
    "UserPushToken",
    "UserIntegration",
    "UserNote",
    "Task",
    "TaskAssignee",
    "TaskFile",
    "TaskAttachment",
    "TaskVoiceNote",
    "TaskMilestone",
    "Comment",
    "ActivityComment",
    "ExecutionActivity",
    "Project",
    "ProjectMember",
    "ProjectMilestone",
    "DepartmentMilestone",
    "Meeting",
    "MeetingParticipant",
    "MeetingFile",
    "MeetingAttachment",
    "MeetingRequest",
    "MeetingApproval",
    "ChatChannel",
    "ChatMessage",
    "Notification",
    "InAppNotification",
    "SystemAlert",
    "Approval",
    "RegistrationRequest",
    "PasswordReset",
    "PhoneChangeRequest",
    "AuditLog",
    "ActivityLog",
    "SystemConfig",
]
