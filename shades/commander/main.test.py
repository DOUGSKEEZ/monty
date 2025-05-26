from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="ShadeCommander 🫡",
    description="FastAPI microservice for controlling roller shades via Arduino",
    version="1.0.0"
)

# Add CORS middleware for Node.js integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://192.168.0.15:3001"],  # Node.js backend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "message": "ShadeCommander is ready! 🫡",
        "status": "operational",
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service": "ShadeCommander",
        "arduino_connected": False,  # TODO: Real Arduino check
        "database_connected": False  # TODO: Real DB check
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
