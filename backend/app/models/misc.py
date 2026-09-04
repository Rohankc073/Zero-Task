from sqlalchemy import Column, String, ForeignKey, Text, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class AuditLog(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "audit_logs"

    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True)
    action_type = Column(String(100), nullable=False)
    target_type = Column(String(100), nullable=True)
    target_id = Column(UUID(as_uuid=True), nullable=True)
    description = Column(Text, nullable=True)
    previous_state = Column(JSON, nullable=True)
    new_state = Column(JSON, nullable=True)

    company = relationship("Company")
    user = relationship("User")


class ActivityLog(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "activity_logs"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    action = Column(String(255), nullable=False)
    details = Column(JSON, nullable=True)

    user = relationship("User")


class SystemConfig(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "system_config"

    key = Column(String(100), unique=True, nullable=False)
    value = Column(JSON, nullable=True)
