import io
import json
import zipfile

from conftest import register_and_login, auth_header


def make_zip(target="Grove Vision AI V2", version="1.0", include_manifest=True, manifest_json=True):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        if include_manifest:
            if manifest_json:
                z.writestr("manifest.json", json.dumps({"version": version, "target": target}))
            else:
                z.writestr("manifest.json", "not valid json {{{")
    return buf.getvalue()


def upload(client, token, content=None, filename="model.zip", content_type="application/zip"):
    content = content if content is not None else make_zip()
    return client.post(
        "/models/upload",
        files={"file": (filename, content, content_type)},
        headers=auth_header(token),
    )


def join_as_plain_user(client, admin_token):
    invite_code = client.get("/me", headers=auth_header(admin_token)).json()["invite_code"]
    client.post(
        "/register",
        json={"email": "plainuser@example.com", "password": "password123", "invite_code": invite_code},
    )
    r = client.post("/login", json={"email": "plainuser@example.com", "password": "password123"})
    return r.json()["access_token"]


def test_valid_upload_succeeds(client):
    token = register_and_login(client)
    r = upload(client, token)
    assert r.status_code == 200, r.text
    assert len(r.json()["sha256_hash"]) == 64


def test_plain_user_cannot_upload(client):
    admin_token = register_and_login(client)
    user_token = join_as_plain_user(client, admin_token)
    r = upload(client, user_token)
    assert r.status_code == 403


def test_non_zip_extension_rejected(client):
    token = register_and_login(client)
    r = upload(client, token, filename="model.txt")
    assert r.status_code == 400


def test_wrong_content_type_rejected(client):
    token = register_and_login(client)
    r = upload(client, token, content_type="text/plain")
    assert r.status_code == 400


def test_corrupt_zip_rejected(client):
    token = register_and_login(client)
    r = upload(client, token, content=b"not actually a zip file")
    assert r.status_code == 400


def test_missing_manifest_rejected(client):
    token = register_and_login(client)
    r = upload(client, token, content=make_zip(include_manifest=False))
    assert r.status_code == 400


def test_invalid_manifest_json_rejected(client):
    token = register_and_login(client)
    r = upload(client, token, content=make_zip(manifest_json=False))
    assert r.status_code == 400


def test_unsupported_target_rejected(client):
    token = register_and_login(client)
    r = upload(client, token, content=make_zip(target="ESP32-CAM"))
    assert r.status_code == 400


def make_zip_bomb():
    """A few KB on the wire that would expand to 300MB if decompressed."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json", json.dumps({"version": "1.0", "target": "Grove Vision AI V2"}))
        z.writestr("payload.bin", b"\x00" * (300 * 1024 * 1024))
    return buf.getvalue()


def test_zip_bomb_rejected(client):
    token = register_and_login(client)
    r = upload(client, token, content=make_zip_bomb())
    assert r.status_code == 400
    assert "bomb" in r.json()["detail"].lower()


def test_duplicate_upload_rejected(client):
    token = register_and_login(client)
    upload(client, token)
    r = upload(client, token)
    assert r.status_code == 409


def test_download_returns_matching_sha256_header(client):
    token = register_and_login(client)
    uploaded = upload(client, token).json()
    r = client.get(f"/models/{uploaded['id']}/download", headers=auth_header(token))
    assert r.status_code == 200
    assert r.headers["x-model-sha256"] == uploaded["sha256_hash"]


def test_model_not_downloadable_from_another_organization(client):
    token_a = register_and_login(client, email="admin-a@example.com", org_name="Org A")
    token_b = register_and_login(client, email="admin-b@example.com", org_name="Org B")

    uploaded = upload(client, token_a).json()
    r = client.get(f"/models/{uploaded['id']}/download", headers=auth_header(token_b))
    assert r.status_code == 404
