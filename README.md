# 🚦 Smart Traffic Management System (STMS)

An integrated, multi-layer intelligent traffic-control stack combining computer-vision perception, orchestrating signal optimization logic, a live operations dashboard, and an interactive 3D simulation environment.

---

## 🏗️ System Architecture & Data Flow

This repository unifies four key components of the STMS architecture into a runnable stack:

```
                      ┌──────────────────────────────────────────────┐
                      │              3D SIMULATOR                    │
                      │  - green-corridor-sim (React/Three.js)       │
                      │  - Port 8081 (Embedded in Layer-5 Iframe)    │
                      └──────────────┬──────────────▲────────────────┘
                                     │              │
                    postMessage      │ Telemetry    │ Sync Signal/
                    Iframe Bridge    │ (Vehicles)   │ Ambulance
                                     ▼              │
 ┌────────────────────────┐    SSE   ┌──────────────────────────────┐
 │    OPERATIONS DASHBOARD│◄─────────┤     ORCHESTRATOR BACKEND     │
 │    - Layer-5 (React)   ├─────────►│     - Layer-3_STM (Node/TS)  │
 │    - Port 5273         │   POST   │     - Ports: 8100 & 8200     │
 └────────────────────────┘  Override└──────────────▲───────────────┘
                                                    │
                                                    │ HTTP Fetch
                                                    │ /perception/layer2
                                                    │
                                     ┌──────────────┴───────────────┐
                                     │     PERCEPTION ML SERVICE    │
                                     │     - GatiShakti-ML (FastAPI)│
                                     │     - Port 8000              │
                                     └──────────────────────────────┘
```

---

## 🧩 Project Modules

| Layer / Component | Folder Name | Technology Stack | Core Responsibility |
|:---|:---|:---|:---|
| **Layer 2 — Perception (ML)** | [`GatiShakti-ML/`](GatiShakti-ML/) | Python · FastAPI · YOLO11 · OpenCV | Computer Vision: Runs YOLO object detection on camera frames per approach (North/South/East/West) to extract vehicle counts, occupancy, and CV confidence. |
| **Layer 3 — Orchestration (Backend)** | [`Layer-3_STM/`](Layer-3_STM/) | TypeScript · Node.js · Express | Brain / Decider: Executes traffic signal-timing algorithms (Max-Pressure scoring, safety verification, fallback logic), ingests EMV priority tokens, and broadcasts live telemetry. |
| **Layer 5 — Command & Operations UI** | [`Layer-5/`](Layer-5/) | React · TypeScript · Vite · Leaflet | Live Web Interface: Displays real-time junction diagrams, system health stats, interactive maps, EMV green corridors, violation reviews, and hosts manual signal overrides. |
| **Simulator — 3D Environment** | [`green-corridor-sim/`](green-corridor-sim/) | React · TypeScript · Three.js (R3F) | 3D Visualization: Simulates a physical double-intersection with real-time vehicle movement, queues, and emergency pathing (e.g. ambulance dispatch). |

---

## 🔌 Port Mapping Reference

The STMS stack services run locally on the following ports:

| Port | Service | Description |
|---|---|---|
| **`8000`** | **Perception API (FastAPI)** | Serves YOLO detection and analytics endpoints (e.g. `/perception/layer2`). |
| **`8100`** | **EMV Ingestion API** | Accepts emergency vehicle status updates and green-corridor token dispatches. |
| **`8200`** | **Dashboard SSE Gateway** | Streams real-time `CycleSnapshot` data and accepts manual signal override requests. |
| **`5273`** | **Operations Dashboard UI** | Vite development server for the main Layer-5 React web application. |
| **`8081`** | **3D Simulator Canvas** | Runs the React Three Fiber application visualizing live traffic conditions. |

---

## 🚀 Quick Start Guide

### 1. One-Time Setup
Run the setup script from the project root to create the Python virtual environment, download YOLO11 weights, and install all Node.js dependencies for the stack:

```powershell
# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File .\setup.ps1
```

### 2. Run the Complete Stack
To start the Perception service, Dashboard gateway, and Front-end dashboard together:

```powershell
# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File .\start.ps1
```
```bash
# Linux / macOS / Git-Bash
./start.sh
```

*Note: If you want to run the stack without the heavy YOLO computer-vision engine, launch with the skip flag:*
`.\start.ps1 -SkipPerception` or `./start.sh --skip-perception`

