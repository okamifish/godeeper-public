// @ts-nocheck
"use client";

import { useState } from "react";
import { AlertModal } from "@/components/modal/alert-modal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteUserMutation } from "../../api/mutations";
import type { AdminUser } from "../../api/types";
import { Icons } from "@/components/icons";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserFormSheet } from "../user-form-sheet";

interface CellActionProps {
  row: AdminUser;
}

export function CellAction({ row }: CellActionProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const deleteMut = useMutation(deleteUserMutation);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <Icons.moreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setIsEditOpen(true)}>
            <Icons.edit className="mr-2 h-4 w-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setIsDeleteOpen(true)}>
            <Icons.trash className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <UserFormSheet open={isEditOpen} onOpenChange={setIsEditOpen} user={row} />
      <AlertModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={() => {
          deleteMut.mutate(row.id, {
            onSuccess: () => { toast.success("User deleted"); setIsDeleteOpen(false); },
            onError: () => toast.error("Failed to delete user"),
          });
        }}
        loading={deleteMut.isPending}
      />
    </>
  );
}
