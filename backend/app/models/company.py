from sqlalchemy import Column, String
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class Company(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "companies"

    name = Column(String(255), nullable=False)
    code = Column(String(50), nullable=True, unique=True)
    industry = Column(String(100), nullable=True)
    status = Column(String(50), default="Active", nullable=False)  # Active, Inactive, Suspended

    # Relationships
    users = relationship("User", back_populates="company", cascade="all, delete-orphan")
    departments = relationship("Department", back_populates="company", cascade="all, delete-orphan")
    designations = relationship("Designation", back_populates="company", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="company", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="company", cascade="all, delete-orphan")
    meetings = relationship("Meeting", back_populates="company", cascade="all, delete-orphan")
    chat_channels = relationship("ChatChannel", back_populates="company", cascade="all, delete-orphan")
