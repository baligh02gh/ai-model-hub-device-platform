from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from database import Base


class Organization(Base):
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    invite_code = Column(String, unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="user")
    organization_id = Column(Integer, ForeignKey("organizations.id"), index=True, nullable=False)


class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    status = Column(String, default="offline")
    battery = Column(Float, nullable=True)
    rssi = Column(Integer, nullable=True)
    temperature = Column(Float, nullable=True)
    last_seen = Column(DateTime, nullable=True, default=None)
    organization_id = Column(Integer, ForeignKey("organizations.id"), index=True, nullable=False)


class AcademyProgress(Base):
    __tablename__ = "academy_progress"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    module_id = Column(String, nullable=False)
    completed_at = Column(DateTime, default=datetime.utcnow)


class AcademyModule(Base):
    __tablename__ = "academy_modules"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("organizations.id"), index=True, nullable=False)
    module_key = Column(String, nullable=False)
    title = Column(String, nullable=False)
    minutes = Column(Integer, nullable=False)
    summary = Column(String, nullable=False)
    sections_json = Column(Text, nullable=False)  # JSON: [{heading, paragraphs, code?}]
    takeaways_json = Column(Text, nullable=False)  # JSON: [string]
    position = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class AIModel(Base):
    __tablename__ = "models"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    filename = Column(String, nullable=False)
    sha256_hash = Column(String, nullable=False)
    file_size = Column(Integer, nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    organization_id = Column(Integer, ForeignKey("organizations.id"), index=True, nullable=False)