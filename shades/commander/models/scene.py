# /commander/models/scene.py

from pydantic import BaseModel, Field, validator
from typing import List, Optional, Literal
from datetime import datetime

class SceneCommand(BaseModel):
    """Individual command within a scene"""
    shade_id: int = Field(..., description="Shade to command", gt=0)
    action: Literal['u', 'd', 's'] = Field(..., description="Action: u=up, d=down, s=stop")
    delay_ms: int = Field(1000, description="Delay after this command in milliseconds", ge=0)
    
    class Config:
        json_schema_extra = {
            "example": {
                "shade_id": 14,
                "action": "u",
                "delay_ms": 1000
            }
        }
    
    @validator('action')
    def validate_action(cls, v):
        if v not in ['u', 'd', 's']:
            raise ValueError('Action must be u (up), d (down), or s (stop)')
        return v.lower()

class SceneDefinition(BaseModel):
    """Complete scene definition"""
    name: str = Field(..., description="Human-readable scene name")
    description: str = Field(..., description="What this scene does")
    commands: List[SceneCommand] = Field(..., description="List of commands to execute")
    retry_count: int = Field(2, description="Number of times to retry failed commands", ge=0, le=5)
    timeout_seconds: int = Field(30, description="Total timeout for scene execution", ge=1, le=300)
    
    @validator('commands')
    def validate_commands(cls, v):
        if not v:
            raise ValueError('Scene must have at least one command')
        return v

class SceneListItem(BaseModel):
    """Scene item for listing scenes"""
    name: str = Field(..., description="Scene name/identifier")
    display_name: str = Field(..., description="Human-readable scene name")
    description: str = Field(..., description="What this scene does")
    command_count: int = Field(..., description="Number of commands in this scene")
    
    class Config:
        json_schema_extra = {
            "example": {
                "name": "good_night",
                "display_name": "Good Night",
                "description": "Lower all privacy shades for nighttime",
                "command_count": 2
            }
        }

class ScenesListResponse(BaseModel):
    """Response for listing all scenes"""
    success: bool = Field(True, description="Request success status")
    count: int = Field(..., description="Number of scenes available")
    scenes: List[SceneListItem] = Field(..., description="List of available scenes")

class SceneExecutionResult(BaseModel):
    """Result of executing a single command in a scene"""
    shade_id: int = Field(..., description="Shade that was commanded")
    action: str = Field(..., description="Action that was attempted")
    success: bool = Field(..., description="Whether this command succeeded")
    message: str = Field(..., description="Result message")
    execution_time_ms: int = Field(..., description="Time taken for this command")
    retry_attempt: int = Field(0, description="Which retry attempt this was (0 = first try)")

class SceneExecutionResponse(BaseModel):
    """Response for scene execution"""
    success: bool = Field(..., description="Whether the entire scene succeeded")
    scene_name: str = Field(..., description="Name of the scene that was executed")
    message: str = Field(..., description="Overall result message")
    total_execution_time_ms: int = Field(..., description="Total time for scene execution")
    commands_executed: int = Field(..., description="Number of commands that were executed")
    commands_successful: int = Field(..., description="Number of commands that succeeded")
    results: List[SceneExecutionResult] = Field(..., description="Detailed results for each command")
    timestamp: datetime = Field(default_factory=datetime.now, description="When scene was executed")
    task_id: Optional[str] = Field(None, description="Background task ID for tracking execution")

class SceneExecutionRequest(BaseModel):
    """Optional parameters for scene execution"""
    override_retry_count: Optional[int] = Field(None, description="Override default retry count", ge=0, le=10)
    override_timeout: Optional[int] = Field(None, description="Override default timeout", ge=1, le=600)
    dry_run: bool = Field(False, description="Preview what would be executed without sending commands")
    
    class Config:
        json_schema_extra = {
            "example": {
                "override_retry_count": 3,
                "override_timeout": 45,
                "dry_run": False
            }
        }

class SceneDetailResponse(BaseModel):
    """Detailed scene information"""
    success: bool = Field(True, description="Request success status")
    scene: SceneDefinition = Field(..., description="Complete scene definition")
    estimated_execution_time_ms: int = Field(..., description="Estimated time to execute this scene")
