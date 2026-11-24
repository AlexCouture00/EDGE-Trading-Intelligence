CREATE TABLE "edge_prop_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"firm_id" uuid NOT NULL,
	"journal_account_id" uuid
);
--> statement-breakpoint
CREATE TABLE "edge_prop_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"account_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edge_prop_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"account_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edge_prop_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"firm_id" uuid NOT NULL,
	"account_id" uuid
);
--> statement-breakpoint
CREATE TABLE "edge_prop_firms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edge_prop_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"account_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edge_prop_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"account_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "edge_prop_accounts" ADD CONSTRAINT "edge_prop_accounts_firm_id_edge_prop_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."edge_prop_firms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge_prop_accounts" ADD CONSTRAINT "edge_prop_accounts_journal_account_id_edge_accounts_id_fk" FOREIGN KEY ("journal_account_id") REFERENCES "public"."edge_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge_prop_balances" ADD CONSTRAINT "edge_prop_balances_account_id_edge_prop_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."edge_prop_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge_prop_challenges" ADD CONSTRAINT "edge_prop_challenges_account_id_edge_prop_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."edge_prop_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge_prop_expenses" ADD CONSTRAINT "edge_prop_expenses_firm_id_edge_prop_firms_id_fk" FOREIGN KEY ("firm_id") REFERENCES "public"."edge_prop_firms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge_prop_expenses" ADD CONSTRAINT "edge_prop_expenses_account_id_edge_prop_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."edge_prop_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge_prop_payouts" ADD CONSTRAINT "edge_prop_payouts_account_id_edge_prop_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."edge_prop_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge_prop_rules" ADD CONSTRAINT "edge_prop_rules_account_id_edge_prop_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."edge_prop_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "edge_prop_accounts_owner_idx" ON "edge_prop_accounts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "edge_prop_balances_account_idx" ON "edge_prop_balances" USING btree ("owner_id","account_id","created_at");--> statement-breakpoint
CREATE INDEX "edge_prop_challenges_owner_idx" ON "edge_prop_challenges" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "edge_prop_expenses_owner_idx" ON "edge_prop_expenses" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "edge_prop_firms_owner_idx" ON "edge_prop_firms" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "edge_prop_payouts_owner_idx" ON "edge_prop_payouts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "edge_prop_rules_owner_idx" ON "edge_prop_rules" USING btree ("owner_id");
--> statement-breakpoint
-- New tables only. No original journal rows or tables are rewritten.
DO $$
DECLARE
  edge_table text;
  api_role text;
BEGIN
  FOREACH edge_table IN ARRAY ARRAY[
    'edge_prop_firms', 'edge_prop_accounts', 'edge_prop_balances', 'edge_prop_challenges',
    'edge_prop_rules', 'edge_prop_expenses', 'edge_prop_payouts'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', edge_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', edge_table);
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', edge_table, api_role);
      END IF;
    END LOOP;
  END LOOP;
END $$;