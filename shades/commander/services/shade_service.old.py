# /commander/services/shade_service.py

import time
import logging
from typing import List, Optional, Tuple
from ..models.shade import ShadeCommand, ShadeResponse, ShadeInfo, ShadesListResponse, HealthStatus, SystemStatus
from ..interface.arduino_whisperer import arduino_whisperer

logger = logging.getLogger(__name__)

class ShadeService:
    """Business logic service for shade operations"""
    
    def __init__(self):
        self.start_time = time.time()
        
    async def execute_shade_command(self, command: ShadeCommand) -> ShadeResponse:
        """Execute a single shade command"""
        start_time = time.time()
        
        try:
            # Execute the command
            success, message, arduino_response = await arduino_whisperer.control_shade(
                command.shade_id, 
                command.action
            )
            
            execution_time_ms = int((time.time() - start_time) * 1000)
            
            return ShadeResponse(
                success=success,
                message=message,
                shade_id=command.shade_id,
                action=command.action,
                execution_time_ms=execution_time_ms,
                arduino_response=arduino_response
            )
            
        except Exception as e:
            execution_time_ms = int((time.time() - start_time) * 1000)
            logger.error(f"Error executing shade command: {e}")
            
            return ShadeResponse(
                success=False,
                message=f"Failed to execute command: {str(e)}",
                shade_id=command.shade_id,
                action=command.action,
                execution_time_ms=execution_time_ms
            )
    
    async def get_all_shades(self) -> ShadesListResponse:
        """Get list of all configured shades"""
        try:
            shades_data = arduino_whisperer.get_all_shades()
            
            shades = [
                ShadeInfo(
                    shade_id=shade['shade_id'],
                    name=shade['name'] or f"Shade {shade['shade_id']}",
                    room=shade['room'] or "Unknown",
                    location=shade['location'] or "Unknown", 
                    type=shade['type'] or "Unknown",
                    scene_group=shade['scene_group']
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
    
    async def get_health_status(self) -> HealthStatus:
        """Get system health status"""
        try:
            # Test Arduino connection
            arduino_connected = arduino_whisperer.is_connected()
            if not arduino_connected:
                arduino_connected = await arduino_whisperer.connect()
            
            # Test database access
            try:
                shades = arduino_whisperer.get_all_shades()
                database_accessible = True
            except:
                database_accessible = False
            
            # Get last command time
            history = arduino_whisperer.get_command_history(1)
            last_command_time = None
            if history:
                last_command_time = history[0]['timestamp']
            
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
            health_info = arduino_whisperer.get_health_status()
            recent_commands = arduino_whisperer.get_command_history(10)
            
            # Format recent commands for response
            formatted_commands = []
            for cmd in recent_commands:
                formatted_commands.append({
                    'command': cmd['command'],
                    'timestamp': cmd['timestamp'],
                    'success': cmd['success'],
                    'response_lines': len(cmd['response']) if cmd['response'] else 0
                })
            
            return SystemStatus(
                arduino_port=health_info['arduino_port'],
                arduino_connected=health_info['arduino_connected'],
                database_path=health_info['database_path'],
                database_accessible=health_info['database_accessible'],
                total_shades=len(arduino_whisperer.get_all_shades()),
                recent_commands=formatted_commands,
                uptime_seconds=time.time() - self.start_time
            )
            
        except Exception as e:
            logger.error(f"Error getting system status: {e}")
            return SystemStatus(
                success=False,
                arduino_port="unknown",
                arduino_connected=False,
                database_path="unknown",
                database_accessible=False,
                total_shades=0,
                recent_commands=[],
                uptime_seconds=time.time() - self.start_time
            )

# Global service instance
shade_service = ShadeService()
