# /commander/routers/shades.py

from fastapi import APIRouter, HTTPException, Path, BackgroundTasks
from typing import List
import logging
import time

from commander.models.shade import (
    ShadeCommand,
    ShadeResponse,
    Shade,
    ShadesListResponse,
    ErrorResponse
)
from commander.services.shade_service import shade_service
from commander.services.async_retry_service import async_retry_service
from commander.routers.scenes import scene_execution_logs, SceneExecutionLog

logger = logging.getLogger(__name__)
router = APIRouter()


def _log_shade_command(shade_id: int, action: str):
    """Log individual shade command for audit trail"""
    action_map = {"u": "UP", "d": "DOWN", "s": "STOP"}
    action_name = action_map.get(action, action.upper())

    log_entry = SceneExecutionLog(
        scene_name=f"shade_{shade_id}_{action_name}",
        total_commands=1,
        successful_commands=1,  # "Fired" successfully
        failed_commands=0,
        duration_ms=0,  # Not tracking execution time
        commands=[{
            "shade_id": shade_id,
            "action": action,
            "success": True,
            "message": f"Fired: shade {shade_id} {action_name}",
            "execution_time_ms": 0,
            "retry_attempt": 0
        }]
    )

    scene_execution_logs.append(log_entry)

    # Keep only last 100 executions
    if len(scene_execution_logs) > 100:
        scene_execution_logs[:] = scene_execution_logs[-100:]

    logger.info(f"📊 Logged shade command: shade {shade_id} {action_name}")

@router.post(
    "/{shade_id}/command",
    response_model=ShadeResponse,
    summary="Send command to specific shade",
    description="""
    Send a command (up/down/stop) to a specific shade.
    
    **Important**: This only confirms RF transmission, not actual shade movement!
    The shades are stateless listeners - we just broadcast the signal and hope they respond.
    """,
    responses={
        200: {"description": "Command transmitted successfully"},
        404: {"description": "Shade not found in database"},
        500: {"description": "Arduino communication error"},
    }
)
async def control_shade(
    shade_id: int = Path(..., description="Unique shade identifier", gt=0),
    command: ShadeCommand = ...,
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """Send a command to a specific shade (fire-and-forget)"""
    start_time = time.time()
    
    try:
        logger.info(f"🚀 Fire-and-forget command for shade {shade_id}: {command.action}")

        # Queue complete fire-and-forget sequence (NO synchronous first command)
        task_id = async_retry_service.queue_fire_and_forget_sequence(shade_id, command.action.value)

        execution_time_ms = int((time.time() - start_time) * 1000)

        logger.info(f"✅ Shade {shade_id} fire-and-forget sequence queued (task: {task_id}) in {execution_time_ms}ms")

        # LOG THE COMMAND (audit trail - what was fired)
        _log_shade_command(shade_id, command.action.value)
        
        # Return immediately with fire-and-forget response
        return ShadeResponse(
            success=True,
            message=f"Command sent to Arduino - fire-and-forget sequence started",
            shade_id=shade_id,
            action=command.action.value,
            execution_time_ms=execution_time_ms,
            arduino_response=f"Fire-and-forget task: {task_id}"
        )
        
    except Exception as e:
        execution_time_ms = int((time.time() - start_time) * 1000)
        logger.error(f"❌ Error controlling shade {shade_id}: {e}")
        
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "CommandExecutionError",
                "message": f"Failed to execute command: {str(e)}",
                "shade_id": shade_id,
                "execution_time_ms": execution_time_ms
            }
        )

@router.get(
    "/",
    response_model=ShadesListResponse,
    summary="List all configured shades",
    description="""
    Get a list of all shades configured in the database.
    
    Returns basic information needed for the frontend:
    - Shade ID, name, room, location, type
    - No status information (shades are stateless!)
    """,
    responses={
        200: {"description": "List of all configured shades"},
        500: {"description": "Database access error"},
    }
)
async def list_shades():
    """Get list of all configured shades"""
    try:
        logger.info("Fetching list of all shades")
        
        response = await shade_service.get_all_shades()
        
        logger.info(f"✅ Retrieved {response.count} shades from database")
        return response
        
    except Exception as e:
        logger.error(f"❌ Error fetching shades list: {e}")
        
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "DatabaseError",
                "message": f"Failed to fetch shades: {str(e)}"
            }
        )

@router.get(
    "/{shade_id}",
    response_model=Shade,
    summary="Get specific shade details",
    description="""
    Get detailed information about a specific shade.
    
    **Note**: This is just configuration data from the database.
    No real-time status since shades are stateless listeners!
    """,
    responses={
        200: {"description": "Shade details"},
        404: {"description": "Shade not found"},
        500: {"description": "Database access error"},
    }
)
async def get_shade_details(
    shade_id: int = Path(..., description="Unique shade identifier", gt=0)
):
    """Get detailed information about a specific shade"""
    try:
        logger.info(f"Fetching details for shade {shade_id}")
        
        shade_details = await shade_service.get_shade_by_id(shade_id)
        
        if not shade_details:
            logger.warning(f"⚠️ Shade {shade_id} not found in database")
            raise HTTPException(
                status_code=404,
                detail={
                    "success": False,
                    "error": "ShadeNotFound",
                    "message": f"Shade {shade_id} not found in database",
                    "shade_id": shade_id
                }
            )
        
        logger.info(f"✅ Retrieved details for shade {shade_id}")
        return shade_details
        
    except HTTPException:
        raise  # Re-raise HTTP exceptions
    except Exception as e:
        logger.error(f"❌ Error fetching shade {shade_id}: {e}")
        
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "DatabaseError",
                "message": f"Failed to fetch shade details: {str(e)}",
                "shade_id": shade_id
            }
        )

