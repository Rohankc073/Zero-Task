from sqlalchemy import Column, String, Boolean, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class Notification(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "notifications"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    type = Column(String(50), nullable=True)

    user = relationship("User")


class InAppNotification(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "in_app_notifications"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=True)
    body = Column(Text, nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    type = Column(String(50), nullable=True)

    user = relationship("User")


class SystemAlert(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "system_alerts"

    department_id = Column(UUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True)
    message = Column(Text, nullable=False)
    type = Column(String(50), default="System", nullable=False)

    department = relationship("Department")
