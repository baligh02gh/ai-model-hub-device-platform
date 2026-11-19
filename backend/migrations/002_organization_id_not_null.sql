BEGIN;

-- Safety check: this will raise an error and roll back if any row still has
-- a NULL organization_id, instead of silently leaving orphaned data behind.
DO $$
DECLARE
    orphans INTEGER;
BEGIN
    SELECT
        (SELECT count(*) FROM users WHERE organization_id IS NULL) +
        (SELECT count(*) FROM devices WHERE organization_id IS NULL) +
        (SELECT count(*) FROM models WHERE organization_id IS NULL)
    INTO orphans;

    IF orphans > 0 THEN
        RAISE EXCEPTION 'Found % row(s) with a NULL organization_id; backfill them before running this migration', orphans;
    END IF;
END $$;

ALTER TABLE users   ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE devices ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE models  ALTER COLUMN organization_id SET NOT NULL;

COMMIT;
