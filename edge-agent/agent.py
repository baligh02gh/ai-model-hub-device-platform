import asyncio
import hashlib
import os
import math
import time

import httpx
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# The agent only ever talks to this backend, never to an address sent by a web page.
BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:8000")
ALLOWED_ORIGIN = os.getenv("ALLOWED_ORIGIN", "http://localhost:3000")

# No physical Grove Vision AI V2 is available, so the USB side is simulated.
SIMULATED = True
sim_device = "grove"  # "grove" | "wrong" | "missing"

app = FastAPI(title="TRINOVATECH Edge Agent")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[ALLOWED_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)

state = {
    "state": "idle",
    "message": "Ready.",
    "progress": 0,
    "model_id": None,
    "sha256": None,
}


def set_state(new_state: str, message: str, progress: int | None = None):
    state["state"] = new_state
    state["message"] = message
    if progress is not None:
        state["progress"] = progress


def detect_device() -> str:
    """Returns 'grove', 'wrong' or 'missing'.
    REPLACE THIS FUNCTION with real USB detection when a board is available."""
    return sim_device


class DeployRequest(BaseModel):
    model_id: int
    token: str


class SimulateRequest(BaseModel):
    device: str


async def run_deploy(model_id: int, token: str):
    state["model_id"] = model_id
    state["sha256"] = None

    device = detect_device()
    if device == "missing":
        set_state("device_missing", "No device detected. Plug in the Grove Vision AI V2 with a USB-C cable.", 0)
        return
    if device == "wrong":
        set_state("wrong_device", "A device is connected, but it is not a Grove Vision AI V2.", 0)
        return

    set_state("transferring", "Downloading model from the platform...", 0)
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.get(
                f"{BACKEND_URL}/models/{model_id}/download",
                headers={"Authorization": f"Bearer {token}"},
            )
    except httpx.HTTPError:
        set_state("error", "Cannot reach the platform. Is the backend running?", 0)
        return

    if r.status_code != 200:
        set_state("error", f"Download refused by the platform (HTTP {r.status_code}).", 0)
        return

    expected = r.headers.get("x-model-sha256")
    actual = hashlib.sha256(r.content).hexdigest()
    if not expected or actual != expected:
        set_state("error", "Integrity check failed: the file does not match its SHA256 hash.", 0)
        return
    state["sha256"] = actual

    total_steps = 25
    for step in range(1, total_steps + 1):
        await asyncio.sleep(0.4)
        device = detect_device()
        if device == "missing":
            set_state("device_missing", "Device unplugged during the transfer. Reconnect it and try again.", 0)
            return
        if device == "wrong":
            set_state("wrong_device", "The connected device changed during the transfer.", 0)
            return
        pct = int(step / total_steps * 100)
        set_state("transferring", f"Writing model to the device... {pct}%", pct)

    set_state("success", "Model deployed. The device is ready.", 100)


@app.get("/status")
def get_status():
    return {**state, "simulated": SIMULATED, "device": detect_device()}


@app.post("/deploy", status_code=202)
async def deploy(req: DeployRequest, background: BackgroundTasks):
    if state["state"] == "transferring":
        raise HTTPException(status_code=409, detail="A transfer is already running")
    set_state("transferring", "Starting...", 0)
    background.add_task(run_deploy, req.model_id, req.token)
    return {"accepted": True}


@app.post("/reset")
def reset():
    if state["state"] == "transferring":
        raise HTTPException(status_code=409, detail="A transfer is running")
    set_state("idle", "Ready.", 0)
    state["model_id"] = None
    state["sha256"] = None
    return {"ok": True}


@app.post("/simulate")
def simulate(req: SimulateRequest):
    global sim_device
    if not SIMULATED:
        raise HTTPException(status_code=404, detail="Not available")
    if req.device not in ("grove", "wrong", "missing"):
        raise HTTPException(status_code=400, detail="device must be grove, wrong or missing")
    sim_device = req.device
    return {"device": sim_device}
def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


# label, phase, centre x, centre y, width, height, base confidence (all 0-1)
SIM_OBJECTS = [
    ("person", 0.0, 0.50, 0.50, 0.22, 0.55, 0.92),
    ("cup", 1.7, 0.20, 0.65, 0.10, 0.16, 0.81),
    ("laptop", 3.1, 0.78, 0.60, 0.24, 0.20, 0.74),
]


@app.get("/detections")
def detections():
    """Simulated detections. REPLACE with real data from the board when available.
    Only active after a successful deploy, and only while the board is connected."""
    if state["state"] != "success" or detect_device() != "grove":
        return {"active": False, "objects": []}

    t = time.time()
    objects = []
    for label, phase, cx, cy, w, h, conf in SIM_OBJECTS:
        x = _clamp(cx + 0.12 * math.sin(t * 0.8 + phase) - w / 2, 0.0, 1.0 - w)
        y = _clamp(cy + 0.06 * math.cos(t * 0.6 + phase) - h / 2, 0.0, 1.0 - h)
        score = _clamp(conf + 0.04 * math.sin(t * 2.0 + phase), 0.0, 0.99)
        objects.append(
            {"label": label, "score": round(score, 2), "x": round(x, 3), "y": round(y, 3), "w": w, "h": h}
        )
    return {"active": True, "objects": objects}