# Scheduler API

The Scheduler API provides endpoints for managing scheduled events and automation in the Monty system.

## Endpoints

### GET /api/scheduler/schedule

Returns the current schedule configuration.

**Response:**

```json
{
  "success": true,
  "data": {
    "schedules": [
      {
        "id": "morning-shades",
        "name": "Morning Shades",
        "type": "time",
        "time": "07:30",
        "days": ["monday", "tuesday", "wednesday", "thursday", "friday"],
        "action": {
          "type": "scene",
          "scene": "goodMorning"
        },
        "enabled": true,
        "lastRun": "2023-07-25T07:30:00Z",
        "nextRun": "2023-07-26T07:30:00Z"
      },
      {
        "id": "evening-shades",
        "name": "Evening Shades",
        "type": "sunset-relative",
        "offset": -30,  // 30 minutes before sunset
        "days": ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
        "action": {
          "type": "scene",
          "scene": "goodEvening"
        },
        "enabled": true,
        "lastRun": "2023-07-24T20:15:00Z",
        "nextRun": "2023-07-25T20:13:00Z"
      },
      // Additional schedules...
    ]
  }
}
```

### POST /api/scheduler/schedule

Creates or updates a scheduled event.

**Request Body:**

```json
{
  "id": "weekend-morning",
  "name": "Weekend Morning Shades",
  "type": "time",
  "time": "09:00",
  "days": ["saturday", "sunday"],
  "action": {
    "type": "scene",
    "scene": "goodMorning"
  },
  "enabled": true
}
```

**Parameters:**

- `id`: Schedule ID (required for updates, optional for create)
- `name`: Human-readable name (required)
- `type`: One of: "time", "sunrise-relative", "sunset-relative" (required)
- `time`: Time in HH:MM format (required for "time" type)
- `offset`: Minutes offset from sun event (required for sun-relative types)
- `days`: Array of days (optional, defaults to all days)
- `action`: Action to perform (required)
- `enabled`: Whether schedule is active (optional, defaults to true)

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "weekend-morning",
    "name": "Weekend Morning Shades",
    "type": "time",
    "time": "09:00",
    "days": ["saturday", "sunday"],
    "action": {
      "type": "scene",
      "scene": "goodMorning"
    },
    "enabled": true,
    "nextRun": "2023-07-29T09:00:00Z"
  }
}
```

### DELETE /api/scheduler/schedule/:id

Deletes a scheduled event.

**Parameters:**

- `id`: Schedule ID (path parameter, required)

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "weekend-morning",
    "deleted": true
  }
}
```

### POST /api/scheduler/schedule/:id/toggle

Enables or disables a scheduled event.

**Request Body:**

```json
{
  "enabled": false
}
```

**Parameters:**

- `id`: Schedule ID (path parameter, required)
- `enabled`: Boolean enabled state (required)

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "morning-shades",
    "enabled": false,
    "nextRun": null
  }
}
```

### GET /api/scheduler/events

Returns upcoming scheduled events.

**Query Parameters:**

- `limit` (optional): Number of events to return (default: 10)

**Response:**

```json
{
  "success": true,
  "data": {
    "events": [
      {
        "id": "evening-shades",
        "name": "Evening Shades",
        "time": "2023-07-25T20:13:00Z",
        "action": {
          "type": "scene",
          "scene": "goodEvening"
        }
      },
      // Additional events...
    ]
  }
}
```

### GET /api/scheduler/sunset

Returns sunset data for the configured location.

**Query Parameters:**

- `date` (optional): Date in YYYY-MM-DD format (default: today)

**Response:**

```json
{
  "success": true,
  "data": {
    "date": "2023-07-25",
    "sunrise": "06:45",
    "sunset": "20:43",
    "location": {
      "latitude": 30.267,
      "longitude": -97.743,
      "name": "Austin, TX"
    }
  }
}
```

## Error Responses

### Invalid Schedule

```json
{
  "success": false,
  "error": {
    "code": "INVALID_SCHEDULE",
    "message": "Invalid schedule configuration",
    "details": "Time must be in HH:MM format"
  }
}
```

### Schedule Not Found

```json
{
  "success": false,
  "error": {
    "code": "SCHEDULE_NOT_FOUND",
    "message": "Schedule with ID 'unknown-id' not found"
  }
}
```

### Action Error

```json
{
  "success": false,
  "error": {
    "code": "ACTION_ERROR",
    "message": "Invalid action configuration",
    "details": "Scene 'invalidScene' does not exist"
  }
}
```