import { z } from "zod";

const columnFieldSchema = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);

export const jurisdictionSchema = z.object({
  name: z.string().min(2, "Name is required"),
  socrata_domain: z.string().min(3, "Socrata domain is required"),
  resource_id: z.string().min(1, "Resource ID is required"),
  app_token: z.string().optional().nullable(),
  filing_type: z.enum(["building_permit", "business_license"]).optional().default("building_permit"),
  column_field_map: z
    .record(z.string(), columnFieldSchema)
    .refine((map) => Boolean(map.address), {
      message: "column_field_map must include an 'address' key"
    })
    .refine((map) => Boolean(map.issued_date), {
      message: "column_field_map must include an 'issued_date' key"
    })
    .refine((map) => Boolean(map.permit_number || map.license_number || map.id), {
      message: "column_field_map must include a permit_number, license_number, or id key"
    })
});

export const subscriberSchema = z.object({
  business_name: z.string().min(2, "Add your business name"),
  business_type: z.enum(["roofer", "hvac", "solar", "insurance", "lawyer", "other"]),
  filing_type_filters: z.array(z.enum(["building_permit", "business_license"])).min(1, "Choose at least one filing type"),
  market: z.string().min(1, "Select a city")
});

export const filingSearchSchema = z.object({
  address: z.string().min(2, "Enter an address"),
  radiusKm: z.coerce.number().min(1).max(25),
  type: z.enum(["all", "building_permit", "business_license"])
});
