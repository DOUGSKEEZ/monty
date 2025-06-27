# /commander/main.py

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import logging
import asyncio
from contextlib import asynccontextmanager

# Import our routers
from commander.routers import shades, health, scenes
from commander.interface.arduino_whisperer import cleanup_arduino_connection, force_arduino_reconnect

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events for the FastAPI app"""
    # Startup
    logger.info("🫡 ShadeCommander starting up...")
    
    # AUTO-CONNECT TO ARDUINO ON STARTUP
    logger.info("🔌 Establishing Arduino connection...")
    try:
        connection_result = await force_arduino_reconnect()
        if connection_result["success"]:
            logger.info("✅ Arduino connected successfully on startup")
        else:
            logger.warning("⚠️ Arduino connection failed on startup - will retry on first command")
    except Exception as e:
        logger.error(f"❌ Arduino startup connection error: {e}")
    
    logger.info("🚀 ShadeCommander ready to receive commands!")
    
    yield
    
    # Shutdown
    logger.info("🛑 ShadeCommander shutting down...")
    cleanup_arduino_connection()
    logger.info("👋 ShadeCommander stopped")

# Create FastAPI app
app = FastAPI(
    title="ShadeCommander",
    description="""
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
    """,
    version="1.0.0",
    lifespan=lifespan
)

# Timeout middleware
@app.middleware("http")
async def timeout_middleware(request: Request, call_next):
    """Add global timeout to all requests"""
    # Set a 30-second timeout for all requests
    try:
        response = await asyncio.wait_for(call_next(request), timeout=30.0)
        return response
    except asyncio.TimeoutError:
        logger.error(f"Request timeout: {request.method} {request.url.path}")
        return JSONResponse(
            status_code=504,
            content={
                "success": False,
                "error": "RequestTimeout", 
                "message": "Request processing exceeded 30 second timeout",
                "path": str(request.url.path)
            }
        )

# Add CORS middleware for Node.js and frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3001",        # Node.js backend server
        "http://192.168.0.15:3001",     # Node.js backend server (IP)
        "http://localhost:3000",        # React frontend (localhost)
        "http://192.168.0.15:3000",     # React frontend (IP)
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(shades.router, prefix="/shades", tags=["Shade Control"])
app.include_router(scenes.router, prefix="/scenes", tags=["Scene Control"])
app.include_router(health.router, tags=["System Health"])

# Root endpoint
@app.get("/", summary="ShadeCommander Info")
async def root():
    """Welcome message and basic service info"""
    return {
        "service": "ShadeCommander",
        "version": "1.0.0",
        "description": "Hardware interface for shade control",
        "status": "operational",
        "docs": "/docs",
        "health": "/health"
    }

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Handle unexpected errors gracefully"""
    logger.error(f"Unexpected error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "InternalServerError", 
            "message": "An unexpected error occurred",
            "timestamp": "2025-05-25T14:30:00Z"  # Will be replaced with actual timestamp
        }
    )

# Development server runner
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",  # Listen on all interfaces
        port=8000,       # Your designated ShadeCommander port
        reload=True,     # Auto-reload on code changes
        log_level="info"
    )
