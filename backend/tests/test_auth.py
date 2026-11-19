from conftest import register_and_login, auth_header


def test_register_creates_organization_and_admin(client):
    r = client.post(
        "/register",
        json={"email": "founder@example.com", "password": "password123", "organization_name": "Acme"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["email"] == "founder@example.com"
    assert body["role"] == "admin"


def test_register_join_with_invite_code_creates_plain_user(client):
    token = register_and_login(client)
    me = client.get("/me", headers=auth_header(token)).json()
    invite_code = me["invite_code"]

    r = client.post(
        "/register",
        json={"email": "member@example.com", "password": "password123", "invite_code": invite_code},
    )
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "user"


def test_register_duplicate_email_rejected(client):
    register_and_login(client)
    r = client.post(
        "/register",
        json={"email": "admin@example.com", "password": "password123", "organization_name": "Other"},
    )
    assert r.status_code == 400


def test_login_wrong_password_rejected(client):
    register_and_login(client)
    r = client.post("/login", json={"email": "admin@example.com", "password": "wrong"})
    assert r.status_code == 401


def test_login_rate_limit_locks_out_after_five_failures(client):
    register_and_login(client)
    for _ in range(5):
        r = client.post("/login", json={"email": "admin@example.com", "password": "wrong"})
        assert r.status_code == 401

    # Even the correct password is now rejected, with 429
    r = client.post("/login", json={"email": "admin@example.com", "password": "password123"})
    assert r.status_code == 429


def test_protected_route_requires_token(client):
    r = client.get("/devices")
    assert r.status_code == 401


def test_protected_route_rejects_garbage_token(client):
    r = client.get("/devices", headers={"Authorization": "Bearer not-a-real-token"})
    assert r.status_code == 401
