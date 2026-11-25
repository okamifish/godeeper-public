"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface AlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}

export function AlertModal({ isOpen, onClose, onConfirm, loading }: AlertModalProps) {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => { setIsMounted(true); }, []);
  if (!isMounted) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Are you sure?</DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <div className="flex w-full items-center justify-end space-x-2 pt-6">
          <Button disabled={loading} variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={loading} variant="destructive" onClick={onConfirm}>Continue</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
