CREATE TABLE "edge_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"broker" text DEFAULT '' NOT NULL,
	"currency" text NOT NULL,
	"initial_balance" numeric(28, 8) NOT NULL,
	"type" text NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edge_cash_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"owner_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(28, 8) NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edge_settings" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"risk_limit_percent" numeric(8, 4) DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edge_confluences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'Technical' NOT NULL,
	"color" text DEFAULT '#7f96c6' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edge_strategies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"entry_rules" text DEFAULT '' NOT NULL,
	"exit_rules" text DEFAULT '' NOT NULL,
	"risk_rules" text DEFAULT '' NOT NULL,
	"timeframe" text DEFAULT 'H4' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edge_executions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"price" numeric(28, 8) NOT NULL,
	"quantity" numeric(28, 8) NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"fee" numeric(28, 8) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edge_trade_confluences" (
	"trade_id" uuid NOT NULL,
	"confluence_id" uuid NOT NULL,
	"name_snapshot" text NOT NULL,
	"description_snapshot" text DEFAULT '' NOT NULL,
	"category_snapshot" text DEFAULT 'Technical' NOT NULL,
	"color_snapshot" text NOT NULL,
	CONSTRAINT "edge_trade_confluences_trade_id_confluence_id_pk" PRIMARY KEY("trade_id","confluence_id")
);
--> statement-breakpoint
CREATE TABLE "edge_trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"strategy_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"symbol" text DEFAULT '' NOT NULL,
	"asset_class" text DEFAULT 'forex' NOT NULL,
	"direction" text DEFAULT 'long' NOT NULL,
	"entry_at" timestamp with time zone,
	"exit_at" timestamp with time zone,
	"entry_price" numeric(28, 8),
	"exit_price" numeric(28, 8),
	"stop_loss" numeric(28, 8),
	"take_profit" numeric(28, 8),
	"quantity" numeric(28, 8),
	"multiplier" numeric(28, 8),
	"initial_risk" numeric(28, 8),
	"gross_pnl" numeric(28, 8),
	"commission" numeric(28, 8) DEFAULT '0' NOT NULL,
	"funding" numeric(28, 8) DEFAULT '0' NOT NULL,
	"slippage" numeric(28, 8) DEFAULT '0' NOT NULL,
	"pnl_source" text DEFAULT 'broker' NOT NULL,
	"net_pnl" numeric(28, 8),
	"realized_r" numeric(28, 8),
	"timeframe" text DEFAULT 'H4' NOT NULL,
	"higher_timeframe" text DEFAULT 'D1' NOT NULL,
	"session" text DEFAULT 'London' NOT NULL,
	"regime" text DEFAULT '' NOT NULL,
	"emotion" text DEFAULT '' NOT NULL,
	"confidence" integer,
	"grade" text,
	"followed_plan" boolean,
	"behavioral_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"thesis" text DEFAULT '' NOT NULL,
	"entry_reason" text DEFAULT '' NOT NULL,
	"management" text DEFAULT '' NOT NULL,
	"exit_reason" text DEFAULT '' NOT NULL,
	"went_well" text DEFAULT '' NOT NULL,
	"went_wrong" text DEFAULT '' NOT NULL,
	"lesson" text DEFAULT '' NOT NULL,
	"chart_url" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "edge_cash_flows" ADD CONSTRAINT "edge_cash_flows_account_id_edge_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."edge_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge_executions" ADD CONSTRAINT "edge_executions_trade_id_edge_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."edge_trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge_trade_confluences" ADD CONSTRAINT "edge_trade_confluences_trade_id_edge_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."edge_trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge_trade_confluences" ADD CONSTRAINT "edge_trade_confluences_confluence_id_edge_confluences_id_fk" FOREIGN KEY ("confluence_id") REFERENCES "public"."edge_confluences"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge_trades" ADD CONSTRAINT "edge_trades_account_id_edge_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."edge_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge_trades" ADD CONSTRAINT "edge_trades_strategy_id_edge_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."edge_strategies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "edge_accounts_owner_idx" ON "edge_accounts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "edge_flows_account_date_idx" ON "edge_cash_flows" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "edge_confluences_owner_idx" ON "edge_confluences" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "edge_strategies_owner_idx" ON "edge_strategies" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "edge_executions_trade_idx" ON "edge_executions" USING btree ("trade_id");--> statement-breakpoint
CREATE INDEX "edge_trades_owner_exit_idx" ON "edge_trades" USING btree ("owner_id","exit_at");--> statement-breakpoint
CREATE INDEX "edge_trades_account_idx" ON "edge_trades" USING btree ("account_id");