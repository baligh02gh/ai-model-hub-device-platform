from conftest import register_and_login, auth_header


def join_org(client, admin_token, email):
    invite_code = client.get("/me", headers=auth_header(admin_token)).json()["invite_code"]
    client.post(
        "/register",
        json={"email": email, "password": "password123", "invite_code": invite_code},
    )
    r = client.post("/login", json={"email": email, "password": "password123"})
    return r.json()["access_token"]


def get_user_id(client, token):
    return client.get("/me", headers=auth_header(token)).json()["id"]


def test_admin_can_list_members(client):
    admin_token = register_and_login(client)
    join_org(client, admin_token, "member@example.com")

    r = client.get("/organization/members", headers=auth_header(admin_token))
    assert r.status_code == 200
    emails = {m["email"] for m in r.json()}
    assert emails == {"admin@example.com", "member@example.com"}


def test_plain_user_cannot_list_members(client):
    admin_token = register_and_login(client)
    user_token = join_org(client, admin_token, "member@example.com")

    r = client.get("/organization/members", headers=auth_header(user_token))
    assert r.status_code == 403


def test_admin_can_promote_member_to_formateur(client):
    admin_token = register_and_login(client)
    join_org(client, admin_token, "member@example.com")
    user_token = client.post(
        "/login", json={"email": "member@example.com", "password": "password123"}
    ).json()["access_token"]
    member_id = get_user_id(client, user_token)

    r = client.patch(
        f"/organization/members/{member_id}/role",
        json={"role": "formateur"},
        headers=auth_header(admin_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "formateur"


def test_cannot_promote_a_member_to_admin(client):
    admin_token = register_and_login(client)
    user_token = join_org(client, admin_token, "member@example.com")
    member_id = get_user_id(client, user_token)

    r = client.patch(
        f"/organization/members/{member_id}/role",
        json={"role": "admin"},
        headers=auth_header(admin_token),
    )
    assert r.status_code == 422  # rejected by the Literal["user", "formateur"] schema


def test_admin_cannot_change_own_role(client):
    admin_token = register_and_login(client)
    admin_id = get_user_id(client, admin_token)

    r = client.patch(
        f"/organization/members/{admin_id}/role",
        json={"role": "formateur"},
        headers=auth_header(admin_token),
    )
    assert r.status_code == 400


def test_admin_cannot_change_role_of_member_in_another_organization(client):
    admin_a_token = register_and_login(client, email="admin-a@example.com", org_name="Org A")
    admin_b_token = register_and_login(client, email="admin-b@example.com", org_name="Org B")
    user_in_b_token = join_org(client, admin_b_token, "member-b@example.com")
    member_id = get_user_id(client, user_in_b_token)

    r = client.patch(
        f"/organization/members/{member_id}/role",
        json={"role": "formateur"},
        headers=auth_header(admin_a_token),
    )
    assert r.status_code == 404
