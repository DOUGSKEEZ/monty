# Monty Home Automation Backend API
Express.js backend API for Monty home automation system. Provides endpoints for shade control, music playback (Pianobar), weather data, scheduling, Bluetooth management, and system monitoring.

## Version: 1.0.0

**Contact information:**  
Monty Home Automation  

---
## Health
Service health and status endpoints

### [GET] /api/health
**Health check endpoint**

Get overall system health status including service registry health checks

#### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ------ |
| full | query | Perform full health check of all services | No | string, <br>**Available values:** "true", "false" |

#### Responses

| Code | Description | Schema |
| ---- | ----------- | ------ |
| 200 | Health status retrieved successfully | **application/json**: { **"status"**: string, <br>**Available values:** "ok", "degraded", "error", **"services"**: object, **"timestamp"**: dateTime }<br> |

### [GET] /ping
**Simple ping endpoint**

Quick ping to verify server is responding

#### Responses

| Code | Description | Schema |
| ---- | ----------- | ------ |
| 200 | Pong response | **application/json**: { **"message"**: string }<br> |

### [GET] /api/dashboard
**Get dashboard data**

Get comprehensive dashboard data for frontend

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Dashboard data |

### [GET] /api/debug/services
**Get service debug info**

Get debug information about all registered services

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Service debug information |

### [POST] /api/shade-commander/reconnect
**Reconnect to ShadeCommander**

Force reconnection to ShadeCommander microservice

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Reconnection initiated |

---
## Monitoring
System monitoring and metrics

### [GET] /metrics
**Prometheus metrics endpoint**

Get Prometheus-formatted metrics for monitoring

#### Responses

| Code | Description | Schema |
| ---- | ----------- | ------ |
| 200 | Prometheus metrics | **text/plain**: string<br> |

### [GET] /api/monitoring/status
**Get monitoring provider status**

Get status of all monitoring providers (Prometheus, New Relic, Splunk, etc.)

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Monitoring status |

### [GET] /api/monitoring/shadecommander-health
**ShadeCommander health check**

Deep health check of ShadeCommander microservice

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Health check result |

### [GET] /api/monitoring/shadecommander-stats
**ShadeCommander statistics**

Get ShadeCommander monitoring statistics and history

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Statistics |

### [GET] /api/monitoring/notifications/status
**Notification service status**

Get notification service status

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Notification status |

### [POST] /api/monitoring/notifications/test
**Test notification**

Send a test notification

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Test notification sent |

### [GET] /api/monitoring/metrics-stats
**Get metrics statistics**

Get metrics collection statistics

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Metrics statistics |

### [POST] /api/monitoring/test-metric
**Send test metric**

Send a test metric to all providers

#### Request Body

| Required | Schema |
| -------- | ------ |
|  No | **application/json**: { **"name"**: string, <br>**Default:** test_metric, **"value"**: number, <br>**Default:** 1, **"type"**: string, <br>**Available values:** "gauge", "counter", "histogram", <br>**Default:** gauge }<br> |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Test metric sent |

### [POST] /api/monitoring/test-event
**Send test event**

Send a test event to all providers

#### Request Body

| Required | Schema |
| -------- | ------ |
|  No | **application/json**: { **"title"**: string, <br>**Default:** Test Event, **"text"**: string, <br>**Default:** This is a test event from the monitoring API, **"level"**: string, <br>**Available values:** "info", "warning", "error", <br>**Default:** info }<br> |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Test event sent |

### [GET] /api/monitoring/config
**Get monitoring configuration**

Get current monitoring configuration and enabled providers

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Monitoring configuration |

### [POST] /api/monitoring/business-event
**Record business event**

Record an important business/automation event

#### Request Body

| Required | Schema |
| -------- | ------ |
|  Yes | **application/json**: { **"event_type"**: string, **"description"**: string, **"metadata"**: object, **"level"**: string, <br>**Available values:** "info", "warning", "error", <br>**Default:** info }<br> |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Event recorded |
| 400 | Invalid request |

### [GET] /api/monitoring/dashboard
**Get monitoring dashboard data**

Get comprehensive dashboard data for all monitoring providers

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Dashboard data |

---
## Configuration
Application configuration management

### [GET] /api/config
**Get all configuration**

Retrieve complete application configuration including computed home status

#### Responses

