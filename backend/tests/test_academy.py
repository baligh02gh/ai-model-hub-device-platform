from conftest import register_and_login, auth_header


def test_progress_starts_empty(client):
    token = register_and_login(client)
    r = client.get("/academy/progress", headers=auth_header(token))
    assert r.status_code == 200
    assert r.json()["completed_modules"] == []


def test_mark_module_complete(client):
    token = register_and_login(client)
    r = client.post("/academy/progress/edge-ai", headers=auth_header(token))
    assert r.status_code == 200
    assert r.json()["completed_modules"] == ["edge-ai"]


def test_marking_complete_twice_does_not_duplicate(client):
    token = register_and_login(client)
    client.post("/academy/progress/edge-ai", headers=auth_header(token))
    r = client.post("/academy/progress/edge-ai", headers=auth_header(token))
    assert r.json()["completed_modules"] == ["edge-ai"]


def test_mark_module_incomplete(client):
    token = register_and_login(client)
    client.post("/academy/progress/edge-ai", headers=auth_header(token))
    r = client.delete("/academy/progress/edge-ai", headers=auth_header(token))
    assert r.json()["completed_modules"] == []


def test_progress_is_per_user_not_per_organization(client):
    admin_token = register_and_login(client)
    invite_code = client.get("/me", headers=auth_header(admin_token)).json()["invite_code"]
    client.post(
        "/register",
        json={"email": "member@example.com", "password": "password123", "invite_code": invite_code},
    )
    member_token = client.post(
        "/login", json={"email": "member@example.com", "password": "password123"}
    ).json()["access_token"]

    client.post("/academy/progress/edge-ai", headers=auth_header(admin_token))

    r = client.get("/academy/progress", headers=auth_header(member_token))
    assert r.json()["completed_modules"] == []


def test_progress_requires_auth(client):
    r = client.get("/academy/progress")
    assert r.status_code == 401


def test_new_organization_is_seeded_with_default_modules(client):
    token = register_and_login(client)
    r = client.get("/academy/modules", headers=auth_header(token))
    assert r.status_code == 200
    keys = [m["module_key"] for m in r.json()]
    assert keys == ["edge-ai", "model-package", "deploy", "results"]


def join_as_plain_user(client, admin_token):
    invite_code = client.get("/me", headers=auth_header(admin_token)).json()["invite_code"]
    client.post(
        "/register",
        json={"email": "plain-academy@example.com", "password": "password123", "invite_code": invite_code},
    )
    r = client.post("/login", json={"email": "plain-academy@example.com", "password": "password123"})
    return r.json()["access_token"]


def new_module_payload(key="intro-extra"):
    return {
        "module_key": key,
        "title": "Extra module",
        "minutes": 4,
        "summary": "A formateur-authored module.",
        "sections": [{"heading": "Section one", "paragraphs": ["Some text."]}],
        "takeaways": ["One takeaway."],
    }


def test_formateur_can_create_module(client):
    admin_token = register_and_login(client)
    r = client.post(
        "/academy/modules", json=new_module_payload(), headers=auth_header(admin_token)
    )
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "Extra module"
    assert r.json()["position"] == 4  # appended after the 4 seeded modules


def test_plain_user_cannot_create_module(client):
    admin_token = register_and_login(client)
    user_token = join_as_plain_user(client, admin_token)
    r = client.post(
        "/academy/modules", json=new_module_payload(), headers=auth_header(user_token)
    )
    assert r.status_code == 403


def test_update_and_delete_module(client):
    admin_token = register_and_login(client)
    created = client.post(
        "/academy/modules", json=new_module_payload(), headers=auth_header(admin_token)
    ).json()

    updated_payload = new_module_payload()
    updated_payload["title"] = "Renamed module"
    r = client.put(
        f"/academy/modules/{created['id']}", json=updated_payload, headers=auth_header(admin_token)
    )
    assert r.status_code == 200
    assert r.json()["title"] == "Renamed module"

    r = client.delete(f"/academy/modules/{created['id']}", headers=auth_header(admin_token))
    assert r.status_code == 200

    remaining = client.get("/academy/modules", headers=auth_header(admin_token)).json()
    assert created["id"] not in [m["id"] for m in remaining]


def test_module_not_editable_from_another_organization(client):
    token_a = register_and_login(client, email="admin-a-academy@example.com", org_name="Org Academy A")
    token_b = register_and_login(client, email="admin-b-academy@example.com", org_name="Org Academy B")

    modules_a = client.get("/academy/modules", headers=auth_header(token_a)).json()
    target_id = modules_a[0]["id"]

    r = client.put(
        f"/academy/modules/{target_id}", json=new_module_payload(), headers=auth_header(token_b)
    )
    assert r.status_code == 404
