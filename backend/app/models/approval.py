from sqlalchemy import Column, String, ForeignKey, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class Approval(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "approvals"

    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    requester_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    approver_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(50), default="pending", nullable=False)
    comments = Column(Text, nullable=True)

    task = relationship("Task")
    requester = relationship("User", foreign_keys=[requester_id])
    approver = relationship("User", foreign_keys=[approver_id])


class RegistrationRequest(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "registration_requests"

    email = Column(String(255), nullable=False, index=True)
    requested_role = Column(String(50), nullable=False)
    status = Column(String(50), default="Pending", nullable=False)  # Pending, Approved, Rejected
    rejected_at = Column(DateTime(timezone=True), nullable=True)


class PasswordReset(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "password_resets"

    email = Column(String(255), nullable=False, index=True)
    requester_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approver_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=True, index=True)
    status = Column(String(50), default="Pending", nullable=False)  # Pending, Approved, Completed, Rejected, Expired
    temp_password = Column(String(255), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    requester = relationship("User", foreign_keys=[requester_id])
    approver = relationship("User", foreign_keys=[approver_id])
    company = relationship("Company", foreign_keys=[company_id])


class PhoneChangeRequest(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "phone_change_requests"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    new_phone = Column(String(50), nullable=False)
    old_phone = Column(String(50), nullable=True)
    status = Column(String(50), default="Pending", nullable=False)
    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", foreign_keys=[user_id])
