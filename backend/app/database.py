import uuid
from datetime import datetime
from sqlalchemy import create_engine, Column, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from app.config import DATABASE_URL

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Supervisor(Base):
    __tablename__ = "supervisors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    base_instruction = Column(Text, nullable=False)
    default_wakeup_behavior = Column(Text, nullable=True)
    model_choice = Column(String(100), nullable=False, default="llama-3.1-70b-versatile")
    aggressiveness = Column(String(50), nullable=False, default="medium")
    created_at = Column(DateTime, default=datetime.utcnow)

    runs = relationship("Run", back_populates="supervisor", cascade="all, delete-orphan")

class Run(Base):
    __tablename__ = "runs"

    id = Column(String(255), primary_key=True)  # Matches Temporal Workflow ID
    supervisor_id = Column(UUID(as_uuid=True), ForeignKey("supervisors.id"), nullable=False)
    order_id = Column(String(255), nullable=False)
    status = Column(String(50), nullable=False, default="active")  # active, paused, completed, terminated
    memory_summary = Column(Text, nullable=True, default="")
    next_wakeup_time = Column(DateTime, nullable=True)
    final_summary = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    supervisor = relationship("Supervisor", back_populates="runs")
    activities = relationship("Activity", back_populates="run", cascade="all, delete-orphan")

class Activity(Base):
    __tablename__ = "activities"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(String(255), ForeignKey("runs.id"), nullable=False)
    type = Column(String(50), nullable=False)  # system_event, classifier_decision, agent_reasoning, tool_execution, manual_instruction, status_change
    name = Column(String(255), nullable=False)  # e.g., payment_failed, message_customer
    payload = Column(JSON, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    run = relationship("Run", back_populates="activities")

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
