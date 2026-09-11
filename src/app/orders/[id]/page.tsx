"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { OrderStatusBadge, getStatusLabel } from "@/components/ui/OrderStatusBadge";
import { Modal } from "@/components/ui/Modal";
import { orderService } from "@/services/orderService";
import { inventoryService } from "@/services/inventoryService";
import { settingsService } from "@/services/settingsService";
import { productService } from "@/services/productService";
import { AppSettings, OrderItem, OrderStatus, OrderWithItems, PaymentMethod, Product } from "@/types";
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

function parseNumber(s: string): number {
  return parseInt(s.replace(/[^\d]/g, ''), 10) || 0;
}

function formatInputNumber(s: string): string {
  const n = parseNumber(s);
  return n > 0 ? n.toLocaleString('vi-VN') : s;
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

  // Exchange flow states
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [exchangeStep, setExchangeStep] = useState<0 | 1 | 2 | 3>(0);
  const [exchangeOldItems, setExchangeOldItems] = useState<Set<string>>(new Set());
  const [exchangeNewProducts, setExchangeNewProducts] = useState<{ product: Product; selectedSize?: string }[]>([]);
  const [exchangeCostInput, setExchangeCostInput] = useState('');
  const [exchangeCreating, setExchangeCreating] = useState(false);
  const [capturedOldItemsTotal, setCapturedOldItemsTotal] = useState(0);
  const [capturedOldItemsData, setCapturedOldItemsData] = useState<OrderItem[]>([]);
  const [exchangeableItemIds, setExchangeableItemIds] = useState<Set<string>>(new Set());
  // Product picker for exchange step 2
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productsLoading, setProductsLoading] = useState(false);

  const load = useCallback(async () => {
    const data = await orderService.getById(id);
    setOrder(data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const unsub = orderService.subscribeToOrder(id, (updated) => {
      if (updated) setOrder(updated);
    });
    return () => unsub();
  }, [id]);

  // Load settings for exchange
  useEffect(() => {
    settingsService.get().then(setAppSettings);
  }, []);

  // Load exchangeable item IDs
  const canExchange = !!(appSettings?.exchangeEnabled &&
    order &&
    ['shipped', 'completed'].includes(order.status) &&
    appSettings.exchangeCategoryIds.length > 0);

  useEffect(() => {
    if (!canExchange || !order) return;
    const loadCategories = async () => {
      const ids = new Set<string>();
      for (const item of order.items) {
        const product = await productService.getById(item.productId);
        if (product?.categoryId && appSettings!.exchangeCategoryIds.includes(product.categoryId)) {
          ids.add(item.id);
        }
      }
      setExchangeableItemIds(ids);
    };
    loadCategories();
  }, [canExchange, order?.items.length]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const orderItems = await orderService.getItems(id);
      const { success, outOfStockProductIds } = await inventoryService.deductStock(orderItems);

      if (!success) {
        const removedIds = await inventoryService.removeOutOfStockItems(id);
        const updatedItems = orderItems.filter((i) => !removedIds.includes(i.id));

        if (updatedItems.length === 0) {
          alert("Tất cả sản phẩm đã hết hàng. Không thể xác nhận đơn hàng.");
          setActionLoading(false);
          return;
        }
        const retry = await inventoryService.deductStock(updatedItems);
        if (!retry.success) {
          alert("Không đủ tồn kho để xác nhận. Vui lòng kiểm tra lại.");
          setActionLoading(false);
          return;
        }
        const removedNames = order.items
          .filter((i) => outOfStockProductIds.includes(i.productId))
          .map((i) => i.productName)
          .join(", ");
        alert(`Đã xác nhận. Một số sản phẩm hết hàng đã bị xóa: ${removedNames}`);
      }

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

      const now = Date.now();
      await orderService.updateStatus(id, "confirmed", {
        paymentMethod: method,
        confirmedAt: now,
      });

      const deductedItems = order.items
        .filter((i) => !i.isGift)
        .map((i) => ({ productId: i.productId, productName: i.productName }));
      await inventoryService.cleanupDraftOrdersForProducts(id, deductedItems);

      const creationDay = new Date(order.createdAt).toDateString();
      const confirmDay = new Date(now).toDateString();
      if (creationDay !== confirmDay) {
        await orderService.updateCreatedAt(id, now);
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
    setActionLoading(true);
    try {
      await orderService.delete(id);
      router.push("/orders");
    } catch {
      alert("Không thể xóa đơn hàng");
    } finally {
      setActionLoading(false);
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
        await navigator.share({ files: [file] });
      } else if ("showSaveFilePicker" in window) {
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
    setActionLoading(true);
    try {
      const currentEditor = await orderService.checkEditingBy(id);
      if (currentEditor) {
        alert("Đơn hàng đang được chỉnh sửa trên thiết bị khác. Vui lòng thử lại sau.");
        return;
      }
      router.push(`/orders/create?editId=${id}`);
    } finally {
      setActionLoading(false);
    }
  };

  // === Exchange handlers ===
  const startExchange = () => {
    setMenuOpen(false);
    setExchangeOldItems(new Set());
    setExchangeNewProducts([]);
    setExchangeCostInput('');
    setCapturedOldItemsTotal(0);
    setCapturedOldItemsData([]);
    setExchangeStep(1);
  };

  const toggleExchangeItem = (itemId: string) => {
    setExchangeOldItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleExchangeStep1Confirm = () => {
    if (exchangeOldItems.size === 0 || !order) return;
    const selectedItems = order.items.filter((i) => exchangeOldItems.has(i.id));
    setCapturedOldItemsTotal(selectedItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0));
    setCapturedOldItemsData(selectedItems);
    // Load products for step 2
    setProductsLoading(true);
    productService.getAll().then((products) => {
      if (appSettings?.exchangeCategoryIds.length) {
        setAllProducts(products.filter((p) => p.categoryId && appSettings.exchangeCategoryIds.includes(p.categoryId)));
      } else {
        setAllProducts(products);
      }
      setProductsLoading(false);
    });
    setExchangeStep(2);
  };

  const toggleNewProduct = (product: Product) => {
    setExchangeNewProducts((prev) => {
      const exists = prev.find((e) => e.product.id === product.id);
      if (exists) return prev.filter((e) => e.product.id !== product.id);
      return [...prev, { product }];
    });
  };

  const setExchangeProductSize = (productId: string, sizeName: string) => {
    setExchangeNewProducts((prev) =>
      prev.map((e) => e.product.id === productId ? { ...e, selectedSize: sizeName } : e),
    );
  };

  const getExchangeItemPrice = (entry: { product: Product; selectedSize?: string }) => {
    if (entry.selectedSize) {
      return entry.product.sizes?.find((s) => s.name === entry.selectedSize)?.price ?? entry.product.price;
    }
    return entry.product.price;
  };

  const newItemsTotal = exchangeNewProducts.reduce((s, e) => s + getExchangeItemPrice(e), 0);
  const priceDiff = newItemsTotal - capturedOldItemsTotal;

  const handleExchangeConfirm = async () => {
    if (!order || exchangeNewProducts.length === 0 || capturedOldItemsData.length === 0) return;
    setExchangeCreating(true);
    try {
      // 1. Remove old items from main order
      await orderService.removeItemsFromOrder(order.id, [...exchangeOldItems]);

      // 2. Create exchange order
      const exchangeCost = parseNumber(exchangeCostInput);
      const exchangeOrderId = await orderService.createExchangeOrder(
        order.id,
        { customerName: order.customerName, customerPhone: order.customerPhone, customerAddress: order.customerAddress, notes: order.notes, paymentMethod: order.paymentMethod },
        capturedOldItemsData.map((i) => ({ id: i.id, productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice, productName: i.productName, productColor: i.productColor, productSize: i.productSize, productImageUri: i.productImageUri, costPrice: i.costPrice })),
        exchangeNewProducts.map((e) => {
          const price = getExchangeItemPrice(e);
          return { productId: e.product.id, quantity: 1, unitPrice: price, productName: e.product.name, productColor: e.product.color, productSize: e.selectedSize || e.product.size, productImageUri: e.product.imageUri, costPrice: e.product.costPrice, selectedSize: e.selectedSize };
        }),
        exchangeCost,
        priceDiff,
      );

      // 3. Deduct stock for new items
      const newOrderItems = exchangeNewProducts.map((e) => {
        const price = getExchangeItemPrice(e);
        return {
          id: '', orderId: exchangeOrderId, productId: e.product.id, quantity: 1,
          unitPrice: price, originalUnitPrice: price, isGift: false,
          createdAt: Date.now(), productName: e.product.name, productSku: e.product.sku,
          productColor: e.product.color, productSize: e.selectedSize || e.product.size, productImageUri: e.product.imageUri,
          currentStock: 0, costPrice: e.product.costPrice, isExchangeReturn: false,
          selectedSize: e.selectedSize,
        };
      });
      const { success } = await inventoryService.deductStock(newOrderItems);
      if (!success) {
        // Rollback: cancel exchange to restore old items to main order
        await inventoryService.restoreStock(newOrderItems);
        await orderService.cancelExchange(exchangeOrderId);
        alert("Không đủ tồn kho cho sản phẩm mới. Đơn đổi đã bị hủy.");
        await load();
        return;
      }

      setExchangeStep(0);
      alert("Đã tạo đơn đổi hàng thành công!");
      router.push(`/orders/${exchangeOrderId}`);
    } catch {
      alert("Không thể tạo đơn đổi hàng");
    } finally {
      setExchangeCreating(false);
    }
  };

  const handleExchangeReceived = async () => {
    if (!order) return;
    if (!confirm("Xác nhận đã nhận hàng đổi từ khách?")) return;
    setActionLoading(true);
    try {
      const returnedItems = order.items.filter((i) => i.isExchangeReturn);
      if (returnedItems.length > 0) {
        await inventoryService.restoreStock(returnedItems, true);
      }
      await orderService.updateStatus(order.id, 'preparing');
      await load();
    } catch {
      alert("Không thể cập nhật trạng thái");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelExchange = async () => {
    if (!order?.exchangeFromOrderId) return;
    if (!confirm("Sản phẩm cũ sẽ được trả về đơn gốc. Bạn có chắc chắn?")) return;
    setActionLoading(true);
    try {
      // Restore stock for new items
      const newItems = order.items.filter((i) => !i.isExchangeReturn);
      if (newItems.length > 0) {
        await inventoryService.restoreStock(newItems);
      }
      await orderService.cancelExchange(order.id);
      router.push("/orders");
    } catch {
      alert("Không thể hủy đổi hàng");
    } finally {
      setActionLoading(false);
    }
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
  const isExchangeOrder = !!order.exchangeFromOrderId;

  const filteredProducts = productSearch.trim()
    ? allProducts.filter((p) =>
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.sku.toLowerCase().includes(productSearch.toLowerCase())
      )
    : allProducts;

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

        {isExchangeOrder && (
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
                  {isExchangeOrder && !item.isExchangeReturn && (
                    <span className="text-[10px] ml-1 text-green-600 font-semibold">(Mới)</span>
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
      {isExchangeOrder ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-2">
          <h3 className="text-sm font-bold text-purple-700 pb-1">Chi phí đổi hàng</h3>
          {order.exchangePriceDiff !== 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-purple-600">Chênh lệch đổi hàng</span>
              <span className="text-purple-600 font-semibold">
                {order.exchangePriceDiff >= 0 ? '+' : ''}{formatVND(order.exchangePriceDiff)}
              </span>
            </div>
          )}
          {order.exchangeCost > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-purple-600">Chi phí đổi trả</span>
              <span className="text-purple-600 font-semibold">{formatVND(order.exchangeCost)}</span>
            </div>
          )}
          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            <span className="font-bold text-purple-700">Chi phí báo khách</span>
            <span className="text-xl font-bold text-purple-700">{formatVND(displayTotal)}</span>
          </div>
        </div>
      ) : (
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
      )}

      {/* Action buttons */}
      <div className="space-y-3">
        {/* Exchange order: cancel + receive */}
        {isExchangeOrder && ['confirmed', 'preparing'].includes(order.status) && (
          <button
            onClick={handleCancelExchange}
            disabled={actionLoading}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-red-500 border-2 border-red-200 hover:bg-red-50 disabled:opacity-50"
          >
            Hủy đổi hàng
          </button>
        )}

        {isExchangeOrder && order.status === 'confirmed' ? (
          <button
            onClick={handleExchangeReceived}
            disabled={actionLoading}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 shadow-sm"
          >
            {actionLoading ? "Đang xử lý..." : "Đã nhận hàng đổi"}
          </button>
        ) : (
          <>
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
          </>
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
            disabled={actionLoading}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-primary border-2 border-primary hover:bg-blue-50 disabled:opacity-50"
          >
            Chỉnh sửa đơn hàng
          </button>
        )}

        {isDraft && (
          <button
            onClick={handleDelete}
            disabled={actionLoading}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-red-500 border-2 border-red-200 hover:bg-red-50 disabled:opacity-50"
          >
            Xóa đơn hàng
          </button>
        )}

        {!isExchangeOrder && canCancel && (
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

      {/* Payment confirmation modal */}
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
          {canExchange && exchangeableItemIds.size > 0 && (
            <button
              onClick={startExchange}
              className="w-full text-left px-4 py-3 rounded-lg hover:bg-purple-50 text-sm font-medium text-purple-700"
            >
              🔄 Đổi sản phẩm
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

      {/* Exchange Step 1: Select items to exchange */}
      <Modal open={exchangeStep === 1} onClose={() => setExchangeStep(0)} title="Chọn sản phẩm muốn đổi">
        <div className="space-y-3 pt-2">
          <p className="text-xs text-muted">Chọn sản phẩm trong đơn hàng mà bạn muốn đổi</p>
          <div className="max-h-[300px] overflow-y-auto space-y-1">
            {order.items.filter((i) => exchangeableItemIds.has(i.id)).map((item) => {
              const selected = exchangeOldItems.has(item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => toggleExchangeItem(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-3 rounded-lg border transition-colors ${
                    selected ? "bg-orange-50 border-orange-300" : "bg-white border-gray-100 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {item.productImageUri && (
                      <img src={item.productImageUri} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    )}
                    <div className="text-left min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {item.productName}{item.productColor ? ` (${item.productColor})` : ''}
                      </p>
                      <p className="text-xs text-muted">x{item.quantity} · {formatVND(item.unitPrice * item.quantity)}</p>
                    </div>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    selected ? "border-orange-500 bg-orange-500" : "border-gray-300"
                  }`}>
                    {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                </button>
              );
            })}
          </div>
          <button
            onClick={handleExchangeStep1Confirm}
            disabled={exchangeOldItems.size === 0}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-white bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Tiếp tục — Chọn sản phẩm mới ({exchangeOldItems.size} đã chọn)
          </button>
        </div>
      </Modal>

      {/* Exchange Step 2: Pick new products */}
      <Modal open={exchangeStep === 2} onClose={() => setExchangeStep(1)} title="Chọn sản phẩm mới">
        <div className="space-y-3 pt-2">
          <input
            type="text"
            placeholder="Tìm sản phẩm..."
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          {productsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto space-y-1">
              {filteredProducts.filter((p) => p.stock > 0).map((product) => {
                const entry = exchangeNewProducts.find((e) => e.product.id === product.id);
                const selected = !!entry;
                const hasSizes = (product.sizes ?? []).length > 0;
                return (
                  <div key={product.id}>
                    <button
                      onClick={() => toggleNewProduct(product)}
                      className={`w-full flex items-center justify-between px-3 py-3 rounded-lg border transition-colors ${
                        selected ? "bg-green-50 border-green-300" : "bg-white border-gray-100 hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {product.imageUri && (
                          <img src={product.imageUri} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                        )}
                        <div className="text-left min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {product.name}{product.color ? ` (${product.color})` : ''}
                          </p>
                          <p className="text-xs text-muted">{product.sku} · {formatVND(product.price)} · Kho: {product.stock}</p>
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        selected ? "border-green-500 bg-green-500" : "border-gray-300"
                      }`}>
                        {selected && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                    </button>
                    {selected && hasSizes && (
                      <div className="px-3 pb-2 mt-1">
                        <select
                          value={entry?.selectedSize ?? ""}
                          onChange={(e) => setExchangeProductSize(product.id, e.target.value)}
                          className={`w-full text-xs font-medium rounded-lg px-2.5 py-1.5 border transition-colors appearance-none bg-no-repeat bg-[length:12px] bg-[right_8px_center] ${
                            entry?.selectedSize
                              ? "bg-green-50 text-green-700 border-green-500"
                              : "bg-gray-50 text-gray-500 border-amber-400"
                          }`}
                          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")` }}
                        >
                          <option value="" disabled>Chọn size...</option>
                          {product.sizes.filter((s) => s.stock > 0).map((s) => (
                            <option key={s.name} value={s.name}>
                              {s.name} — tồn: {s.stock} — {formatVND(s.price)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <button
            onClick={() => {
              if (exchangeNewProducts.length === 0) return;
              const missingSize = exchangeNewProducts.find((e) => (e.product.sizes ?? []).length > 0 && !e.selectedSize);
              if (missingSize) {
                alert(`Vui lòng chọn size cho "${missingSize.product.name}"`);
                return;
              }
              setExchangeStep(3);
            }}
            disabled={exchangeNewProducts.length === 0}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Tiếp tục — Xác nhận đổi ({exchangeNewProducts.length} sản phẩm mới)
          </button>
        </div>
      </Modal>

      {/* Exchange Step 3: Confirm */}
      <Modal open={exchangeStep === 3} onClose={() => setExchangeStep(0)} title="Xác nhận đổi sản phẩm">
        <div className="space-y-4 pt-2">
          {/* Old items */}
          <div>
            <h4 className="text-sm font-bold text-red-600 mb-2">Sản phẩm trả lại</h4>
            <div className="space-y-1">
              {capturedOldItemsData.map((item) => (
                <div key={item.id} className="flex justify-between items-center bg-red-50 rounded-lg px-3 py-2">
                  <span className="text-sm text-red-700 truncate flex-1">
                    {item.productName}{item.productColor ? ` (${item.productColor})` : ''} x{item.quantity}
                  </span>
                  <span className="text-sm font-semibold text-red-600 shrink-0 ml-2">
                    -{formatVND(item.unitPrice * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* New items */}
          <div>
            <h4 className="text-sm font-bold text-green-600 mb-2">Sản phẩm mới</h4>
            <div className="space-y-1">
              {exchangeNewProducts.map((e) => (
                <div key={e.product.id} className="flex justify-between items-center bg-green-50 rounded-lg px-3 py-2">
                  <span className="text-sm text-green-700 truncate flex-1">
                    {e.product.name}{e.product.color ? ` (${e.product.color})` : ''}{e.selectedSize ? ` - ${e.selectedSize}` : ''}
                  </span>
                  <span className="text-sm font-semibold text-green-600 shrink-0 ml-2">
                    +{formatVND(getExchangeItemPrice(e))}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Exchange cost input */}
          <div>
            <label className="text-sm font-bold text-purple-700 block mb-1">Chi phí đổi trả</label>
            <div className="relative">
              <input
                type="text"
                placeholder="0"
                value={formatInputNumber(exchangeCostInput)}
                onChange={(e) => setExchangeCostInput(e.target.value.replace(/[^\d]/g, ''))}
                className="w-full px-3 py-2.5 rounded-lg border border-purple-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">₫</span>
            </div>
          </div>

          {/* Summary */}
          <div className="bg-purple-50 rounded-lg p-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-purple-600">Chênh lệch</span>
              <span className="font-semibold text-purple-700">{priceDiff >= 0 ? '+' : ''}{formatVND(priceDiff)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-purple-600">Chi phí đổi trả</span>
              <span className="font-semibold text-purple-700">{formatVND(parseNumber(exchangeCostInput))}</span>
            </div>
            <div className="flex justify-between text-sm pt-1 border-t border-purple-200">
              <span className="font-bold text-purple-700">Chi phí báo khách</span>
              <span className="font-bold text-purple-700">{formatVND(priceDiff + parseNumber(exchangeCostInput))}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setExchangeStep(0)}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-gray-600 border-2 border-gray-200 hover:bg-gray-50"
            >
              Hủy
            </button>
            <button
              onClick={handleExchangeConfirm}
              disabled={exchangeCreating}
              className="flex-1 py-3 rounded-xl text-sm font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50"
            >
              {exchangeCreating ? "Đang xử lý..." : "Xác nhận đổi"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Action loading overlay */}
      {actionLoading && (
        <div className="fixed inset-0 bg-black/20 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-lg px-6 py-5 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium text-gray-600">Đang xử lý...</p>
          </div>
        </div>
      )}

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
