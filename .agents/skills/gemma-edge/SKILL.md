---
name: gemma-edge
metadata:
  version: "1.0.0"
  category: EdgeAi
description: >-
  Guides development, deployment, and troubleshooting of Gemma 3 on-premise edge models
  in Kaizen Agent. Use when working on edge vision classification (backend/edge/gateway/),
  the 95% frame filtering logic (edge_filter.py), the local edge simulator (backend/edge/simulator/),
  running Ollama locally (ollama run gemma:2b), or managing the MQTT telemetry bridge.
---

# Gemma 3 Edge Inference Skill

Gemma 3 Edge runs lightweight open-source models (Gemma 2B, 9B, PaliGemma) on industrial edge devices and inspection gateways. It pre-filters camera frames and publishes anomaly events without incurring cloud streaming costs.

## Gemma 3 Architecture & On-Device Deployment

- **Model Family**: Gemma 3 lightweight open weights (Gemma 3 1B, 4B, 12B, 27B and PaliGemma vision models).
- **On-Device Execution**: Runs on edge hardware via Ollama (`ollama run gemma:2b`), llama.cpp, or Google MediaPipe GenAI LLM Inference SDK.
- **Edge Hardware Targets**: Industrial PCs (IPCs), Raspberry Pi 5, Coral Edge TPU, NVIDIA Jetson, or the local simulator.
- **Inference Optimization**: 4-bit / 8-bit quantization (`q4_K_M`) ensures sub-50ms inference latency on factory gateways.

## Key Capabilities & References

- **Edge Filtering & Bandwidth Reduction**: Dropping 95%+ of normal product frames locally. See [references/edge-filtering.md](references/edge-filtering.md)
- **MQTT Bridge Protocol**: Topic conventions and broker integration. See [references/mqtt-bridge.md](references/mqtt-bridge.md)

---

## Running Edge Locally

### Option 1: Built-in Edge Simulator (Zero Setup)
The codebase includes a lightweight edge simulator (`backend/edge/simulator/`):
```bash
python -m backend.edge.simulator.run_sim
```
This feeds synthetic camera frames and defect triggers into the backend without requiring edge hardware or local LLMs.

### Option 2: Local Gemma Inference via Ollama
To test real model inference on your local GPU/CPU:
```bash
# 1. Install & start Ollama
ollama run gemma:2b

# 2. Test prompt
curl http://localhost:11434/api/generate -d '{
  "model": "gemma:2b",
  "prompt": "Analyze visual defect: surface scratch, length 4mm, CNC machine 2. Pass or Fail?"
}'
```

---

## Architecture Layout

Edge gateway components follow this responsibility breakdown:

| Component | Purpose |
|---|---|
| `gemma_classifier` | Local pass/fail visual defect classification |
| `edge_filter` | Drops normal frames; forwards anomalies |
| `mqtt_bridge` | Connects edge gateway to factory MQTT broker / PubSub |
| `edge_simulator` | Dev mock feeding synthetic camera frames |

---

## Troubleshooting Guide

| Issue | Cause | Fix |
|---|---|---|
| High edge inference latency (>100ms) | Model too large for edge CPU/TPU | Switch to quantized `gemma:2b-instruct-q4_K_M` or Coral TPU delegate |
| All frames being dispatched | `edge_filter.py` threshold set too low | Check `DEFECT_CONFIDENCE_THRESHOLD` (default: 0.85) |
| MQTT connection dropouts | Broker unavailable or network partitioned | Edge gateway buffers up to 500 alerts in local SQLite spool |
