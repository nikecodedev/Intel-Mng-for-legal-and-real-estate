"""
Configuration module
"""
import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Application configuration"""
    PORT = int(os.getenv("PORT", 8000))
    ENV = os.getenv("ENV", "development")
    # Add more configuration as needed

