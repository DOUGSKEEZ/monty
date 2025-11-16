# /commander/routers/scenes.py

from fastapi import APIRouter, HTTPException, Path, BackgroundTasks
from typing import List
import logging
import json
import time
import asyncio
from pathlib import Path as FilePath

from commander.models.scene import (
    SceneDefinition,
    SceneListItem, 
    ScenesListResponse,
    SceneDetailResponse,
    SceneExecutionRequest,
    SceneExecutionResponse,
    SceneExecutionResult
)
from commander.models.shade import (
    SceneExecutionLog,
    SceneExecutionHistory
)
from commander.services.shade_service import shade_service
from commander.services.async_retry_service import async_retry_service

logger = logging.getLogger(__name__)
router = APIRouter()

# Path to scenes directory
SCENES_DIR = FilePath("/home/monty/monty/shades/data/scenes")

# In-memory scene execution logs (last 100 executions)
scene_execution_logs: List[SceneExecutionLog] = []

def load_scene(scene_name: str) -> SceneDefinition:
    """Load a scene from JSON file"""
    scene_file = SCENES_DIR / f"{scene_name}.json"
    
    if not scene_file.exists():
        raise FileNotFoundError(f"Scene '{scene_name}' not found")
    
    try:
        with open(scene_file, 'r') as f:
            scene_data = json.load(f)
        
        return SceneDefinition(**scene_data)
    except Exception as e:
        raise ValueError(f"Invalid scene file '{scene_name}': {e}")

def get_available_scenes() -> List[str]:
    """Get list of available scene names"""
    if not SCENES_DIR.exists():
        return []
    
    scene_files = SCENES_DIR.glob("*.json")
    return [f.stem for f in scene_files]

@router.get(
    "/",
    response_model=ScenesListResponse,
    summary="List all available scenes",
    description="""
    Get a list of all available shade scenes.
    
    **Returns:**
    - Scene names and descriptions
    - Command counts for each scene
    - Quick overview for scene selection
    
    **Use this to:**
    - Show available scenes in UI
    - Build scene selection menus
    - Get overview of configured scenes
    """,
    responses={
        200: {"description": "List of available scenes"},
        500: {"description": "Error loading scenes"},
    }
)
async def list_scenes():
    """Get list of all available scenes"""
    try:
        logger.info("Fetching list of all scenes")
        
        scene_names = get_available_scenes()
        scenes = []
        
        for scene_name in scene_names:
            try:
                scene = load_scene(scene_name)
                scenes.append(SceneListItem(
                    name=scene_name,
                    display_name=scene.name,
                    description=scene.description,
                    command_count=len(scene.commands)
                ))
            except Exception as e:
                logger.warning(f"Failed to load scene '{scene_name}': {e}")
                continue
        
        logger.info(f"✅ Retrieved {len(scenes)} scenes")
        return ScenesListResponse(
            count=len(scenes),
            scenes=scenes
        )
        
    except Exception as e:
        logger.error(f"❌ Error fetching scenes list: {e}")
        
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "ScenesLoadError",
                "message": f"Failed to load scenes: {str(e)}"
            }
        )

@router.get(
    "/logs",
    response_model=SceneExecutionHistory,
    summary="Get scene execution history",
    description="""
    Get recent scene execution logs for monitoring and troubleshooting.
    
    **Returns:**
    - Last 100 scene executions
    - Success rates and timing information
    - Detailed command results for each execution
    
    **Use this to:**
    - Monitor scene reliability over time
    - Troubleshoot scene execution issues
    - Display scene execution history in monitoring dashboards
    - Track which shades are frequently failing
    
    **Perfect for:**
    - Monty dashboard showing recent scene activity
    - Alerting when scene success rates drop
    - Debugging automation schedules
    """,
    responses={
        200: {"description": "Scene execution history"},
        500: {"description": "Error retrieving logs"},
    }
)
async def get_scene_execution_logs():
    """Get recent scene execution history"""
    try:
        logger.info("Fetching scene execution logs")
        
        # Return logs in reverse chronological order (newest first)
        recent_logs = sorted(scene_execution_logs, key=lambda x: x.execution_time, reverse=True)
        
        logger.info(f"✅ Retrieved {len(recent_logs)} scene execution logs")
        
        return SceneExecutionHistory(
            total_executions=len(recent_logs),
            executions=recent_logs
        )
        
    except Exception as e:
        logger.error(f"❌ Error fetching scene execution logs: {e}")
        
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "LogRetrievalError",
                "message": f"Failed to retrieve scene logs: {str(e)}"
            }
        )

