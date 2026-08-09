CREATE TABLE "trip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"title" text NOT NULL,
	"phase" text DEFAULT 'intake' NOT NULL,
	"share_token" text NOT NULL,
	"brief" jsonb,
	"shortlist" jsonb,
	"itinerary" jsonb,
	CONSTRAINT "trip_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE "trip_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"channel" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"question" jsonb
);
--> statement-breakpoint
ALTER TABLE "trip_message" ADD CONSTRAINT "trip_message_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trip_updated_at_idx" ON "trip" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "trip_message_trip_idx" ON "trip_message" USING btree ("trip_id","at");