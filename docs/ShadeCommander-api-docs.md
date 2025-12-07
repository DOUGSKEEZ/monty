# ShadeCommander

    🫡 **ShadeCommander** - Hardware interface for Monty's shade control system
    
    ## What This Does
    - Receives REST commands from Node.js ShadeService
    - Translates them into Arduino serial commands  
    - Transmits RF signals to physical shades
    - Returns transmission confirmation (not shade position!)
    
    ## Architecture
    ```
    React Frontend → Node.js ShadeService → FastAPI ShadeCommander → Arduino → RF → Shades
    ```
    
    ## Key Points
    - **Stateless Design**: No shade position tracking
    - **Transmission Only**: We confirm signal sent, not shade movement
    - **Hardware Interface**: Direct Arduino communication
    

## Version: 1.0.0

---

### [POST] /shades/{shade_id}/command
**Send command to specific shade**

Send a command (up/down/stop) to a specific shade.
    
    **Important**: This only confirms RF transmission, not actual shade movement!
    The shades are stateless listeners - we just broadcast the signal and hope they respond.

#### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ------ |
| shade_id | path | Unique shade identifier | Yes | integer |

#### Request Body

| Required | Schema |
| -------- | ------ |
|  Yes | **application/json**: [ShadeCommand](#shadecommand)<br> |

#### Responses

| Code | Description | Schema |
| ---- | ----------- | ------ |
| 200 | Command transmitted successfully | **application/json**: [ShadeResponse](#shaderesponse)<br> |
| 404 | Shade not found in database |  |
| 422 | Validation Error | **application/json**: [HTTPValidationError](#httpvalidationerror)<br> |
| 500 | Arduino communication error |  |

### [GET] /shades/
**List all configured shades**

Get a list of all shades configured in the database.
    
    Returns basic information needed for the frontend:
    - Shade ID, name, room, location, type
    - No status information (shades are stateless!)

#### Responses

| Code | Description | Schema |
| ---- | ----------- | ------ |
| 200 | List of all configured shades | **application/json**: [ShadesListResponse](#shadeslistresponse)<br> |
| 500 | Database access error |  |

### [GET] /shades/{shade_id}
**Get specific shade details**

Get detailed information about a specific shade.
    
    **Note**: This is just configuration data from the database.
    No real-time status since shades are stateless listeners!

#### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ------ |
| shade_id | path | Unique shade identifier | Yes | integer |

#### Responses

| Code | Description | Schema |
| ---- | ----------- | ------ |
| 200 | Shade details | **application/json**: [Shade](#shade)<br> |
| 404 | Shade not found |  |
| 422 | Validation Error | **application/json**: [HTTPValidationError](#httpvalidationerror)<br> |
| 500 | Database access error |  |

---

### [GET] /scenes/
**List all available scenes**

Get a list of all available shade scenes.
    
    **Returns:**
    - Scene names and descriptions
    - Command counts for each scene
    - Quick overview for scene selection
    
    **Use this to:**
    - Show available scenes in UI
    - Build scene selection menus
    - Get overview of configured scenes

#### Responses

| Code | Description | Schema |
| ---- | ----------- | ------ |
| 200 | List of available scenes | **application/json**: [ScenesListResponse](#sceneslistresponse)<br> |
| 500 | Error loading scenes |  |

### [GET] /scenes/logs
**Get scene execution history**

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

#### Responses

| Code | Description | Schema |
| ---- | ----------- | ------ |
| 200 | Scene execution history | **application/json**: [SceneExecutionHistory](#sceneexecutionhistory)<br> |
| 500 | Error retrieving logs |  |

### [GET] /scenes/{scene_name}
**Get specific scene details**

Get detailed information about a specific scene.
    
    **Returns:**
    - Complete scene definition
    - All commands and their parameters
    - Estimated execution time
    
    **Use this to:**
    - Preview scene before execution
    - Debug scene configurations
    - Show detailed scene information in UI

#### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ------ |
| scene_name | path | Scene name/identifier | Yes | string |

#### Responses

| Code | Description | Schema |
| ---- | ----------- | ------ |
| 200 | Scene details | **application/json**: [SceneDetailResponse](#scenedetailresponse)<br> |
| 404 | Scene not found |  |
| 422 | Validation Error | **application/json**: [HTTPValidationError](#httpvalidationerror)<br> |
| 500 | Error loading scene |  |

### [POST] /scenes/{scene_name}/execute
**Execute a scene**

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

#### Parameters

| Name | Located in | Description | Required | Schema |
| ---- | ---------- | ----------- | -------- | ------ |
| scene_name | path | Scene name/identifier | Yes | string |

#### Request Body

| Required | Schema |
| -------- | ------ |
|  No | **application/json**: [SceneExecutionRequest](#sceneexecutionrequest)<br> |

#### Responses

| Code | Description | Schema |
| ---- | ----------- | ------ |
| 200 | Scene execution completed (may have partial failures) | **application/json**: [SceneExecutionResponse](#sceneexecutionresponse)<br> |
| 400 | Invalid execution parameters |  |
| 404 | Scene not found |  |
| 422 | Validation Error | **application/json**: [HTTPValidationError](#httpvalidationerror)<br> |
| 500 | Scene execution error |  |

---

### [GET] /health
**Service health check**

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

#### Responses

| Code | Description | Schema |
| ---- | ----------- | ------ |
| 200 | Health status retrieved successfully | **application/json**: [HealthStatus](#healthstatus)<br> |
| 503 | Service is unhealthy |  |

### [GET] /arduino/status
**Arduino connection status**

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

#### Responses

| Code | Description | Schema |
| ---- | ----------- | ------ |
| 200 | Arduino status retrieved successfully | **application/json**: <br> |

### [POST] /arduino/reconnect
**Force Arduino reconnection**

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

#### Responses

| Code | Description | Schema |
| ---- | ----------- | ------ |
| 200 | Reconnection attempt completed | **application/json**: <br> |

### [GET] /retries
**Active retry tasks status**

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

#### Responses

| Code | Description | Schema |
| ---- | ----------- | ------ |
| 200 | Retry tasks status retrieved successfully | **application/json**: <br> |

### [DELETE] /retries/all
**Cancel all active retry tasks**

Emergency endpoint to clear all background retry tasks

#### Responses

| Code | Description | Schema |
| ---- | ----------- | ------ |
| 200 | Successfully cancelled all retry tasks | **application/json**: <br> |
| 500 | Error cancelling retry tasks |  |

---

### [GET] /
**ShadeCommander Info**

Welcome message and basic service info

#### Responses

| Code | Description | Schema |
| ---- | ----------- | ------ |
| 200 | Successful Response | **application/json**: <br> |

---
### Schemas

#### HTTPValidationError

| Name | Type | Description | Required |
| ---- | ---- | ----------- | -------- |
| detail | [ [ValidationError](#validationerror) ] |  | No |

#### HealthStatus

Health check for monitoring dashboards - answers: "Can ShadeCommander send commands?"

Usage Examples:
- Monty dashboard shows: ShadeCommander ✅ healthy
- Load balancer health checks
- Alerting when Arduino disconnects

| Name | Type | Description | Required |
| ---- | ---- | ----------- | -------- |
| status | string | Overall health: healthy, degraded, unhealthy | Yes |
| arduino_connected | boolean | Can we talk to Arduino? | Yes |
| database_accessible | boolean | Can we read shades.db? | Yes |
| uptime_seconds | number | How long has service been running? | Yes |
| last_command_time |  | When did we last send a command? (local time) | No |

**Example**
<pre>{
  "arduino_connected": true,
  "database_accessible": true,
  "last_command_time": "2025-05-25T14:25:00Z",
  "status": "healthy",
  "uptime_seconds": 3600.5
}</pre>

#### SceneCommand

Individual command within a scene

| Name | Type | Description | Required |
| ---- | ---- | ----------- | -------- |
| shade_id | integer | Shade to command | Yes |
| action | string, <br>**Available values:** "u", "d", "s" | Action: u=up, d=down, s=stop<br>*Enum:* `"u"`, `"d"`, `"s"` | Yes |
| delay_ms | integer, <br>**Default:** 1000 | Delay after this command in milliseconds | No |

**Example**
<pre>{
  "action": "u",
  "delay_ms": 1000,
  "shade_id": 14
}</pre>

#### SceneDefinition

Complete scene definition

| Name | Type | Description | Required |
| ---- | ---- | ----------- | -------- |
| name | string | Human-readable scene name | Yes |
| description | string | What this scene does | Yes |
| commands | [ [SceneCommand](#scenecommand) ] | List of commands to execute | Yes |
| retry_count | integer, <br>**Default:** 2 | Number of times to retry failed commands | No |
| timeout_seconds | integer, <br>**Default:** 30 | Total timeout for scene execution | No |

#### SceneDetailResponse

Detailed scene information

| Name | Type | Description | Required |
| ---- | ---- | ----------- | -------- |
| success | boolean, <br>**Default:** true | Request success status | No |
| scene | [SceneDefinition](#scenedefinition) |  | Yes |
| estimated_execution_time_ms | integer | Estimated time to execute this scene | Yes |

#### SceneExecutionHistory

Response for scene execution history

| Name | Type | Description | Required |
| ---- | ---- | ----------- | -------- |
| success | boolean, <br>**Default:** true | Request success status | No |
| total_executions | integer | Total number of logged executions | Yes |
| executions | [ [SceneExecutionLog](#sceneexecutionlog) ] | List of recent scene executions | Yes |

**Example**
<pre>{
  "executions": [],
  "success": true,
  "total_executions": 25
}</pre>

#### SceneExecutionLog

Log entry for scene execution - perfect for monitoring scene success rates.

Usage Examples:
- Dashboard shows: "Good Morning scene: ✅ Complete (5/5 shades)"
- Scene history: "Last 10 executions, 90% success rate"
- Troubleshooting: "Scene failed because shade 14 didn't respond"

| Name | Type | Description | Required |
| ---- | ---- | ----------- | -------- |
| scene_name | string | Name of the scene that was executed | Yes |
| execution_time | string | When the scene started (local time) | No |
| total_commands | integer | Total number of shade commands in scene | Yes |
| successful_commands | integer | Number of commands that succeeded | Yes |
| failed_commands | integer | Number of commands that failed | Yes |
| duration_ms | integer | Total time to execute all commands | Yes |
| commands | [ object ] | Detailed results for each shade command | Yes |

**Example**
<pre>{
  "commands": [
    {
      "action": "u",
      "arduino_response": "TX OK: 5C 35 B1 48 | FEFF | BCEC --- UP",
      "message": "Shade 14 UP fire-and-forget command sent",
      "shade_id": 14,
      "success": true
    },
    {
      "action": "u",
      "arduino_response": "No Arduino connection",
      "message": "Fire-and-forget command failed silently",
      "shade_id": 28,
      "success": false
    }
  ],
  "duration_ms": 2500,
  "execution_time": "2025-06-04T07:00:00Z",
  "failed_commands": 1,
  "scene_name": "good_morning",
  "successful_commands": 4,
  "total_commands": 5
}</pre>

#### SceneExecutionRequest

Optional parameters for scene execution

| Name | Type | Description | Required |
| ---- | ---- | ----------- | -------- |
| override_retry_count |  | Override default retry count | No |
| override_timeout |  | Override default timeout | No |
| dry_run | boolean | Preview what would be executed without sending commands | No |

**Example**
<pre>{
  "dry_run": false,
  "override_retry_count": 3,
  "override_timeout": 45
}</pre>

#### SceneExecutionResponse

Response for scene execution

| Name | Type | Description | Required |
| ---- | ---- | ----------- | -------- |
| success | boolean | Whether the entire scene succeeded | Yes |
| scene_name | string | Name of the scene that was executed | Yes |
| message | string | Overall result message | Yes |
| total_execution_time_ms | integer | Total time for scene execution | Yes |
| commands_executed | integer | Number of commands that were executed | Yes |
| commands_successful | integer | Number of commands that succeeded | Yes |
| results | [ [SceneExecutionResult](#sceneexecutionresult) ] | Detailed results for each command | Yes |
| timestamp | dateTime | When scene was executed | No |
| task_id |  | Background task ID for tracking execution | No |

#### SceneExecutionResult

Result of executing a single command in a scene

| Name | Type | Description | Required |
| ---- | ---- | ----------- | -------- |
| shade_id | integer | Shade that was commanded | Yes |
| action | string | Action that was attempted | Yes |
| success | boolean | Whether this command succeeded | Yes |
| message | string | Result message | Yes |
| execution_time_ms | integer | Time taken for this command | Yes |
| retry_attempt | integer | Which retry attempt this was (0 = first try) | No |

#### SceneListItem

Scene item for listing scenes

| Name | Type | Description | Required |
| ---- | ---- | ----------- | -------- |
| name | string | Scene name/identifier | Yes |
| display_name | string | Human-readable scene name | Yes |
| description | string | What this scene does | Yes |
| command_count | integer | Number of commands in this scene | Yes |

**Example**
<pre>{
  "command_count": 2,
  "description": "Lower all privacy shades for nighttime",
  "display_name": "Good Night",
  "name": "good_night"
}</pre>

#### ScenesListResponse

Response for listing all scenes

| Name | Type | Description | Required |
| ---- | ---- | ----------- | -------- |
| success | boolean, <br>**Default:** true | Request success status | No |
| count | integer | Number of scenes available | Yes |
| scenes | [ [SceneListItem](#scenelistitem) ] | List of available scenes | Yes |

#### Shade

Shade information from database

| Name | Type | Description | Required |
| ---- | ---- | ----------- | -------- |
| shade_id | integer | Unique shade identifier | Yes |
| remote_id | integer | Remote control ID | Yes |
| name | string | Computed name from room + location | Yes |
| room | string | Room where shade is installed | Yes |
| location | string | Physical location description | Yes |
| facing | string | Direction the window faces (north/south/east/west) | Yes |
| type | string | Shade type (Privacy, Solar, Blackout) | Yes |

**Example**
<pre>{
  "facing": "east",
  "location": "East Window",
  "name": "Bedroom East Window",
  "remote_id": 5,
  "room": "Bedroom",
  "shade_id": 40,
  "type": "Blackout"
}</pre>

#### ShadeAction

Valid shade actions

| Name | Type | Description | Required |
| ---- | ---- | ----------- | -------- |
| ShadeAction | string | Valid shade actions |  |

#### ShadeCommand

Command to send to a shade (stateless - just transmit the signal!)

| Name | Type | Description | Required |
| ---- | ---- | ----------- | -------- |
| action | [ShadeAction](#shadeaction) | Action to perform: u=up, d=down, s=stop | Yes |

**Example**
<pre>{
  "action": "u"
}</pre>

#### ShadeResponse

Response from a shade command - only confirms transmission, not actual shade movement!

| Name | Type | Description | Required |
| ---- | ---- | ----------- | -------- |
| success | boolean | Whether the command was transmitted successfully | Yes |
| message | string | Human readable transmission result | Yes |
| shade_id | integer | ID of the shade we transmitted to | Yes |
| action | string | Action that was transmitted | Yes |
| execution_time_ms | integer | Time taken to transmit command in milliseconds | Yes |
| timestamp | string | When command was transmitted (local time) | No |
| arduino_response |  | Raw Arduino response for debugging | No |

**Example**
<pre>{
  "action": "u",
  "arduino_response": "TX_OK: 5C2D0D39|FEFF|F469 --- UP",
  "execution_time_ms": 1250,
  "message": "UP command transmitted to Shade 14",
  "shade_id": 14,
  "success": true,
  "timestamp": "2025-05-25T14:30:00Z"
}</pre>

#### ShadesListResponse

Response for listing all shades

| Name | Type | Description | Required |
| ---- | ---- | ----------- | -------- |
| success | boolean, <br>**Default:** true | Request success status | No |
| count | integer | Number of shades returned | Yes |
| shades | [ [Shade](#shade) ] | List of shade information | Yes |

#### ValidationError

| Name | Type | Description | Required |
| ---- | ---- | ----------- | -------- |
| loc | [  ] |  | Yes |
| msg | string |  | Yes |
| type | string |  | Yes |