### 3. Run the 3D Simulator
To start the 3D visual traffic simulator:
```powershell
cd green-corridor-sim
npm install
npm run dev
```
Once started, the simulator runs on [http://localhost:8081](http://localhost:8081) and automatically embeds itself inside the Layer-5 simulator page.

---

## 🔧 Running Components Individually

### 📷 Layer 2 — Perception (ML Service)
```bash
cd GatiShakti-ML
.venv/Scripts/python -m uvicorn app:app --reload --port 8000
# API Interactive Docs: http://localhost:8000/docs
```

### 🚦 Layer 3 — Orchestration (Backend)
```bash
cd Layer-3_STM
npm run live    # Runs live loop with real perception client (falls back to mock if down)
npm run dev     # Runs continuous loop using mock perception data
npm run test    # Executes integration and resilience tests
```

### 📊 Layer 5 — Operations Dashboard
```bash
cd Layer-5
npm run dev     # Starts the React web application on http://localhost:5273
```

---

## ⚙️ Configuration & Environment Variables

### Layer 3 Orchestrator (`Layer-3_STM/.env`)
- **`PORT`** *(Default: `8100`)*: Port for the core EMV backend client.
- **`DASHBOARD_PORT`** *(Default: `8200`)*: Port for the SSE gateway.
- **`PERCEPTION_URL`** *(Default: `http://localhost:8000`)*: Live connection URL to Layer-2 Perception.
- **`DATABASE_URL`** & **`REDIS_URL`** *(Optional)*: Configuration values to enable TimescaleDB/Redis storage. If left unset, the backend degrades gracefully to an in-memory/file-based datastore.

### Layer 5 Dashboard (`Layer-5/.env`)
- **`VITE_GATEWAY_URL`** *(Default: `http://localhost:8200`)*: Configures where the dashboard looks for Server-Sent Events.
- **`VITE_SIM_URL`** *(Default: `http://localhost:8081`)*: URL of the embedded 3D simulation iframe.

---

## 🔒 Role-Based Access Controls

The Layer-5 dashboard has built-in role-based views. For demonstration purposes, you can log in on `/login` using the password **`stm@1234`** with one of the following personas:

*   **`admin`** (Administrator): Full system privileges, configuration, and audit logs.
*   **`operator`** (Traffic Operator): Standard dashboard access and manual signal override controls.
*   **`dispatcher`** (Emergency Dispatcher): Access to the emergency vehicle green-corridor token dispatch dashboard.
*   **`inspector`** (Corridor Inspector): Review violations queue (ANPR) and compliance analytics.

---

## 🤝 Integration Seams & Contracts

1.  **Layer 2 ──► Layer 3**: Layer 3 queries `GET /perception/layer2` to obtain a `Layer2Payload` JSON object (vehicle counts, occupancy levels, and camera confidence).
2.  **Layer 3 ──► Layer 5**: Layer 3 serves Server-Sent Events (`/events`) containing `CycleSnapshot` and `CitySnapshot` arrays. The frontend connects using a single shared stream provider.
3.  **Layer 5 ◄──► Simulator**: Layer-5 embeds the simulator iframe. Communication is established bidirectionally via `window.postMessage` to sync vehicle spawns, signal timings, and emergency triggers.

---

## 📁 Repository Layout

```
Layer_23/
│
├── GatiShakti-ML/         # Layer 2: YOLO11 computer-vision FastAPI server
│   ├── models/            # YOLO weight storage
│   ├── predictors/        # Image processing & detection calculations
│   └── app.py             # Server endpoints & entrypoint
│
├── Layer-3_STM/           # Layer 3: TypeScript signal orchestrator
│   ├── src/
│   │   ├── algorithms/    # Pressure scoring & timing calculations
│   │   ├── dashboard/     # Event snapshot & SSE gateway
│   │   └── live.ts        # Orchestrator core run loop
│   └── docker-compose.yml # Postgres/TimescaleDB & Redis container configurations
│
├── Layer-5/               # Layer 5: React dashboard & client interface
│   ├── src/
│   │   ├── components/    # Reusable UI widgets & Leaflet map configurations
│   │   ├── context/       # Single SSE stream context manager
│   │   ├── pages/         # Dashboard operational views
│   │   └── config.ts      # Client service URL configurations
│   └── package.json
│
├── green-corridor-sim/    # Interactive 3D junction traffic simulator
│   ├── src/
│   │   ├── components/    # Three.js UI overlays
│   │   ├── simulation/    # VehicleManager & TrafficController modules
│   │   └── App.tsx        # Main scene container & postMessage handler
│   └── package.json
│
├── docs/                  # System contract & communication protocols
│   └── L3-L4-actuation-contract.md
│
├── setup.ps1              # System environment installer
├── start.ps1              # PowerShell automatic launcher
└── start.sh               # Bash automatic launcher
```
