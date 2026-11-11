from fastapi import FastAPI
from backend.api.routes.call_routes import router as call_router
 
app = FastAPI(
    title="AI Voice Analysis API",
    description="API for receiving call recordings from the MERN backend",
    version="1.0.0"
)
 
app.include_router(call_router)
 
 
@app.get("/")
async def health_check():
    return {
        "status": "success",
        "message": "AI Voice Analysis API is running"
    }