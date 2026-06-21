export type FilingType = "building_permit" | "business_license";
export type BusinessType = "roofer" | "hvac" | "solar" | "insurance" | "lawyer" | "other";

export type ServiceArea = GeoJSON.Polygon | GeoJSON.MultiPolygon;

export type Alert = {
  id: string;
  filing_type: FilingType;
  address: string;
  filed_at: string;
  lat: number;
  lng: number;
  raw_data?: Record<string, unknown>;
};

export type Subscriber = {
  id: string;
  business_name: string;
  business_type: BusinessType;
  filing_type_filters: FilingType[];
  service_area: ServiceArea;
  radius_km?: number;
  created_at: string;
  recent_alerts: Alert[];
  api_key?: string;
};

export type Filing = Omit<Alert, "raw_data">;

export type JurisdictionHealth = {
  jurisdiction_id: string;
  name: string;
  last_polled_at: string | null;
  last_success_at: string | null;
  consecutive_failures: number;
  total_ingested: number;
  total_quarantined: number;
};

export type SubscriberPayload = {
  business_name: string;
  business_type: BusinessType;
  filing_type_filters: FilingType[];
  service_area: ServiceArea;
};
