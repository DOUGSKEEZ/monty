import asyncio
import glob
import logging
import serial
import time
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import threading

logger = logging.getLogger(__name__)

class SmartArduinoConnection:
    """
    Smart Arduino connection manager with caching and background health checks.
    
    - Auto-detects on first command of the day (gives you snooze time! 😴)
    - Caches connection for instant subsequent commands ⚡
    - Background health check every hour 🕐
    - Graceful reconnection only when needed 🔄
    """
    
    def __init__(self, baud_rate: int = 115200):
        self.baud_rate = baud_rate
        self.serial_connection: Optional[serial.Serial] = None
        self.current_port: Optional[str] = None
        self.last_successful_command: Optional[datetime] = None
        self.last_health_check: Optional[datetime] = None
        self.connection_lock = threading.Lock()
        self.last_command_time: Optional[float] = None  # Track timing between commands
        
        # Health check every hour (much more reasonable than 5-10 minutes!)
        self.health_check_interval = timedelta(hours=1)
        
        # DISABLED: Background health checker - causes serial blocking during RF transmission
        # self._start_background_health_check()
        
        logger.info("🤖 Smart Arduino Whisperer initialized - ready for your snooze-friendly shade control!")
    
    def _start_background_health_check(self):
        """Start background thread for periodic health checks"""
        def health_check_loop():
            while True:
                try:
                    time.sleep(3600)  # Sleep for 1 hour
                    if self._should_do_health_check():
                        logger.info("🏥 Hourly Arduino health check...")
                        # Use timeout to prevent deadlock
                        lock_acquired = self.connection_lock.acquire(timeout=5.0)
                        if lock_acquired:
                            try:
                                self._test_connection_health()
                            finally:
                                self.connection_lock.release()
                        else:
                            logger.warning("⚠️ Health check skipped - connection lock busy")
                except Exception as e:
                    logger.error(f"❌ Background health check error: {e}")
        
        health_thread = threading.Thread(target=health_check_loop, daemon=True)
        health_thread.start()
        logger.info("⏰ Background health checker started (every hour)")
    
    def _should_do_health_check(self) -> bool:
        """Check if it's time for a health check"""
        if not self.last_health_check:
            return True
        return datetime.now() - self.last_health_check > self.health_check_interval
    
    def _find_arduino_port(self) -> Optional[str]:
        """
        Auto-detect Arduino port by checking all available serial ports.
        This is the "slow" operation that we only do when needed.
        """
        logger.info("🔍 Searching for Arduino... (grab some coffee! ☕)")
        
        # Get all potential serial ports
        potential_ports = []
        potential_ports.extend(glob.glob('/dev/ttyACM*'))
        potential_ports.extend(glob.glob('/dev/ttyUSB*'))
        
        # Also check by-id directory for more reliable detection
        try:
            arduino_ports = glob.glob('/dev/serial/by-id/*Arduino*')
            arduino_ports.extend(glob.glob('/dev/serial/by-id/*arduino*'))
            potential_ports.extend(arduino_ports)
        except:
            pass
        
        if not potential_ports:
            logger.warning("❌ No serial ports found!")
            return None
        
        logger.info(f"📡 Found potential ports: {potential_ports}")
        
        # Try each port to see if it's our Arduino
        for port in potential_ports:
            try:
                logger.debug(f"🔌 Testing port: {port}")
                
                # Try to open the port
                test_ser = serial.Serial(port, self.baud_rate, timeout=2, write_timeout=2)
                time.sleep(2)  # Give Arduino time to reset/initialize
                
                # Send INFO command to see if it's our Arduino
                test_ser.write(b'INFO\n')
                time.sleep(0.5)
                
                # Read response
                start_time = time.time()
                while time.time() - start_time < 3:  # Wait up to 3 seconds
                    if test_ser.in_waiting:
                        line = test_ser.readline().decode().strip()
                        logger.debug(f"📨 Response: {line}")
                        
                        # Look for Arduino shade controller specific responses
                        if any(keyword in line.lower() for keyword in ['shade', 'tx', 'ready', 'arduino']):
                            logger.info(f"✅ Found Arduino Shade Controller at: {port}")
                            test_ser.close()
                            return port
                
                test_ser.close()
                logger.debug(f"❌ Port {port} didn't respond as expected")
                
            except Exception as e:
                logger.debug(f"❌ Failed to test port {port}: {e}")
                continue
        
        logger.warning("😞 No Arduino Shade Controller found on any port")
        return None
    
    def _test_connection_health(self) -> bool:
        """Test if current connection is still healthy (must be called with lock held)"""
        if not self.serial_connection:
            return False
        
        try:
            # Send a quick INFO command to test
            self.serial_connection.write(b'INFO\n')
            time.sleep(0.1)
            
            # Try to read response (don't care about content, just that it responds)
            start_time = time.time()
            while time.time() - start_time < 1:  # Quick 1-second timeout
                if self.serial_connection.in_waiting:
                    self.serial_connection.readline()  # Clear the response
                    self.last_health_check = datetime.now()
                    logger.debug("💚 Arduino connection healthy")
                    return True
            
            # No response - connection is dead
            logger.warning("💔 Arduino connection appears dead")
            return False
            
        except Exception as e:
            logger.warning(f"💔 Arduino connection test failed: {e}")
            return False
    
    def _establish_connection(self) -> bool:
        """
        Establish connection to Arduino (the potentially slow part).
        Only called when we don't have a working connection.
        """
        with self.connection_lock:
            # Close existing connection if any
            if self.serial_connection:
                try:
                    self.serial_connection.close()
                except:
                    pass
                self.serial_connection = None
                self.current_port = None
            
            # Find the Arduino port
            port = self._find_arduino_port()
            if not port:
                return False
            
            try:
                # Connect to the Arduino with non-blocking settings
                # timeout=1 for reads (health checks), write_timeout=0 for non-blocking writes
                self.serial_connection = serial.Serial(port, self.baud_rate, timeout=1, write_timeout=0)
                time.sleep(2)  # Wait for Arduino to initialize
                self.current_port = port
                
                # Test the connection
                if self._test_connection_health():
                    logger.info(f"🎉 Successfully connected to Arduino at: {port}")
                    return True
                else:
                    # Connection established but not responding properly
                    self.serial_connection.close()
                    self.serial_connection = None
                    self.current_port = None
                    return False
                    
            except Exception as e:
                logger.error(f"❌ Failed to connect to {port}: {e}")
                return False
    
    async def get_connection(self) -> Optional[serial.Serial]:
        """
        Get a working Arduino connection.
        
        This is the main method that implements our smart caching:
        - First call: Auto-detect (gives you snooze time! 😴)
        - Subsequent calls: Instant cached connection ⚡
        - Reconnect only when needed 🔄
        """
        # If we have a connection, test if it's still good
        if self.serial_connection:
            with self.connection_lock:
                if self._test_connection_health():
                    return self.serial_connection
                else:
                    logger.info("🔄 Cached connection failed, reconnecting...")
        
        # Need to establish new connection
        logger.info("🌅 First connection of the session - auto-detecting Arduino...")
        if self._establish_connection():
            self.last_successful_command = datetime.now()
            return self.serial_connection
        else:
            logger.error("💥 Failed to connect to Arduino")
            return None
    
    async def send_command_fast(self, command: str, timeout: float = 0.05) -> Dict[str, Any]:
        """
        Send a command to Arduino with fire-and-forget optimization.
        
        Fire-and-forget optimizations:
        - Ultra-fast 50ms timeout (down from 1000ms+)
        - No connection health checks
        - Assume Arduino is connected
        - Silent failure on errors
        
        Args:
            command: Command string to send
            timeout: Response timeout in seconds (default 200ms)
            
        Returns:
            Dict with success status and response data
        """
        # Fast-fail if no cached connection exists
        if not self.serial_connection:
            logger.warning(f"❌ No Arduino connection available for fire-and-forget command: {command}")
            return {
                "success": False,
                "error": "No Arduino connection",
                "port": None,
                "command": command
            }
        
        try:
            # Try to acquire lock with timeout to prevent indefinite blocking
            lock_acquired = self.connection_lock.acquire(timeout=1.0)  # 1 second timeout
            if not lock_acquired:
                logger.warning(f"⚠️ Failed to acquire connection lock for command: {command}")
                return {
                    "success": False,
                    "error": "Connection lock timeout - possible serial deadlock",
                    "port": self.current_port,
                    "command": command
                }
            
            try:
                # TRUE FIRE-AND-FORGET: Send command without waiting for response
                try:
                    # Track command spacing
                    current_time = time.time()
                    if self.last_command_time:
                        spacing_ms = (current_time - self.last_command_time) * 1000
                        logger.info(f"⏱️ Command spacing: {spacing_ms:.1f}ms since last command")
                        if spacing_ms < 100:  # Less than 100ms between commands is concerning
                            logger.warning(f"⚠️ RAPID COMMANDS: Only {spacing_ms:.1f}ms between commands!")
                    
                    # Track serial write timing
                    write_start = time.time()
                    logger.info(f"📝 Serial write starting for command: {command[:20]}...")
                    
                    # Flush buffers before write to clear any pending data
                    self.serial_connection.reset_input_buffer()
                    self.serial_connection.reset_output_buffer()
                    
                    # Set write_timeout to 0.1 seconds (was 0, which might cause buffer issues)
                    self.serial_connection.write_timeout = 0.1
                    bytes_to_write = (command + '\n').encode()
                    bytes_written = self.serial_connection.write(bytes_to_write)
                    
                    write_end = time.time()
                    write_duration_ms = (write_end - write_start) * 1000
                    
                    # Update last command time
                    self.last_command_time = write_end
                    
                    # Log write completion with timing
                    logger.info(f"✍️ Serial write completed: {bytes_written} bytes in {write_duration_ms:.1f}ms")
                    
                    # Check if write was suspiciously slow (>10ms for non-blocking should be concerning)
                    if write_duration_ms > 10:
                        logger.warning(f"⚠️ SLOW serial write: {write_duration_ms:.1f}ms for {bytes_written} bytes")
                    
                    # Immediately mark as successful - we don't wait for Arduino
                    self.last_successful_command = datetime.now()
                    
                    # Return success immediately
                    return {
                        "success": True,
                        "responses": ["Fire-and-forget - no response expected"],
                        "port": self.current_port,
                        "command": command,
                        "write_duration_ms": write_duration_ms
                    }
                except serial.SerialTimeoutException:
                    # This shouldn't happen with write_timeout=0, but just in case
                    logger.warning(f"⏱️ Write timeout for command: {command}")
                    return {
                        "success": False,
                        "error": "Serial write timeout - Arduino may be unresponsive",
                        "port": self.current_port,
                        "command": command
                    }
                except Exception as e:
                    # Buffer full or other write error
                    logger.warning(f"⚠️ Write error for command: {command} - {str(e)}")
                    return {
                        "success": False,
                        "error": f"Serial write error: {str(e)}",
                        "port": self.current_port,
                        "command": command
                    }
            finally:
                self.connection_lock.release()
                
        except Exception as e:
            # Silent failure - just log debug and continue
            logger.debug(f"🔇 Fire-and-forget command '{command}' failed silently: {e}")
            
            # Don't reset connection on single command failure in fire-and-forget mode
            # Let the health check handle connection issues
            
            return {
                "success": False,
                "error": str(e),
                "port": self.current_port,
                "command": command
            }
    
    def get_status(self) -> Dict[str, Any]:
        """Get current connection status"""
        return {
            "connected": self.serial_connection is not None,
            "port": self.current_port,
            "last_successful_command": self.last_successful_command.isoformat() if self.last_successful_command else None,
            "last_health_check": self.last_health_check.isoformat() if self.last_health_check else None,
            "next_health_check": (self.last_health_check + self.health_check_interval).isoformat() if self.last_health_check else None
        }
    
    async def reconnect(self) -> bool:
        """Force a reconnection (useful for testing or manual recovery)"""
        logger.info("🔄 Manual reconnection requested...")
        return self._establish_connection()
    
    def close(self):
        """Clean shutdown of connection"""
        with self.connection_lock:
            if self.serial_connection:
                try:
                    self.serial_connection.close()
                    logger.info("🔌 Arduino connection closed")
                except:
                    pass
                finally:
                    self.serial_connection = None
                    self.current_port = None


