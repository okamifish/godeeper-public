import { z } from "zod";

export const userSchema = z.object({
  membership: z.enum(["free", "pro", "team"]),
});

export type UserFormValues = z.infer<typeof userSchema>;
