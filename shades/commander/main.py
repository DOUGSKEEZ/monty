# /commander/main.py

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
import logging
from contextlib import asynccontextmanager

# Import our routers
from commander.routers import shades, health, scenes
from commander.interface.arduino_whisperer import cleanup_arduino_connection

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
    
    # Smart Arduino connection will auto-connect on first command
    logger.info("🤖 Smart Arduino Whisperer ready - will auto-connect on first command!")
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

# Add CORS middleware for Node.js communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001"],  # Your Node.js server
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
