-- Supabase is PostgreSQL only. The browser must never bypass the Express API.
-- No policies are added: RLS therefore denies non-owner roles by default.
-- The backend uses the trusted database owner; Express enforces Clerk ownership.
DO $$
DECLARE
  edge_table text;
  api_role text;
BEGIN
  FOREACH edge_table IN ARRAY ARRAY[
    'edge_accounts', 'edge_cash_flows', 'edge_settings', 'edge_confluences',
    'edge_strategies', 'edge_trades', 'edge_executions', 'edge_trade_confluences'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', edge_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', edge_table);
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', edge_table, api_role);
      END IF;
    END LOOP;
  END LOOP;
END $$;
