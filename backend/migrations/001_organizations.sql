BEGIN;

CREATE TABLE IF NOT EXISTS organizations (
    id SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL UNIQUE,
    invite_code VARCHAR NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT now()
);

INSERT INTO organizations (name, invite_code)
VALUES ('TRINOVATECH', upper(substr(md5(random()::text), 1, 10)))
ON CONFLICT (name) DO NOTHING;

ALTER TABLE users   ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id);
ALTER TABLE devices ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id);
ALTER TABLE models  ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id);

UPDATE users   SET organization_id = (SELECT id FROM organizations WHERE name = 'TRINOVATECH') WHERE organization_id IS NULL;
UPDATE devices SET organization_id = (SELECT id FROM organizations WHERE name = 'TRINOVATECH') WHERE organization_id IS NULL;
UPDATE models  SET organization_id = (SELECT id FROM organizations WHERE name = 'TRINOVATECH') WHERE organization_id IS NULL;

COMMIT;