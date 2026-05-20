# NILM Chiller Monitor

React + FastAPI dashboard for NILM chiller monitoring, virtual sensing, ON/OFF detection, physical-vs-virtual sensor comparison, and diagnostic alerts.

## Project Structure

```text
frontend/   React + Vite interface
backend/    FastAPI API and Python NILM logic
```

## Run Locally

### Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend

Open another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

The frontend connects to `http://localhost:8000` by default. To override it, copy `frontend/.env.example` to `frontend/.env` and set:

```text
VITE_API_URL=http://localhost:8000
```

## Deployment

### Frontend on Vercel

- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment variable:

```text
VITE_API_URL=https://your-backend-url.onrender.com
```

### Backend on Render

- Root Directory: `backend`
- Build Command:

```bash
pip install -r requirements.txt
```

- Start Command:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

## Main API Endpoints

- `GET /health`
- `POST /dataset/demo`
- `POST /dataset/upload`
- `GET /dataset/summary`
- `POST /analysis/run`
- `GET /cleaning/results`
- `GET /signal-analysis/results`
- `GET /virtual-sensor/results`
- `GET /on-off/results`
- `GET /sensor-comparison/results`
- `GET /alerts`
- `GET /report/export?kind=summary`
