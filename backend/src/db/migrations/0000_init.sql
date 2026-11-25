CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" text NOT NULL,
	"feature" text DEFAULT 'task' NOT NULL,
	"model" text,
	"input_tokens" integer DEFAULT 0,
	"output_tokens" integer DEFAULT 0,
	"cost_usd" numeric(10, 6) DEFAULT '0',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canvas_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canvas_id" uuid NOT NULL,
	"share_token" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canvas_shares_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE "canvases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT 'Untitled Canvas' NOT NULL,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"node_count" integer DEFAULT 0,
	"is_public" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canvas_id" uuid NOT NULL,
	"node_id" text,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"feature" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credits" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"task_run" integer DEFAULT 0 NOT NULL,
	"inspire" integer DEFAULT 0 NOT NULL,
	"summary" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"provider" text DEFAULT 'openrouter' NOT NULL,
	"model_name" text NOT NULL,
	"input_price_per_1k" numeric(10, 6) DEFAULT '0',
	"output_price_per_1k" numeric(10, 6) DEFAULT '0',
	"enabled" boolean DEFAULT true,
	"allowed_plans" text DEFAULT 'free,pro,team',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "node_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_node_id" text NOT NULL,
	"target_node_id" text NOT NULL,
	"link_type" text DEFAULT 'reference' NOT NULL,
	"is_auto" boolean DEFAULT false,
	"canvas_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"canvas_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"canvases_limit" integer DEFAULT 3 NOT NULL,
	"nodes_per_canvas" integer DEFAULT 50 NOT NULL,
	"ai_tasks_per_day" integer DEFAULT 10 NOT NULL,
	"stripe_price_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"content" text NOT NULL,
	"feature" text DEFAULT 'task' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"detail" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"canvas_id" uuid,
	"model" text,
	"input_tokens" integer DEFAULT 0,
	"output_tokens" integer DEFAULT 0,
	"duration_ms" integer DEFAULT 0,
	"status" text DEFAULT 'running' NOT NULL,
	"error_msg" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"membership" text DEFAULT 'free' NOT NULL,
	"api_key_enc" text,
	"api_provider" text DEFAULT 'openrouter',
	"api_base_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_shares" ADD CONSTRAINT "canvas_shares_canvas_id_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvases" ADD CONSTRAINT "canvases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_canvas_id_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_links" ADD CONSTRAINT "node_links_source_node_id_nodes_id_fk" FOREIGN KEY ("source_node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_links" ADD CONSTRAINT "node_links_target_node_id_nodes_id_fk" FOREIGN KEY ("target_node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_links" ADD CONSTRAINT "node_links_canvas_id_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_canvas_id_canvases_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_events" ADD CONSTRAINT "risk_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;