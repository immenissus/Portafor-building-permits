import { customType, pgTable, text, timestamp, varchar, integer, boolean, jsonb } from "drizzle-orm/pg-core";

// Custom Drizzle Type for PostGIS Geometry (Polygon / Point)
export const geometry = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geometry";
  },
  toDriver(value: string) {
    return value; // Will pass GeoJSON or WKT
  },
  fromDriver(value: string) {
    return value;
  }
});

// SUBSCRIBERS
export const subscribers = pgTable("subscribers", {
  id: varchar("id", { length: 255 }).primaryKey(), // Clerk User ID
  email: varchar("email", { length: 255 }),
  businessName: varchar("business_name", { length: 255 }).notNull(),
  businessType: varchar("business_type", { length: 100 }).notNull(),
  filingTypeFilters: jsonb("filing_type_filters").$type<string[]>().notNull(),
  serviceArea: geometry("service_area").notNull(), // PostGIS Polygon
  radiusKm: integer("radius_km"),
  apiKey: varchar("api_key", { length: 255 }).unique(),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// JURISDICTIONS
export const jurisdictions = pgTable("jurisdictions", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  socrataDomain: varchar("socrata_domain", { length: 255 }).notNull(),
  resourceId: varchar("resource_id", { length: 50 }).notNull(),
  appToken: varchar("app_token", { length: 255 }),
  columnFieldMap: jsonb("column_field_map").notNull(),
  watermarkDatetime: timestamp("watermark_datetime"),
  isActive: boolean("is_active").default(true).notNull(),
  lastPolledAt: timestamp("last_polled_at"),
  lastSuccessAt: timestamp("last_success_at"),
  consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
  totalIngested: integer("total_ingested").default(0).notNull(),
  totalQuarantined: integer("total_quarantined").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

// FILINGS
export const filings = pgTable("filings", {
  id: varchar("id", { length: 255 }).primaryKey(),
  jurisdictionId: varchar("jurisdiction_id", { length: 255 }).references(() => jurisdictions.id).notNull(),
  externalId: varchar("external_id", { length: 255 }).notNull(),
  filingType: varchar("filing_type", { length: 100 }).notNull(),
  addressRaw: text("address_raw").notNull(),
  addressParsed: jsonb("address_parsed"),
  geom: geometry("geom").notNull(), // PostGIS Point
  filedAt: timestamp("filed_at").notNull(),
  rawData: jsonb("raw_data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

// QUARANTINED FILINGS
export const quarantinedFilings = pgTable("quarantined_filings", {
  id: varchar("id", { length: 255 }).primaryKey(),
  jurisdictionId: varchar("jurisdiction_id", { length: 255 }).references(() => jurisdictions.id).notNull(),
  rawData: jsonb("raw_data").notNull(),
  errorLog: text("error_log").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull()
});

// ALERTS SENT (Deduplication table)
export const alertsSent = pgTable("alerts_sent", {
  id: varchar("id", { length: 255 }).primaryKey(),
  subscriberId: varchar("subscriber_id", { length: 255 }).references(() => subscribers.id).notNull(),
  filingId: varchar("filing_id", { length: 255 }).references(() => filings.id).notNull(),
  dispatchedAt: timestamp("dispatched_at").defaultNow().notNull()
});

// STRIPE WEBHOOK LOGGING & RETRY QUEUE
export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  id: varchar("id", { length: 255 }).primaryKey(), // Stripe Event ID
  type: varchar("type", { length: 100 }).notNull(),
  clerkUserId: varchar("clerk_user_id", { length: 255 }),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, processed, failed
  errorLog: text("error_log"),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at")
});
