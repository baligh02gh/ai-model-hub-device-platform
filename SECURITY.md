# Security policy

- Never commit `.env`, `frontend/.env.local`, `mosquitto/passwd`, uploaded model data, or credentials.
- Copy `.env.example` to `.env` and `frontend/.env.local.example` to `frontend/.env.local` for local development.
- Use unique, randomly generated database, JWT, and MQTT credentials outside local demos.
- MQTT is configured without TLS for local development; do not expose this setup directly to the public internet.
- If a credential is ever committed or shared, revoke/rotate it immediately. Removing it in a later commit does not remove it from Git history.

Please report suspected vulnerabilities privately to the repository maintainer rather than opening a public issue with exploit details.
