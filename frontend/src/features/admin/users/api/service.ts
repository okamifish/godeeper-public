import { api } from "@/lib/api";
import type { AdminUserFilters, AdminUsersResponse, AdminUser, AdminUserMutationPayload } from "./types";

export async function getUsers(filters: AdminUserFilters): Promise<AdminUsersResponse> {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.membership) params.set("membership", filters.membership);
  if (filters.search) params.set("search", filters.search);
  return api.request<AdminUsersResponse>(`/admin/users?${params}`);
}

export async function updateUser(id: string, data: AdminUserMutationPayload): Promise<AdminUser> {
  return api.request<AdminUser>(`/admin/users/${id}/membership`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteUser(id: string): Promise<void> {
  return api.request<void>(`/admin/users/${id}`, { method: "DELETE" });
}
