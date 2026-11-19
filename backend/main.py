from fastapi import FastAPI, Depends, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import os
import hashlib
import zipfile
import io
import json
import secrets
from sqlalchemy import func
from sqlalchemy.orm import Session
from database import engine, Base, get_db
import models
import schemas
from auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    require_role,
)
from mqtt_client import start_mqtt_client
import rate_limit
from academy_defaults import DEFAULT_MODULES
from fastapi.responses import FileResponse

# Skipped during tests (set by backend/tests/conftest.py): tests use their own
# isolated SQLite database and must not depend on a real MQTT broker being up.
if not os.getenv("TRINOVATECH_TESTING"):
    Base.metadata.create_all(bind=engine)
    mqtt_client = start_mqtt_client()
else:
    mqtt_client = None

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"message": "Hello from TRINOVATECH backend!"}


def _seed_default_academy_modules(db: Session, organization_id: int):
    for position, module in enumerate(DEFAULT_MODULES):
        db.add(models.AcademyModule(
            organization_id=organization_id,
            module_key=module["module_key"],
            title=module["title"],
            minutes=module["minutes"],
            summary=module["summary"],
            sections_json=json.dumps(module["sections"]),
            takeaways_json=json.dumps(module["takeaways"]),
            position=position,
        ))


@app.post("/register")
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.email == user.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    if user.organization_name:
        name = user.organization_name.strip()
        taken = (
            db.query(models.Organization)
            .filter(func.lower(models.Organization.name) == name.lower())
            .first()
        )
        if taken:
            raise HTTPException(status_code=400, detail="This organization name is already taken")
        org = models.Organization(name=name, invite_code=secrets.token_hex(5).upper())
        db.add(org)
        db.flush()
        _seed_default_academy_modules(db, org.id)
        role = "admin"
    else:
        org = (
            db.query(models.Organization)
            .filter(models.Organization.invite_code == user.invite_code.strip().upper())
            .first()
        )
        if not org:
            raise HTTPException(status_code=400, detail="Invalid invite code")
        role = "user"

    new_user = models.User(
        email=user.email,
        hashed_password=hash_password(user.password),
        role=role,
        organization_id=org.id,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {"id": new_user.id, "email": new_user.email, "role": new_user.role}


@app.post("/login")
def login(user: schemas.UserLogin, request: Request, db: Session = Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    rate_limit.check(ip, user.email)

    db_user = db.query(models.User).filter(models.User.email == user.email).first()

    if not db_user or not verify_password(user.password, db_user.hashed_password):
        rate_limit.record_failure(ip, user.email)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    rate_limit.clear(ip, user.email)
    access_token = create_access_token(data={"sub": db_user.email})

    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/me")
def read_current_user(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org = (
        db.query(models.Organization)
        .filter(models.Organization.id == current_user.organization_id)
        .first()
    )
    data = {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role,
        "organization": org.name,
    }
    if current_user.role == "admin":
        data["invite_code"] = org.invite_code
    return data


@app.get("/organization/members", response_model=list[schemas.MemberResponse])
def list_members(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin")),
):
    return (
        db.query(models.User)
        .filter(models.User.organization_id == current_user.organization_id)
        .order_by(models.User.id)
        .all()
    )


@app.patch("/organization/members/{user_id}/role", response_model=schemas.MemberResponse)
def set_member_role(
    user_id: int,
    body: schemas.RoleUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin")),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot change your own role")

    member = (
        db.query(models.User)
        .filter(
            models.User.id == user_id,
            models.User.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="User not found in your organization")

    member.role = body.role
    db.commit()
    db.refresh(member)
    return member


@app.post("/devices", response_model=schemas.DeviceResponse)
def create_device(
    device: schemas.DeviceCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if db.query(models.Device).filter(models.Device.device_id == device.device_id).first():
        raise HTTPException(status_code=400, detail="Device ID is already in use")

    new_device = models.Device(
        device_id=device.device_id,
        name=device.name,
        organization_id=current_user.organization_id,
    )
    db.add(new_device)
    db.commit()
    db.refresh(new_device)

    return new_device


@app.get("/devices", response_model=list[schemas.DeviceResponse])
def list_devices(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.Device)
        .filter(models.Device.organization_id == current_user.organization_id)
        .order_by(models.Device.id)
        .all()
    )


UPLOAD_DIR = "uploaded_models"
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_UPLOAD_CONTENT_TYPES = {
    "application/zip",
    "application/x-zip-compressed",
    "application/octet-stream",  # many HTTP clients use this generic type for .zip
}
SUPPORTED_TARGETS = {"Grove Vision AI V2"}
MAX_UNCOMPRESSED_SIZE = 200 * 1024 * 1024  # 200MB, generous for a model package
MAX_MANIFEST_SIZE = 1 * 1024 * 1024  # 1MB, manifest.json is a small JSON file


@app.post("/models/upload")
async def upload_model(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin", "formateur")),
):
    filename = os.path.basename(file.filename or "")
    if not filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are allowed")

    if file.content_type not in ALLOWED_UPLOAD_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unexpected content type '{file.content_type}' for a .zip upload",
        )

    contents = await file.read()

    if len(contents) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 50MB)")

    try:
        zip_file = zipfile.ZipFile(io.BytesIO(contents))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Invalid ZIP file")

    if "manifest.json" not in zip_file.namelist():
        raise HTTPException(status_code=400, detail="manifest.json not found in ZIP")

    # A small compressed file can still expand to gigabytes once decompressed
    # (a zip bomb). Check the uncompressed sizes declared in the ZIP's own
    # index before decompressing anything.
    total_uncompressed = sum(info.file_size for info in zip_file.infolist())
    if total_uncompressed > MAX_UNCOMPRESSED_SIZE:
        raise HTTPException(
            status_code=400,
            detail="ZIP contents are too large once uncompressed (possible zip bomb)",
        )

    manifest_info = zip_file.getinfo("manifest.json")
    if manifest_info.file_size > MAX_MANIFEST_SIZE:
        raise HTTPException(status_code=400, detail="manifest.json is unexpectedly large")

    try:
        manifest = json.loads(zip_file.read("manifest.json"))
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="manifest.json is not valid JSON")

    if not isinstance(manifest, dict) or not manifest.get("version") or not manifest.get("target"):
        raise HTTPException(
            status_code=400,
            detail="manifest.json must contain 'version' and 'target'",
        )

    if manifest["target"] not in SUPPORTED_TARGETS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported target device '{manifest['target']}'. Supported: {', '.join(sorted(SUPPORTED_TARGETS))}",
        )

    sha256_hash = hashlib.sha256(contents).hexdigest()

    duplicate = (
        db.query(models.AIModel)
        .filter(
            models.AIModel.sha256_hash == sha256_hash,
            models.AIModel.organization_id == current_user.organization_id,
        )
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="This model has already been uploaded")

    org_dir = os.path.join(UPLOAD_DIR, str(current_user.organization_id))
    os.makedirs(org_dir, exist_ok=True)
    file_path = os.path.join(org_dir, f"{sha256_hash[:12]}_{filename}")
    with open(file_path, "wb") as f:
        f.write(contents)

    new_model = models.AIModel(
        name=filename[:-4],
        filename=filename,
        sha256_hash=sha256_hash,
        file_size=len(contents),
        organization_id=current_user.organization_id,
    )
    db.add(new_model)
    db.commit()
    db.refresh(new_model)

    return {
        "id": new_model.id,
        "name": new_model.name,
        "sha256_hash": new_model.sha256_hash,
        "file_size": new_model.file_size,
    }


