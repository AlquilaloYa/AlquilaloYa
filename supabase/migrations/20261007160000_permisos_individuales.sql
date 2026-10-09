CREATE TABLE "user_permissions" (
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"permission_id" uuid NOT NULL REFERENCES "permissions"("id") ON DELETE CASCADE,
	CONSTRAINT "user_permissions_user_permission_unique" UNIQUE("user_id", "permission_id")
);

CREATE INDEX "user_permissions_user_id_idx" ON "user_permissions" ("user_id");
