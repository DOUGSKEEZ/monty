# /commander/services/async_retry_service.py

import asyncio
import logging
import time
from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass
from commander.interface.arduino_whisperer import send_shade_command_fast, send_shade_command_single_shot

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
        
        # ZOMBIE MONITORING: Enhanced tracking
        self.zombie_warnings: Dict[str, float] = {}  # task_id -> first_warning_timestamp
        self.zombie_metrics = {
            "total_zombies_detected": 0,
            "total_zombies_cleaned": 0,
            "total_timeout_kills": 0,
            "zombies_today": 0,
            "last_reset_date": self._get_current_date()
        }

        # Start periodic cleanup task
        asyncio.create_task(self._cleanup_old_tasks())
    
    async def _cleanup_old_tasks(self):
        """Periodically clean up tasks and detect zombies"""
        while True:
            try:
                await asyncio.sleep(60)  # Check every 1 minute for better zombie detection
                
                # Check for daily reset first
                self._check_daily_reset()
                
                current_time = time.time()
                tasks_to_remove = []
                zombie_warnings_to_remove = []
                
                for task_id, task in self.active_tasks.items():
                    # Parse timestamp from task_id
                    try:
                        task_timestamp = int(task_id.split('_')[-1]) / 1000
                        task_age_minutes = (current_time - task_timestamp) / 60
                        
                        # ZOMBIE DETECTION: Tasks older than 6 seconds are suspicious
                        task_age_seconds = current_time - task_timestamp
                        if task_age_seconds > 6:
                            if task_id not in self.zombie_warnings:
                                # First time detecting this potential zombie
                                self.zombie_warnings[task_id] = current_time
                                self.zombie_metrics["total_zombies_detected"] += 1
                                self.zombie_metrics["zombies_today"] += 1
                                logger.warning(f"🧟 ZOMBIE DETECTED: Task {task_id} is {task_age_seconds:.1f} seconds old - will cleanup at 12 seconds")
                            
                            # ZOMBIE CLEANUP: Tasks older than 12 seconds get force-killed
                            if task_age_seconds > 12:  # 12 seconds max
                                task.cancel()
                                tasks_to_remove.append(task_id)
                                zombie_warnings_to_remove.append(task_id)
                                self.zombie_metrics["total_zombies_cleaned"] += 1
                                logger.error(f"🧟 ZOMBIE CLEANUP: Force-cancelled task {task_id} (age: {task_age_seconds:.1f} seconds)")

                        # Remove resolved warnings for tasks that completed normally
                        elif task_id in self.zombie_warnings:
                            zombie_warnings_to_remove.append(task_id)
                            logger.info(f"✅ ZOMBIE RESOLVED: Task {task_id} completed normally after warning")
                            
                    except:
                        pass
                
                # Clean up removed tasks
                for task_id in tasks_to_remove:
                    self.active_tasks.pop(task_id, None)
                    # Also remove from shade mapping if present
                    for shade_id, tid in list(self.active_shade_tasks.items()):
                        if tid == task_id:
                            del self.active_shade_tasks[shade_id]
                
                # Clean up resolved zombie warnings
                for task_id in zombie_warnings_to_remove:
                    self.zombie_warnings.pop(task_id, None)
                
                # Log summary if there are active zombie warnings
                active_warnings = len(self.zombie_warnings)
                if active_warnings > 0:
                    logger.warning(f"🧟 ZOMBIE STATUS: {active_warnings} active warnings, {self.zombie_metrics['zombies_today']} today, {self.zombie_metrics['total_zombies_detected']} total detected")
            
            except Exception as e:
                logger.error(f"Error in cleanup/zombie detection task: {e}")
    
    def _get_current_date(self) -> str:
        """Get current date as YYYY-MM-DD string"""
        from datetime import datetime
        return datetime.now().strftime("%Y-%m-%d")
    
    def _check_daily_reset(self):
        """Reset daily zombie count if it's a new day"""
        current_date = self._get_current_date()
        if current_date != self.zombie_metrics["last_reset_date"]:
            old_count = self.zombie_metrics["zombies_today"]
            self.zombie_metrics["zombies_today"] = 0
            self.zombie_metrics["last_reset_date"] = current_date
            if old_count > 0:
                logger.info(f"📅 Daily zombie reset: {old_count} zombies detected yesterday, counter reset for {current_date}")
    
    def _generate_task_id(self) -> str:
        """Generate unique task ID"""
        self.task_counter += 1
        return f"retry_{self.task_counter}_{int(time.time() * 1000)}"
    
    async def _execute_fire_and_forget_sequence(self, retry_task: RetryTask) -> None:
        """
        Execute fire-and-forget command sequence (including first command).
        
        This replaces the retry sequence with a complete fire-and-forget approach:
        - Executes first command immediately in background
        - Follows with 2 additional commands at optimized intervals (total 3 attempts)
        - Silent failure strategy - no blocking on errors
        - ZOMBIE PREVENTION: Overall timeout protection
        
        Args:
            retry_task: The retry task containing shade_id, action, and timing
        """
        try:
            logger.info(f"🚀 Starting fire-and-forget sequence for shade {retry_task.shade_id} action '{retry_task.action}' (task: {retry_task.task_id})")
            
            # Command 1: Execute immediately (true fire-and-forget)
            cmd_start = time.time()
            logger.info(f"🚀 Command 1/3 for shade {retry_task.shade_id} action '{retry_task.action}' (immediate)")
            result = await send_shade_command_fast(retry_task.shade_id, retry_task.action)
            cmd_time = int((time.time() - cmd_start) * 1000)
            
            if result["success"]:
                logger.debug(f"✅ Command 1/3 sent for shade {retry_task.shade_id} (took {cmd_time}ms)")
            else:
                logger.warning(f"⚠️ Command 1/3 failed for shade {retry_task.shade_id}: {result.get('message', 'Unknown error')} (took {cmd_time}ms)")
            
            # Commands 2-3: Execute at optimized intervals
            for i, delay_ms in enumerate(retry_task.retry_delays_ms):
                # Wait for the specified delay
                await asyncio.sleep(delay_ms / 1000.0)
                
                # Execute the command (true fire-and-forget)
                cmd_start = time.time()
                logger.info(f"🚀 Command {i+2}/3 for shade {retry_task.shade_id} action '{retry_task.action}' (after {delay_ms}ms)")
                result = await send_shade_command_fast(retry_task.shade_id, retry_task.action)
                cmd_time = int((time.time() - cmd_start) * 1000)
                
                if result["success"]:
                    logger.debug(f"✅ Command {i+2}/3 sent for shade {retry_task.shade_id} (took {cmd_time}ms)")
                else:
                    logger.warning(f"⚠️ Command {i+2}/3 failed for shade {retry_task.shade_id}: {result.get('message', 'Unknown error')} (took {cmd_time}ms)")
            
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
            retry_delays_ms=[650, 1500],  # RF-optimized timing for commands 2-3 (total 3 attempts)
            task_id=task_id,
            started_at=time.time()
        )
        
        # Start the fire-and-forget background task with overall timeout protection
        # ZOMBIE PREVENTION: Maximum 10 seconds for entire sequence (includes all delays + commands)
        async def timeout_protected_sequence():
            try:
                await asyncio.wait_for(
                    self._execute_fire_and_forget_sequence(retry_task),
                    timeout=10.0  # 10 second max for entire sequence
                )
            except asyncio.TimeoutError:
                self.zombie_metrics["total_timeout_kills"] += 1
                logger.error(f"🧟 ZOMBIE PREVENTION: Task {task_id} exceeded 10s timeout - forcing cleanup (total timeouts: {self.zombie_metrics['total_timeout_kills']})")
                # The finally block in _execute_fire_and_forget_sequence will handle cleanup
                raise
        
        task = asyncio.create_task(timeout_protected_sequence())
        self.active_tasks[task_id] = task
        
        # Track this task for the specific shade (for future cancellation)
        self.active_shade_tasks[shade_id] = task_id
        
        logger.info(f"🚀 Queued fire-and-forget sequence for shade {shade_id} action '{action}' (task: {task_id})")
        return task_id
    
    def queue_scene_execution(self, scene_name: str, scene_commands: List[Dict[str, Any]], 
                            retry_count: int, delay_between_commands_ms: int = 750,
                            timeout_seconds: int = 30) -> str:
        """
        Queue complete scene execution as a background task (fire-and-forget).
        
        This makes scenes non-blocking like individual shade commands.
        
        Implements "Latest Scene Wins" - cancels any active scene tasks before starting.
        
        Args:
            scene_name: Name of the scene to execute
            scene_commands: List of commands with shade_id, action, and delay_ms
            retry_count: Total number of execution cycles (including first)
            delay_between_commands_ms: Default delay between commands
            timeout_seconds: Timeout for the entire scene execution
            
        Returns:
            task_id: Unique identifier for this scene execution
        """
        # LATEST SCENE WINS: Cancel any active scene tasks before starting new scene
        scene_tasks_cancelled = self.cancel_all_scene_tasks()
        if scene_tasks_cancelled > 0:
            logger.info(f"🎬 Latest Scene Wins: Cancelled {scene_tasks_cancelled} active scene tasks before starting '{scene_name}'")
        
        task_id = self._generate_task_id()
        
        async def execute_scene_with_retries():
            """Execute the scene with all retry cycles"""
            try:
                logger.info(f"🎬 Starting scene '{scene_name}' execution with {retry_count} total cycles")
                
                for cycle in range(retry_count):
                    logger.info(f"🔄 Scene '{scene_name}' cycle {cycle + 1}/{retry_count}")
                    
                    for i, cmd in enumerate(scene_commands):
                        shade_id = cmd["shade_id"]
                        try:
                            # LATEST COMMAND WINS: Register this shade as being controlled by this scene
                            # This allows individual shade commands to cancel scene commands for this shade
                            cancelled = self.cancel_shade_retries(shade_id)
                            if cancelled:
                                logger.info(f"🔄 Latest Command Wins: Scene cancelled previous command for shade {shade_id}")
                            
                            # Register this scene task as controlling this shade
                            self.active_shade_tasks[shade_id] = task_id
                            
                            # Execute the command (single-shot, no individual retries)
                            result = await send_shade_command_single_shot(shade_id, cmd["action"])
                            
                            if result["success"]:
                                logger.debug(f"✅ Scene command: shade {shade_id} {cmd['action']} successful")
                            else:
                                logger.warning(f"⚠️ Scene command: shade {shade_id} {cmd['action']} failed")
                            
                            # Apply command-specific delay or default delay
                            delay_ms = cmd.get("delay_ms", delay_between_commands_ms)
                            if i < len(scene_commands) - 1 and delay_ms > 0:
                                await asyncio.sleep(delay_ms / 1000.0)
                                
                        except Exception as e:
                            logger.error(f"❌ Scene command error for shade {shade_id}: {e}")
                        finally:
                            # Unregister this shade when command completes (successful or failed)
                            if shade_id in self.active_shade_tasks and self.active_shade_tasks[shade_id] == task_id:
                                del self.active_shade_tasks[shade_id]
                    
                    # Add delay between retry cycles (except after last cycle)
                    if cycle < retry_count - 1:
                        await asyncio.sleep(2.0)  # 2 second delay between cycles
                
                logger.info(f"✅ Scene '{scene_name}' completed all {retry_count} cycles")
                
            except asyncio.CancelledError:
                logger.info(f"🛑 Scene '{scene_name}' task {task_id} was cancelled")
                raise
            except Exception as e:
                logger.error(f"❌ Scene '{scene_name}' execution failed: {e}")
            finally:
                # Clean up the task
                if task_id in self.active_tasks:
                    del self.active_tasks[task_id]
        
        # Create task with timeout protection
        async def timeout_protected_scene():
            try:
                await asyncio.wait_for(
                    execute_scene_with_retries(),
                    timeout=float(timeout_seconds)
                )
            except asyncio.TimeoutError:
                logger.error(f"⏱️ Scene '{scene_name}' timed out after {timeout_seconds}s")
        
        # Queue the scene execution as a background task
        task = asyncio.create_task(timeout_protected_scene())
        self.active_tasks[task_id] = task
        
        logger.info(f"🚀 Queued scene '{scene_name}' for background execution (task: {task_id})")
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
        try:
            logger.info(f"🎬 Starting {retry_count} background retry cycles for scene '{scene_name}'")
            
            for cycle in range(retry_count):
                    
                logger.info(f"🔄 Scene '{scene_name}' retry cycle {cycle + 1}/{retry_count}")
                
                for i, cmd in enumerate(scene_commands):
                    try:
                        # Execute the command (single-shot, no individual retries)
                        result = await send_shade_command_single_shot(cmd["shade_id"], cmd["action"])
                        
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
        """Get comprehensive task statistics for monitoring (including zombie metrics)"""
        current_time = time.time()
        
        # Calculate task ages for better monitoring
        task_ages = {}
        suspicious_tasks = []
        for task_id in self.active_tasks.keys():
            try:
                task_timestamp = int(task_id.split('_')[-1]) / 1000
                age_minutes = (current_time - task_timestamp) / 60
                task_ages[task_id] = age_minutes
                if age_minutes > 5:  # Tasks older than 5 minutes are suspicious
                    suspicious_tasks.append({"task_id": task_id, "age_minutes": round(age_minutes, 1)})
            except:
                task_ages[task_id] = 0
        
        return {
            "total_active_tasks": len(self.active_tasks),
            "active_shade_tasks": len(self.active_shade_tasks),
            "total_cancelled_tasks": len(self.cancelled_tasks),
            "active_task_ids": list(self.active_tasks.keys()),
            "shade_task_mapping": self.active_shade_tasks.copy(),
            "recent_cancellations": len([t for t in self.cancelled_tasks.values() if time.time() - t < 300]),  # Last 5 minutes
            # ZOMBIE MONITORING METRICS for dashboard
            "zombie_metrics": self.zombie_metrics.copy(),
            "active_zombie_warnings": len(self.zombie_warnings),
            "suspicious_tasks": suspicious_tasks,
            "task_ages": task_ages,
            "oldest_task_age_minutes": max(task_ages.values()) if task_ages else 0
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
    
    def cancel_all_scene_tasks(self) -> int:
        """
        Cancel all active scene tasks (for Latest Scene Wins).
        
        Scene tasks have task_ids that don't correspond to individual shades
        in active_shade_tasks mapping.
        
        Returns:
            int: Number of scene tasks cancelled
        """
        scene_tasks_cancelled = 0
        tasks_to_cancel = []
        
        # Find scene tasks (tasks not in active_shade_tasks)
        shade_task_ids = set(self.active_shade_tasks.values())
        
        for task_id, task in self.active_tasks.items():
            if task_id not in shade_task_ids:  # This is a scene task
                tasks_to_cancel.append((task_id, task))
        
        # Cancel scene tasks
        for task_id, task in tasks_to_cancel:
            task.cancel()
            scene_tasks_cancelled += 1
            logger.info(f"🛑 Cancelled scene task: {task_id}")
            # Remove from active_tasks (cleanup will happen in task's finally block)
        
        return scene_tasks_cancelled
    
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