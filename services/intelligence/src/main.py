"""
Intelligence Services - Main entry point
"""
from fastapi import FastAPI
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI(
    title="Intelligence Services",
    description="AI/ML services for the platform",
    version="1.0.0"
)


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "ok"}


@app.get("/api/v1")
async def api_info():
    """API information"""
    return {"message": "Intelligence Services API v1"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

