# Stage 1: Build the React frontend
FROM node:20-alpine AS frontend
WORKDIR /app/web
COPY web/package.json web/package-lock.json* ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2: Python backend + bundled frontend
FROM python:3.11-slim AS backend
WORKDIR /app

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source and data
COPY src/ ./src/
COPY Data/ ./Data/

# Copy built frontend into /app/static (served by FastAPI)
COPY --from=frontend /app/web/dist ./static/

EXPOSE 8000

CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
