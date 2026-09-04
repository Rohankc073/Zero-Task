from sqlalchemy import Column, String, Integer, Float, Boolean, ForeignKey, Text, JSON, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class Task(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "tasks"

    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="To Do", nullable=False, index=True)  # To Do, In Progress, Awaiting Review, Done
    priority = Column(String(50), default="Medium", nullable=False)           # Low, Medium, High
    due_date = Column(DateTime(timezone=True), nullable=True, index=True)

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    department_id = Column(UUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=True, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    parent_task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True, index=True)
    milestone_id = Column(UUID(as_uuid=True), nullable=True)

    progress = Column(Integer, default=0, nullable=False)
    execution_classification = Column(String(100), nullable=True)
    is_private = Column(Boolean, default=False, nullable=False)

    # Relationships
    company = relationship("Company", back_populates="tasks")
    assignee = relationship("User", foreign_keys=[user_id])
    creator = relationship("User", foreign_keys=[created_by])
    department = relationship("Department")
    parent = relationship("Task", remote_side="Task.id", backref="subtasks")
    assignees = relationship("TaskAssignee", back_populates="task", cascade="all, delete-orphan")
    files = relationship("TaskFile", back_populates="task", cascade="all, delete-orphan")
    attachments = relationship("TaskAttachment", back_populates="task", cascade="all, delete-orphan")
    voice_notes = relationship("TaskVoiceNote", back_populates="task", cascade="all, delete-orphan")
    comments = relationship("Comment", back_populates="task", cascade="all, delete-orphan")
    activity_comments = relationship("ActivityComment", back_populates="task", cascade="all, delete-orphan")
    activities = relationship("ExecutionActivity", back_populates="task", cascade="all, delete-orphan")


class TaskAssignee(Base):
    __tablename__ = "task_assignees"

    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)

    task = relationship("Task", back_populates="assignees")
    user = relationship("User")


class TaskFile(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "task_files"

    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    file_url = Column(Text, nullable=False)
    file_type = Column(String(100), nullable=True)
    file_name = Column(String(255), nullable=True)
    file_size = Column(Integer, nullable=True)
    mime_type = Column(String(100), nullable=True)
    storage_path = Column(Text, nullable=True)

    task = relationship("Task", back_populates="files")
    user = relationship("User")


class TaskAttachment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "task_attachments"

    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    file_name = Column(String(255), nullable=False)
    file_url = Column(Text, nullable=False)
    file_size = Column(Integer, nullable=True)
    file_type = Column(String(100), nullable=True)
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    task = relationship("Task", back_populates="attachments")
    uploader = relationship("User")


class TaskVoiceNote(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "task_voice_notes"

    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    creator_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    storage_path = Column(Text, nullable=False)
    display_name = Column(String(255), nullable=False)
    note_number = Column(Integer, default=1, nullable=False)
    duration_seconds = Column(Float, default=0.0, nullable=False)
    mime_type = Column(String(100), default="audio/m4a", nullable=False)
    file_size = Column(Integer, default=0, nullable=False)

    task = relationship("Task", back_populates="voice_notes")
    creator = relationship("User")


class TaskMilestone(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "task_milestones"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    milestone_type = Column(String(100), nullable=False)
    points = Column(Integer, default=0, nullable=False)

    user = relationship("User")


class Comment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "comments"

    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)

    task = relationship("Task", back_populates="comments")
    user = relationship("User")


class ActivityComment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "activity_comments"

    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)

    task = relationship("Task", back_populates="activity_comments")
    user = relationship("User")


class ExecutionActivity(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "execution_activity"

    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    milestone_id = Column(UUID(as_uuid=True), nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    event_type = Column(String(100), nullable=False)
    metadata_ = Column("metadata", JSON, nullable=True)

    task = relationship("Task", back_populates="activities")
    user = relationship("User")
