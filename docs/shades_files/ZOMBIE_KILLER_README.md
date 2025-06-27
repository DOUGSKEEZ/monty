 Zombie Prevention Features

  1. Individual Command Timeouts: Each shade command now has a 10-second timeout
  2. Overall Task Timeout: Complete retry sequences timeout after 60 seconds
  3. Enhanced Error Logging: Clear timeout messages with "ZOMBIE PREVENTION" tags

  🔍 Zombie Monitoring & Detection

  4. Early Warning System: Tasks older than 5 minutes get flagged as suspicious
  5. Automatic Cleanup: Tasks older than 1 hour get force-cancelled
  6. Comprehensive Metrics: Detailed zombie statistics for dashboard monitoring

  📊 Dashboard-Ready Metrics

  Your /retries endpoint now provides rich monitoring data:

  {
    "zombie_metrics": {
      "total_zombies_detected": 0,
      "total_zombies_cleaned": 0,
      "total_timeout_kills": 0,
      "current_warnings": 0
    },
    "zombie_warnings": 0,
    "suspicious_tasks": [],
    "oldest_task_age_minutes": 0,
    "task_ages": {}
  }

  🏥 Enhanced Logging

  You'll now see detailed logs like:
  - 🧟 ZOMBIE DETECTED: Task retry_1_xyz is 6.2 minutes old - monitoring for cleanup
  - ⏰ Command 1/4 TIMEOUT after 10s - ZOMBIE PREVENTION
  - 🧟 ZOMBIE PREVENTION: Task exceeded 60s timeout - forcing cleanup
  - 🧟 ZOMBIE STATUS: 2 active warnings, 5 total detected, 1 cleaned

  🔧 API Improvements

  - ✅ Fixed Endpoint Location: DELETE /retries/all (moved from /scenes/retries/all)
  - ✅ Consistent API Design: All retry operations now under /retries

  ⚡ Performance Improvements

  - Faster Detection: Zombie monitoring runs every 1 minute (vs 5 minutes)
  - Better Cleanup: Proactive warnings before force-cleanup
  - Timeout Protection: Prevents infinite hangs

  You can now monitor zombie tasks in your dashboard using the rich metrics, and the
  system will automatically prevent and clean up any future zombies! 🚀

  The DELETE endpoint is now properly located at DELETE /retries/all for consistency
  with GET /retries. The zombie prevention system will catch stuck tasks much earlier
  and provide you with detailed metrics for monitoring. 🎯
