"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { OrderStatusBadge, getStatusLabel } from "@/components/ui/OrderStatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { orderService } from "@/services/orderService";
import { exportSPXToXlsx } from "@/services/spxXlsxService";
import {
  DateFilter,
  OrderStatus,
  OrderSummary,
  OrderType,
} from "@/types";
import { formatVND } from "@/utils/currency";
import {
  formatDateGroupHeader,
  getEndOfDay, getEndOfMonth, getEndOfYear,
  getStartOfDay, getStartOfMonth, getStartOfYear,
} from "@/utils/date";

function getRange(filter: DateFilter): [number, number] {
  const d = filter.date;
  if (filter.mode === "day") return [getStartOfDay(d).getTime(), getEndOfDay(d).getTime()];
  if (filter.mode === "month") return [getStartOfMonth(d).getTime(), getEndOfMonth(d).getTime()];
  return [getStartOfYear(d).getTime(), getEndOfYear(d).getTime()];
}

function getFilterLabel(filter: DateFilter): string {
  const d = filter.date;
  if (filter.mode === "day") {
    if (d.toDateString() === new Date().toDateString()) return "Hôm nay";
    return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  }
  if (filter.mode === "month") {
    return new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric" }).format(d);
  }
  return `Năm ${d.getFullYear()}`;
}

const ALL_STATUSES: OrderStatus[] = ["draft", "confirmed", "preparing", "packed", "shipped", "cancelled", "completed"];
const STATUS_LABEL: Record<OrderStatus, string> = {
  draft: "Nháp", confirmed: "Xác nhận", preparing: "Chuẩn bị hàng", packed: "Đóng gói",
  shipped: "Đã gửi", cancelled: "Đã hủy", completed: "Hoàn tất", deleted: "Đã xóa",
};

const PLATFORM_OPTIONS: { value: OrderType | "all"; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "normal", label: "Đơn thường" },
  { value: "tiktok", label: "TikTok" },
  { value: "shopee", label: "Shopee" },
];

const DEFAULT_FILTER: DateFilter = { mode: "day", date: new Date() };

interface Section { title: string; data: OrderSummary[] }

function groupByDate(orders: OrderSummary[]): Section[] {
  const map = new Map<string, OrderSummary[]>();
  for (const o of orders) {
    const key = new Date(o.createdAt).toDateString();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(o);
  }
  return Array.from(map.entries()).map(([, data]) => ({
    title: formatDateGroupHeader(data[0].createdAt),
    data,
  }));
}

const BULK_STATUS_OPTIONS: { status: OrderStatus; label: string; color: string }[] = [
  { status: "confirmed", label: "Xác nhận", color: "#10B981" },
  { status: "preparing", label: "Chuẩn bị hàng", color: "#3B82F6" },
  { status: "packed", label: "Đóng gói", color: "#8B5CF6" },
  { status: "shipped", label: "Đã gửi", color: "#F59E0B" },
  { status: "completed", label: "Hoàn tất", color: "#059669" },
  { status: "cancelled", label: "Hủy đơn", color: "#EF4444" },
];

