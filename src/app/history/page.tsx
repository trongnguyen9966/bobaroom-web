"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { OrderStatusBadge } from "@/components/ui/OrderStatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { CalendarPicker } from "@/components/dashboard/CalendarPicker";
import { orderService } from "@/services/orderService";
import { revenueService, getDateRange } from "@/services/revenueService";
import {
  ChartDataPoint,
  DateFilter,
  OrderStatus,
  OrderSummary,
  RevenueStats,
} from "@/types";
import { formatVND } from "@/utils/currency";
import { formatDateGroupHeader } from "@/utils/date";

const ALL_STATUSES: OrderStatus[] = [
  "draft", "confirmed", "packed", "shipped", "cancelled", "completed", "deleted",
];
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

function getFilterTitle(filter: DateFilter): string {
  const d = filter.date;
  const fmt = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit" });
  const fmtFull = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

  if (filter.mode === "day") {
    if (d.toDateString() === new Date().toDateString()) return "Hôm nay";
    return fmtFull.format(d);
  }
  if (filter.mode === "month") {
    return new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric" }).format(d);
  }
  if (filter.mode === "custom" && filter.endDate) {
    return `${fmt.format(d)} - ${fmt.format(filter.endDate)}`;
  }
  return `Năm ${d.getFullYear()}`;
}

const emptyStats: RevenueStats = {
  totalRevenue: 0, totalOperatingCost: 0, totalPlatformFee: 0,
  totalCustomerShipping: 0, totalShopShipping: 0, netRevenue: 0,
  totalCostOfGoods: 0, estimatedProfit: 0, totalOrders: 0, averageOrderValue: 0,
};