@router.get(
    "/{scene_name}",
    response_model=SceneDetailResponse,
    summary="Get specific scene details",
    description="""
    Get detailed information about a specific scene.
    
    **Returns:**
    - Complete scene definition
    - All commands and their parameters
    - Estimated execution time
    
    **Use this to:**
    - Preview scene before execution
    - Debug scene configurations
    - Show detailed scene information in UI
    """,
    responses={
        200: {"description": "Scene details"},
        404: {"description": "Scene not found"},
        500: {"description": "Error loading scene"},
    }
)
async def get_scene_details(
    scene_name: str = Path(..., description="Scene name/identifier")
):
    """Get detailed information about a specific scene"""
    try:
        logger.info(f"Fetching details for scene '{scene_name}'")
        
        scene = load_scene(scene_name)
        
        # Calculate estimated execution time
        estimated_time = sum(cmd.delay_ms for cmd in scene.commands) + (len(scene.commands) * 500)  # Base execution time per command
        
        logger.info(f"✅ Retrieved details for scene '{scene_name}'")
        
        return SceneDetailResponse(
            scene=scene,
            estimated_execution_time_ms=estimated_time
        )
        
    except FileNotFoundError:
        logger.warning(f"⚠️ Scene '{scene_name}' not found")
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "error": "SceneNotFound",
                "message": f"Scene '{scene_name}' not found",
                "scene_name": scene_name
            }
        )
    except Exception as e:
        logger.error(f"❌ Error fetching scene '{scene_name}': {e}")
        
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "SceneLoadError",
                "message": f"Failed to load scene: {str(e)}",
                "scene_name": scene_name
            }
        )


