# /commander/models/shade.py

from pydantic import BaseModel, Field
from typing import Optional
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
    timestamp: datetime = Field(default_factory=datetime.now, description="When command was transmitted")
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
    last_command_time: Optional[datetime] = Field(None, description="When did we last send a command?")
    
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
    timestamp: datetime = Field(default_factory=datetime.now, description="When the error occurred")
    
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
