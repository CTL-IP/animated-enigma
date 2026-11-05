ALTER TYPE "public"."payment_method" ADD VALUE 'paypal';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "paypal_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_ciphertext" text NOT NULL,
	"webhook_id" text,
	"webhook_url" text,
	"connected_by" uuid,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_verified_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "paypal_invoice_id" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "paypal_pay_url" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "paypal_sent_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "paypal_connections" ADD CONSTRAINT "paypal_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "paypal_connections" ADD CONSTRAINT "paypal_connections_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "paypal_connections_org_idx" ON "paypal_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_org_paypal_invoice_idx" ON "invoices" USING btree ("organization_id","paypal_invoice_id") WHERE paypal_invoice_id is not null;