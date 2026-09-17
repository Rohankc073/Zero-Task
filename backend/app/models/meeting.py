from sqlalchemy import Column, String, Boolean, ForeignKey, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class Meeting(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "meetings"

    title = Column(String(255), nullable=False)
    agenda = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    start_time = Column(DateTime(timezone=True), nullable=False, index=True)
    end_time = Column(DateTime(timezone=True), nullable=False)
    organizer_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)

    meeting_link = Column(Text, nullable=True)
    status = Column(String(50), default="Scheduled", nullable=False)  # Scheduled, Completed, Cancelled
    is_private = Column(Boolean, default=False, nullable=False)

    @property
    def meeting_url(self):
        return self.meeting_link

    company = relationship("Company", back_populates="meetings")
    organizer = relationship("User")
    project = relationship("Project")
    participants = relationship("MeetingParticipant", back_populates="meeting", cascade="all, delete-orphan")
    files = relationship("MeetingFile", back_populates="meeting", cascade="all, delete-orphan")
    attachments = relationship("MeetingAttachment", back_populates="meeting", cascade="all, delete-orphan")
    approvals = relationship("MeetingApproval", back_populates="meeting", cascade="all, delete-orphan")


class MeetingParticipant(Base):
    __tablename__ = "meeting_participants"

    meeting_id = Column(UUID(as_uuid=True), ForeignKey("meetings.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role = Column(String(50), default="attendee", nullable=True)
    status = Column(String(50), default="accepted", nullable=True)

    meeting = relationship("Meeting", back_populates="participants")
    user = relationship("User")


class MeetingFile(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "meeting_files"

    meeting_id = Column(UUID(as_uuid=True), ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    file_url = Column(Text, nullable=False)
    file_name = Column(String(255), nullable=True)
    file_type = Column(String(100), nullable=True)

    meeting = relationship("Meeting", back_populates="files")
    user = relationship("User")


class MeetingAttachment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "meeting_attachments"

    meeting_id = Column(UUID(as_uuid=True), ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    file_url = Column(Text, nullable=False)
    file_name = Column(String(255), nullable=True)
    file_type = Column(String(100), nullable=True)

    meeting = relationship("Meeting", back_populates="attachments")
    user = relationship("User")


class MeetingRequest(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "meeting_requests"

    requester_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    agenda = Column(Text, nullable=True)
    preferred_times = Column(Text, nullable=True)
    status = Column(String(50), default="Pending", nullable=False)

    requester = relationship("User")


class MeetingApproval(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "meeting_approvals"

    meeting_id = Column(UUID(as_uuid=True), ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    approver_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    requester_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(50), default="Pending", nullable=False)  # Pending, Approved, Rejected
    decision_reason = Column(Text, nullable=True)

    meeting = relationship("Meeting", back_populates="approvals")
    approver = relationship("User", foreign_keys=[approver_id])
    requester = relationship("User", foreign_keys=[requester_id])
