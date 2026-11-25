// @ts-nocheck
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateUserMutation } from "./api/mutations";
import type { AdminUser } from "./api/types";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

interface UserFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AdminUser;
}

export function UserFormSheet({ open, onOpenChange, user }: UserFormSheetProps) {
  const [membership, setMembership] = useState(user.membership);
  const updateMut = useMutation(updateUserMutation);

  const handleSubmit = () => {
    updateMut.mutate(
      { id: user.id, values: { membership } },
      {
        onSuccess: () => { toast.success("User updated"); onOpenChange(false); },
        onError: () => toast.error("Failed to update user"),
      }
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader><SheetTitle>Edit User</SheetTitle></SheetHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">{user.email}</p>
          <div className="space-y-2">
            <label className="text-sm font-medium">Membership</label>
            <Select value={membership} onValueChange={(v) => setMembership(v as AdminUser["membership"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="team">Team</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSubmit} disabled={updateMut.isPending} className="w-full">
            {updateMut.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
