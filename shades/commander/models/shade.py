# /commander/models/shade.py

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

class ShadeAction(str, Enum):
    """Valid shade actions"""
    UP = "u"
    DOWN = "d"
    STOP = "s"

class ShadeCommand(BaseModel):
    """Command to send to a shade (stateless - just transmit the signal!)"""
    action: ShadeAction = Field(..., description="Action to perform: u=up, d=down, s=stop")

    class Config:
        extra = 'forbid'  # Reject unknown fields like 'position' with 422
        json_schema_extra = {
            "example": {
                "action": "u"
            }
        }

class ShadeResponse(BaseModel):
    """Response from a shade command - only confirms transmission, not actual shade movement!"""
    success: bool = Field(..., description="Whether the command was transmitted successfully")
    message: str = Field(..., description="Human readable transmission result")
    shade_id: int = Field(..., description="ID of the shade we transmitted to")
    action: str = Field(..., description="Action that was transmitted")
    execution_time_ms: int = Field(..., description="Time taken to transmit command in milliseconds")
    timestamp: str = Field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f"), description="When command was transmitted (local time)")
    arduino_response: Optional[str] = Field(None, description="Raw Arduino response for debugging")
    
    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "message": "UP command transmitted to Shade 14",  # Stateless messaging!
                "shade_id": 14,
                "action": "u",
                "execution_time_ms": 1250,
                "timestamp": "2025-05-25T14:30:00Z",
                "arduino_response": "TX_OK: 5C2D0D39|FEFF|F469 --- UP"
            }
        }

class Shade(BaseModel):
    """Shade information from database"""
    shade_id: int = Field(..., description="Unique shade identifier")
    remote_id: int = Field(..., description="Remote control ID")
    name: str = Field(..., description="Computed name from room + location")
    room: str = Field(..., description="Room where shade is installed")
    location: str = Field(..., description="Physical location description")
    facing: str = Field(..., description="Direction the window faces (north/south/east/west)")
    type: str = Field(..., description="Shade type (Privacy, Solar, Blackout)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "shade_id": 40,
                "remote_id": 5,
                "name": "Bedroom East Window",
                "room": "Bedroom",
                "location": "East Window",
                "facing": "east",
                "type": "Blackout"
            }
        }

class ShadesListResponse(BaseModel):
    """Response for listing all shades"""
    success: bool = Field(True, description="Request success status")
    count: int = Field(..., description="Number of shades returned")
    shades: list[Shade] = Field(..., description="List of shade information")

# 🏥 HEALTH STATUS - "Is the ShadeCommander service working?"
class HealthStatus(BaseModel):
    """
    Health check for monitoring dashboards - answers: "Can ShadeCommander send commands?"
    
    Usage Examples:
    - Monty dashboard shows: ShadeCommander ✅ healthy
    - Load balancer health checks
    - Alerting when Arduino disconnects
    """
    status: str = Field(..., description="Overall health: healthy, degraded, unhealthy")
    arduino_connected: bool = Field(..., description="Can we talk to Arduino?")
    database_accessible: bool = Field(..., description="Can we read shades.db?")
    uptime_seconds: float = Field(..., description="How long has service been running?")
    last_command_time: Optional[str] = Field(None, description="When did we last send a command? (local time)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "status": "healthy",
                "arduino_connected": True,
                "database_accessible": True, 
                "uptime_seconds": 3600.5,
                "last_command_time": "2025-05-25T14:25:00Z"
            }
        }

# 🔧 SYSTEM STATUS - "What's going on under the hood?"
class SystemStatus(BaseModel):
    """
    Detailed debugging info for developers - answers: "Why isn't it working?"
    
    Usage Examples:
    - Troubleshooting connection issues
    - Checking if database has shades configured
    - Seeing recent command history when things go wrong
    """
    success: bool = Field(True, description="Request success status")
    arduino_port: str = Field(..., description="Which USB port are we using?")
    arduino_connected: bool = Field(..., description="Is Arduino responding?")
    database_path: str = Field(..., description="Where is shades.db located?")
    total_shades: int = Field(..., description="How many shades are configured?")
    recent_commands: list[dict] = Field(..., description="Last 10 commands sent (for debugging)")
    uptime_seconds: float = Field(..., description="Service uptime")
    
    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "arduino_port": "/dev/ttyACM0",
                "arduino_connected": True,
                "database_path": "/home/monty/monty/shades/data/shades.db",
                "total_shades": 48,
                "recent_commands": [
                    {
                        "command": "TX:FE,5C2D0D39,FEFF,F469,1,50,0,0",
                        "timestamp": 1716646800.123,
                        "success": True,
                        "response_lines": 2
                    }
                ],
                "uptime_seconds": 7200.8
            }
        }

