import "../env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;
const isLocalHost = /@(localhost|127\.0\.0\.1|\[::1\])(?::|\/)/.test(connectionString);

const client = postgres(connectionString, { ssl: isLocalHost ? false : "require" });
export const db = drizzle(client, { schema });
