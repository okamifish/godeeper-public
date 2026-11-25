CREATE TABLE "system_settings" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" DROP CONSTRAINT "comments_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "status" text DEFAULT 'success' NOT NULL;--> statement-breakpoint
ALTER TABLE "canvas_shares" ADD COLUMN "allow_comment" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "canvas_shares" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "canvas_shares" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "is_unlimited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "model_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "canvas_shares" ADD CONSTRAINT "canvas_shares_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "node_links_source_target_canvas_unique" ON "node_links" USING btree ("source_node_id","target_node_id","canvas_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_name_unique" ON "plans" USING btree ("name");