export default function OrdersPage() {
  const [filter, setFilter] = useState<DateFilter>(DEFAULT_FILTER);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [platformFilter, setPlatformFilter] = useState<OrderType | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterVisible, setFilterVisible] = useState(false);
  const initialized = useRef(false);

  // Multi-select
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatusVisible, setBulkStatusVisible] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Pending filter state (in modal)
  const [pendingFilter, setPendingFilter] = useState<DateFilter>(DEFAULT_FILTER);
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | "all">("all");
  const [pendingPlatform, setPendingPlatform] = useState<OrderType | "all">("all");

  const isFiltered =
    statusFilter !== "all" ||
    platformFilter !== "all" ||
    filter.mode !== "day" ||
    filter.date.toDateString() !== new Date().toDateString();

  // Real-time Firestore listener
  useEffect(() => {
    if (!initialized.current) setLoading(true);
    orderService.checkAndCompleteShipped().catch(() => {});
    orderService.cleanupStaleDrafts().catch(() => {});

    const [start, end] = getRange(filter);
    const statuses = statusFilter === "all" ? undefined : [statusFilter];
    const orderTypes = platformFilter === "all" ? undefined : [platformFilter];

    const unsubscribe = orderService.subscribeToFiltered(
      { query: searchQuery, startMs: start, endMs: end, statuses, orderTypes },
      (orders) => {
        setSections(groupByDate(orders));
        initialized.current = true;
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [filter, statusFilter, platformFilter, searchQuery]);

  const openFilter = () => {
    setPendingFilter(filter);
    setPendingStatus(statusFilter);
    setPendingPlatform(platformFilter);
    setFilterVisible(true);
  };

  const applyFilter = () => {
    initialized.current = false;
    setFilter(pendingFilter);
    setStatusFilter(pendingStatus);
    setPlatformFilter(pendingPlatform);
    setFilterVisible(false);
  };

  const resetFilter = () => {
    setPendingFilter(DEFAULT_FILTER);
    setPendingStatus("all");
    setPendingPlatform("all");
  };

  const clearFilter = () => {
    initialized.current = false;
    setFilter(DEFAULT_FILTER);
    setStatusFilter("all");
    setPlatformFilter("all");
  };

  // Multi-select handlers
  const toggleSelect = (orderId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleSelectAll = () => {
    const allIds = sections.flatMap((s) => s.data.map((o) => o.id));
    if (selectedIds.size === allIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  };

  const handleBulkStatus = async (targetStatus: OrderStatus) => {
    setBulkStatusVisible(false);
    const allOrders = sections.flatMap((s) => s.data);
    const selected = allOrders.filter((o) => selectedIds.has(o.id));
    if (selected.length === 0) return;

    const label = STATUS_LABEL[targetStatus];
    if (!confirm(`Chuyển ${selected.length} đơn sang "${label}"?`)) return;

    try {
      for (const order of selected) {
        const extra: Parameters<typeof orderService.updateStatus>[2] = {};
        if (targetStatus === "shipped") {
          extra.shippedAt = Date.now();
          extra.lockedTotal = order.total;
        }
        await orderService.updateStatus(order.id, targetStatus, extra);
      }
      exitSelectMode();
    } catch {
      alert("Không thể cập nhật một số đơn hàng");
    }
  };

  const handleBulkCopy = async () => {
    const allOrders = sections.flatMap((s) => s.data);
    const selected = allOrders.filter((o) => selectedIds.has(o.id));
    if (selected.length === 0) return;

    const lines = selected.map((o) => {
      const parts: string[] = [];
      parts.push(`${o.customerName || "Khách hàng"}${o.orderCode ? ` (#${o.orderCode})` : ""}`);
      if (o.customerPhone) parts.push(`SĐT: ${o.customerPhone}`);
      if (o.customerAddress) parts.push(`Địa chỉ: ${o.customerAddress}`);
      if (o.itemNames) parts.push(o.itemNames);
      parts.push(`Tổng: ${formatVND(o.lockedTotal ?? o.total)}`);
      if (o.notes) parts.push(`Ghi chú: ${o.notes}`);
      return parts.join("\n");
    });

    await navigator.clipboard.writeText(lines.join("\n---\n"));
    alert(`Đã sao chép ${selected.length} đơn hàng`);
  };

  const handleExportXlsx = async () => {
    if (selectedIds.size === 0 || exporting) return;
    setExporting(true);
    try {
      const { count } = await exportSPXToXlsx(Array.from(selectedIds));
      alert(`Đã tạo file Excel SPX (${count} đơn)`);
    } catch {
      alert("Không thể tạo file Excel");
    } finally {
      setExporting(false);
    }
  };

  const totalOrderCount = sections.reduce((acc, s) => acc + s.data.length, 0);

  // Date navigation for filter modal
  const navigateDate = (direction: -1 | 1) => {
    setPendingFilter((prev) => {
      const d = new Date(prev.date);
      if (prev.mode === "day") d.setDate(d.getDate() + direction);
      else if (prev.mode === "month") d.setMonth(d.getMonth() + direction);
      else d.setFullYear(d.getFullYear() + direction);
      return { ...prev, date: d };
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-border px-4 sm:px-6 py-4 space-y-3 sticky top-0 z-50">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Đơn hàng</h1>
          <Link
            href="/orders/create"
            className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-hover transition-colors"
          >
            + Tạo đơn
          </Link>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Tìm theo tên, SĐT, mã đơn..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />

        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={openFilter}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              isFiltered ? "bg-blue-50 text-primary" : "bg-gray-100 text-gray-500"
            }`}
          >
            Bộ lọc
          </button>
          {isFiltered && (
            <>
              <button
                onClick={clearFilter}
                className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-red-50 text-red-500"
              >
                Xóa lọc
              </button>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-primary">
                {getFilterLabel(filter)}
              </span>
              {statusFilter !== "all" && (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-primary">
                  {STATUS_LABEL[statusFilter]}
                </span>
              )}
              {platformFilter !== "all" && (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-primary">
                  {PLATFORM_OPTIONS.find((p) => p.value === platformFilter)?.label}
                </span>
              )}
            </>
          )}

          {/* Select mode toggle */}
          {totalOrderCount > 0 && (
            <button
              onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
              className={`ml-auto px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                selectMode ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-500"
              }`}
            >
              {selectMode ? "Hủy chọn" : "Chọn"}
            </button>
          )}
        </div>
      </div>

      {/* Order list */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : totalOrderCount === 0 ? (
          <EmptyState title="Không có đơn hàng" subtitle={`Không có đơn trong ${getFilterLabel(filter).toLowerCase()}`} />
        ) : (
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 space-y-4">
            {/* Summary */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted font-medium">{totalOrderCount} đơn hàng</span>
              {selectMode && (
                <button onClick={handleSelectAll} className="text-xs font-semibold text-primary">
                  {selectedIds.size === totalOrderCount ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                </button>
              )}
            </div>

            {sections.map((section) => (
              <div key={section.title}>
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                  {section.title}
                </h3>
                <div className="space-y-2">
                  {section.data.map((order) => (
                    <OrderCard
                      key={order.id}
                      order={order}
                      selectMode={selectMode}
                      isSelected={selectedIds.has(order.id)}
                      onToggleSelect={() => toggleSelect(order.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Select mode bottom bar */}
      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-14 lg:bottom-0 left-0 right-0 z-[60] bg-gray-800 text-white px-4 py-3 flex items-center gap-3 lg:rounded-t-xl safe-area-bottom">
          <span className="text-sm font-semibold flex-1">{selectedIds.size} đã chọn</span>
          <button
            onClick={handleBulkCopy}
            className="px-3 py-2.5 rounded-lg bg-gray-700 text-sm font-semibold hover:bg-gray-600 active:bg-gray-500"
          >
            Sao chép
          </button>
          <button
            onClick={handleExportXlsx}
            disabled={exporting}
            className="px-3 py-2.5 rounded-lg bg-green-600 text-sm font-semibold hover:bg-green-700 active:bg-green-800 disabled:opacity-50"
          >
            {exporting ? "Đang tạo..." : "Excel SPX"}
          </button>
          <button
            onClick={() => setBulkStatusVisible(true)}
            className="px-3 py-2.5 rounded-lg bg-primary text-sm font-semibold hover:bg-primary-hover active:bg-primary-hover"
          >
            Đổi trạng thái
          </button>
        </div>
      )}

      {/* Bulk status modal */}
      <Modal open={bulkStatusVisible} onClose={() => setBulkStatusVisible(false)} title="Chuyển sang trạng thái">
        <div className="space-y-2">
          {BULK_STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.status}
              onClick={() => handleBulkStatus(opt.status)}
              className="w-full text-left px-4 py-3.5 rounded-lg bg-gray-50 hover:bg-gray-100 border-l-4 font-semibold text-sm transition-colors"
              style={{ borderLeftColor: opt.color, color: opt.color }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Modal>

      {/* Filter modal */}
      <Modal open={filterVisible} onClose={() => setFilterVisible(false)} title="Bộ lọc">
        <div className="space-y-5">
          {/* Date filter */}
          <div>
            <label className="text-xs font-semibold text-muted uppercase tracking-wide">Thời gian</label>
            <div className="flex gap-2 mt-2">
              {(["day", "month", "year"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setPendingFilter((f) => ({ ...f, mode }))}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    pendingFilter.mode === mode ? "bg-primary text-white" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {mode === "day" ? "Ngày" : mode === "month" ? "Tháng" : "Năm"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-3">
              <button onClick={() => navigateDate(-1)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">
                &lt;
              </button>
              <span className="flex-1 text-center text-sm font-medium">
                {getFilterLabel(pendingFilter)}
              </span>
              <button onClick={() => navigateDate(1)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">
                &gt;
              </button>
              <button
                onClick={() => setPendingFilter((f) => ({ ...f, date: new Date() }))}
                className="text-xs text-primary font-semibold"
              >
                Hôm nay
              </button>
            </div>
          </div>

          {/* Status filter */}
          <div>
            <label className="text-xs font-semibold text-muted uppercase tracking-wide">Trạng thái</label>
            <div className="flex flex-wrap gap-2 mt-2">
              <button
                onClick={() => setPendingStatus("all")}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  pendingStatus === "all" ? "bg-primary text-white" : "bg-gray-100 text-gray-500"
                }`}
              >
                Tất cả
              </button>
              {ALL_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setPendingStatus(s)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    pendingStatus === s ? "bg-primary text-white" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Platform filter */}
          <div>
            <label className="text-xs font-semibold text-muted uppercase tracking-wide">Nền tảng</label>
            <div className="flex flex-wrap gap-2 mt-2">
              {PLATFORM_OPTIONS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPendingPlatform(p.value)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    pendingPlatform === p.value ? "bg-primary text-white" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={resetFilter}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-red-500 bg-red-50 hover:bg-red-100"
            >
              Đặt lại
            </button>
            <button
              onClick={applyFilter}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-hover"
            >
              Áp dụng
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function OrderCard({
  order,
  selectMode,
  isSelected,
  onToggleSelect,
}: {
  order: OrderSummary;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
}) {
  const content = (
    <div
      className={`bg-white rounded-xl shadow-sm border border-gray-100 border-l-4 overflow-hidden transition-colors ${
        isSelected ? "bg-blue-50 border-l-primary" : `border-status-${order.status}`
      } ${order.isWaiting ? "bg-amber-50" : ""}`}
    >
      <div className="p-3.5 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-900 truncate">
                {order.customerName || "Khách hàng"}
              </span>
              {order.orderType !== "normal" && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 uppercase">
                  {order.orderType}
                </span>
              )}
            </div>
            {order.orderCode && (
              <p className="text-xs text-muted-light mt-0.5">#{order.orderCode}</p>
            )}
            {order.exchangeFromOrderId && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-200 inline-block mt-1">
                Đổi hàng
              </span>
            )}
            {order.isWaiting && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 inline-block mt-1 ml-1">
                Đang chờ
              </span>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <OrderStatusBadge status={order.status} />
            {selectMode && (
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  isSelected ? "bg-primary border-primary" : "border-gray-300 bg-white"
                }`}
              >
                {isSelected && <span className="text-white text-xs font-bold">✓</span>}
              </div>
            )}
          </div>
        </div>

        {order.customerPhone && (
          <p className="text-xs text-muted mt-1">{order.customerPhone}</p>
        )}
        {order.itemNames && (
          <p className="text-xs text-muted mt-0.5 truncate">{order.itemNames}</p>
        )}
        {order.paymentMethod && order.status !== "draft" && (
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-block mt-1.5 ${
              order.paymentMethod === "paid"
                ? "bg-green-100 text-green-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            {order.paymentMethod === "paid" ? "Đã thanh toán" : "COD"}
          </span>
        )}
        {order.notes && (
          <p className="text-xs text-muted mt-1 truncate">📝 {order.notes}</p>
        )}
        <p
          className={`text-base font-bold mt-1.5 ${
            ["draft", "cancelled", "deleted"].includes(order.status)
              ? "text-muted-light"
              : "text-primary"
          }`}
        >
          {formatVND(order.lockedTotal ?? order.total)}
        </p>
      </div>
    </div>
  );

  if (selectMode) {
    return (
      <button onClick={onToggleSelect} className="w-full text-left">
        {content}
      </button>
    );
  }

  return (
    <Link href={`/orders/${order.id}`} className="block hover:opacity-80 transition-opacity">
      {content}
    </Link>
  );
}
