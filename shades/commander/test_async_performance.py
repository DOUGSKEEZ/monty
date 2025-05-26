#!/usr/bin/env python3
"""
Test script to verify async retry performance improvements.

This script will start the ShadeCommander server and test:
1. Individual shade command response times (<100ms)
2. Scene command response times (<200ms)
3. Background retry task monitoring
"""

import asyncio
import json
import time
import requests
import subprocess
import sys
from pathlib import Path

# Configuration
BASE_URL = "http://localhost:8000"
TIMEOUT = 10  # seconds

class PerformanceTest:
    def __init__(self):
        self.server_process = None
        self.test_results = {
            "individual_commands": [],
            "scene_commands": [],
            "background_tasks": []
        }
    
    def start_server(self):
        """Start the ShadeCommander server"""
        try:
            print("🚀 Starting ShadeCommander server...")
            
            # Start server in background
            self.server_process = subprocess.Popen(
                ["python3", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"],
                cwd="/home/monty/monty/shades/commander",
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            
            # Wait for server to start
            print("⏳ Waiting for server to start...")
            time.sleep(3)
            
            # Test if server is responding
            for attempt in range(10):
                try:
                    response = requests.get(f"{BASE_URL}/health/ping", timeout=2)
                    if response.status_code == 200:
                        print("✅ Server started successfully")
                        return True
                except:
                    time.sleep(1)
            
            print("❌ Server failed to start")
            return False
            
        except Exception as e:
            print(f"❌ Error starting server: {e}")
            return False
    
    def stop_server(self):
        """Stop the ShadeCommander server"""
        if self.server_process:
            print("🛑 Stopping server...")
            self.server_process.terminate()
            self.server_process.wait()
    
    def test_individual_shade_command(self, shade_id: int = 14):
        """Test individual shade command response time"""
        print(f"🧪 Testing individual shade command (shade {shade_id})...")
        
        start_time = time.time()
        
        try:
            response = requests.post(
                f"{BASE_URL}/shades/{shade_id}/command",
                json={"action": "u"},
                timeout=TIMEOUT
            )
            
            response_time_ms = int((time.time() - start_time) * 1000)
            
            result = {
                "shade_id": shade_id,
                "response_time_ms": response_time_ms,
                "status_code": response.status_code,
                "success": response.status_code == 200,
                "under_100ms": response_time_ms < 100
            }
            
            if response.status_code == 200:
                result["response_data"] = response.json()
            
            self.test_results["individual_commands"].append(result)
            
            print(f"  ⏱️  Response time: {response_time_ms}ms")
            print(f"  ✅ Under 100ms: {result['under_100ms']}")
            
            return result
            
        except Exception as e:
            response_time_ms = int((time.time() - start_time) * 1000)
            
            result = {
                "shade_id": shade_id,
                "response_time_ms": response_time_ms,
                "error": str(e),
                "success": False,
                "under_100ms": False
            }
            
            self.test_results["individual_commands"].append(result)
            
            print(f"  ❌ Error: {e}")
            return result
    
    def test_scene_command(self, scene_name: str = "good_morning"):
        """Test scene command response time"""
        print(f"🧪 Testing scene command (scene: {scene_name})...")
        
        start_time = time.time()
        
        try:
            response = requests.post(
                f"{BASE_URL}/scenes/{scene_name}/execute",
                json={},
                timeout=TIMEOUT
            )
            
            response_time_ms = int((time.time() - start_time) * 1000)
            
            result = {
                "scene_name": scene_name,
                "response_time_ms": response_time_ms,
                "status_code": response.status_code,
                "success": response.status_code == 200,
                "under_200ms": response_time_ms < 200
            }
            
            if response.status_code == 200:
                result["response_data"] = response.json()
            
            self.test_results["scene_commands"].append(result)
            
            print(f"  ⏱️  Response time: {response_time_ms}ms")
            print(f"  ✅ Under 200ms: {result['under_200ms']}")
            
            return result
            
        except Exception as e:
            response_time_ms = int((time.time() - start_time) * 1000)
            
            result = {
                "scene_name": scene_name,
                "response_time_ms": response_time_ms,
                "error": str(e),
                "success": False,
                "under_200ms": False
            }
            
            self.test_results["scene_commands"].append(result)
            
            print(f"  ❌ Error: {e}")
            return result
    
    def test_background_tasks(self):
        """Test background retry task monitoring"""
        print("🧪 Testing background retry task monitoring...")
        
        try:
            response = requests.get(f"{BASE_URL}/health/retries", timeout=TIMEOUT)
            
            result = {
                "status_code": response.status_code,
                "success": response.status_code == 200
            }
            
            if response.status_code == 200:
                data = response.json()
                result["active_tasks"] = data.get("active_retry_tasks", 0)
                result["task_ids"] = data.get("task_ids", [])
            
            self.test_results["background_tasks"].append(result)
            
            print(f"  ✅ Active retry tasks: {result.get('active_tasks', 'unknown')}")
            
            return result
            
        except Exception as e:
            result = {
                "error": str(e),
                "success": False
            }
            
            self.test_results["background_tasks"].append(result)
            
            print(f"  ❌ Error: {e}")
            return result
    
    def run_performance_tests(self):
        """Run all performance tests"""
        print("🎯 Starting ShadeCommander Async Retry Performance Tests")
        print("=" * 60)
        
        # Start server
        if not self.start_server():
            return False
        
        try:
            # Test individual shade commands (multiple times for reliability)
            print("\n📋 Testing Individual Shade Commands:")
            for i in range(3):
                self.test_individual_shade_command(14)
                time.sleep(0.5)  # Small delay between tests
            
            # Test scene commands
            print("\n📋 Testing Scene Commands:")
            self.test_scene_command("good_morning")
            
            # Wait a moment for background tasks to start
            time.sleep(1)
            
            # Test background task monitoring
            print("\n📋 Testing Background Task Monitoring:")
            self.test_background_tasks()
            
            # Wait to observe background tasks
            print("\n⏳ Waiting 3 seconds to observe background retry tasks...")
            time.sleep(3)
            self.test_background_tasks()
            
            return True
            
        finally:
            self.stop_server()
    
    def print_results(self):
        """Print test results summary"""
        print("\n" + "=" * 60)
        print("🏁 PERFORMANCE TEST RESULTS")
        print("=" * 60)
        
        # Individual commands
        individual_commands = self.test_results["individual_commands"]
        if individual_commands:
            successful_commands = [c for c in individual_commands if c["success"]]
            under_100ms_commands = [c for c in individual_commands if c["under_100ms"]]
            
            avg_response_time = sum(c["response_time_ms"] for c in successful_commands) / len(successful_commands) if successful_commands else 0
            
            print(f"\n📊 Individual Shade Commands:")
            print(f"  Total tests: {len(individual_commands)}")
            print(f"  Successful: {len(successful_commands)}")
            print(f"  Under 100ms: {len(under_100ms_commands)}")
            print(f"  Average response time: {avg_response_time:.1f}ms")
            print(f"  ✅ Target achieved: {len(under_100ms_commands) >= len(successful_commands) * 0.8}")
        
        # Scene commands
        scene_commands = self.test_results["scene_commands"]
        if scene_commands:
            successful_scenes = [s for s in scene_commands if s["success"]]
            under_200ms_scenes = [s for s in scene_commands if s["under_200ms"]]
            
            avg_response_time = sum(s["response_time_ms"] for s in successful_scenes) / len(successful_scenes) if successful_scenes else 0
            
            print(f"\n📊 Scene Commands:")
            print(f"  Total tests: {len(scene_commands)}")
            print(f"  Successful: {len(successful_scenes)}")
            print(f"  Under 200ms: {len(under_200ms_scenes)}")
            print(f"  Average response time: {avg_response_time:.1f}ms")
            print(f"  ✅ Target achieved: {len(under_200ms_scenes) >= len(successful_scenes)}")
        
        # Background tasks
        background_tests = self.test_results["background_tasks"]
        if background_tests:
            successful_tests = [t for t in background_tests if t["success"]]
            
            print(f"\n📊 Background Task Monitoring:")
            print(f"  Total tests: {len(background_tests)}")
            print(f"  Successful: {len(successful_tests)}")
            print(f"  ✅ Monitoring working: {len(successful_tests) > 0}")
        
        print("\n" + "=" * 60)

def main():
    """Main test function"""
    test = PerformanceTest()
    
    try:
        success = test.run_performance_tests()
        test.print_results()
        
        if success:
            print("🎉 Performance tests completed successfully!")
            return 0
        else:
            print("❌ Performance tests failed!")
            return 1
    
    except KeyboardInterrupt:
        print("\n🛑 Tests interrupted by user")
        test.stop_server()
        return 1
    except Exception as e:
        print(f"\n❌ Test error: {e}")
        test.stop_server()
        return 1

if __name__ == "__main__":
    sys.exit(main())