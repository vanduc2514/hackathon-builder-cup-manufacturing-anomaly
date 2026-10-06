# MQTT Bridge & Industrial Gateway Protocol

The edge gateway communicates with industrial machine controllers and the cloud backend via an MQTT bridge:

## Architecture

```
[Industrial Camera] ──► [Gemma 3 Classifier] ──► [Edge Filter] ──► [MQTT Bridge]
                                                                        │
                                       ┌────────────────────────────────┴──┐
                                       ▼                                   ▼
                             Local Broker (Mosquitto)           Cloud Pub/Sub Forwarder
```

## MQTT Topic Taxonomy

| Topic | Direction | Payload Schema | Description |
|---|---|---|---|
| `factory/line1/defect/alert` | Edge $\rightarrow$ Cloud | JSON (`IncidentAlert`) | Dispatched when defect confidence $> 85\%$ |
| `factory/line1/telemetry` | Edge $\rightarrow$ Cloud | JSON (`SensorTelemetry`) | Sub-sampled 1Hz vibration, temp, RPM |
| `factory/line1/control/halt` | Cloud $\rightarrow$ Edge | JSON (`LineControlCommand`) | Command to halt feeder when UCL breached |

## Local MQTT Broker Testing

Start a local Mosquitto MQTT broker for testing:
```bash
docker run -d --name mosquitto -p 1883:1883 eclipse-mosquitto:latest
```

Subscribe to defect alerts:
```bash
mosquitto_sub -h localhost -p 1883 -t "factory/line1/#" -v
```
