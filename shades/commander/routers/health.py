# /routers/health.py

from fastapi import APIRouter, HTTPException
import logging
import time

from commander.models.shade import HealthStatus, SystemStatus
from commander.services.shade_service import shade_service
from commander.services.async_retry_service import async_retry_service
from commander.interface.arduino_whisperer import get_arduino_status, force_arduino_reconnect

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get(
    "/health",
    response_model=HealthStatus,
    summary="Service health check",
    description="""
    Quick health check for monitoring systems.
    
    **Used by:**
    - Monty dashboard to show ShadeCommander status
    - Load balancers and monitoring tools
    - Automated health checks
    
    **Returns:**
    - Overall status (healthy/degraded/unhealthy)
    - Arduino connection status
    - Database accessibility
    - Service uptime
    """,
    responses={
        200: {"description": "Health status retrieved successfully"},
        503: {"description": "Service is unhealthy"},
    }
)
async def health_check():
    """Get service health status for monitoring"""
    try:
        logger.debug("Performing health check")
        
        health = await shade_service.get_health_status()
        
        # Return appropriate HTTP status code based on health
        if health.status == "unhealthy":
            # Still return 200 but with unhealthy status
            # Some monitoring systems prefer this approach
            logger.warning(f"⚠️ Health check shows unhealthy status: {health.status}")
        else:
            logger.debug(f"✅ Health check completed: {health.status}")
        
        return health
        
    except Exception as e:
        logger.error(f"❌ Health check failed: {e}")
        
        # Return a basic unhealthy response even if health check itself fails
        return HealthStatus(
            status="unhealthy",
            arduino_connected=False,
            database_accessible=False,
            uptime_seconds=0.0,
            last_command_time=None
        )




@router.get(
    "/arduino/status",
    summary="Arduino connection status",
    description="""
    Get detailed Arduino connection status from the smart connection manager.
    
    **Returns:**
    - Connection status (connected/disconnected)
    - Port information
    - Last successful command timestamp
    - Health check timing
    
    **Used for:**
    - Monitoring Arduino connectivity
    - Debugging connection issues
    - Checking if first-of-day connection is needed
    """,
    responses={
        200: {"description": "Arduino status retrieved successfully"},
    }
)
async def arduino_status():
    """Get Arduino connection status from smart connection manager"""
    try:
        logger.info("Getting Arduino connection status")
        
        status = await get_arduino_status()
        
        logger.info(f"✅ Arduino status: connected={status.get('connected')}, port={status.get('port')}")
        return {
            "success": True,
            "arduino_status": status,
            "message": "Arduino status retrieved successfully"
        }
        
    except Exception as e:
        logger.error(f"❌ Error getting Arduino status: {e}")
        
        return {
            "success": False,
            "error": str(e),
            "message": "Failed to get Arduino status"
        }

@router.post(
    "/arduino/reconnect",
    summary="Force Arduino reconnection",
    description="""
    Force a reconnection to the Arduino controller.
    
    **When to use:**
    - Arduino was unplugged and reconnected
    - Connection appears stale or unresponsive
    - Troubleshooting connectivity issues
    - Manual recovery after errors
    
    **What happens:**
    - Closes current connection (if any)
    - Auto-detects Arduino port
    - Establishes fresh connection
    - Tests connection health
    
    **Note:** This may take 5-10 seconds for port detection.
    """,
    responses={
        200: {"description": "Reconnection attempt completed"},
    }
)
async def arduino_reconnect():
    """Force Arduino reconnection"""
    try:
        logger.info("Manual Arduino reconnection requested")
        
        result = await force_arduino_reconnect()
        
        if result["success"]:
            logger.info("✅ Arduino reconnection successful")
        else:
            logger.warning("⚠️ Arduino reconnection failed")
        
        return result
        
    except Exception as e:
        logger.error(f"❌ Error during Arduino reconnection: {e}")
        
        return {
            "success": False,
            "error": str(e),
            "message": "Arduino reconnection failed"
        }

@router.get(
    "/retries",
    summary="Active retry tasks status",
    description="""
    Monitor active background retry tasks with "Latest Command Wins" details.
    
    **Returns:**
    - Active retry tasks by type (individual shades vs scenes)
    - Shade-specific task mapping  
    - Cancelled task statistics
    - Recent cancellation activity
    
    **Used for:**
    - Monitoring background retry performance
    - Debugging retry task behavior
    - Verifying "Latest Command Wins" implementation
    - Tracking task cancellation effectiveness
    """,
    responses={
        200: {"description": "Retry tasks status retrieved successfully"},
    }
)
async def retry_tasks_status():
    """Get comprehensive status of background retry tasks"""
    try:
        logger.info("Getting retry tasks status")
        
        # Get comprehensive task statistics
        task_stats = async_retry_service.get_task_stats()
        
        return {
            "success": True,
            "timestamp": time.time(),
            **task_stats,
            "latest_command_wins_active": len(task_stats["shade_task_mapping"]) > 0,
            "message": f"Active: {task_stats['total_active_tasks']} tasks, Cancelled: {task_stats['total_cancelled_tasks']} total, Recent: {task_stats['recent_cancellations']}"
        }
        
    except Exception as e:
        logger.error(f"❌ Error getting retry tasks status: {e}")
        
        return {
            "success": False,
            "error": str(e),
            "message": "Failed to get retry tasks status"
        }


@router.delete(
    "/retries/all",
    summary="Cancel all active retry tasks",
    description="Emergency endpoint to clear all background retry tasks",
    responses={
        200: {"description": "Successfully cancelled all retry tasks"},
        500: {"description": "Error cancelling retry tasks"}
    }
)
async def cancel_all_retries():
    """Cancel all active retry tasks - use with caution!"""
    try:
        # Import here to avoid circular imports
        from commander.services.async_retry_service import async_retry_service
        
        # Get current stats before cancellation
        initial_count = len(async_retry_service.active_tasks)
        
        # Cancel all tasks
        async_retry_service.cancel_all_tasks()
        
        logger.info(f"Cancelled {initial_count} active retry tasks via API")
        
        return {
            "success": True,
            "message": f"Cancelled {initial_count} active retry tasks",
            "tasks_cancelled": initial_count,
            "timestamp": time.time()
        }
    except Exception as e:
        logger.error(f"Error cancelling retry tasks: {e}")
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "RetryCancellationError",
                "message": str(e)
            }
        )