# Global instance for the FastAPI app
arduino_connection = SmartArduinoConnection()


# Database and command functions
import sqlite3
from pathlib import Path

# Database path
DB_PATH = Path("/home/monty/monty/shades/data/shades.db")

def _get_shade_data(shade_id: int) -> Optional[Dict[str, Any]]:
    """Get shade configuration from database"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM shades WHERE shade_id = ?", (shade_id,))
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            logger.error(f"Shade {shade_id} not found in database")
            return None
        
        return dict(row)
        
    except Exception as e:
        logger.error(f"Database error getting shade {shade_id}: {e}")
        return None

def get_all_shades() -> list[Dict[str, Any]]:
    """Get list of all configured shades"""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT shade_id, remote_id, room, location, facing, type,
                   room || ' ' || location as name
            FROM shades 
            ORDER BY shade_id ASC
        """)
        rows = cursor.fetchall()
        conn.close()
        
        return [dict(row) for row in rows]
        
    except Exception as e:
        logger.error(f"Database error getting all shades: {e}")
        return []

# Smart Arduino functions for FastAPI
async def send_shade_command_fast(shade_id: int, command: str) -> Dict[str, Any]:
    """
    Send a shade command with fire-and-forget optimization.
    
    Fire-and-forget optimizations:
    - No database lookup caching
    - Fast 200ms Arduino timeout
    - Silent failure strategy
    - Minimal error handling
    
    Args:
        shade_id: Shade ID from database
        command: 'u' (up), 'd' (down), or 's' (stop)
    
    Returns:
        Dict with success status, message, and execution details
    """
    start_time = time.time()
    
    # Fast command validation
    if command not in ['u', 'd', 's']:
        return {
            "success": False,
            "message": f"Invalid command '{command}'. Must be u, d, or s",
            "shade_id": shade_id,
            "action": command,
            "execution_time_ms": 0
        }
    
    # Get shade configuration from database (fast lookup)
    shade_data = _get_shade_data(shade_id)
    if not shade_data:
        return {
            "success": False,
            "message": f"Shade {shade_id} not found in database",
            "shade_id": shade_id,
            "action": command,
            "execution_time_ms": int((time.time() - start_time) * 1000)
        }
    
    try:
        # Select command based on action (fast lookup)
        if command == 'u':
            cmd = shade_data.get('up_command')
        elif command == 'd':
            cmd = shade_data.get('down_command')
        else:  # command == 's'
            cmd = shade_data.get('stop_command')
        
        if not cmd or cmd == 'FF FF':
            return {
                "success": False,
                "message": f"Command '{command}' not configured for shade {shade_id}",
                "shade_id": shade_id,
                "action": command,
                "execution_time_ms": int((time.time() - start_time) * 1000)
            }
        
        # Build Arduino command (optimized)
        remote_type_val = 0 if shade_data['remote_type'] == 'AC123-06D' else 1
        cmd_type_val = 0 if command == 'u' else 1 if command == 'd' else 2
        is_cc = 1 if shade_data['channel'] == 'CC' else 0
        
        arduino_command = (f"TX:{shade_data['remote_id']:02X},"
                         f"{shade_data['header_bytes'].replace(' ', '')},"
                         f"{shade_data['identifier_bytes'].replace(' ', '')},"
                         f"{cmd.replace(' ', '')},"
                         f"{remote_type_val},"
                         f"{shade_data['common_byte']},"
                         f"{is_cc},"
                         f"{cmd_type_val}")
        
        # Send command via fire-and-forget Arduino connection (200ms timeout)
        result = await arduino_connection.send_command_fast(arduino_command, timeout=0.2)
        
        execution_time_ms = int((time.time() - start_time) * 1000)
        
        if result["success"]:
            action_name = {'u': 'UP', 'd': 'DOWN', 's': 'STOP'}[command]
            message = f"Shade {shade_id} {action_name} fire-and-forget command sent"
            logger.debug(f"🚀 {message} (took {execution_time_ms}ms)")
            
            return {
                "success": True,
                "message": message,
                "shade_id": shade_id,
                "action": command,
                "execution_time_ms": execution_time_ms,
                "arduino_response": "\n".join(result.get("responses", [])) if result.get("responses") else None,
                "port": result.get("port")
            }
        else:
            # Silent failure in fire-and-forget mode
            logger.debug(f"🔇 Fire-and-forget command failed for shade {shade_id}: {result.get('error', 'Unknown error')}")
            return {
                "success": False,
                "message": f"Fire-and-forget command failed silently",
                "shade_id": shade_id,
                "action": command,
                "execution_time_ms": execution_time_ms,
                "arduino_response": result.get("error")
            }
            
    except Exception as e:
        execution_time_ms = int((time.time() - start_time) * 1000)
        logger.debug(f"🔇 Fire-and-forget shade {shade_id} error: {e}")
        return {
            "success": False,
            "message": f"Fire-and-forget command error",
            "shade_id": shade_id,
            "action": command,
            "execution_time_ms": execution_time_ms
        }

