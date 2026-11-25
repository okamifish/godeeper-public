import { queryOptions } from "@tanstack/react-query";
import { getUsers } from "./service";
import type { AdminUserFilters } from "./types";

export type { AdminUser } from "./types";

export const userKeys = {
  all: ["admin-users"] as const,
  list: (filters: AdminUserFilters) => [...userKeys.all, "list", filters] as const,
};

export const usersQueryOptions = (filters: AdminUserFilters) =>
  queryOptions({
    queryKey: userKeys.list(filters),
    queryFn: () => getUsers(filters),
  });
