"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { OrderStatusBadge, getStatusLabel } from "@/components/ui/OrderStatusBadge";
import { Modal } from "@/components/ui/Modal";
import { orderService } from "@/services/orderService";
import { inventoryService } from "@/services/inventoryService";
import { settingsService } from "@/services/settingsService";
import { OrderStatus, OrderWithItems, PaymentMethod } from "@/types";
import { formatVND } from "@/utils/currency";
import { formatDateTime } from "@/utils/date";
import { generateOrderImage } from "@/utils/orderImage";

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  confirmed: "preparing",
  preparing: "packed",
  packed: "shipped",
};

const NEXT_STATUS_LABEL: Partial<Record<OrderStatus, string>> = {
  confirmed: "Bắt đầu Chuẩn bị hàng",
  preparing: "Đánh dấu Đã đóng gói",
  packed: "Đánh dấu Đã gửi",
};

function formatOrderText(order: OrderWithItems): string {
  const lines: string[] = [
    `=== ĐƠN HÀNG ===`,
    `Khách hàng: ${order.customerName || "(Không có tên)"}`,
    `SĐT: ${order.customerPhone || "(Không có)"}`,
    `Địa chỉ: ${order.customerAddress || "(Không có)"}`,
    ``,
    `--- SẢN PHẨM ---`,
    ...order.items.map(
      (i) =>
        `- ${i.productName}${i.productColor ? ` (${i.productColor})` : ""} x${i.quantity}: ${formatVND(i.unitPrice * i.quantity)}`,
    ),
    ``,
    `Tạm tính: ${formatVND(order.subtotal)}`,
  ];

  if (order.discountAmount > 0) {
    const label = order.discountType === "percent" ? `Giảm giá (${order.discountValue}%)` : "Giảm giá";
    lines.push(`${label}: -${formatVND(order.discountAmount)}`);
  }
  if (order.shippingFee > 0) {
    lines.push(`Phí vận chuyển: ${formatVND(order.shippingFee)}`);
  }
  lines.push(`TỔNG CỘNG: ${formatVND(order.total)}`);
  if (order.deposit > 0) {
    lines.push(`Khách cọc: -${formatVND(order.deposit)}`);
    lines.push(`Còn thu hộ (COD): ${formatVND(Math.max(0, order.total - order.deposit))}`);
  }
  lines.push("");
  lines.push(`Thanh toán: ${order.paymentMethod === "paid" ? "Đã thanh toán" : order.paymentMethod === "cod" ? "COD" : "-"}`);
  lines.push(`Trạng thái: ${getStatusLabel(order.status)}`);
  lines.push(`Ngày tạo: ${formatDateTime(order.createdAt)}`);
  if (order.notes) {
    lines.push("");
    lines.push(`Ghi chú: ${order.notes}`);
  }
  return lines.join("\n");
}

