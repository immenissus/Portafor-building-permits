"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ApiError, getSubscriber } from "./api";

export function useApiKey() {
  const { user } = useUser();
  const subscriberId = user?.unsafeMetadata?.subscriberId as string | undefined;
  let apiKey = user?.unsafeMetadata?.apiKey as string | undefined;

  if (!apiKey && subscriberId) {
    if (subscriberId === "1" || subscriberId === "austin") {
      apiKey = "austin_roofing_test_api_key_abc123";
    } else if (subscriberId === "2" || subscriberId === "dallas") {
      apiKey = "dallas_hvac_test_api_key_xyz789";
    }
  }
  return apiKey;
}

export function useSubscriber(options: { redirectOnMissing?: boolean } = { redirectOnMissing: true }) {
  const { user, isLoaded: isUserLoaded } = useUser();
  const router = useRouter();
  const subscriberId = user?.unsafeMetadata?.subscriberId as string | undefined;
  const apiKey = useApiKey();

  const query = useQuery({
    queryKey: ["subscriber", subscriberId],
    enabled: Boolean(subscriberId) && Boolean(apiKey),
    queryFn: async () => getSubscriber(subscriberId!, apiKey!)
  });

  useEffect(() => {
    if (!isUserLoaded) return;

    const isMissing = !subscriberId || !apiKey;
    const is404 = query.error instanceof ApiError && query.error.status === 404;

    if (options.redirectOnMissing && (isMissing || is404)) {
      router.replace("/onboarding");
    }
  }, [options.redirectOnMissing, query.error, router, subscriberId, apiKey, isUserLoaded]);

  return query;
}

export async function getTokenOrThrow(getToken: () => Promise<string | null>) {
  const token = await getToken();
  if (!token) throw new ApiError(401, "Your session expired. Please sign in again.");
  return token;
}
