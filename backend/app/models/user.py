from sqlalchemy import Column, String, Boolean, ForeignKey, Text, JSON, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class Department(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "departments"

    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=True, index=True)

    company = relationship("Company", back_populates="departments")
    users = relationship("User", back_populates="department")


class Designation(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "designations"

    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=True, index=True)
    base_role = Column(String(50), nullable=False, default="Employee")

    company = relationship("Company", back_populates="designations")
    users = relationship("User", back_populates="designation")


class User(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "users"

    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=True)
    full_name = Column(String(255), nullable=True)
    role = Column(String(50), default="Employee", nullable=False, index=True)
    # Roles: Super Admin, Founder, Department Head, Manager, Employee, Execution Team

    department_id = Column(UUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True)
    designation_id = Column(UUID(as_uuid=True), ForeignKey("designations.id", ondelete="SET NULL"), nullable=True, index=True)
    company_id = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="CASCADE"), nullable=True, index=True)

    phone_number = Column(String(50), nullable=True)
    avatar_url = Column(Text, nullable=True)
    expo_push_token = Column(String(255), nullable=True)

    is_approved = Column(Boolean, default=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)
    onboarding_completed = Column(Boolean, default=True, nullable=False)

    organization_name = Column(String(255), nullable=True)
    subscription_status = Column(String(50), default="active", nullable=True)
    preferences = Column(JSON, nullable=True)

    # Relationships
    company = relationship("Company", back_populates="users")
    department = relationship("Department", back_populates="users")
    designation = relationship("Designation", back_populates="users")
    credentials = relationship("UserCredential", back_populates="user", uselist=False, cascade="all, delete-orphan")
    refresh_tokens = relationship("UserRefreshToken", back_populates="user", cascade="all, delete-orphan")
    push_tokens = relationship("UserPushToken", back_populates="user", cascade="all, delete-orphan")
    integrations = relationship("UserIntegration", back_populates="user", uselist=False, cascade="all, delete-orphan")
    notes = relationship("UserNote", back_populates="user", cascade="all, delete-orphan")


class UserCredential(Base, TimestampMixin):
    """Stores password hashes for FastAPI native authentication."""
    __tablename__ = "user_credentials"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    password_hash = Column(String(255), nullable=False)

    user = relationship("User", back_populates="credentials")


class UserRefreshToken(Base, UUIDMixin, TimestampMixin):
    """Stores active and rotated refresh tokens."""
    __tablename__ = "user_refresh_tokens"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(255), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    device_info = Column(String(255), nullable=True)

    user = relationship("User", back_populates="refresh_tokens")


class UserPushToken(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "user_push_tokens"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token = Column(String(255), nullable=False, unique=True)
    device_id = Column(String(255), nullable=True)
    platform = Column(String(50), nullable=True)

    user = relationship("User", back_populates="push_tokens")


class UserIntegration(Base, TimestampMixin):
    __tablename__ = "user_integrations"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    gcal_access_token = Column(Text, nullable=True)
    gcal_refresh_token = Column(Text, nullable=True)
    token_expires_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="integrations")


class UserNote(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "user_notes"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=True)

    user = relationship("User", back_populates="notes")
