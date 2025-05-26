## FastAPI ShadeCommander Architecture 🫡

*Designed: May 25, 2025*  
*Status: Ready to Build!*

---

## Architecture Overview 🏗️

### Service Flow
```
    React
  WebInterface        Node.js               
communicates 3000  ↔ ShadeService       FastAPI 
                   communicates 3001 ↔ ShadeCommander     Arduino
                                      communciates 8000 ↔ Listens
```

### What Each Component Does
- **React Frontend** (3000): User clicks shade buttons
- **Node.js ShadeService** (3001): Business logic, validation, scheduling integration  
- **FastAPI ShadeCommander** (8000): Hardware interface, Arduino communication
- **Arduino**: RF transmission to physical shades

---

## Directory Structure 📁

```
/home/monty/monty/shades/              # Clean slate optimal design!
├── arduino/
│   └── shade_transmitter.ino          # Arduino hardware code
├── commander/                         # FastAPI microservice
│   ├── main.py                       # FastAPI app entry point
│   ├── models/
│   │   ├── __init__.py
│   │   ├── shade.py                  # Pydantic models for shades
│   │   └── scene.py                  # Pydantic models for scenes
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── shades.py                 # Shade endpoints
│   │   ├── scenes.py                 # Scene endpoints
│   │   └── health.py                 # System health
│   ├── services/
│   │   ├── __init__.py
│   │   ├── shade_service.py          # Business logic
│   │   └── scene_service.py          # Scene execution
│   └── requirements.txt
├── data/
│   ├── shades.db                     # Existing SQLite database
│   └── scenes.json                   # Scene configurations (JSON for easy editing)
└── interface/
    ├── __init__.py
    └── arduino_whisperer.py           # Modified control_shades.py (hardware interface)
```

```
FastAPI endpoint → commander/services/shade_service.py → interface/arduino_whisperer.py → Arduino
```

---

## API Endpoints 🛣️

### Shade Control (Stateless & Simple)
```python
POST /shades/{shade_id}/command    # Send u/d/s command - that's it!
GET  /shades                       # List all configured shades (IDs, names, rooms only)
```

### Scene Management
```python
GET  /scenes                       # List available scenes
GET  /scenes/{scene_name}         # Get scene configuration details
POST /scenes/{scene_name}/execute  # Execute scene with delays/retries
```

### System Operations
```python
GET  /health                       # Arduino connection status
GET  /status                       # Last few commands sent (for debugging)
```

### Why Shades Are Stateless ✨
- **No individual shade details needed** - Frontend knows what to display
- **No GET /shade/{id} calls** - Saves 28 API calls per page load!
- **Simple logic:** UP command to UP shade = stays UP, DOWN to DOWN = stays DOWN
- **Manual adjustments:** User tweaks shade position? Just send the command you want next!

---

## Scene Configuration Example 🎬

```json
{
  "good_night": {
    "name": "Good Night",
    "description": "Lower all privacy shades for nighttime",
    "commands": [
      {"shade_id": 14, "action": "d", "delay_ms": 1000},
      {"shade_id": 36, "action": "d", "delay_ms": 1000}, 
      {"shade_id": 40, "action": "d", "delay_ms": 1000},
      {"shade_id": 48, "action": "d", "delay_ms": 1000}
    ],
    "retry_count": 2,
    "timeout_seconds": 30
  }
}
```

---

## Pydantic Models 📋

```python
# Shade command model
class ShadeCommand(BaseModel):
    shade_id: int
    action: str  # 'u', 'd', 's'
    
# Response model
class ShadeResponse(BaseModel):
    success: bool
    message: str
    shade_id: int
    action: str
    execution_time_ms: int
```

---

## Integration with Monty Dashboard 📊

### Service Grouping
```
┌─ Node.js Services ─────────────┐
│ • ShadeService         ✅ ready │
│ • PianobarService      ✅ ready │  
│ • BluetoothService     ✅ ready │
│ • WeatherService       ✅ ready │
└─────────────────────────────────┘

┌─ External Services ────────────┐
│ • ShadeCommander (8000) ✅ ready │
│ • OpenWeatherMap API    ✅ ready │
└─────────────────────────────────┘
```

### Health Check Integration
- **Node.js ShadeService** monitors ShadeCommander health
- **ShadeCommander** appears in main dashboard
- **Both services** tracked independently with metrics

---

## Configuration Decisions ⚙️

1. **Port:** FastAPI runs on `8000` (standard)
2. **Database:** Uses existing `shades.db` directly from `/data/` directory
3. **Location:** `/home/monty/monty/shades/` (clean project organization)
4. **Arduino Integration:** `arduino_whisperer.py` - modified version of proven `control_shades.py`
5. **Scene Storage:** JSON files in `/data/` directory (easy to edit, version control friendly)
6. **Shade State:** Stateless design - no individual shade status tracking needed

---

## Benefits ✨

- **Portability:** ShadeCommander can move to new house/hardware
- **Separation of Concerns:** Hardware interface isolated from business logic
- **Monitoring:** Full integration with existing dashboard
- **Auto-Documentation:** FastAPI generates interactive API docs
- **Proven Hardware Code:** Leverages working Arduino/Python implementation

---

## Next Steps 🚀

### Ready to Build Checklist:
- [ ] **Create project directory structure** (`mkdir` all the folders)
- [ ] **Set up FastAPI dependencies** (`pip install fastapi uvicorn`)
- [ ] **Create Pydantic models** (shade commands, scene definitions)  
- [ ] **Build arduino_whisperer.py** (hardware interface)
- [ ] **Implement REST endpoints** (shades, scenes, health)
- [ ] **Create scene JSON configurations** (good_night, good_morning, etc.)
- [ ] **Integrate with Node.js ShadeService** (HTTP client calls)
- [ ] **Test end-to-end shade commands** (React → Node.js → FastAPI → Arduino)

### Development Priority:
1. **Hardware first** - Get arduino_whisperer talking to Arduino
2. **API second** - Build FastAPI endpoints  
3. **Integration third** - Connect to Node.js ShadeService
4. **Frontend last** - Wire up the beautiful shade buttons!

---

*Ready to build ShadeCommander! 🫡*