import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

// Disable prefetch as it is not supported for "Transaction" pool mode on Supabase
const client = postgres(connectionString as string, { prepare: false });
export const db = drizzle(client, { schema });
