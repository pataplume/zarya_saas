import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: path.resolve(__dirname, "../../.env.local") });

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    // biome-ignore lint/style/noNonNullAssertion: env var required at runtime, loaded by dotenv above
    url: process.env.DATABASE_URL!,
  },
  schemaFilter: ["crm"],
});
