# Shade Service

The Shade Service provides an interface to control window shades throughout the Monty home automation system. It translates API requests into commands for the Python-based shade controller that communicates with the Arduino RF transmitter.

## Interface

```javascript
class IShadeService extends BaseInterface {
  static get methods() {
    return {
      // Individual shade control
      controlShade: "function",
      getShadeStatus: "function",
      
      // Scene control
      executeScene: "function",
      getScenes: "function",
      
      // Configuration
      getShadeConfig: "function",
      getRoomShades: "function",
      getShadesByType: "function",
      
      // Service status
      getServiceStatus: "function"
    };
  }
}
```

## Features

- **Individual shade control**: Move specific shades up, down, or stop
- **Scene execution**: Run predefined shade scenes (Good Morning, Good Night, etc.)
- **Room-based control**: Control all shades in a specific room
- **Type-based control**: Control all shades of a specific type (solar, privacy, blackout)
- **Status monitoring**: Track shade positions and service health

## Usage Examples

### Control an Individual Shade

```javascript
const shadeService = require('../services/serviceFactory').shadeService;

async function moveShade(shadeId, direction) {
  const result = await shadeService.controlShade(shadeId, direction);
  if (result.success) {
    console.log(`Shade ${shadeId} is moving ${direction}`);
  } else {
    console.error('Failed to control shade:', result.error);
  }
}

// Example: Move shade #14 up
moveShade(14, 'up');
```

### Execute a Scene

```javascript
async function runEveningScene() {
  const result = await shadeService.executeScene('goodEvening');
  console.log('Scene execution result:', result);
}
```

### Get Shades by Room

```javascript
async function getBedroomShades() {
  const shades = await shadeService.getRoomShades('bedroom');
  console.log('Bedroom shades:', shades);
}
```

## Response Format

### Shade Control Response

```javascript
{
  success: Boolean,
  shade: {
    id: Number,
    name: "string",
    room: "string",
    type: "string",
    position: "string" // "up", "down", "partial", "unknown"
  },
  command: "string", // The command that was sent
  timestamp: Date
}
```

### Scene Execution Response

```javascript
{
  success: Boolean,
  scene: "string",
  shades: [
    {
      id: Number,
      command: "string",
      success: Boolean
    }
  ],
  timestamp: Date
}
```

### Shade Configuration Response

```javascript
{
  id: Number,
  name: "string",
  room: "string",
  type: "string", // "privacy", "solar", "blackout"
  group: "string", // For group-based control
  scenes: ["string"], // Scene names this shade participates in
  position: "string", // Current position if known
  lastCommand: {
    command: "string",
    timestamp: Date
  }
}
```

## Implementation Details

The shade service communicates with the Python-based shade controller (`control_shades.py`) which sends RF commands to the Arduino transmitter. The shade configuration is stored in the SQLite database (`shades.db`).

### Command Format

Shade commands follow this format:
- `u{id}` - Move shade up (e.g., `u14` to move shade #14 up)
- `d{id}` - Move shade down (e.g., `d28` to move shade #28 down)
- `s{id}` - Stop shade movement (e.g., `s40` to stop shade #40)
- `scene:{name},{command}` - Execute scene (e.g., `scene:main,u` to move all main group shades up)

### Dependency Injection

The DI-compatible implementation accepts dependencies through its constructor:

```javascript
class ShadeService {
  constructor(dependencies = {}) {
    this.logger = dependencies.logger || console;
    this.configManager = dependencies.configManager;
    this.db = dependencies.database;
    // Initialize shade controller
  }
  
  // Service methods...
}
```

### Service Registration

The service is registered with the dependency container:

```javascript
container.register('shadeService', ShadeService, {
  dependencies: ['logger', 'configManager', 'database'],
  lifecycle: Lifecycle.SINGLETON
});
```

## Related Services

- **Scheduler Service**: Schedules automated shade movements
- **Config Service**: Stores shade configurations and preferences
- **Database Service**: Provides access to shade definitions in the SQLite database