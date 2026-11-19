from conftest import register_and_login, auth_header


def test_new_device_starts_offline(client):
    token = register_and_login(client)
    r = client.post("/devices", json={"device_id": "ESP32-TEST-1"}, headers=auth_header(token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["last_seen"] is None
    assert body["battery"] is None


def test_duplicate_device_id_rejected(client):
    token = register_and_login(client)
    client.post("/devices", json={"device_id": "ESP32-TEST-1"}, headers=auth_header(token))
    r = client.post("/devices", json={"device_id": "ESP32-TEST-1"}, headers=auth_header(token))
    assert r.status_code == 400


def test_devices_are_isolated_per_organization(client):
    token_a = register_and_login(client, email="admin-a@example.com", org_name="Org A")
    token_b = register_and_login(client, email="admin-b@example.com", org_name="Org B")

    client.post("/devices", json={"device_id": "ESP32-ORG-A"}, headers=auth_header(token_a))
    client.post("/devices", json={"device_id": "ESP32-ORG-B"}, headers=auth_header(token_b))

    devices_a = client.get("/devices", headers=auth_header(token_a)).json()
    devices_b = client.get("/devices", headers=auth_header(token_b)).json()

    assert [d["device_id"] for d in devices_a] == ["ESP32-ORG-A"]
    assert [d["device_id"] for d in devices_b] == ["ESP32-ORG-B"]
