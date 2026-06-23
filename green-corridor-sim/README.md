# SmartFlow AI Model Service

## Overview

SmartFlow AI Model Service is the computer-vision inference layer for the SmartFlow platform. It provides YOLO-based real-time vehicle detection and exposes HTTP endpoints consumed by frontend and backend services.

The service supports two operational modes:

1. Optimized asynchronous mode (recommended), based on frame submission plus lightweight metadata polling.
2. Backward-compatible synchronous mode, based on per-request detection from base64 images.

This folder includes:

- Inference APIs: `inference_api.py`, `inference_api_optimized.py`
- Model file: `best.pt`
- Backend bridge: `smartflow_backend_integration.py`
- Integration examples: `send_data_to_backend.py`
- Traffic simulator: `test_realtime_data.py`
- Environment and dependency files: `requirements.txt`, `runtime.txt`

## Objectives

This service is designed to:

- Detect vehicles and emergency vehicles from incoming camera frames.
- Return compact, structured detection metadata for efficient client rendering.
- Support multiple cameras in parallel.
- Provide operational health and runtime statistics.
- Integrate with SmartFlow backend ingestion endpoints for dashboard and signal control workflows.

## System Architecture

### Recommended architecture (optimized)

1. Client sends frames using `POST /submit-frame/{camera_id}` or `POST /submit-frame-base64/{camera_id}`.
2. Frames are queued for background processing by a multi-thread inference engine.
3. Client polls latest results using `GET /detections/{camera_id}`.
4. Frontend/backend renders or aggregates detections using returned JSON metadata.

This architecture reduces network overhead and avoids heavy image round-trips for each request.

### Compatibility architecture (legacy)

1. Client sends a base64 frame to `POST /detect-annotated`.
2. Service runs inference immediately on that frame.
3. Service returns detection payload, and in some implementations also annotated imagery.

This mode is simple but less efficient under sustained high frame rates.

## Main Files and Responsibilities

### `inference_api.py`

Primary high-performance implementation with:

- Background inference engine (`SmartFlowInferenceEngine`)
- Frame queue per camera
- Parallel processing workers
- Metadata-first retrieval (`/detections` endpoints)
- Compatibility endpoints (`/detect-annotated`, `/detect`)

### `inference_api_optimized.py`

Alternative optimized implementation with similar goals and API style, using a continuous engine abstraction (`ContinuousInferenceEngine`).

### `smartflow_backend_integration.py`

Bridge service that:

- Pulls detections from the inference API
- Maps camera detections to roads
- Derives traffic density and speed estimates
- Pushes data to SmartFlow backend ingestion routes
- Detects and reports emergency vehicles

### `send_data_to_backend.py`

Reference client for backend ingestion APIs, including road, intersection, signal, emergency, and batch updates.

### `test_realtime_data.py`

Synthetic traffic simulator to validate backend/dashboard behavior without live camera feeds.

## Data Model

### Detection object

Each detection generally contains:

- Bounding box coordinates: `x1`, `y1`, `x2`, `y2`
- Classification fields: `class_name`, `class_id`
- Confidence score: `confidence`
- Visualization color: `color`

### Detection frame object

Per camera output includes:

- `camera_id`
- `timestamp`
- `detections` array
- `frame_width`, `frame_height`
- `total_vehicles`
- `emergency_count`
- `processing_time_ms` (in `inference_api.py` implementation)

## API Reference

Base URL (default): `http://localhost:8000`

### Health and status

#### `GET /health`

Returns service health, model/device state, and runtime status.

#### `GET /stats`

Returns runtime statistics such as camera count, inference count, and model metadata.

### Optimized frame submission and polling

#### `POST /submit-frame/{camera_id}`

Submits an image via multipart upload for background processing.

Request:

- Path parameter: `camera_id` (integer)
- Body: image file (`multipart/form-data`)

Response (example):

```json
{
  "status": "queued",
  "camera_id": 0
}
```

#### `POST /submit-frame-base64/{camera_id}`

Submits a base64-encoded frame.

Request (example):

```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQ..."
}
```

Response (example):

```json
{
  "status": "queued",
  "camera_id": 0
}
```

#### `GET /detections/{camera_id}`

Returns latest detection metadata for a camera.

Response (example):

```json
{
  "camera_id": 0,
  "timestamp": 1760000000.123,
  "detections": [
    {
      "x1": 120,
      "y1": 180,
      "x2": 220,
      "y2": 330,
      "class_name": "car",
      "class_id": 2,
      "confidence": 0.91,
      "color": [0, 255, 0]
    }
  ],
  "frame_width": 1280,
  "frame_height": 720,
  "total_vehicles": 1,
  "emergency_count": 0,
  "processing_time_ms": 18.4
}
```

#### `GET /detections`

Returns latest detections for all cameras in one response.

### Backward compatibility endpoints

#### `POST /detect-annotated`

