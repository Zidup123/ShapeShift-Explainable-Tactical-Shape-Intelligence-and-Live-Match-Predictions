# ShapeShift — Explainable Tactical Intelligence

Synthetic football data · Microsoft x Premier League hackathon · Deadline 27 Oct 2026

Built with **Microsoft Foundry** (narrative agent), **Azure Container Apps** (backend), **Azure Static Web Apps** (frontend), **Azure MCP** + our own **MCP server**, and the **Microsoft Agent Framework** (analyst → narrator → verifier pipeline).

## Setup

```bash
pip install -r requirements.txt
cp .env.example .env          # fill in Azure credentials if available
python3 generate_season.py --seed 6 --out Data
python3 src/shapes/detect.py
python3 src/tactics/run.py
```

## Run locally

```bash
# Backend
uvicorn src.api.main:app --reload

# Frontend (separate terminal)
cd web && npm install && npm run dev
```

Open http://localhost:5173. API at http://localhost:8000.

## MCP server

```bash
python3 src/mcp/server.py
```

## Docker (production)

```bash
docker build -t shapeshift . && docker run -p 8000:8000 shapeshift
```

All data is synthetic. See `Data/facts.json` for evidence. Label: **SYNTHETIC DATA**.