@router.post(
    "/{scene_name}/execute",
    response_model=SceneExecutionResponse,
    summary="Execute a scene",
    description="""
    Execute all commands in a scene.
    
    **What happens:**
    1. Load scene definition from JSON
    2. Execute each command in sequence
    3. Apply delays between commands
    4. Retry failed commands if configured
    5. Return detailed execution results
    
    **Important Notes:**
    - Commands are executed sequentially, not in parallel
    - Failed commands will be retried based on scene configuration
    - Scene execution can be cancelled with timeout
    - Arduino must be connected for commands to succeed
    
    **Use this for:**
    - Automated shade control based on time/conditions
    - Manual scene activation from UI
    - Scheduled scene execution
    """,
    responses={
        200: {"description": "Scene execution completed (may have partial failures)"},
        404: {"description": "Scene not found"},
        400: {"description": "Invalid execution parameters"},
        500: {"description": "Scene execution error"},
    }
)
async def execute_scene(
    scene_name: str = Path(..., description="Scene name/identifier"),
    execution_params: SceneExecutionRequest = SceneExecutionRequest(),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """Execute a scene"""
    start_time = time.time()
    
    try:
        logger.info(f"Starting execution of scene '{scene_name}'")
        
        # Load scene definition
        scene = load_scene(scene_name)
        
        # Apply parameter overrides
        retry_count = execution_params.override_retry_count if execution_params.override_retry_count is not None else scene.retry_count
        timeout_seconds = execution_params.override_timeout if execution_params.override_timeout is not None else scene.timeout_seconds
        
        logger.info(f"Scene '{scene_name}': {len(scene.commands)} commands, {retry_count} retries, {timeout_seconds}s timeout")
        
        # Dry run mode - just return what would be executed
        if execution_params.dry_run:
            results = []
            for i, cmd in enumerate(scene.commands):
                results.append(SceneExecutionResult(
                    shade_id=cmd.shade_id,
                    action=cmd.action,
                    success=True,
                    message=f"DRY RUN: Would execute {cmd.action} on shade {cmd.shade_id}",
                    execution_time_ms=0,
                    retry_attempt=0
                ))
            
            total_time = int((time.time() - start_time) * 1000)
            
            return SceneExecutionResponse(
                success=True,
                scene_name=scene_name,
                message=f"DRY RUN: Scene would execute {len(scene.commands)} commands",
                total_execution_time_ms=total_time,
                commands_executed=len(scene.commands),
                commands_successful=len(scene.commands),
                results=results
            )
        
        # NEW APPROACH: Queue entire scene execution as background task (fire-and-forget)
        logger.info(f"Queuing scene '{scene_name}' for background execution (fire-and-forget)")
        
        # Prepare all commands for background execution
        scene_commands = []
        for cmd in scene.commands:
            scene_commands.append({
                "shade_id": cmd.shade_id,
                "action": cmd.action,
                "delay_ms": cmd.delay_ms
            })
        
        # Queue the entire scene as a background task (including first cycle + retries)
        task_id = async_retry_service.queue_scene_execution(
            scene_name=scene_name,
            scene_commands=scene_commands,
            retry_count=retry_count + 1,  # +1 to include the first execution
            delay_between_commands_ms=scene.commands[0].delay_ms if scene.commands else 750,
            timeout_seconds=timeout_seconds
        )

        logger.info(f"✅ Scene '{scene_name}' queued for background execution (task: {task_id})")

        # LOG THE SCENE EXECUTION (audit trail - what was fired)
        _log_scene_execution(
            scene_name=scene_name,
            total_commands=len(scene_commands),
            successful_commands=len(scene_commands),  # All "fired" successfully
            duration_ms=0,  # Not tracking execution time, just that it was fired
            command_results=[
                SceneExecutionResult(
                    shade_id=cmd.shade_id,
                    action=cmd.action,
                    success=True,
                    message=f"Fired: shade {cmd.shade_id} {cmd.action}",
                    execution_time_ms=0,
                    retry_attempt=0
                )
                for cmd in scene.commands
            ]
        )
        
        # Return immediately with success (fire-and-forget pattern)
        total_time = int((time.time() - start_time) * 1000)
        
        # For immediate response, we'll show the scene as "queued" rather than executed
        results = []
        for cmd in scene.commands:
            results.append(SceneExecutionResult(
                shade_id=cmd.shade_id,
                action=cmd.action,
                success=True,
                message=f"Queued for background execution",
                execution_time_ms=0,
                retry_attempt=0
            ))
        
        # Return immediately with success (fire-and-forget pattern)
        message = f"Scene '{scene_name}' queued for background execution with {retry_count + 1} total cycles"
        
        return SceneExecutionResponse(
            success=True,
            scene_name=scene_name,
            message=message,
            total_execution_time_ms=total_time,
            commands_executed=len(scene.commands),
            commands_successful=len(scene.commands),  # All "successful" since they're queued
            results=results,
            task_id=task_id  # Include task ID so user can track progress
        )
        
    except FileNotFoundError:
        execution_time = int((time.time() - start_time) * 1000)
        logger.warning(f"⚠️ Scene '{scene_name}' not found")
        raise HTTPException(
            status_code=404,
            detail={
                "success": False,
                "error": "SceneNotFound",
                "message": f"Scene '{scene_name}' not found",
                "scene_name": scene_name,
                "execution_time_ms": execution_time
            }
        )
    except Exception as e:
        execution_time = int((time.time() - start_time) * 1000)
        logger.error(f"❌ Error executing scene '{scene_name}': {e}")
        
        raise HTTPException(
            status_code=500,
            detail={
                "success": False,
                "error": "SceneExecutionError",
                "message": f"Failed to execute scene: {str(e)}",
                "scene_name": scene_name,
                "execution_time_ms": execution_time
            }
        )

        
def _log_scene_execution(
    scene_name: str,
    total_commands: int,
    successful_commands: int,
    duration_ms: int,
    command_results: List[SceneExecutionResult]
):
    """Log scene execution for monitoring and tracking"""
    global scene_execution_logs
    
    # Create detailed command log entries
    commands_log = []
    for result in command_results:
        commands_log.append({
            "shade_id": result.shade_id,
            "action": result.action,
            "success": result.success,
            "message": result.message,
            "execution_time_ms": result.execution_time_ms,
            "retry_attempt": result.retry_attempt
        })
    
    # Create scene execution log entry
    log_entry = SceneExecutionLog(
        scene_name=scene_name,
        total_commands=total_commands,
        successful_commands=successful_commands,
        failed_commands=total_commands - successful_commands,
        duration_ms=duration_ms,
        commands=commands_log
    )
    
    # Add to logs
    scene_execution_logs.append(log_entry)
    
    # Keep only last 100 executions
    if len(scene_execution_logs) > 100:
        scene_execution_logs = scene_execution_logs[-100:]
    
    logger.info(f"📊 Logged scene execution: {scene_name} - {log_entry.status} ({log_entry.success_rate:.0f}% success rate)")