@app.get("/models")
def list_models(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    all_models = (
        db.query(models.AIModel)
        .filter(models.AIModel.organization_id == current_user.organization_id)
        .order_by(models.AIModel.id)
        .all()
    )
    return [
        {
            "id": m.id,
            "name": m.name,
            "sha256_hash": m.sha256_hash,
            "file_size": m.file_size,
            "uploaded_at": m.uploaded_at,
        }
        for m in all_models
    ]
@app.get("/models/{model_id}/download")
def download_model(
    model_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    m = (
        db.query(models.AIModel)
        .filter(
            models.AIModel.id == model_id,
            models.AIModel.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="Model not found")

    new_path = os.path.join(UPLOAD_DIR, str(m.organization_id), f"{m.sha256_hash[:12]}_{m.filename}")
    legacy_path = os.path.join(UPLOAD_DIR, m.filename)
    path = new_path if os.path.exists(new_path) else legacy_path
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Model file is missing on the server")

    return FileResponse(
        path,
        media_type="application/zip",
        filename=m.filename,
        headers={"X-Model-SHA256": m.sha256_hash},
    )


def _module_to_response(m: models.AcademyModule) -> dict:
    return {
        "id": m.id,
        "module_key": m.module_key,
        "title": m.title,
        "minutes": m.minutes,
        "summary": m.summary,
        "sections": json.loads(m.sections_json),
        "takeaways": json.loads(m.takeaways_json),
        "position": m.position,
    }


@app.get("/academy/modules", response_model=list[schemas.AcademyModuleResponse])
def list_academy_modules(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    modules = (
        db.query(models.AcademyModule)
        .filter(models.AcademyModule.organization_id == current_user.organization_id)
        .order_by(models.AcademyModule.position)
        .all()
    )
    return [_module_to_response(m) for m in modules]


@app.post("/academy/modules", response_model=schemas.AcademyModuleResponse)
def create_academy_module(
    module: schemas.AcademyModuleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin", "formateur")),
):
    max_position = (
        db.query(func.max(models.AcademyModule.position))
        .filter(models.AcademyModule.organization_id == current_user.organization_id)
        .scalar()
    )
    new_module = models.AcademyModule(
        organization_id=current_user.organization_id,
        module_key=module.module_key,
        title=module.title,
        minutes=module.minutes,
        summary=module.summary,
        sections_json=json.dumps([s.model_dump() for s in module.sections]),
        takeaways_json=json.dumps(module.takeaways),
        position=(max_position + 1) if max_position is not None else 0,
    )
    db.add(new_module)
    db.commit()
    db.refresh(new_module)
    return _module_to_response(new_module)


def _get_org_module_or_404(db: Session, module_id: int, organization_id: int) -> models.AcademyModule:
    m = (
        db.query(models.AcademyModule)
        .filter(
            models.AcademyModule.id == module_id,
            models.AcademyModule.organization_id == organization_id,
        )
        .first()
    )
    if not m:
        raise HTTPException(status_code=404, detail="Academy module not found")
    return m


@app.put("/academy/modules/{module_id}", response_model=schemas.AcademyModuleResponse)
def update_academy_module(
    module_id: int,
    module: schemas.AcademyModuleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin", "formateur")),
):
    existing = _get_org_module_or_404(db, module_id, current_user.organization_id)
    existing.module_key = module.module_key
    existing.title = module.title
    existing.minutes = module.minutes
    existing.summary = module.summary
    existing.sections_json = json.dumps([s.model_dump() for s in module.sections])
    existing.takeaways_json = json.dumps(module.takeaways)
    db.commit()
    db.refresh(existing)
    return _module_to_response(existing)


@app.delete("/academy/modules/{module_id}")
def delete_academy_module(
    module_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role("admin", "formateur")),
):
    existing = _get_org_module_or_404(db, module_id, current_user.organization_id)
    db.delete(existing)
    db.commit()
    return {"deleted": True}


def _completed_modules(db: Session, user_id: int) -> list[str]:
    rows = db.query(models.AcademyProgress).filter(models.AcademyProgress.user_id == user_id).all()
    return [r.module_id for r in rows]


@app.get("/academy/progress", response_model=schemas.AcademyProgressResponse)
def get_academy_progress(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return {"completed_modules": _completed_modules(db, current_user.id)}


@app.post("/academy/progress/{module_id}", response_model=schemas.AcademyProgressResponse)
def mark_academy_module_complete(
    module_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    existing = (
        db.query(models.AcademyProgress)
        .filter(
            models.AcademyProgress.user_id == current_user.id,
            models.AcademyProgress.module_id == module_id,
        )
        .first()
    )
    if not existing:
        db.add(models.AcademyProgress(user_id=current_user.id, module_id=module_id))
        db.commit()
    return {"completed_modules": _completed_modules(db, current_user.id)}


@app.delete("/academy/progress/{module_id}", response_model=schemas.AcademyProgressResponse)
def mark_academy_module_incomplete(
    module_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    (
        db.query(models.AcademyProgress)
        .filter(
            models.AcademyProgress.user_id == current_user.id,
            models.AcademyProgress.module_id == module_id,
        )
        .delete()
    )
    db.commit()
    return {"completed_modules": _completed_modules(db, current_user.id)}