async def send_shade_command_single_shot(shade_id: int, command: str) -> Dict[str, Any]:
    """
    Send a single shade command with NO retries - for scene execution.
    
    This is used by scenes to send one attempt per shade per cycle,
    letting the scene retry logic handle repetition instead of
    individual shade retry bursts.
    
    Args:
        shade_id: Shade ID from database
        command: 'u' (up), 'd' (down), or 's' (stop)
    
    Returns:
        Dict with success status, message, and execution details
    """
    start_time = time.time()
    
    # Fast command validation
    if command not in ['u', 'd', 's']:
        return {
            "success": False,
            "message": f"Invalid command '{command}'. Must be u, d, or s",
            "shade_id": shade_id,
            "action": command,
            "execution_time_ms": 0
        }
    
    # Get shade configuration from database (fast lookup)
    shade_data = _get_shade_data(shade_id)
    if not shade_data:
        return {
            "success": False,
            "message": f"Shade {shade_id} not found in database",
            "shade_id": shade_id,
            "action": command,
            "execution_time_ms": int((time.time() - start_time) * 1000)
        }
    
    try:
        # Select command based on action (fast lookup)
        if command == 'u':
            cmd = shade_data.get('up_command')
        elif command == 'd':
            cmd = shade_data.get('down_command')
        else:  # command == 's'
            cmd = shade_data.get('stop_command')
        
        if not cmd or cmd == 'FF FF':
            return {
                "success": False,
                "message": f"Command '{command}' not configured for shade {shade_id}",
                "shade_id": shade_id,
                "action": command,
                "execution_time_ms": int((time.time() - start_time) * 1000)
            }
        
        # Build Arduino command (optimized)
        remote_type_val = 0 if shade_data['remote_type'] == 'AC123-06D' else 1
        cmd_type_val = 0 if command == 'u' else 1 if command == 'd' else 2
        is_cc = 1 if shade_data['channel'] == 'CC' else 0
        
        arduino_command = (f"TX:{shade_data['remote_id']:02X},"
                         f"{shade_data['header_bytes'].replace(' ', '')},"
                         f"{shade_data['identifier_bytes'].replace(' ', '')},"
                         f"{cmd.replace(' ', '')},"
                         f"{remote_type_val},"
                         f"{shade_data['common_byte']},"
                         f"{is_cc},"
                         f"{cmd_type_val}")
        
        # Send SINGLE command (no retries) via fire-and-forget Arduino connection
        result = await arduino_connection.send_command_fast(arduino_command, timeout=0.05)
        
        execution_time_ms = int((time.time() - start_time) * 1000)
        
        if result["success"]:
            action_name = {'u': 'UP', 'd': 'DOWN', 's': 'STOP'}[command]
            message = f"Shade {shade_id} {action_name} single-shot command sent"
            logger.debug(f"🎯 {message} (took {execution_time_ms}ms)")
            
            return {
                "success": True,
                "message": message,
                "shade_id": shade_id,
                "action": command,
                "execution_time_ms": execution_time_ms,
                "arduino_response": "\n".join(result.get("responses", [])) if result.get("responses") else None,
                "port": result.get("port")
            }
        else:
            # Silent failure in single-shot mode
            logger.debug(f"🎯 Single-shot command failed for shade {shade_id}: {result.get('error', 'Unknown error')}")
            return {
                "success": False,
                "message": f"Single-shot command failed silently",
                "shade_id": shade_id,
                "action": command,
                "execution_time_ms": execution_time_ms,
                "arduino_response": result.get("error")
            }
            
    except Exception as e:
        execution_time_ms = int((time.time() - start_time) * 1000)
        logger.debug(f"🎯 Single-shot shade {shade_id} error: {e}")
        return {
            "success": False,
            "message": f"Single-shot command error",
            "shade_id": shade_id,
            "action": command,
            "execution_time_ms": execution_time_ms
        }

# Keep the original function for compatibility and health checks
async def send_shade_command(shade_id: int, command: str) -> Dict[str, Any]:
    """Legacy function - redirects to fast fire-and-forget implementation"""
    return await send_shade_command_fast(shade_id, command)


async def get_arduino_status() -> Dict[str, Any]:
    """Get Arduino connection status for monitoring"""
    return arduino_connection.get_status()


async def force_arduino_reconnect() -> Dict[str, Any]:
    """Force Arduino reconnection (for troubleshooting)"""
    success = await arduino_connection.reconnect()
    return {
        "success": success,
        "message": "Reconnection successful" if success else "Reconnection failed",
        "status": arduino_connection.get_status()
    }


# Cleanup function for app shutdown
def cleanup_arduino_connection():
    """Call this when your FastAPI app shuts down"""
    arduino_connection.close()