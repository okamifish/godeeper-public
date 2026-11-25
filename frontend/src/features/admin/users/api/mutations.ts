import { mutationOptions } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { updateUser, deleteUser } from "./service";
import { userKeys } from "./queries";
import type { AdminUserMutationPayload } from "./types";

export const updateUserMutation = mutationOptions({
  mutationFn: ({ id, values }: { id: string; values: AdminUserMutationPayload }) =>
    updateUser(id, values),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: userKeys.all });
  },
});

export const deleteUserMutation = mutationOptions({
  mutationFn: (id: string) => deleteUser(id),
  onSuccess: () => {
    getQueryClient().invalidateQueries({ queryKey: userKeys.all });
  },
});
