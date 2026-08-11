import os
from dotenv import load_dotenv

# Load .env file
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgrespassword@localhost:5432/sagepilot")
TEMPORAL_HOST = os.getenv("TEMPORAL_HOST", "localhost:7233")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
PORT = int(os.getenv("PORT", "8000"))

# Verify vital settings
if not GROQ_API_KEY:
    print("WARNING: GROQ_API_KEY is not set.")
