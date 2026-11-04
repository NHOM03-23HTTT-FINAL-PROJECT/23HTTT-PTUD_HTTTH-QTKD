-- EF Core history table: same protection as every other qtkd table. Created by EF before the first migration.
ALTER TABLE qtkd."__EFMigrationsHistory" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE qtkd."__EFMigrationsHistory" FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE qtkd."__EFMigrationsHistory" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE qtkd."__EFMigrationsHistory" FROM authenticated';
  END IF;
END $$;
