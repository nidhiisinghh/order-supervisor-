import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field

# Supervisor Schemas
class SupervisorBase(BaseModel):
    name: str
    base_instruction: str
    default_wakeup_behavior: Optional[str] = None
    model_choice: str = "llama-3.1-70b-versatile"
    aggressiveness: str = "medium"

class SupervisorCreate(SupervisorBase):
    pass

class SupervisorResponse(SupervisorBase):
    id: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True

# Run Schemas
class RunCreate(BaseModel):
    supervisor_id: uuid.UUID
    order_id: str
    initial_instructions: Optional[str] = None

class RunResponse(BaseModel):
    id: str
    supervisor_id: uuid.UUID
    order_id: str
    status: str
    memory_summary: Optional[str] = ""
    next_wakeup_time: Optional[datetime] = None
    final_summary: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Activity Schemas
class ActivityResponse(BaseModel):
    id: uuid.UUID
    run_id: str
    type: str
    name: str
    payload: Optional[Dict[str, Any]] = None
    timestamp: datetime

    class Config:
        from_attributes = True

# Event Input Schema (Simulator)
class EventInput(BaseModel):
    name: str
    payload: Optional[Dict[str, Any]] = Field(default_factory=dict)

# Instruction Input Schema (Run modifications)
class InstructionInput(BaseModel):
    text: str
