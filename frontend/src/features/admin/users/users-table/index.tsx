// @ts-nocheck
"use client";

import { DataTable } from "@/components/ui/table/data-table";
import { DataTableToolbar } from "@/components/ui/table/data-table-toolbar";
import { usersQueryOptions } from "../../api/queries";
import { columns } from "./columns";
import { useQuery } from "@tanstack/react-query";

interface UsersTableProps {
  page?: number;
  search?: string;
  membership?: string;
}

export function UsersTable({ page = 1, search, membership }: UsersTableProps) {
  const { data, isLoading } = useQuery(
    usersQueryOptions({ page, search: search || undefined, membership: membership || undefined })
  );

  if (isLoading) return <div className="p-4">Loading...</div>;

  return (
    <DataTable
      table={null as any}
      columns={columns}
    />
  );
}
