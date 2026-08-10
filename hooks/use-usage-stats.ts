"use client";

import { useCallback, useEffect, useState } from "react";
import type { UsageStatsResponse } from "@/lib/usage-types";

export function useUsageStats() {
  const [data, setData] = useState<UsageStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/usage/stats");
      if (response.ok) {
        setData(await response.json());
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, isLoading, refetch };
}
