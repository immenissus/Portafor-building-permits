# Use official Python 3.12 slim image
FROM python:3.12-slim

# Set system environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

# Install system dependencies required for build and PostGIS shape support (if needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements file and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Expose port and declare command
EXPOSE 8000
CMD ["uvicorn", "filingpulse.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