| Code | Description | Schema |
| ---- | ----------- | ------ |
| 200 | Configuration retrieved successfully | **application/json**: [ConfigResponse](#configresponse)<br> |
| 500 | Failed to get configuration |  |

### [POST] /api/config
**Update multiple configuration values**

Bulk update multiple configuration settings

#### Request Body

| Required | Schema |
| -------- | ------ |
|  Yes | **application/json**: { **"updates"**: object }<br> |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Configuration updated successfully |
| 400 | Invalid request |
| 500 | Update failed |

### [GET] /api/config/{path}
**Get specific configuration**

Retrieve configuration value by path (e.g., 'homeStatus')

#### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ------ |
| path | path | Configuration path | Yes | string |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Configuration value retrieved |
| 404 | Configuration path not found |
| 500 | Failed to get configuration |

### [PUT] /api/config/{path}
**Update specific configuration**

Update a single configuration value by path

#### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ------ |
| path | path |  | Yes | string |

#### Request Body

| Required | Schema |
| -------- | ------ |
|  Yes | **application/json**: { **"value"**:  }<br> |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Configuration updated |
| 400 | Invalid request |
| 500 | Update failed |

### [POST] /api/config/wake-up-time
**Set wake-up time**

Set wake-up alarm time for tomorrow

#### Request Body

| Required | Schema |
| -------- | ------ |
|  Yes | **application/json**: { **"time"**: string }<br> |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Wake-up time set successfully |
| 400 | Invalid time format |

### [POST] /api/config/home-status
**Set home/away status**

Set whether user is home or away

#### Request Body

| Required | Schema |
| -------- | ------ |
|  Yes | **application/json**: { **"status"**: string, <br>**Available values:** "home", "away" }<br> |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Home status updated |
| 400 | Invalid status value |

### [POST] /api/config/away-periods
**Add away period**

Add a scheduled away period

#### Request Body

| Required | Schema |
| -------- | ------ |
|  Yes | **application/json**: { **"startDate"**: date, **"endDate"**: date }<br> |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Away period added |
| 400 | Invalid dates |

### [DELETE] /api/config/away-periods/{index}
**Remove away period**

Remove an away period by index

#### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ------ |
| index | path |  | Yes | integer |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Away period removed |
| 400 | Invalid index |

---
## Weather
Weather data and forecasts

### [GET] /api/weather/current
**Get current weather**

Retrieve current weather data from OpenWeatherMap

#### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ------ |
| refresh | query | Force refresh from API (subject to quota limits) | No | string, <br>**Available values:** "true", "false" |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Current weather data |
| 500 | Failed to get weather |

### [GET] /api/weather/forecast
**Get weather forecast**

Retrieve weather forecast data

#### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ------ |
| refresh | query |  | No | string, <br>**Available values:** "true", "false" |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Weather forecast data |
| 500 | Failed to get forecast |

### [GET] /api/weather/sun-times
**Get sunrise/sunset times**

Get sun-related times including civil twilight

#### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ------ |
| date | query | Date in YYYY-MM-DD format | No | date |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Sun times data |
| 400 | Invalid date format |
| 500 | Failed to get sun times |

### [GET] /api/weather/temperatures
**Get all temperatures**

Get outdoor temperature and indoor sensor data (Govee integration pending)

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Temperature data from all sources |

### [GET] /api/weather/usage
**Get API usage statistics**

Get OpenWeatherMap API usage stats for quota monitoring

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | API usage statistics |

### [GET] /api/weather/can-refresh
**Check if manual refresh allowed**

Check if manual weather refresh is allowed based on quota limits

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Refresh status |

### [GET] /api/weather/map-tile/{layer}/{z}/{x}/{y}
**Proxy weather map tiles**

Secure proxy for OpenWeatherMap tile layers (hides API key)

#### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ------ |
| layer | path |  | Yes | string, <br>**Available values:** "precipitation_new", "clouds_new", "pressure_new", "temp_new", "wind_new" |
| z | path | Zoom level | Yes | integer |
| x | path | Tile X coordinate | Yes | integer |
| y | path | Tile Y coordinate | Yes | integer |

#### Responses

| Code | Description | Schema |
| ---- | ----------- | ------ |
| 200 | Map tile image | **image/png**: binary<br> |
| 400 | Invalid parameters |  |

---
## Scheduler
Automated scene scheduling and wake-up alarms

### [GET] /api/scheduler/status
**Get scheduler status**

Get scheduler health status and next scene times

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Scheduler status |
| 500 | Failed to get status |
| 503 | Scheduler service unavailable |

### [POST] /api/scheduler/wake-up
**Set wake-up time**

Set wake-up alarm time and reschedule

#### Request Body

| Required | Schema |
| -------- | ------ |
|  Yes | **application/json**: { **"time"**: string }<br> |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Wake-up time set |
| 400 | Invalid time format |

### [DELETE] /api/scheduler/wake-up
**Disable wake-up alarm**

Disable the wake-up alarm

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Wake-up alarm disabled |

### [PUT] /api/scheduler/wake-up
**Update wake-up settings**

Update wake-up time and good morning delay

#### Request Body

| Required | Schema |
| -------- | ------ |
|  No | **application/json**: { **"time"**: string, **"good_morning_delay_minutes"**: integer }<br> |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Wake-up settings updated |

### [GET] /api/scheduler/wake-up/status
**Get wake-up alarm status**

Get detailed wake-up alarm configuration and next trigger time

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Wake-up alarm status |

### [POST] /api/scheduler/initialize
**Initialize scheduler**

Force scheduler service initialization and scheduling

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Scheduler initialized |

### [POST] /api/scheduler/trigger
**Manually trigger scene**

Execute a scene manually

#### Request Body

| Required | Schema |
| -------- | ------ |
|  Yes | **application/json**: { **"scene_name"**: string, <br>**Available values:** "good_afternoon", "good_evening", "good_night", "rise_n_shine", "good_morning" }<br> |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Scene executed successfully |
| 400 | Scene execution failed |

### [GET] /api/scheduler/schedules
**Get active schedules**

Get all active scheduled jobs and next scene times

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Active schedules |

### [GET] /api/scheduler/config
**Get scheduler configuration**

Get complete scheduler configuration including scene timings

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Scheduler configuration |

### [PUT] /api/scheduler/scenes
**Update scene timing settings**

Update scene timing configuration (good afternoon time, evening/night offsets)

#### Request Body

| Required | Schema |
| -------- | ------ |
|  No | **application/json**: { **"good_afternoon_time"**: string, **"good_evening_offset_minutes"**: integer, **"good_night_offset_minutes"**: integer }<br> |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Scene timings updated |

### [PUT] /api/scheduler/music
**Update music integration settings**

Configure music playback for different scenes

#### Request Body

| Required | Schema |
| -------- | ------ |
|  No | **application/json**: { **"enabled_for_morning"**: boolean, **"enabled_for_evening"**: boolean, **"enabled_for_afternoon"**: boolean, **"enabled_for_night"**: boolean }<br> |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Music settings updated |

### [POST] /api/scheduler/test/{sceneName}
**Test a scene**

Manually execute a scene for testing

#### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ------ |
| sceneName | path |  | Yes | string, <br>**Available values:** "good_afternoon", "good_evening", "good_night", "rise_n_shine", "good_morning" |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Scene executed |
| 400 | Invalid scene name |

### [GET] /api/scheduler/alarm-device/status
**Get alarm device status**

Get connectivity status of external alarm device

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Alarm device status |

### [POST] /api/scheduler/alarm-device/sync
**Sync with alarm device**

Manually sync current schedule with alarm device

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Sync successful |
| 400 | Sync failed |

### [PUT] /api/scheduler/alarm-device/config
**Update alarm device config**

Update alarm device notification settings

#### Request Body

| Required | Schema |
| -------- | ------ |
|  No | **application/json**: { **"enabled"**: boolean, **"deviceUrl"**: string (uri), **"timeout"**: integer, **"maxRetries"**: integer }<br> |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Config updated |
| 400 | Invalid configuration |

### [POST] /api/scheduler/alarm-device/ping
**Ping alarm device**

Test alarm device connectivity

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Device reachable |
| 503 | Device unreachable |

---
## Bluetooth
Bluetooth speaker connectivity

### [POST] /api/bluetooth/init
**Initialize Bluetooth**

Initialize Bluetooth subsystems

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Bluetooth initialized |
| 500 | Initialization failed |

### [POST] /api/bluetooth/connect
**Connect to Bluetooth speakers**

Connect to configured Bluetooth speakers

#### Request Body

| Required | Schema |
| -------- | ------ |
|  No | **application/json**: { **"forceWakeup"**: boolean }<br> |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Connection successful or already connected |
| 500 | Connection failed |

### [POST] /api/bluetooth/disconnect
**Disconnect from Bluetooth speakers**

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Disconnected successfully |
| 500 | Disconnect failed |

### [GET] /api/bluetooth/status
**Get Bluetooth status**

Get current Bluetooth connection status

#### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ------ |
| silent | query | Silent mode for background polling | No | string, <br>**Available values:** "true", "false" |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Bluetooth status |

### [POST] /api/bluetooth/wakeup
**Wake up Bluetooth speakers**

Send wakeup signal to Bluetooth speakers

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Wakeup signal sent |
| 500 | Wakeup failed |

### [GET] /api/bluetooth/diagnostics
**Get Bluetooth diagnostics**

Get detailed Bluetooth diagnostic information

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Diagnostic information |

### [GET] /api/bluetooth/rssi
**Get Bluetooth RSSI**

Get Bluetooth signal strength (RSSI)

#### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ------ |
| silent | query |  | No | string, <br>**Available values:** "true", "false" |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | RSSI value |

---
## Pianobar
Music playback via Pianobar (Pandora)

### [POST] /api/pianobar/initialize
**Initialize Pianobar**

Initialize Pianobar music service

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Pianobar initialized |
| 500 | Initialization failed |

### [GET] /api/pianobar/status
**Get Pianobar status**

Get current Pianobar process status with stale cache detection

#### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ------ |
| silent | query |  | No | string, <br>**Available values:** "true", "false" |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Pianobar status |

### [GET] /api/pianobar/state
**Get Pianobar state**

Get combined Pianobar state including current song and playback status

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Pianobar state |

### [POST] /api/pianobar/start
**Start Pianobar**

Start Pianobar process

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Pianobar started |
| 500 | Start failed |

### [POST] /api/pianobar/stop
**Stop Pianobar**

Stop Pianobar process gracefully

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Pianobar stopped |

### [POST] /api/pianobar/play
**Play/Resume music**

Play or resume music playback

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Playback started/resumed |

### [POST] /api/pianobar/pause
**Pause music**

Pause music playback

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Playback paused |

### [POST] /api/pianobar/next
**Skip to next song**

Skip to the next song

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Skipped to next song |

### [POST] /api/pianobar/love
**Love current song**

Mark current song as loved (thumbs up)

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Song loved |

### [GET] /api/pianobar/stations
**Get station list**

Get list of available Pandora stations

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Station list |

### [POST] /api/pianobar/select-station
**Select station**

Switch to a different Pandora station

#### Request Body

| Required | Schema |
| -------- | ------ |
|  Yes | **application/json**: { **"stationId"**: string }<br> |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Station selected |

### [POST] /api/pianobar/refresh-stations
**Refresh station list**

Refresh the cached station list from Pandora

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Stations refreshed |

### [POST] /api/pianobar/kill
**Force kill Pianobar**

Force kill Pianobar process (emergency stop)

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Pianobar killed |

### [POST] /api/pianobar/command
**Send raw command**

Send a raw command to Pianobar FIFO

#### Request Body

| Required | Schema |
| -------- | ------ |
|  Yes | **application/json**: { **"command"**: string }<br> |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Command sent |

### [GET] /api/pianobar/health
**Pianobar health check**

Get Pianobar service health status

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Health status |

### [GET] /api/pianobar/debug-events
**Get debug events**

Get recent Pianobar events for debugging

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Debug events |

### [GET] /api/pianobar/current-track
**Get current track**

Get currently playing track information

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Current track info |

### [GET] /api/pianobar/debug-logs
**Get debug logs**

Get recent Pianobar debug logs

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Debug logs |

### [GET] /api/pianobar/sync-state
**Get sync state**

Get synchronized state for cross-device consistency

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Sync state |

### [POST] /api/pianobar/sync-state
**Update sync state**

Update synchronized state from external device

#### Request Body

| Required | Schema |
| -------- | ------ |
|  Yes | **application/json**: { **"track"**: object }<br> |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Sync state updated |

### [GET] /api/pianobar/modes
**Get available station modes**

Get available modes for current Pandora station

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Available modes |

### [POST] /api/pianobar/mode
**Set station mode**

Change station mode (e.g., Artist Only Radio, Song Radio, etc.)

#### Request Body

| Required | Schema |
| -------- | ------ |
|  Yes | **application/json**: { **"modeId"**: string }<br> |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Mode changed |

---
## State
Application state persistence

### [GET] /api/state
**Get application state**

Get current application state

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | Application state |
| 500 | Failed to read state |

### [PUT] /api/state
**Bulk update state**

Update multiple state keys at once

#### Request Body

| Required | Schema |
| -------- | ------ |
|  Yes | **application/json**: object<br> |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | State updated |
| 500 | Update failed |

### [PUT] /api/state/{key}
**Update specific state key**

Update a single state value

#### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ------ |
| key | path |  | Yes | string |

#### Request Body

| Required | Schema |
| -------- | ------ |
|  Yes | **application/json**: { **"value"**:  }<br> |

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | State key updated |
| 500 | Update failed |

---
## System
System information and settings

### [GET] /api/system/timezone
**Get system timezone**

Get current system timezone (read-only, changes must be done via SSH)

#### Responses

| Code | Description |
| ---- | ----------- |
| 200 | System timezone |
| 500 | Failed to get timezone |

---
### Schemas

#### ConfigResponse

| Name | Type | Description | Required |
| ---- | ---- | ----------- | -------- |
| success | boolean |  | No |
| data | object | Complete application configuration | No |

#### SuccessResponse

| Name | Type | Description | Required |
| ---- | ---- | ----------- | -------- |
| success | boolean |  | No |
| message | string |  | No |
| data | object |  | No |

#### ErrorResponse

| Name | Type | Description | Required |
| ---- | ---- | ----------- | -------- |
| success | boolean | *Example:* `false` | No |
| error | string |  | No |
| details | string |  | No |
