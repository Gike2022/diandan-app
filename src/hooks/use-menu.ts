import { useQuery } from "@tanstack/react-query";
import { api, fetchMenu } from "../lib/api";

export async function fetchCatalog(signal?: AbortSignal) {
  const [{ categories }, dishes] = await Promise.all([api.categories(signal), fetchMenu(signal)]);
  return { categories, dishes };
}

export function useMenu() {
  return useQuery({
    queryKey: ["menu"],
    queryFn: ({ signal }) => fetchCatalog(signal),
    staleTime: 30000, retry: false,
  });
}
