export interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  membership: "free" | "pro" | "team";
  canvasCount: number;
  nodeCount: number;
  createdAt: string;
  lastActive: string | null;
}

export interface AdminUsersResponse {
  users: AdminUser[];
  total: number;
}

export interface AdminUserFilters {
  page?: number;
  limit?: number;
  membership?: string;
  search?: string;
}

export interface AdminUserMutationPayload {
  membership: string;
}
