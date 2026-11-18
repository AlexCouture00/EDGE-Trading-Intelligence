CREATE TABLE "edge_day_notes" (
	"owner_id" text NOT NULL,
	"day" date NOT NULL,
	"went_well" text DEFAULT '' NOT NULL,
	"went_badly" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edge_day_notes_owner_id_day_pk" PRIMARY KEY("owner_id","day")
);
--> statement-breakpoint
ALTER TABLE public.edge_day_notes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE public.edge_day_notes FROM PUBLIC;
--> statement-breakpoint
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.edge_day_notes FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
