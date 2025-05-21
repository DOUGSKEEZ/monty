# Scheduler Service

The Scheduler Service manages time-based events and automation schedules for the Monty home automation system, particularly for shade control based on time of day and sunset data.

## Interface

```javascript
class ISchedulerService extends BaseInterface {
  static get methods() {
    return {
      // Schedule management
      getSchedule: "function", 
      updateSchedule: "function",
      
      // Event scheduling
      scheduleTask: "function",
      cancelTask: "function",
      
      // Scene automation
      scheduleSceneEvent: "function",
      getSunsetData: "function",
      
      // Status and info
      getNextScheduledEvents: "function",
      getServiceStatus: "function"
    };
  }
}
```

## Features

- **Time-based event scheduling**: Schedule one-time or recurring tasks
- **Sunset-aware automation**: Schedule events relative to local sunset times
- **Scene automation**: Schedule shade scenes (Good Morning, Good Evening, etc.)
- **Schedule management**: Create, update, and cancel scheduled events
- **Status monitoring**: Check upcoming events and service health

## Usage Examples

### Get Current Schedule

```javascript
const schedulerService = require('../services/serviceFactory').schedulerService;

async function viewCurrentSchedule() {
  const schedule = await schedulerService.getSchedule();
  console.log('Current schedule:', schedule);
}
```

### Schedule a Scene Event

```javascript
async function scheduleGoodMorningScene() {
  const result = await schedulerService.scheduleSceneEvent({
    scene: 'goodMorning',
    time: '07:30', // HH:MM 24-hour format
    days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    enabled: true
  });
  
  if (result.success) {
    console.log('Good Morning scene scheduled successfully');
  } else {
    console.error('Failed to schedule scene:', result.error);
  }
}
```

### Schedule a Task Relative to Sunset

```javascript
async function scheduleEveningEvent() {
  const result = await schedulerService.scheduleTask({
    name: 'eveningLights',
    type: 'sunset-relative',
    offset: -30, // 30 minutes before sunset
    callback: 'turnOnLights', // Service method to call
    enabled: true
  });
  
  console.log('Evening task scheduled:', result);
}
```

## Response Format

### Schedule Object

```javascript
{
  id: "string", // Unique identifier for this schedule
  name: "string", // Human-readable name
  type: "string", // "time", "sunset-relative", "sunrise-relative"
  time: "string", // For fixed-time events, in HH:MM format
  offset: Number, // For relative events, minutes before/after sun event
  days: ["string"], // Days of week this applies to
  callback: "string", // Function or service method to call
  params: Object, // Parameters to pass to the callback
  enabled: Boolean, // Whether this schedule is active
  lastRun: Date, // When this was last triggered
  nextRun: Date // When this will next trigger
}
```

### Service Status Response

```javascript
{
  success: Boolean,
  status: "string", // "running", "idle", "error"
  activeSchedules: Number,
  nextEvent: {
    name: "string",
    time: Date
  },
  errors: [] // Any recent errors
}
```

## Implementation Details

The scheduler service uses node-cron for precise time-based scheduling and manages sunset-based events using a combination of sunset data (from `sunset_data.csv`) and real-time calculations. The service implements a circuit breaker pattern to handle failures gracefully.

### Dependency Injection

The DI-compatible implementation accepts dependencies through its constructor:

```javascript
class SchedulerService {
  constructor(dependencies = {}) {
    this.logger = dependencies.logger || console;
    this.configManager = dependencies.configManager;
    this.shadeService = dependencies.shadeService;
    // Initialize scheduler
  }
  
  // Service methods...
}
```

### Service Registration

The service is registered with the dependency container:

```javascript
container.register('schedulerService', SchedulerService, {
  dependencies: ['logger', 'configManager', 'shadeService'],
  lifecycle: Lifecycle.SINGLETON
});
```

## Related Services

- **Shade Service**: Receives commands from the scheduler to control shades
- **Weather Service**: Provides sunset/sunrise data for accurate scheduling
- **Config Service**: Stores scheduler preferences and schedules