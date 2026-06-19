"use client";

import { useAuth, useUser } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ApiError, getSubscriber } from "./api";

export function useSubscriber(options: { redirectOnMissing?: boolean } = { redirectOnMissing: true }) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const subscriberId = user?.unsafeMetadata?.subscriberId as string | undefined ?? user?.id;

  const query = useQuery({
    queryKey: ["subscriber", subscriberId],
    enabled: Boolean(subscriberId),
    queryFn: async () => getSubscriber(subscriberId!, await getTokenOrThrow(getToken))
  });

  useEffect(() => {
    if (options.redirectOnMissing && query.error instanceof ApiError && query.error.status === 404) {
      router.replace("/onboarding");
    }
  }, [options.redirectOnMissing, query.error, router]);

  return query;
}

export async function getTokenOrThrow(getToken: () => Promise<string | null>) {
  const token = await getToken();
  if (!token) throw new ApiError(401, "Your session expired. Please sign in again.");
  return token;
}
