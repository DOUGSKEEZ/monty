# /commander/services/async_retry_service.py

import asyncio
import logging
import time
from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass
from commander.interface.arduino_whisperer import send_shade_command_fast

logger = logging.getLogger(__name__)

@dataclass
class RetryTask:
    """Represents a single retry task"""
    shade_id: int
    action: str
    retry_delays_ms: List[int]
    task_id: str
    started_at: float
    
class AsyncRetryService:
    """
    Manages background retries for shade commands with specific timing.
    
    Individual shade commands use RF-optimized timing: [650ms, 1500ms, 2500ms]
    Scene commands use complete scene cycles without individual retry delays.
    """
    
    def __init__(self):
        self.active_tasks: Dict[str, asyncio.Task] = {}
        self.active_shade_tasks: Dict[int, str] = {}  # shade_id -> task_id mapping for individual commands
        self.cancelled_tasks: Dict[str, float] = {}  # task_id -> cancelled_timestamp for monitoring
        self.task_counter = 0

        # Start periodic cleanup task
        asyncio.create_task(self._cleanup_old_tasks())
    
    async def _cleanup_old_tasks(self):
        """Periodically clean up tasks older than 1 hour"""
        while True:
            try:
                await asyncio.sleep(300)  # Check every 5 minutes
                
                current_time = time.time()
                tasks_to_remove = []
                
                for task_id, task in self.active_tasks.items():
                    # Parse timestamp from task_id
                    try:
                        task_timestamp = int(task_id.split('_')[-1]) / 1000
                        if current_time - task_timestamp > 3600:  # 1 hour
                            task.cancel()
                            tasks_to_remove.append(task_id)
                            logger.warning(f"Cancelling old task {task_id} (age: {(current_time - task_timestamp)/60:.1f} minutes)")
                    except:
                        pass
                
                # Remove cancelled tasks
                for task_id in tasks_to_remove:
                    self.active_tasks.pop(task_id, None)
                    # Also remove from shade mapping if present
                    for shade_id, tid in list(self.active_shade_tasks.items()):
                        if tid == task_id:
                            del self.active_shade_tasks[shade_id]
                
                if tasks_to_remove:
                    logger.info(f"Cleaned up {len(tasks_to_remove)} old retry tasks")  
            
            except Exception as e:
                logger.error(f"Error in cleanup task: {e}")
    
    def _generate_task_id(self) -> str:
        """Generate unique task ID"""
        self.task_counter += 1
        return f"retry_{self.task_counter}_{int(time.time() * 1000)}"
    
    async def _execute_fire_and_forget_sequence(self, retry_task: RetryTask) -> None:
        """
        Execute fire-and-forget command sequence (including first command).
        
        This replaces the retry sequence with a complete fire-and-forget approach:
        - Executes first command immediately in background
        - Follows with 3 additional commands at optimized intervals
        - Silent failure strategy - no blocking on errors
        
        Args:
            retry_task: The retry task containing shade_id, action, and timing
        """
        try:
            logger.info(f"🚀 Starting fire-and-forget sequence for shade {retry_task.shade_id} action '{retry_task.action}' (task: {retry_task.task_id})")
            
            # Command 1: Execute immediately (this is the "first" command, now in background)
            cmd_start = time.time()
            try:
                logger.info(f"🚀 Command 1/4 for shade {retry_task.shade_id} action '{retry_task.action}' (immediate)")
                result = await send_shade_command_fast(retry_task.shade_id, retry_task.action)
                cmd_time = int((time.time() - cmd_start) * 1000)
                
                if result["success"]:
                    logger.info(f"✅ Command 1/4 successful for shade {retry_task.shade_id} (took {cmd_time}ms)")
                else:
                    logger.warning(f"⚠️ Command 1/4 failed for shade {retry_task.shade_id}: {result.get('message', 'Unknown error')} (took {cmd_time}ms)")
                    
            except Exception as e:
                cmd_time = int((time.time() - cmd_start) * 1000)
                logger.error(f"❌ Command 1/4 error for shade {retry_task.shade_id}: {e} (took {cmd_time}ms)")
            
            # Commands 2-4: Execute at optimized intervals
            for i, delay_ms in enumerate(retry_task.retry_delays_ms):
                # Wait for the specified delay
                await asyncio.sleep(delay_ms / 1000.0)
                
                # Execute the command
                cmd_start = time.time()
                try:
                    logger.info(f"🚀 Command {i+2}/4 for shade {retry_task.shade_id} action '{retry_task.action}' (after {delay_ms}ms)")
                    result = await send_shade_command_fast(retry_task.shade_id, retry_task.action)
                    cmd_time = int((time.time() - cmd_start) * 1000)
                    
                    if result["success"]:
                        logger.info(f"✅ Command {i+2}/4 successful for shade {retry_task.shade_id} (took {cmd_time}ms)")
                    else:
                        logger.warning(f"⚠️ Command {i+2}/4 failed for shade {retry_task.shade_id}: {result.get('message', 'Unknown error')} (took {cmd_time}ms)")
                        
                except Exception as e:
                    cmd_time = int((time.time() - cmd_start) * 1000)
                    logger.error(f"❌ Command {i+2}/4 error for shade {retry_task.shade_id}: {e} (took {cmd_time}ms)")
            
            total_time = int((time.time() - retry_task.started_at) * 1000)
            logger.info(f"🏁 Completed fire-and-forget sequence for shade {retry_task.shade_id} (total time: {total_time}ms)")
            
        except asyncio.CancelledError:
            logger.info(f"🛑 Fire-and-forget task {retry_task.task_id} was cancelled")
            raise
        except Exception as e:
            logger.error(f"❌ Fire-and-forget sequence failed for shade {retry_task.shade_id}: {e}")
        finally:
            # Clean up the task from active tasks
            if retry_task.task_id in self.active_tasks:
                del self.active_tasks[retry_task.task_id]
            
            # Clean up shade-specific tracking
            if retry_task.shade_id in self.active_shade_tasks and self.active_shade_tasks[retry_task.shade_id] == retry_task.task_id:
                del self.active_shade_tasks[retry_task.shade_id]
    
    def cancel_shade_retries(self, shade_id: int) -> bool:
        """
        Cancel any pending background retry tasks for a specific shade.
        
        This implements "Latest Command Wins" - when a new command is sent for a shade,
        any pending retries for that shade are cancelled to prevent bouncing.
        
        Args:
            shade_id: Shade ID to cancel retries for
            
        Returns:
            bool: True if tasks were cancelled, False if no tasks were active
        """
        if shade_id not in self.active_shade_tasks:
            return False
        
        task_id = self.active_shade_tasks[shade_id]
        
        if task_id in self.active_tasks:
            # Cancel the asyncio task
            self.active_tasks[task_id].cancel()
            logger.info(f"🛑 Cancelled existing retry task for shade {shade_id} (task: {task_id}) - Latest Command Wins!")
            
            # Mark as cancelled for monitoring
            self.cancelled_tasks[task_id] = time.time()
            
            # Clean up tracking (the finally block in _execute_retry_sequence will also clean up)
            del self.active_shade_tasks[shade_id]
            # Note: active_tasks cleanup happens in the finally block
            
            return True
        
        # Task was tracked but not active (shouldn't happen, but clean up)
        del self.active_shade_tasks[shade_id]
        return False
    
    def queue_fire_and_forget_sequence(self, shade_id: int, action: str) -> str:
        """
        Queue complete fire-and-forget command sequence for an individual shade.
        
        Implements "Latest Command Wins" - automatically cancels any existing
        tasks for this shade before starting new ones.
        
        Fire-and-forget sequence: Immediate + [650ms, 1500ms, 2500ms] intervals
        
        Args:
            shade_id: Shade ID to command
            action: Action to execute ('u', 'd', or 's')
            
        Returns:
            task_id: Unique identifier for this fire-and-forget sequence
        """
        # LATEST COMMAND WINS: Cancel any existing tasks for this shade
        cancelled = self.cancel_shade_retries(shade_id)
        if cancelled:
            logger.info(f"🔄 Latest Command Wins: Cancelled previous sequence for shade {shade_id}")
        
        task_id = self._generate_task_id()
        
        retry_task = RetryTask(
            shade_id=shade_id,
            action=action,
            retry_delays_ms=[650, 1500, 2500],  # RF-optimized timing for commands 2-4
            task_id=task_id,
            started_at=time.time()
        )
        
        # Start the fire-and-forget background task
        task = asyncio.create_task(self._execute_fire_and_forget_sequence(retry_task))
        self.active_tasks[task_id] = task
        
        # Track this task for the specific shade (for future cancellation)
        self.active_shade_tasks[shade_id] = task_id
        
        logger.info(f"🚀 Queued fire-and-forget sequence for shade {shade_id} action '{action}' (task: {task_id})")
        return task_id
    
    async def _execute_scene_retry_cycles(self, scene_name: str, scene_commands: List[Dict[str, Any]], 
                                        retry_count: int, delay_between_commands_ms: int = 750) -> None:
        """
        Execute retry cycles for a complete scene WITH TIMEOUT PROTECTION.
        
        Args:
            scene_name: Name of the scene for logging
            scene_commands: List of scene commands with shade_id and action
            retry_count: Number of additional retry cycles (scene config)
            delay_between_commands_ms: Delay between commands in each cycle
        """
        MAX_SCENE_DURATION = 300  # 5 minutes max for any scene
        start_time = time.time()
        
        try:
            logger.info(f"🎬 Starting {retry_count} background retry cycles for scene '{scene_name}'")
            
            for cycle in range(retry_count):
                # Check if we've exceeded max duration
                if time.time() - start_time > MAX_SCENE_DURATION:
                    logger.warning(f"Scene '{scene_name}' exceeded max duration of {MAX_SCENE_DURATION}s, aborting retries")
                    break
                    
                logger.info(f"🔄 Scene '{scene_name}' retry cycle {cycle + 1}/{retry_count}")
                
                for i, cmd in enumerate(scene_commands):
                    try:
                        # Execute the command
                        result = await send_shade_command_fast(cmd["shade_id"], cmd["action"])
                        
                        if result["success"]:
                            logger.debug(f"✅ Scene retry: shade {cmd['shade_id']} {cmd['action']} successful")
                        else:
                            logger.warning(f"⚠️ Scene retry: shade {cmd['shade_id']} {cmd['action']} failed: {result.get('message', 'Unknown error')}")
                        
                        # Apply delay between commands (except after last command in cycle)
                        if i < len(scene_commands) - 1:
                            await asyncio.sleep(delay_between_commands_ms / 1000.0)
                            
                    except Exception as e:
                        logger.error(f"❌ Scene retry error for shade {cmd['shade_id']}: {e}")
                
                # Small delay between cycles
                if cycle < retry_count - 1:
                    await asyncio.sleep(1.0)
            
            logger.info(f"🏁 Completed all retry cycles for scene '{scene_name}'")
            
        except asyncio.CancelledError:
            logger.info(f"🛑 Scene retry cycles for '{scene_name}' were cancelled")
            raise
        except Exception as e:
            logger.error(f"❌ Scene retry cycles failed for '{scene_name}': {e}")
    
    def queue_scene_retries(self, scene_name: str, scene_commands: List[Dict[str, Any]], 
                           retry_count: int, delay_between_commands_ms: int = 750) -> str:
        """
        Queue background retry cycles for a scene.
        
        Args:
            scene_name: Name of the scene
            scene_commands: List of commands with shade_id and action
            retry_count: Number of retry cycles from scene config
            delay_between_commands_ms: Delay between commands in each cycle
            
        Returns:
            task_id: Unique identifier for this retry sequence
        """
        if retry_count <= 0:
            logger.info(f"📝 No retries configured for scene '{scene_name}' (retry_count: {retry_count})")
            return ""
        
        task_id = self._generate_task_id()
        
        # Start the background task
        task = asyncio.create_task(
            self._execute_scene_retry_cycles(scene_name, scene_commands, retry_count, delay_between_commands_ms)
        )
        self.active_tasks[task_id] = task
        
        logger.info(f"📝 Queued {retry_count} background retry cycles for scene '{scene_name}' (task: {task_id})")
        return task_id
    
    def get_active_tasks(self) -> List[str]:
        """Get list of active retry task IDs"""
        return list(self.active_tasks.keys())
    
    def get_active_shade_tasks(self) -> Dict[int, str]:
        """Get mapping of shade_id to active task_id for individual shade commands"""
        return self.active_shade_tasks.copy()
    
    def get_cancelled_tasks_count(self) -> int:
        """Get count of cancelled tasks (for monitoring)"""
        return len(self.cancelled_tasks)
    
    def get_task_stats(self) -> Dict[str, Any]:
        """Get comprehensive task statistics for monitoring"""
        return {
            "total_active_tasks": len(self.active_tasks),
            "active_shade_tasks": len(self.active_shade_tasks),
            "total_cancelled_tasks": len(self.cancelled_tasks),
            "active_task_ids": list(self.active_tasks.keys()),
            "shade_task_mapping": self.active_shade_tasks.copy(),
            "recent_cancellations": len([t for t in self.cancelled_tasks.values() if time.time() - t < 300])  # Last 5 minutes
        }
    
    def cancel_task(self, task_id: str) -> bool:
        """
        Cancel a specific retry task.
        
        Args:
            task_id: Task ID to cancel
            
        Returns:
            bool: True if task was found and cancelled, False otherwise
        """
        if task_id in self.active_tasks:
            self.active_tasks[task_id].cancel()
            logger.info(f"🛑 Cancelled retry task: {task_id}")
            return True
        return False
    
    def cancel_all_tasks(self):
        """Cancel all active retry tasks"""
        cancelled_count = 0
        for task_id, task in self.active_tasks.items():
            task.cancel()
            cancelled_count += 1
        
        self.active_tasks.clear()
        logger.info(f"🛑 Cancelled {cancelled_count} active retry tasks")
    
    async def wait_for_task(self, task_id: str, timeout: Optional[float] = None) -> bool:
        """
        Wait for a specific retry task to complete.
        
        Args:
            task_id: Task ID to wait for
            timeout: Maximum time to wait in seconds
            
        Returns:
            bool: True if task completed successfully, False if timeout/cancelled/error
        """
        if task_id not in self.active_tasks:
            return False
        
        try:
            await asyncio.wait_for(self.active_tasks[task_id], timeout=timeout)
            return True
        except (asyncio.TimeoutError, asyncio.CancelledError):
            return False
        except Exception as e:
            logger.error(f"❌ Error waiting for task {task_id}: {e}")
            return False

# Global service instance
async_retry_service = AsyncRetryService()