-- Read-only. Run in Supabase SQL Editor AFTER migrate:deploy and seed.
-- Not yet executed against a Supabase project.
SELECT tablename, rowsecurity
FROM pg_tables WHERE schemaname = 'qtkd' AND tablename <> '_prisma_migrations'
ORDER BY tablename;

SELECT conrelid::regclass AS source_table, conname, contype, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE connamespace = 'qtkd'::regnamespace
ORDER BY conrelid::regclass::text, conname;

SELECT 'department' AS table_name, count(*) AS row_count FROM qtkd.department
UNION ALL SELECT 'user_account', count(*) FROM qtkd.user_account
UNION ALL SELECT 'customer', count(*) FROM qtkd.customer
UNION ALL SELECT 'area', count(*) FROM qtkd.area
UNION ALL SELECT 'contract', count(*) FROM qtkd.contract
UNION ALL SELECT 'approval_round', count(*) FROM qtkd.approval_round
UNION ALL SELECT 'approval_step', count(*) FROM qtkd.approval_step;

SELECT area_code, parent_area_id, level, hierarchy_path, row_version FROM qtkd.area ORDER BY hierarchy_path;

-- Expected: no rows. No floating-point conversion.
SELECT s.statement_id, s.subtotal, sum(l.amount) AS line_total
FROM qtkd.payment_statement s JOIN qtkd.payment_statement_line l ON l.statement_id = s.statement_id
GROUP BY s.statement_id, s.subtotal HAVING s.subtotal <> sum(l.amount);

-- Expected: no rows. Passwords/token hashes are intentionally never selected.
SELECT r.round_id, count(s.step_id) AS current_steps
FROM qtkd.approval_round r LEFT JOIN qtkd.approval_step s
  ON s.round_id = r.round_id AND s.step_status IN ('Pending', 'Reviewing')
WHERE r.result = 'Running'
GROUP BY r.round_id HAVING count(s.step_id) <> 1;