# ❌ ERROR RESPONSE - "Something went wrong!"
class ErrorResponse(BaseModel):
    """
    Standard error format for all failures - answers: "What exactly failed and when?"
    
    Usage Examples:
    - Shade ID 999 doesn't exist in database
    - Arduino disconnected during command
    - Invalid action provided
    - Database file missing
    """
    success: bool = Field(False, description="Always false for errors")
    error: str = Field(..., description="Error category (ShadeNotFound, ArduinoDisconnected, etc)")
    message: str = Field(..., description="Human-readable explanation of what went wrong")
    shade_id: Optional[int] = Field(None, description="Which shade caused the error (if applicable)")
    timestamp: str = Field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f"), description="When the error occurred (local time)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "success": False,
                "error": "ShadeNotFound",
                "message": "Shade 999 not found in database",
                "shade_id": 999,
                "timestamp": "2025-05-25T14:30:00Z"
            }
        }

# 🎬 SCENE EXECUTION TRACKING - "How did that scene go?"
class SceneExecutionLog(BaseModel):
    """
    Log entry for scene execution - perfect for monitoring scene success rates.
    
    Usage Examples:
    - Dashboard shows: "Good Morning scene: ✅ Complete (5/5 shades)"
    - Scene history: "Last 10 executions, 90% success rate"
    - Troubleshooting: "Scene failed because shade 14 didn't respond"
    """
    scene_name: str = Field(..., description="Name of the scene that was executed")
    execution_time: str = Field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f"), description="When the scene started (local time)")
    total_commands: int = Field(..., description="Total number of shade commands in scene")
    successful_commands: int = Field(..., description="Number of commands that succeeded")
    failed_commands: int = Field(..., description="Number of commands that failed")
    duration_ms: int = Field(..., description="Total time to execute all commands")
    commands: List[Dict[str, Any]] = Field(..., description="Detailed results for each shade command")
    
    @property
    def success_rate(self) -> float:
        """Calculate success rate as percentage"""
        if self.total_commands == 0:
            return 0.0
        return (self.successful_commands / self.total_commands) * 100
    
    @property
    def status(self) -> str:
        """Get human-readable status for UI display"""
        if self.successful_commands == self.total_commands:
            return "✅ Complete"
        elif self.successful_commands == 0:
            return "❌ Failed"
        else:
            return f"⚠️ Partial ({self.success_rate:.0f}%)"
    
    class Config:
        json_schema_extra = {
            "example": {
                "scene_name": "good_morning",
                "execution_time": "2025-06-04T07:00:00Z",
                "total_commands": 5,
                "successful_commands": 4,
                "failed_commands": 1,
                "duration_ms": 2500,
                "commands": [
                    {
                        "shade_id": 14,
                        "action": "u",
                        "success": True,
                        "message": "Shade 14 UP fire-and-forget command sent",
                        "arduino_response": "TX OK: 5C 35 B1 48 | FEFF | BCEC --- UP"
                    },
                    {
                        "shade_id": 28,
                        "action": "u", 
                        "success": False,
                        "message": "Fire-and-forget command failed silently",
                        "arduino_response": "No Arduino connection"
                    }
                ]
            }
        }

class SceneExecutionHistory(BaseModel):
    """Response for scene execution history"""
    success: bool = Field(True, description="Request success status")
    total_executions: int = Field(..., description="Total number of logged executions")
    executions: List[SceneExecutionLog] = Field(..., description="List of recent scene executions")
    
    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "total_executions": 25,
                "executions": []
            }
        }

# 🎯 WHEN TO USE EACH MODEL:

"""
HealthStatus:
- GET /health (for monitoring systems)
- Quick "is everything working?" check
- Used by your Monty dashboard to show service status

SystemStatus: 
- GET /status (for debugging)
- Detailed troubleshooting information
- Used when health check fails and you need to know why

ErrorResponse:
- Any endpoint that fails
- Standardized error format across all failures
- Makes frontend error handling consistent

The key difference:
- HealthStatus = "Is the service working?" (monitoring)
- SystemStatus = "What's the service doing?" (debugging) 
- ErrorResponse = "What went wrong?" (error handling)
"""
