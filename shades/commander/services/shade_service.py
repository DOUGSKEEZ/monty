# /home/monty/monty/shades/commander/services/shade_service.py

import time
import logging
from typing import List, Optional
from commander.models.shade import ShadeCommand, ShadeResponse, Shade, ShadesListResponse, HealthStatus, SystemStatus
from commander.interface.arduino_whisperer import send_shade_command, get_all_shades, get_arduino_status

logger = logging.getLogger(__name__)

class ShadeService:
    """Business logic service for shade operations"""
    
    def __init__(self):
        self.start_time = time.time()
        
    async def execute_shade_command(self, shade_id: int, action: str) -> ShadeResponse:
        """Execute a single shade command using smart Arduino connection"""
        try:
            # Execute the command via smart Arduino connection
            result = await send_shade_command(shade_id, action)
            
            return ShadeResponse(
                success=result["success"],
                message=result["message"],
                shade_id=result["shade_id"],
                action=result["action"],
                execution_time_ms=result["execution_time_ms"],
                arduino_response=result.get("arduino_response")
            )
            
        except Exception as e:
            logger.error(f"Error executing shade command: {e}")
            
            return ShadeResponse(
                success=False,
                message=f"Failed to execute command: {str(e)}",
                shade_id=shade_id,
                action=action,
                execution_time_ms=0
            )
    
    async def get_all_shades(self) -> ShadesListResponse:
        """Get list of all configured shades"""
        try:
            shades_data = get_all_shades()
            
            shades = [
                Shade(
                    shade_id=shade['shade_id'],
                    remote_id=shade.get('remote_id', 0),
                    name=shade.get('name', 'Unknown'),
                    room=shade['room'] or "Unknown",
                    location=shade['location'] or "Unknown", 
                    facing=shade.get('facing', 'Unknown'),
                    type=shade['type'] or "Unknown"
                )
                for shade in shades_data
            ]
            
            return ShadesListResponse(
                count=len(shades),
                shades=shades
            )
            
        except Exception as e:
            logger.error(f"Error getting shades list: {e}")
            return ShadesListResponse(
                success=False,
                count=0,
                shades=[]
            )
    
    async def get_shade_by_id(self, shade_id: int) -> Optional[Shade]:
        """Get details for a specific shade"""
        try:
            # Get all shades and find the one we want
            all_shades_response = await self.get_all_shades()
            
            for shade in all_shades_response.shades:
                if shade.shade_id == shade_id:
                    return shade
            
            # Shade not found
            return None
            
        except Exception as e:
            logger.error(f"Error getting shade {shade_id}: {e}")
            return None
    
    async def get_health_status(self) -> HealthStatus:
        """Get system health status"""
        try:
            # Get Arduino status from smart connection
            arduino_status = await get_arduino_status()
            arduino_connected = arduino_status.get("connected", False)
            
            # Test database access
            try:
                shades = get_all_shades()
                database_accessible = True
            except:
                database_accessible = False
            
            # Get last command time from Arduino status
            last_command_time = None
            if arduino_status.get("last_successful_command"):
                # The Arduino returns ISO timestamp, keep as string for API
                last_command_time = arduino_status["last_successful_command"]
            
            # Determine overall status
            if arduino_connected and database_accessible:
                status = 'healthy'
            elif arduino_connected or database_accessible:
                status = 'degraded'
            else:
                status = 'unhealthy'
            
            return HealthStatus(
                status=status,
                arduino_connected=arduino_connected,
                database_accessible=database_accessible,
                last_command_time=last_command_time,
                uptime_seconds=time.time() - self.start_time
            )
            
        except Exception as e:
            logger.error(f"Error checking health status: {e}")
            return HealthStatus(
                status='unhealthy',
                arduino_connected=False,
                database_accessible=False,
                uptime_seconds=time.time() - self.start_time
            )
    
    async def get_system_status(self) -> SystemStatus:
        """Get detailed system status for debugging"""
        try:
            arduino_status = await get_arduino_status()
            
            return SystemStatus(
                arduino_port=arduino_status.get("port", "unknown"),
                arduino_connected=arduino_status.get("connected", False),
                database_path="/home/monty/monty/shades/data/shades.db",
                total_shades=len(get_all_shades()),
                recent_commands=[],  # Arduino command history is handled internally now
                uptime_seconds=time.time() - self.start_time
            )
            
        except Exception as e:
            logger.error(f"Error getting system status: {e}")
            return SystemStatus(
                success=False,
                arduino_port="unknown",
                arduino_connected=False,
                database_path="/home/monty/monty/shades/data/shades.db",
                total_shades=0,
                recent_commands=[],
                uptime_seconds=time.time() - self.start_time
            )

# Global service instance
shade_service = ShadeService()
