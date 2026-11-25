// @ts-nocheck
import { Badge } from "@/components/ui/badge";
import { DataTableColumnHeader } from "@/components/ui/table/data-table-column-header";
import type { AdminUser } from "../../api/types";
import type { ColumnDef } from "@tanstack/react-table";
import { CellAction } from "./cell-action";
import { ROLE_OPTIONS } from "./options";

export const columns: ColumnDef<AdminUser>[] = [
  {
    accessorKey: "email",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
  },
  {
    accessorKey: "displayName",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => row.original.displayName || "—",
  },
  {
    accessorKey: "membership",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Membership" />,
    cell: ({ row }) => {
      const v = row.getValue("membership") as string;
      const opt = ROLE_OPTIONS.find((o) => o.value === v);
      return <Badge variant={v === "free" ? "secondary" : "default"}>{opt?.label ?? v}</Badge>;
    },
    enableColumnFilter: true,
    meta: { options: ROLE_OPTIONS },
  },
  {
    accessorKey: "canvasCount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Canvases" />,
  },
  {
    accessorKey: "nodeCount",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Nodes" />,
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Registered" />,
    cell: ({ row }) => new Date(row.getValue("createdAt")).toLocaleDateString(),
  },
  {
    id: "actions",
    cell: ({ row }) => <CellAction row={row.original} />,
  },
];
