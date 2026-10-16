import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import { adminApi } from "../lib/admin-api";

export function useAdminCatalog() {
  const { token, user } = useAuth();
  const client = useQueryClient();
  const categories = useQuery({
    queryKey: ["admin", user!.id, "categories"],
    queryFn: ({ signal }) => adminApi.categories(token!, signal), retry: false,
  });
  const refreshCatalog = () => Promise.all([
    client.invalidateQueries({ queryKey: ["admin", user!.id, "menu"] }),
    client.invalidateQueries({ queryKey: ["admin", user!.id, "categories"] }),
    client.invalidateQueries({ queryKey: ["menu"] }),
  ]);
  return { token: token!, user: user!, categories, refreshCatalog };
}
