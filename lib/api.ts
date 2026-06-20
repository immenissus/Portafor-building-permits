import type { Filing, JurisdictionHealth, Subscriber, SubscriberPayload } from "./types";

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (error) {
    if (!response.ok) {
      throw new ApiError(
        response.status,
        `Server returned an error (${response.status} ${response.statusText || "Error"}). Please check that your backend is running and configured correctly.`
      );
    }
    throw new ApiError(500, "Server returned a non-JSON success response");
  }

  if (!response.ok) {
    throw new ApiError(response.status, body?.detail ?? "Something went wrong - try again", body);
  }

  return body as T;
}

export async function apiFetch<T>(
  path: string,
  token: string,
  init: RequestInit = {},
  options: { isApiKey?: boolean } = { isApiKey: true }
): Promise<T> {
  if (!apiUrl) {
    throw new ApiError(500, "NEXT_PUBLIC_API_URL is not configured");
  }

  const authHeader: Record<string, string> = options.isApiKey
    ? { "X-Subscriber-Key": token }
    : { Authorization: `Bearer ${token}` };

  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeader,
      ...init.headers
    }
  });

  return parseResponse<T>(response);
}

export function getSubscriber(id: string, token: string) {
  return apiFetch<Subscriber>(`/subscribers/${id}`, token, {}, { isApiKey: true });
}

export function upsertSubscriber(payload: SubscriberPayload, token: string) {
  return apiFetch<Subscriber>("/subscribers", token, {
    method: "POST",
    body: JSON.stringify(payload)
  }, { isApiKey: false });
}

export function searchFilings(params: { lat: number; lng: number; radiusKm: number; type?: string }, token: string) {
  const query = new URLSearchParams({
    near: `${params.lat},${params.lng}`,
    radius_km: String(params.radiusKm)
  });
  if (params.type && params.type !== "all") query.set("type", params.type);
  return apiFetch<Filing[]>(`/filings?${query.toString()}`, token, {}, { isApiKey: true });
}

export function getJurisdictionHealth(id: string, token: string) {
  return apiFetch<JurisdictionHealth>(`/jurisdictions/${id}/health`, token, {}, { isApiKey: false });
}

export function createJurisdiction(payload: unknown, token: string, adminKey: string) {
  return apiFetch<JurisdictionHealth>("/jurisdictions", token, {
    method: "POST",
    headers: { "X-Admin-Key": adminKey },
    body: JSON.stringify(payload)
  }, { isApiKey: false });
}

export async function geocodeAddress(address: string) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) throw new ApiError(500, "NEXT_PUBLIC_MAPBOX_TOKEN is not configured");
  const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?country=US&limit=1&access_token=${token}`);
  const result = await parseResponse<{ features: Array<{ center: [number, number] }> }>(response);
  const center = result.features[0]?.center;
  if (!center) throw new ApiError(404, "We could not find that address");
  return { lng: center[0], lat: center[1] };
}
