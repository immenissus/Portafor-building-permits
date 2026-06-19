import { z } from "zod";

export const subscriberSchema = z.object({
  business_name: z.string().min(2, "Add your business name"),
  business_type: z.enum(["roofer", "hvac", "solar", "insurance", "lawyer", "other"]),
  filing_type_filters: z.array(z.enum(["building_permit", "business_license"])).min(1, "Choose at least one filing type")
});

export const filingSearchSchema = z.object({
  address: z.string().min(2, "Enter an address"),
  radiusKm: z.coerce.number().min(1).max(25),
  type: z.enum(["all", "building_permit", "business_license"])
});
