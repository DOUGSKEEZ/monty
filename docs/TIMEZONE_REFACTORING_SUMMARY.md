# Timezone Refactoring Summary

## Overview

This document summarizes the comprehensive timezone refactoring completed for the Monty home automation system. The refactoring replaced 20+ hardcoded "America/Denver" timezone references with a configurable `TimezoneManager` utility, making the application portable to any timezone.

## Problem Statement

The original codebase had timezone handling scattered throughout with hardcoded "America/Denver" references, creating:
- 1200+ lines of "spaghetti code" with timezone references everywhere
- Non-portable application tied to Mountain Time
- Inconsistent timezone handling across different services
- Bugs in missed alarm detection due to timezone mixing

## Solution: TimezoneManager Utility

Created a centralized `TimezoneManager` utility (`/backend/src/utils/TimezoneManager.js`) that provides:

- **Configurable timezone** - Reads from `scheduler.json`
- **UTC ↔ User timezone conversions** - Consistent conversion methods
- **Display formatting** - Standardized time formatting for UI
- **Cron timezone support** - Timezone-aware scheduling
- **Dynamic labels** - Generates timezone display names

## Files Modified

### 1. `/backend/src/utils/TimezoneManager.js` ⭐ NEW
**Purpose**: Centralized timezone utility with singleton pattern
**Key Methods**:
- `toUTC(localTimeString, referenceDate)` - Convert user time to UTC
- `formatForDisplay(date, format)` - Format UTC time for display
- `getTimezoneDisplay()` - Generate dynamic timezone labels
- `getCronTimezone()` - Get timezone for cron jobs
- `toUserTime(utcDate)` - Convert UTC to user timezone

### 2. `/backend/src/utils/ServiceFactory.js`
**Changes**: 
- Added TimezoneManager initialization from `scheduler.json`
- Injected `timezoneManager` dependency into SchedulerService and WeatherService

### 3. `/backend/src/services/SchedulerService.js` 
**Changes**:
- **Constructor**: Added `timezoneManager` parameter
- **calculateSceneTimes()**: 
  - Fixed Good Afternoon scene time display bug
  - Replaced complex UTC conversion with direct time formatting
  - Added `good_afternoon_display` field for correct display
- **scheduleWakeUp()**: Fixed timezone comparison logic for missed alarm detection
- **handleMissedAlarm()**: Fixed timezone mixing bug in time difference calculation
- **healthCheck()**: Updated to use pre-formatted Good Afternoon display time
- **Replaced 20+ "America/Denver" references** with `this.timezoneManager` methods

### 4. `/backend/src/routes/scheduler.js`
**Changes**:
- **wake-up/status endpoint**: 
  - Removed hardcoded timezone labels (`currentTimeMT` → `currentTime`)
  - Replaced `timezone: 'America/Denver (Denver Time)'` with `timezoneManager.getTimezoneDisplay()`
- **Added TimezoneManager import and usage** throughout API responses

### 5. `/backend/src/services/WeatherService.js`
**Changes**:
- **Constructor**: Added `timezoneManager` parameter
- **getSunriseSunsetTimes()**: Replaced hardcoded timezone formatting with `timezoneManager.formatForDisplay()`

## Key Bugs Fixed

### Bug 1: Good Afternoon Scene Time Not Updating ✅
**Problem**: Config showed "13:26" but status showed wrong time like "3:37 PM"
**Root Cause**: Complex UTC conversion in `calculateSceneTimes()` was introducing errors
**Solution**: 
- Replaced UTC conversion with direct time formatting for static daily times
- Added `good_afternoon_display` field to bypass timezone conversion entirely
- Updated `healthCheck()` to use pre-formatted display value

### Bug 2: Hardcoded Timezone Labels ✅  
**Problem**: API field names contained "MT" suffix (`currentTimeMT`, `lastTriggeredMT`)
**Solution**: 
- Renamed to timezone-neutral names (`currentTime`, `lastTriggered_formatted`)
- Added dynamic timezone labels via `getTimezoneDisplay()`

### Bug 3: Missed Alarm Detection Timezone Bug ✅
**Problem**: Two different minute calculations for same time comparison:
- `scheduleWakeUp()`: "Wake up was 1 minutes ago" ✅
- `handleMissedAlarm()`: "missed by 361 minutes" ❌ 

**Root Cause**: Mixed timezone Date objects passed to `handleMissedAlarm()`
- `missedAlarmTime`: Mountain Time Date object  
- `now`: UTC Date object

**Solution**: 
- Convert wake-up time to UTC using `timezoneManager.toUTC()` before passing to `handleMissedAlarm()`
- Ensure both parameters are UTC Date objects for consistent comparison

## Architecture Improvements

### Before Refactoring:
```javascript
// Hardcoded timezone references everywhere
const timezone = "America/Denver";
const cronTz = "America/Denver"; 
const displayTime = date.toLocaleString('en-US', {timeZone: "America/Denver"});
```

### After Refactoring:
```javascript
// Centralized, configurable timezone management
const timezoneManager = getTimezoneManager(config.location.timezone);
const cronTz = timezoneManager.getCronTimezone();
const displayTime = timezoneManager.formatForDisplay(date);
```

## Configuration

Timezone is now configurable via `/config/scheduler.json`:

```json
{
  "location": {
    "timezone": "America/Denver",
    "city": "Silverthorne, CO"
  }
}
```

To change timezone:
1. Update `scheduler.json` with new timezone
2. Restart application
3. All timezone handling automatically adapts

## Testing

The refactoring was tested with:
- ✅ Good Afternoon scene time updates correctly
- ✅ Wake-up alarm missed detection works properly  
- ✅ API responses show correct timezone labels
- ✅ Cron jobs schedule in correct timezone
- ✅ Display formatting consistent across app

## Benefits

1. **Portability**: Application works in any timezone
2. **Maintainability**: Single source of truth for timezone logic
3. **Consistency**: Standardized timezone handling across all services
4. **Reliability**: Fixed critical timezone bugs
5. **Configurability**: Change timezone via config file

## DST Compatibility

The refactoring maintains proper DST (Daylight Saving Time) handling:
- `node-cron` with timezone option automatically adjusts for DST
- Normal wake-up times (8:00 AM) work correctly during DST transitions
- Edge cases (1-3 AM) would be handled appropriately for user safety

## Future Enhancements

Potential improvements for the future:
- Add timezone validation on config updates
- Support for multiple timezone displays 
- Enhanced timezone name mappings
- Automatic timezone detection

---

**Refactoring Completed**: May 30, 2025  
**Files Modified**: 6 files  
**Hardcoded References Removed**: 20+  
**Critical Bugs Fixed**: 3