Synchronous detection endpoint for legacy frontend contracts.

Request (example):

```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQ...",
  "camera_id": 0
}
```

Response shape varies by implementation, but includes detection data and success status.

#### `POST /detect`

Alias endpoint mapped to `POST /detect-annotated`.

## Vehicle Class Normalization

Model outputs are normalized to consistent traffic types:

- `car`, `auto`, `taxi` -> `car`
- `bike`, `motorcycle`, `scooter` -> `bike`
- `bus`, `coach` -> `bus`
- `truck`, `lorry` -> `truck`
- `emergency` -> `emergency`
- Unknown classes -> `vehicle`

Emergency detections are surfaced distinctly and used by downstream signal-priority logic.

## Configuration

### Core constants and environment variables

Implemented in API scripts:

- Model path: `best.pt`
- Confidence threshold: `CONFIDENCE = 0.12`
- Device selection: `USE_GPU=true` enables CUDA path, otherwise CPU
- Worker count (in `inference_api.py`): `MAX_INFERENCE_WORKERS` (default `4`)

### Runtime version

- Python version target in `runtime.txt`: `python-3.11.11`

## Installation and Setup

### 1. Create environment and install dependencies

```bash
cd SmartFlow_AI_Model_Service
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

On Windows PowerShell, activate with:

```powershell
.\.venv\Scripts\Activate.ps1
```

### 2. Start the inference API

Recommended:

```bash
python inference_api.py
```

Alternative:

```bash
python inference_api_optimized.py
```

### 3. Verify service health

```bash
curl http://localhost:8000/health
curl http://localhost:8000/stats
```

## Integration with SmartFlow Backend

Run backend bridge:

```bash
python smartflow_backend_integration.py
```

The bridge expects:

- Inference API at `http://localhost:8000`
- SmartFlow backend at `http://localhost:3000/api`

Bridge behavior:

- Polls detections per camera
- Maps camera IDs to roads
- Computes density categories (`low`, `medium`, `high`)
- Sends road updates to `/api/ingest/road`
- Sends emergency updates to `/api/ingest/emergency-vehicle`

## Typical End-to-End Startup Order

1. Start model service (`inference_api.py`)
2. Start SmartFlow backend
3. Start frontend
4. Start `smartflow_backend_integration.py` (if backend ingestion flow is needed)

## Performance Notes

Key performance strategies in the current design:

- Background inference avoids request-blocking compute paths.
- Metadata polling avoids repeated image transfer for every result fetch.
- Per-camera queues isolate workloads and reduce contention.
- Thread pool workers improve throughput in multi-camera setups.

Operational recommendation:

- Use optimized submit/poll endpoints for production-like workflows.
- Reserve synchronous compatibility endpoints for migration support.

## Error Handling and Operational Behavior

Common HTTP statuses:

- `200`: success
- `400`: invalid payload or decoding failure
- `404`: invalid camera ID route
- `503`: engine unavailable or not running

Service behavior includes:

- Structured logging for startup, runtime, and failures
- Graceful startup/shutdown hooks for engine lifecycle
- Defensive decoding checks for image payload integrity

## Troubleshooting

### Service does not start

- Confirm Python version and dependency installation.
- Confirm `best.pt` exists in this folder.
- Check console logs for model-load errors.

### `/health` works but no detections appear

- Confirm frames are being submitted successfully.
- Confirm camera IDs are within configured range.
- Verify polling endpoint (`/detections/{camera_id}`) for same camera ID.

### High latency or low throughput

- Enable GPU with `USE_GPU=true` if CUDA is available.
- Adjust `MAX_INFERENCE_WORKERS` based on CPU/GPU capacity.
- Prefer metadata polling over synchronous detect endpoints.

### Backend not receiving road data

- Verify backend availability at `http://localhost:3000/api/healthz`.
- Verify integration script endpoint settings.
- Inspect bridge logs in `smartflow_backend_integration.py`.

## Security and Deployment Considerations

Current defaults are development-oriented:

- CORS allows all origins.
- Localhost endpoints are hardcoded in helper scripts.

For production deployment:

- Restrict CORS origins.
- Externalize all URLs and thresholds into environment variables.
- Add request authentication for ingestion and inference endpoints.
- Place service behind a reverse proxy with TLS.
- Add health probes and process supervision.

## Development and Test Utilities

- `send_data_to_backend.py`: backend API integration examples.
- `test_realtime_data.py`: synthetic real-time traffic feed generator.
- `visualize_system.py`: architecture and flow visualization.

## Recommended Next Improvements

1. Move all runtime configuration to environment variables.
2. Add a single canonical API contract section shared by both inference implementations.
3. Add automated API tests for frame submission and detection polling.
4. Add structured metrics export (for example, Prometheus-compatible telemetry).

## License and Use

This module is part of the SmartFlow project workspace and is intended for integration with the SmartFlow backend and frontend applications in this repository.
