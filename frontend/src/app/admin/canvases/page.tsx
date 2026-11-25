"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { MOCK_CANVASES } from "@/lib/admin-mock";
import { Icons } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  EmptyState,
  PageHeader,
  SearchInput,
  SectionCard,
  SkeletonBlock,
  StatusChip,
  Toolbar,
} from "@/components/admin/ui";
import { formatDate } from "@/components/admin/format";

interface AdminCanvas {
  id: string;
  title: string;
  ownerEmail: string;
  nodeCount: number;
  isPublic: boolean;
  shareCount: number;
  createdAt: string;
  updatedAt: string;
}

const PAGE_SIZE = 10;

export default function AdminCanvases() {
  const [canvases, setCanvases] = useState<AdminCanvas[]>([]);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<AdminCanvas | null>(null);

  const fetchCanvases = (query?: string) => {
    api
      .getAdminCanvases({ search: query })
      .then((data: AdminCanvas[]) => setCanvases(data))
      .catch(() => setCanvases(MOCK_CANVASES as unknown as AdminCanvas[]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCanvases();
  }, []);

  const filtered = canvases;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const current = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleSearch = () => {
    setAppliedSearch(search.trim());
    setPage(1);
    setLoading(true);
    fetchCanvases(search.trim() || undefined);
  };

  const handleDelete = async (canvas: AdminCanvas) => {
    try {
      await api.deleteAdminCanvas(canvas.id);
      setCanvases((prev) => prev.filter((item) => item.id !== canvas.id));
      toast.success("画布已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div className="gd-stack">
      <PageHeader title="画布管理" description="查看用户画布、分享链接数量与删除违规内容。" />

      <SectionCard flush>
        <Toolbar
          note={
            loading
              ? "正在加载…"
              : `共 ${filtered.length} 个画布${appliedSearch ? ` · 搜索「${appliedSearch}」` : ""}`
          }
        >
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="按所有者邮箱搜索…"
          />
          <button className="gd-btn sm" onClick={handleSearch} disabled={loading}>
            <Icons.search />
            搜索
          </button>
          {appliedSearch ? (
            <button
              className="gd-btn ghost sm"
              onClick={() => {
                setSearch("");
                setAppliedSearch("");
                setPage(1);
                setLoading(true);
                fetchCanvases();
              }}
            >
              清空搜索
            </button>
          ) : null}
        </Toolbar>

        {loading ? (
          <div style={{ padding: 18 }}>
            <SkeletonBlock height={220} />
          </div>
        ) : (
          <>
            <div className="gd-table-wrap">
              <table className="gd-table">
                <thead>
                  <tr>
                    <th>标题</th>
                    <th>所有者</th>
                    <th className="gd-right">节点数</th>
                    <th>分享状态</th>
                    <th className="gd-right">分享数</th>
                    <th>更新时间</th>
                    <th style={{ width: 56 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {current.map((canvas) => (
                    <tr key={canvas.id}>
                      <td className="gd-strong">{canvas.title}</td>
                      <td className="gd-muted">{canvas.ownerEmail}</td>
                      <td className="gd-right gd-num">{canvas.nodeCount}</td>
                      <td>
                        {canvas.shareCount > 0 ? (
                          <StatusChip tone="ok" dot>
                            已分享
                          </StatusChip>
                        ) : (
                          <StatusChip tone="muted">未分享</StatusChip>
                        )}
                      </td>
                      <td className="gd-right gd-num">{canvas.shareCount}</td>
                      <td className="gd-muted gd-nowrap">{formatDate(canvas.updatedAt)}</td>
                      <td>
                        <div className="gd-row-actions">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="gd-btn ghost sm" aria-label="画布操作">
                                <Icons.moreHorizontal />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setPendingDelete(canvas)}
                              >
                                删除画布…
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {current.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <EmptyState
                          icon={Icons.workspace}
                          title="没有匹配的画布"
                          description={
                            appliedSearch
                              ? "试试清空搜索。"
                              : "用户创建画布后会出现在这里。"
                          }
                        />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="gd-table-foot">
              <span>
                第 {safePage} / {totalPages} 页 · 共 {filtered.length} 条
              </span>
              <div className="gd-pager">
                <button
                  className="gd-pg"
                  disabled={safePage <= 1}
                  onClick={() => setPage(safePage - 1)}
                  aria-label="上一页"
                >
                  <Icons.chevronLeft />
                </button>
                {Array.from({ length: totalPages }).slice(0, 7).map((_, index) => (
                  <button
                    key={index + 1}
                    className={`gd-pg${index + 1 === safePage ? " active" : ""}`}
                    onClick={() => setPage(index + 1)}
                  >
                    {index + 1}
                  </button>
                ))}
                <button
                  className="gd-pg"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(safePage + 1)}
                  aria-label="下一页"
                >
                  <Icons.chevronRight />
                </button>
              </div>
              <span className="gd-pagesize">每页 {PAGE_SIZE} 条</span>
            </div>
          </>
        )}
      </SectionCard>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除画布？</AlertDialogTitle>
            <AlertDialogDescription>
              将永久删除「{pendingDelete?.title ?? ""}」及其节点与分享链接，此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) handleDelete(pendingDelete);
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