export default function DashboardPage() {
  const [filter, setFilter] = useState<DateFilter>({ mode: "day", date: new Date() });
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [stats, setStats] = useState<RevenueStats>(emptyStats);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [allOrders, setAllOrders] = useState<OrderSummary[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [deductionsExpanded, setDeductionsExpanded] = useState(false);
  const [netExpanded, setNetExpanded] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) setLoading(true);
    orderService.checkAndCompleteShipped().catch(() => {});

    const [startMs, endMs] = getDateRange(filter);
    const statuses = statusFilter === "all" ? undefined : [statusFilter];

    const unsubscribe = orderService.subscribeToFiltered(
      { startMs, endMs },
      (orders) => {
        // computeStats is async (fetches products + full orders for accurate COGS)
        revenueService.computeStats(orders).then((computedStats) => {
          setStats(computedStats);
        });
        const computedChart = revenueService.getDailyChartData(orders, filter);
        setChartData(computedChart);
        setAllOrders(orders);

        const filtered = statuses
          ? orders.filter((o) => statuses.includes(o.status))
          : orders;
        setSections(groupByDate(filtered));
        initialized.current = true;
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [filter, statusFilter]);

  const handleFilterChange = (newFilter: DateFilter) => {
    initialized.current = false;
    setFilter(newFilter);
  };

  const handleDeleteDraft = async (orderId: string) => {
    if (!confirm("Xóa đơn nháp này?")) return;
    await orderService.updateStatus(orderId, "deleted");
  };

  const totalCount = sections.reduce((a, s) => a + s.data.length, 0);

  // Revenue breakdown values
  const gross = stats.totalRevenue;
  const opCost = stats.totalOperatingCost;
  const platformFee = stats.totalPlatformFee;
  const customerShipping = stats.totalCustomerShipping;
  const shopShipping = stats.totalShopShipping;
  const net = stats.netRevenue;
  const costOfGoods = stats.totalCostOfGoods;
  const totalDeductions = opCost + platformFee + customerShipping + shopShipping;
  const estimatedProfit = net - costOfGoods;
  const deductionItems = [
    { label: "Chi phí vận hành", value: opCost },
    { label: "Phí sàn TMĐT", value: platformFee },
    { label: "Phí ship của khách", value: customerShipping },
    { label: "Phí vận chuyển của shop", value: shopShipping },
  ].filter((d) => d.value > 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-border px-4 sm:px-6 py-4 sticky top-0 z-40">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Doanh thu</h1>
          <button
            onClick={() => setCalendarOpen(!calendarOpen)}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-primary bg-blue-50 hover:bg-blue-100 active:bg-blue-200"
          >
            {getFilterTitle(filter)}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 pb-24 lg:pb-8 space-y-3">
          {/* Calendar picker (collapsible) */}
          {calendarOpen && (
            <CalendarPicker filter={filter} onChange={(f) => { handleFilterChange(f); }} />
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* === Revenue breakdown — 3 cards matching mobile === */}

              {/* 1. Blue card: Tong doanh thu */}
              <div className="rounded-xl p-4 bg-primary shadow-sm">
                <p className="text-xs text-white/80">Tổng doanh thu</p>
                <p className="text-2xl font-bold text-white mt-1">{formatVND(gross)}</p>
              </div>

              {/* 2. White card: Các khoản trừ (expandable) */}
              {deductionItems.length > 0 && (
                <button
                  onClick={() => setDeductionsExpanded((v) => !v)}
                  className="w-full text-left bg-white rounded-xl shadow-sm border border-gray-100 p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">Các khoản trừ</span>
                    <span className="text-xs text-muted">{deductionsExpanded ? "▲" : "▼"}</span>
                  </div>
                  <p className="text-lg font-bold text-red-500 mt-1">- {formatVND(totalDeductions)}</p>
                  {deductionsExpanded && (
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                      {deductionItems.map((d) => (
                        <div key={d.label} className="flex justify-between text-sm">
                          <span className="text-gray-500">{d.label}</span>
                          <span className="font-semibold text-red-500">- {formatVND(d.value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </button>
              )}

              {/* 3. Green card: Doanh thu thực tế (expandable if COGS > 0) */}
              <button
                onClick={() => costOfGoods > 0 && setNetExpanded((v) => !v)}
                className={`w-full text-left rounded-xl shadow-sm p-4 bg-green-50 border border-green-200 ${costOfGoods > 0 ? "cursor-pointer" : "cursor-default"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-green-800">Doanh thu thực tế</span>
                  {costOfGoods > 0 && (
                    <span className="text-xs text-green-800">{netExpanded ? "▲" : "▼"}</span>
                  )}
                </div>
                <p className="text-2xl font-bold text-green-600 mt-1">{formatVND(net)}</p>
                {netExpanded && costOfGoods > 0 && (
                  <div className="mt-3 pt-3 border-t border-green-200 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Doanh thu thực tế</span>
                      <span className="font-semibold text-green-600">{formatVND(net)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Giá vốn hàng bán</span>
                      <span className="font-semibold text-red-500">- {formatVND(costOfGoods)}</span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-green-200">
                      <span className="text-green-800 font-semibold">Lợi nhuận ước tính</span>
                      <span className={`font-bold ${estimatedProfit >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {estimatedProfit >= 0 ? formatVND(estimatedProfit) : `- ${formatVND(-estimatedProfit)}`}
                      </span>
                    </div>
                  </div>
                )}
              </button>

              {/* Stats row: 2 cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
                  <p className="text-lg font-bold text-gray-900">{stats.totalOrders}</p>
                  <p className="text-xs text-muted mt-0.5">Số đơn tính doanh thu</p>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center">
                  <p className="text-lg font-bold text-gray-900">
                    {formatVND(stats.averageOrderValue)}
                  </p>
                  <p className="text-xs text-muted mt-0.5">Trung bình/đơn</p>
                </div>
              </div>

              {/* Chart — hide hourly chart for single day mode */}
              {chartData.length > 0 && filter.mode !== "day" && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                  <h3 className="text-sm font-bold text-gray-900 mb-3">
                    {filter.mode === "month" ? "Doanh thu theo ngày" : "Doanh thu theo tháng"}
                  </h3>
                  <RevenueChart data={chartData} height={160} />
                </div>
              )}

              {stats.totalRevenue === 0 && (
                <div className="bg-gray-50 rounded-xl p-6 text-center">
                  <p className="text-sm text-muted">Chưa có doanh thu trong khoảng thời gian này</p>
                </div>
              )}

              {/* Order history section */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-gray-900">Lịch sử đơn hàng</h3>

                {/* Status chips */}
                <div className="flex flex-wrap gap-2">
                  {(["all", ...ALL_STATUSES] as (OrderStatus | "all")[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => { initialized.current = false; setStatusFilter(s); }}
                      className={`px-4 py-2.5 rounded-full text-sm font-semibold transition-colors ${
                        statusFilter === s
                          ? "bg-primary text-white"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>

                {totalCount === 0 ? (
                  <EmptyState title="Không có đơn hàng" subtitle="Trong khoảng thời gian đã chọn" />
                ) : (
                  <div className="space-y-3">
                    <span className="text-xs text-muted font-medium">{totalCount} đơn hàng</span>
                    {sections.map((section) => (
                      <div key={section.title}>
                        <h4 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                          {section.title}
                        </h4>
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                          {section.data.map((order) => (
                            <Link
                              key={order.id}
                              href={`/orders/${order.id}`}
                              className="flex items-center justify-between px-4 py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">
                                  {order.customerName || "Khách hàng"}
                                </p>
                                <p className="text-xs text-muted mt-0.5">
                                  {formatVND(order.total)}
                                  {order.customerPhone && ` · ${order.customerPhone}`}
                                </p>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <div className="text-right">
                                  <OrderStatusBadge status={order.status} />
                                  <p className="text-[10px] text-muted-light mt-1">
                                    {new Intl.DateTimeFormat("vi-VN", {
                                      day: "2-digit", month: "2-digit",
                                      hour: "2-digit", minute: "2-digit",
                                    }).format(new Date(order.createdAt))}
                                  </p>
                                </div>
                                {order.status === "draft" && (
                                  <button
                                    onClick={(e) => { e.preventDefault(); handleDeleteDraft(order.id); }}
                                    className="text-red-400 hover:text-red-600 text-sm font-bold px-2 py-1"
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
