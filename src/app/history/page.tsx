"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { OrderStatusBadge } from "@/components/ui/OrderStatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { orderService } from "@/services/orderService";
import { DateFilter, Order, OrderStatus, OrderSummary } from "@/types";
import {
  formatDateGroupHeader,
  getEndOfDay, getEndOfMonth, getEndOfYear,
  getStartOfDay, getStartOfMonth, getStartOfYear,
} from "@/utils/date";

function getRange(filter: DateFilter): [number, number] {
  const d = filter.date;
  if (filter.mode === "week") return [getStartOfDay(d).getTime(), getEndOfDay(d).getTime()];
  if (filter.mode === "month") return [getStartOfMonth(d).getTime(), getEndOfMonth(d).getTime()];
  return [getStartOfYear(d).getTime(), getEndOfYear(d).getTime()];
}

function getFilterLabel(filter: DateFilter): string {
  const d = filter.date;
  if (filter.mode === "week") {
    if (d.toDateString() === new Date().toDateString()) return "Hôm nay";
    return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  }
  if (filter.mode === "month") {
    return new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric" }).format(d);
  }
  return `Năm ${d.getFullYear()}`;
}

const ALL_STATUSES: OrderStatus[] = ["draft", "confirmed", "packed", "shipped", "cancelled", "completed", "deleted"];
const STATUS_LABELS: Record<string, string> = {
  all: "Tất cả", draft: "Nháp", confirmed: "Xác nhận", preparing: "Chuẩn bị",
  packed: "Đóng gói", shipped: "Đã gửi", cancelled: "Đã hủy", completed: "Hoàn tất", deleted: "Đã xóa",
};

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

export default function HistoryPage() {
  const [filter, setFilter] = useState<DateFilter>({ mode: "month", date: new Date() });
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) setLoading(true);
    orderService.checkAndCompleteShipped().catch(() => {});

    const [start, end] = getRange(filter);
    const statuses = statusFilter === "all" ? undefined : [statusFilter];

    const unsubscribe = orderService.subscribeToFiltered(
      { startMs: start, endMs: end, statuses },
      (orders) => {
        setSections(groupByDate(orders));
        initialized.current = true;
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [filter, statusFilter]);

  const navigateDate = (direction: -1 | 1) => {
    initialized.current = false;
    setFilter((prev) => {
      const d = new Date(prev.date);
      if (prev.mode === "week") d.setDate(d.getDate() + direction);
      else if (prev.mode === "month") d.setMonth(d.getMonth() + direction);
      else d.setFullYear(d.getFullYear() + direction);
      return { ...prev, date: d };
    });
  };

  const handleDeleteDraft = async (orderId: string) => {
    if (!confirm("Xóa đơn nháp này?")) return;
    await orderService.updateStatus(orderId, "deleted");
  };

  const totalCount = sections.reduce((a, s) => a + s.data.length, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-border px-4 sm:px-6 py-4 space-y-3">
        <h1 className="text-xl font-bold text-gray-900">Lịch sử đơn hàng</h1>

        {/* Date filter */}
        <div className="flex items-center gap-2">
          {(["week", "month", "year"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => { initialized.current = false; setFilter((f) => ({ ...f, mode })); }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                filter.mode === mode ? "bg-primary text-white" : "bg-gray-100 text-gray-500"
              }`}
            >
              {mode === "week" ? "Ngày" : mode === "month" ? "Tháng" : "Năm"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => navigateDate(-1)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">
            &lt;
          </button>
          <span className="flex-1 text-center text-sm font-medium">{getFilterLabel(filter)}</span>
          <button onClick={() => navigateDate(1)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">
            &gt;
          </button>
          <button
            onClick={() => { initialized.current = false; setFilter((f) => ({ ...f, date: new Date() })); }}
            className="text-xs text-primary font-semibold"
          >
            Hôm nay
          </button>
        </div>

        {/* Status chips */}
        <div className="flex flex-wrap gap-2">
          {(["all", ...ALL_STATUSES] as (OrderStatus | "all")[]).map((s) => (
            <button
              key={s}
              onClick={() => { initialized.current = false; setStatusFilter(s); }}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                statusFilter === s ? "bg-primary text-white" : "bg-gray-100 text-gray-500"
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : totalCount === 0 ? (
          <EmptyState title="Không có đơn hàng" subtitle="Trong khoảng thời gian đã chọn" />
        ) : (
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 space-y-3">
            <span className="text-xs text-muted font-medium">{totalCount} đơn hàng</span>
            {sections.map((section) => (
              <div key={section.title}>
                <h3 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                  {section.title}
                </h3>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                  {section.data.map((order) => (
                    <Link
                      key={order.id}
                      href={`/orders/${order.id}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {order.customerName || "Khách hàng"}
                        </p>
                        {order.customerPhone && (
                          <p className="text-xs text-muted-light mt-0.5">{order.customerPhone}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <OrderStatusBadge status={order.status} />
                          <p className="text-[10px] text-muted-light mt-1">
                            {new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(order.createdAt))}
                          </p>
                        </div>
                        {order.status === "draft" && (
                          <button
                            onClick={(e) => { e.preventDefault(); handleDeleteDraft(order.id); }}
                            className="text-red-400 hover:text-red-600 text-sm font-bold"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