export default function OrderDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [order, setOrder] = useState<OrderWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [changePaymentOpen, setChangePaymentOpen] = useState(false);
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const load = useCallback(async () => {
    const data = await orderService.getById(id);
    setOrder(data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Also subscribe for realtime updates
  useEffect(() => {
    const unsub = orderService.subscribeToOrder(id, (updated) => {
      if (updated) setOrder(updated);
    });
    return () => unsub();
  }, [id]);

  const handleAdvanceStatus = async () => {
    if (!order) return;
    const next = NEXT_STATUS[order.status];
    if (!next) return;

    if (!confirm(`Chuyển sang "${getStatusLabel(next)}"?`)) return;

    setActionLoading(true);
    try {
      const extra: Parameters<typeof orderService.updateStatus>[2] = {};
      if (next === "shipped") {
        extra.shippedAt = Date.now();
        extra.lockedTotal = order.total;
      }
      await orderService.updateStatus(id, next, extra);
      await load();
    } catch {
      alert("Không thể cập nhật trạng thái");
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmOrder = async (method: PaymentMethod) => {
    if (!order) return;
    setPaymentConfirmOpen(false);
    setActionLoading(true);
    try {
      // 1. Deduct stock
      const orderItems = await orderService.getItems(id);
      const { success, outOfStockProductIds } = await inventoryService.deductStock(orderItems);

      if (!success) {
        // Remove out-of-stock items from the order
        const removedIds = await inventoryService.removeOutOfStockItems(id);
        const updatedItems = orderItems.filter((i) => !removedIds.includes(i.id));

        if (updatedItems.length === 0) {
          alert("Tất cả sản phẩm đã hết hàng. Không thể xác nhận đơn hàng.");
          setActionLoading(false);
          return;
        }
        // Deduct stock for remaining items
        await inventoryService.deductStock(updatedItems);
        const removedNames = order.items
          .filter((i) => outOfStockProductIds.includes(i.productId))
          .map((i) => i.productName)
          .join(", ");
        alert(`Đã xác nhận. Một số sản phẩm hết hàng đã bị xóa: ${removedNames}`);
      }

      // 2. Check free shipping
      const settings = await settingsService.get();
      if (settings.freeShippingEnabled) {
        const subtotalAfterDiscount = order.subtotal - order.discountAmount;
        const methodMatches =
          settings.freeShippingPaymentMethod === "both" ||
          (settings.freeShippingPaymentMethod === "cod" && method === "cod") ||
          (settings.freeShippingPaymentMethod === "paid" && method !== "cod");
        if (subtotalAfterDiscount >= settings.freeShippingThreshold && methodMatches) {
          await orderService.applyFreeShipping(id);
        }
      }

      // 3. Update status
      const now = Date.now();
      await orderService.updateStatus(id, "confirmed", {
        paymentMethod: method,
        confirmedAt: now,
      });

      // 4. Cleanup draft orders with 0-stock products
      const deductedItems = order.items
        .filter((i) => !i.isGift)
        .map((i) => ({ productId: i.productId, productName: i.productName }));
      await inventoryService.cleanupDraftOrdersForProducts(id, deductedItems);

      // 5. Backdate createdAt if confirmed on different day
      const creationDay = new Date(order.createdAt).toDateString();
      const confirmDay = new Date(now).toDateString();
      if (creationDay !== confirmDay) {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        await orderService.updateCreatedAt(id, startOfToday.getTime());
      }

      // 6. Check waiting order
      if (settings.waitingOrderEnabled && settings.waitingOrderCategoryIds.length > 0) {
        // Note: OrderItem doesn't have categoryId, skip waiting check on web
        // (matching mobile which loads products to check categories)
      }

      await load();
    } catch {
      alert("Không thể xác nhận đơn hàng");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!order) return;
    if (!confirm("Bạn có chắc muốn hủy đơn hàng này?")) return;
    setActionLoading(true);
    try {
      // Restore stock if order was confirmed+
      if (["confirmed", "preparing", "packed", "shipped"].includes(order.status)) {
        await inventoryService.restoreStock(order.items);
      }
      await orderService.updateStatus(id, "cancelled");
      await load();
    } catch {
      alert("Không thể hủy đơn hàng");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!order) return;
    if (order.status !== "draft") {
      alert("Chỉ có thể xóa đơn hàng ở trạng thái nháp.");
      return;
    }
    if (!confirm("Đơn hàng sẽ bị xóa vĩnh viễn. Bạn có chắc chắn?")) return;
    try {
      await orderService.delete(id);
      router.push("/orders");
    } catch {
      alert("Không thể xóa đơn hàng");
    }
  };

  const handleChangePayment = async (method: PaymentMethod) => {
    setChangePaymentOpen(false);
    setActionLoading(true);
    try {
      await orderService.updatePaymentMethod(id, method);
      await load();
    } catch {
      alert("Không thể cập nhật phương thức thanh toán");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!order) return;
    await navigator.clipboard.writeText(formatOrderText(order));
    alert("Đã sao chép thông tin đơn hàng");
    setMenuOpen(false);
  };

  const handleCapture = async () => {
    if (!order) return;
    setMenuOpen(false);
    setCapturing(true);

    try {
      const blob = await generateOrderImage(order);
      const fileName = `don-hang-${order.customerName || "order"}.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (isMobile && navigator.share && navigator.canShare?.({ files: [file] })) {
        // Mobile/iPad: share sheet -> user can "Save to Photos"
        await navigator.share({ files: [file] });
      } else if ("showSaveFilePicker" in window) {
        // Desktop with File System Access API: let user pick folder
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: fileName,
            startIn: "downloads",
            types: [{ description: "PNG Image", accept: { "image/png": [".png"] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          alert("Da luu anh don hang!");
        } catch (err: any) {
          if (err?.name === "AbortError") return;
          throw err;
        }
      } else {
        // Fallback: download
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      console.error("Capture error:", e);
      alert("Khong the tao anh don hang");
    } finally {
      setCapturing(false);
    }
  };

  const handleEdit = async () => {
    const currentEditor = await orderService.checkEditingBy(id);
    if (currentEditor) {
      alert("Đơn hàng đang được chỉnh sửa trên thiết bị khác. Vui lòng thử lại sau.");
      return;
    }
    router.push(`/orders/create?editId=${id}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <h2 className="text-lg font-bold text-gray-700">Không tìm thấy đơn hàng</h2>
        <Link href="/orders" className="text-primary text-sm mt-2">
          Quay lại danh sách
        </Link>
      </div>
    );
  }

  const canEdit = ["draft", "confirmed"].includes(order.status);
  const canAdvance = !!NEXT_STATUS[order.status] && !order.isWaiting;
  const canCancel = ["confirmed", "preparing", "packed"].includes(order.status);
  const isDraft = order.status === "draft";
  const displayTotal = order.lockedTotal ?? order.total;

  return (
    <div className="max-w-3xl lg:max-w-5xl xl:max-w-6xl mx-auto px-4 sm:px-6 py-4 pb-24 lg:pb-8 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={() => router.push("/orders")} className="text-sm text-muted hover:text-gray-700">
          ← Quay lại
        </button>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              onClick={handleEdit}
              className="text-sm font-semibold text-primary hover:underline"
            >
              Chỉnh sửa
            </button>
          )}
          <button
            onClick={() => setMenuOpen(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
          >
            <span className="text-gray-500">⋮</span>
          </button>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-5 lg:gap-6 space-y-4 lg:space-y-0">
      {/* Left column: order info + items */}
      <div className="lg:col-span-3 space-y-4">

      {/* Order info card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {order.customerName || "Khách hàng"}
            </h2>
            {order.orderCode && (
              <p className="text-sm text-muted-light">#{order.orderCode}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <OrderStatusBadge status={order.status} />
            {order.orderType !== "normal" && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 uppercase">
                {order.orderType}
              </span>
            )}
          </div>
        </div>

        {order.exchangeFromOrderId && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
            <span className="text-xs font-semibold text-orange-700">Đơn đổi hàng</span>
          </div>
        )}

        {order.isWaiting && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <span className="text-xs font-semibold text-amber-700">Đơn đang chờ xử lý</span>
          </div>
        )}

        {/* Customer info */}
        <div className="space-y-1.5 text-sm">
          {order.customerPhone && (
            <p className="text-gray-600">
              <span className="text-muted">SĐT:</span>{" "}
              <a href={`tel:${order.customerPhone}`} className="text-primary">
                {order.customerPhone}
              </a>
            </p>
          )}
          {order.customerAddress && (
            <p className="text-gray-600">
              <span className="text-muted">Địa chỉ:</span> {order.customerAddress}
            </p>
          )}
          {(order.customerProvince || order.customerWard) && (
            <p className="text-gray-600">
              <span className="text-muted">Khu vực:</span>{" "}
              {[order.customerWard, order.customerProvince].filter(Boolean).join(", ")}
            </p>
          )}
        </div>

        {/* Payment method */}
        {order.paymentMethod && (
          <div className="flex items-center gap-2">
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                order.paymentMethod === "paid"
                  ? "bg-green-100 text-green-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {order.paymentMethod === "paid" ? "Đã thanh toán" : "COD"}
            </span>
            {!isDraft && (
              <button
                onClick={() => setChangePaymentOpen(true)}
                className="text-xs text-primary hover:underline"
              >
                Đổi
              </button>
            )}
          </div>
        )}

        {/* Date */}
        <p className="text-xs text-muted-light">Tạo lúc: {formatDateTime(order.createdAt)}</p>
        {order.confirmedAt && (
          <p className="text-xs text-muted-light">Xác nhận lúc: {formatDateTime(order.confirmedAt)}</p>
        )}
        {order.shippedAt && (
          <p className="text-xs text-muted-light">Gửi lúc: {formatDateTime(order.shippedAt)}</p>
        )}

        {order.notes && (
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-sm text-gray-600">📝 {order.notes}</p>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900">Sản phẩm ({order.items.length})</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {order.items.map((item) => (
            <div key={item.id} className="px-5 py-3 flex items-start gap-3">
              {item.productImageUri && (
                <img
                  src={item.productImageUri}
                  alt={item.productName}
                  className="w-12 h-12 rounded-lg object-cover bg-gray-100 shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {item.productName}
                  {item.isExchangeReturn && (
                    <span className="text-[10px] ml-1 text-orange-600 font-semibold">(Trả lại)</span>
                  )}
                </p>
                <p className="text-xs text-muted">
                  {[item.productColor, item.productSize].filter(Boolean).join(" | ")}
                  {item.productSku ? ` - ${item.productSku}` : ""}
                </p>
                {item.isGift && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-pink-50 text-pink-600 inline-block mt-0.5">
                    Quà tặng
                  </span>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-gray-900">
                  {item.isGift ? "Tặng" : formatVND(item.unitPrice * item.quantity)}
                </p>
                <p className="text-xs text-muted">x{item.quantity}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      </div>{/* end left column */}

      {/* Right column: totals + actions */}
      <div className="lg:col-span-2 space-y-4 lg:sticky lg:top-4 lg:self-start">

      {/* Totals */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-2">
        <h3 className="text-sm font-bold text-gray-900 pb-1">Tổng tiền</h3>
        <div className="flex justify-between text-sm">
          <span className="text-muted">Tạm tính</span>
          <span>{formatVND(order.subtotal)}</span>
        </div>
        {order.discountAmount > 0 && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-muted">
                Giảm giá {order.discountType === "percent" ? `(${order.discountValue}%)` : ""}
              </span>
              <span className="text-red-500">-{formatVND(order.discountAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Giá sau giảm</span>
              <span className="text-green-600 font-semibold">{formatVND(Math.max(0, order.subtotal - order.discountAmount))}</span>
            </div>
          </>
        )}
        {order.shippingFee > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted">Phí vận chuyển</span>
            <span>{formatVND(order.shippingFee)}</span>
          </div>
        )}
        {order.exchangeCost > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted">Phí đổi hàng</span>
            <span>{formatVND(order.exchangeCost)}</span>
          </div>
        )}
        {order.deposit > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted">Khách cọc</span>
            <span className="text-green-600">-{formatVND(order.deposit)}</span>
          </div>
        )}
        {order.platformFeeAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted">Phí nền tảng</span>
            <span className="text-orange-500">-{formatVND(order.platformFeeAmount)}</span>
          </div>
        )}
        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
          <span className="font-bold text-gray-900">Tổng cộng</span>
          <span className="text-xl font-bold text-primary">{formatVND(displayTotal)}</span>
        </div>
        {order.deposit > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted">Còn thu hộ (COD)</span>
            <span className="font-semibold">{formatVND(Math.max(0, displayTotal - order.deposit))}</span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="space-y-3">
        {isDraft && (
          <button
            onClick={() => {
              if (order.items.length === 0) {
                alert("Vui lòng thêm sản phẩm trước khi xác nhận");
                return;
              }
              setPaymentConfirmOpen(true);
            }}
            disabled={actionLoading}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-hover disabled:opacity-50 shadow-sm"
          >
            Xác nhận đơn hàng
          </button>
        )}

        {canAdvance && (
          <button
            onClick={handleAdvanceStatus}
            disabled={actionLoading}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-hover disabled:opacity-50 shadow-sm"
          >
            {actionLoading ? "Đang xử lý..." : NEXT_STATUS_LABEL[order.status]}
          </button>
        )}

        {order.isWaiting && order.status === "confirmed" && (
          <button
            onClick={async () => {
              if (!confirm("Xác nhận hoàn tất chờ đơn hàng này?")) return;
              setActionLoading(true);
              try {
                await orderService.confirmWaiting([id]);
                await load();
              } catch {
                alert("Không thể xác nhận");
              } finally {
                setActionLoading(false);
              }
            }}
            disabled={actionLoading}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 disabled:opacity-50 shadow-sm"
          >
            Xác nhận hoàn tất (chờ)
          </button>
        )}

        {canEdit && (
          <button
            onClick={handleEdit}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-primary border-2 border-primary hover:bg-blue-50"
          >
            Chỉnh sửa đơn hàng
          </button>
        )}

        {isDraft && (
          <button
            onClick={handleDelete}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-red-500 border-2 border-red-200 hover:bg-red-50"
          >
            Xóa đơn hàng
          </button>
        )}

        {canCancel && (
          <button
            onClick={handleCancel}
            disabled={actionLoading}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-red-500 border-2 border-red-200 hover:bg-red-50 disabled:opacity-50"
          >
            Hủy đơn hàng
          </button>
        )}
      </div>

      </div>{/* end right column */}
      </div>{/* end grid */}

      {/* Payment confirmation modal (for draft -> confirmed) */}
      <Modal open={paymentConfirmOpen} onClose={() => setPaymentConfirmOpen(false)} title="Chọn phương thức thanh toán">
        <div className="space-y-3 pt-2">
          <button
            onClick={() => handleConfirmOrder("cod")}
            className="w-full py-3.5 rounded-xl text-sm font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
          >
            COD - Thu hộ khi nhận hàng
          </button>
          <button
            onClick={() => handleConfirmOrder("paid")}
            className="w-full py-3.5 rounded-xl text-sm font-bold bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
          >
            Đã thanh toán trước
          </button>
        </div>
      </Modal>

      {/* Change payment modal */}
      <Modal open={changePaymentOpen} onClose={() => setChangePaymentOpen(false)} title="Đổi phương thức thanh toán">
        <div className="space-y-3 pt-2">
          <button
            onClick={() => handleChangePayment("cod")}
            className={`w-full py-3.5 rounded-xl text-sm font-bold border ${
              order.paymentMethod === "cod" ? "bg-amber-100 border-amber-300 text-amber-800" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
            }`}
          >
            COD
          </button>
          <button
            onClick={() => handleChangePayment("paid")}
            className={`w-full py-3.5 rounded-xl text-sm font-bold border ${
              order.paymentMethod === "paid" ? "bg-green-100 border-green-300 text-green-800" : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
            }`}
          >
            Đã thanh toán
          </button>
        </div>
      </Modal>

      {/* Menu modal */}
      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="Thao tác">
        <div className="space-y-2 pt-1">
          <button
            onClick={handleCapture}
            className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700"
          >
            📸 Chụp ảnh đơn hàng
          </button>
          <button
            onClick={handleCopy}
            className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700"
          >
            📋 Sao chép thông tin đơn hàng
          </button>
          {canEdit && (
            <button
              onClick={() => { setMenuOpen(false); handleEdit(); }}
              className="w-full text-left px-4 py-3 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700"
            >
              ✏️ Chỉnh sửa đơn hàng
            </button>
          )}
          {order.exchangeFromOrderId && (
            <Link
              href={`/orders/${order.exchangeFromOrderId}`}
              onClick={() => setMenuOpen(false)}
              className="block w-full text-left px-4 py-3 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700"
            >
              🔗 Xem đơn gốc
            </Link>
          )}
          {order.exchangeOrderId && (
            <Link
              href={`/orders/${order.exchangeOrderId}`}
              onClick={() => setMenuOpen(false)}
              className="block w-full text-left px-4 py-3 rounded-lg hover:bg-gray-50 text-sm font-medium text-gray-700"
            >
              🔗 Xem đơn đổi hàng
            </Link>
          )}
        </div>
      </Modal>

      {/* Capturing overlay */}
      {capturing && (
        <div className="fixed inset-0 bg-white/80 z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium text-gray-600">Đang chụp ảnh...</p>
          </div>
        </div>
      )}
    </div>
  );
}
