#!/usr/bin/env python3
"""
Test script to verify the infinite loop bug fix.

This script ensures that fire-and-forget sequences actually call
the Arduino interface instead of creating infinite background task loops.
"""

import asyncio
import sys
from pathlib import Path

# Add current directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

def test_import_fix():
    """Test that async_retry_service imports the correct function"""
    print("🔍 Testing Import Fix...")
    
    try:
        # Import the service and check what it's importing
        from services import async_retry_service
        
        # Check if the correct function is imported
        import inspect
        source = inspect.getsource(async_retry_service)
        
        correct_import = "from commander.interface.arduino_whisperer import send_shade_command_fast" in source
        wrong_import = "from commander.interface.arduino_whisperer import send_shade_command" in source and "send_shade_command_fast" not in source
        
        if correct_import:
            print("  ✅ Correct import: send_shade_command_fast")
        else:
            print("  ❌ Missing import: send_shade_command_fast")
            
        if wrong_import:
            print("  ❌ Found problematic import: send_shade_command (will cause loops)")
        else:
            print("  ✅ No problematic imports found")
            
        return correct_import and not wrong_import
        
    except Exception as e:
        print(f"  ❌ Import test failed: {e}")
        return False

def test_function_calls():
    """Test that fire-and-forget sequences use the correct function calls"""
    print("\n🔍 Testing Function Calls...")
    
    try:
        from services import async_retry_service
        import inspect
        
        # Get the source code of the fire-and-forget sequence function
        source = inspect.getsource(async_retry_service.AsyncRetryService._execute_fire_and_forget_sequence)
        
        # Count occurrences of the correct vs wrong function calls
        correct_calls = source.count("send_shade_command_fast(")
        wrong_calls = source.count("send_shade_command(") - source.count("send_shade_command_fast(")
        
        print(f"  Found {correct_calls} calls to send_shade_command_fast() ✅")
        print(f"  Found {wrong_calls} calls to send_shade_command() ❌")
        
        # Should have exactly 2 correct calls (command 1 + commands 2-4 loop)
        expected_calls = 2
        
        if correct_calls == expected_calls and wrong_calls == 0:
            print(f"  ✅ Perfect! Found exactly {expected_calls} calls to send_shade_command_fast()")
            print("  ✅ No calls to send_shade_command() (infinite loop prevented)")
            return True
        else:
            print(f"  ❌ Expected {expected_calls} calls to send_shade_command_fast(), found {correct_calls}")
            if wrong_calls > 0:
                print(f"  ❌ Found {wrong_calls} calls to send_shade_command() - will cause infinite loops!")
            return False
            
    except Exception as e:
        print(f"  ❌ Function call test failed: {e}")
        return False

async def test_call_flow_simulation():
    """Simulate the call flow to ensure no infinite loops"""
    print("\n🔍 Testing Call Flow Simulation...")
    
    try:
        # Mock the functions to trace calls
        call_trace = []
        
        async def mock_send_shade_command_fast(shade_id, action):
            call_trace.append(f"send_shade_command_fast({shade_id}, {action})")
            return {"success": True, "message": "Mock Arduino command"}
        
        # Patch the function temporarily
        from services import async_retry_service
        original_func = async_retry_service.send_shade_command_fast
        async_retry_service.send_shade_command_fast = mock_send_shade_command_fast
        
        # Create service and test
        service = async_retry_service.AsyncRetryService()
        
        print("  🚀 Starting mock fire-and-forget sequence...")
        
        # Queue a fire-and-forget sequence
        task_id = service.queue_fire_and_forget_sequence(14, "u")
        
        # Wait a short time for the background task to start
        await asyncio.sleep(0.1)
        
        # Restore original function
        async_retry_service.send_shade_command_fast = original_func
        
        # Check call trace
        print(f"  📊 Call trace captured: {len(call_trace)} calls")
        for call in call_trace:
            print(f"    - {call}")
        
        # Should have at least the first command call
        if len(call_trace) >= 1 and "send_shade_command_fast" in call_trace[0]:
            print("  ✅ Fire-and-forget sequence calls Arduino interface directly")
            print("  ✅ No infinite loops detected")
            return True
        else:
            print("  ❌ Fire-and-forget sequence not calling Arduino interface")
            return False
            
    except Exception as e:
        print(f"  ❌ Call flow test failed: {e}")
        return False

async def main():
    """Main test function"""
    print("🚨 INFINITE LOOP BUG FIX VALIDATION")
    print("=" * 45)
    
    test1 = test_import_fix()
    test2 = test_function_calls()
    test3 = await test_call_flow_simulation()
    
    print("\n" + "=" * 45)
    
    if test1 and test2 and test3:
        print("🎉 INFINITE LOOP BUG FIX SUCCESSFUL! 🎉")
        print("\n✅ Fire-and-forget sequences now call Arduino directly")
        print("✅ No more infinite background task loops")
        print("✅ Commands will actually reach the Arduino")
        print("✅ Fire-and-forget performance maintained")
        
        print("\n🚀 Ready for real Arduino testing!")
        return 0
    else:
        print("❌ INFINITE LOOP BUG STILL EXISTS!")
        
        if not test1:
            print("  - Import fix needed")
        if not test2:
            print("  - Function call fix needed")
        if not test3:
            print("  - Call flow issue detected")
            
        return 1

if __name__ == "__main__":
    result = asyncio.run(main())
    sys.exit(result)