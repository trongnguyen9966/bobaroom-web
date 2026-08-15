"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ProductPickerModal } from "@/components/orders/ProductPickerModal";
import { orderService } from "@/services/orderService";
import {
  DiscountType,
  OrderType,
  PaymentMethod,
  PlatformFeeType,
  Product,
} from "@/types";
import { formatInputNumber, formatVND, parseNumber } from "@/utils/currency";

interface DraftItem {
  product: Product;
  quantity: number;
  isGift: boolean;
}

const ORDER_TYPES: { value: OrderType; label: string }[] = [
  { value: "normal", label: "Đơn Thường" },
  { value: "tiktok", label: "TikTok" },
  { value: "shopee", label: "Shopee" },
];

function CreateOrderForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("editId");

  const [orderCode, setOrderCode] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [shippingFee, setShippingFee] = useState("");
  const [orderType, setOrderType] = useState<OrderType>("normal");
  const [platformFeeType, setPlatformFeeType] = useState<PlatformFeeType>("percent");
  const [platformFeeValue, setPlatformFeeValue] = useState("");
  const [deposit, setDeposit] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!editId);

  // Load existing order for edit mode
  useEffect(() => {
    if (!editId) return;
    (async () => {
      const order = await orderService.getById(editId);
      if (!order) {
        router.push("/orders");
        return;
      }
      setOrderCode(order.orderCode ?? "");
      setCustomerName(order.customerName);
      setCustomerPhone(order.customerPhone);
      setCustomerAddress(order.customerAddress);
      setNotes(order.notes);
      setDiscountType(order.discountType);
      setDiscountValue(order.discountValue > 0 ? String(order.discountValue) : "");
      setShippingFee(order.shippingFee > 0 ? String(order.shippingFee) : "");
      setOrderType(order.orderType);
      setPlatformFeeType(order.platformFeeType);
      setPlatformFeeValue(order.platformFeeValue > 0 ? String(order.platformFeeValue) : "");
      setDeposit(order.deposit > 0 ? String(order.deposit) : "");
      setItems(
        order.items.map((i) => ({
          product: {
            id: i.productId,
            name: i.productName,
            sku: i.productSku,
            color: i.productColor,
            size: i.productSize,
            categoryId: null,
            categoryName: null,
            qrCode: null,
            imageUri: i.productImageUri,
            price: i.unitPrice,
            costPrice: i.costPrice,
            stock: i.currentStock,
            createdAt: 0,
            updatedAt: 0,
          },
          quantity: i.quantity,
          isGift: i.isGift,
        })),
      );
      setLoading(false);
    })();
  }, [editId, router]);

  const handleAddProduct = (product: Product) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { product, quantity: 1, isGift: false }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((i) =>
          i.product.id === productId
            ? { ...i, quantity: Math.max(0, i.quantity + delta) }
            : i,
        )
        .filter((i) => i.quantity > 0),
    );
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const toggleGift = (productId: string) => {
    setItems((prev) =>
      prev.map((i) =>
        i.product.id === productId ? { ...i, isGift: !i.isGift } : i,
      ),
    );
  };

  // Calculations
  const subtotal = items
    .filter((i) => !i.isGift)
    .reduce((s, i) => s + i.product.price * i.quantity, 0);
  const discountAmount =
    discountType === "percent"
      ? subtotal * (parseNumber(discountValue) / 100)
      : parseNumber(discountValue);
  const shippingFeeNum = parseNumber(shippingFee);
  const total = Math.max(0, subtotal - discountAmount) + shippingFeeNum;
  const depositNum = parseNumber(deposit);
  const platformFeeNum = parseNumber(platformFeeValue);

  const handleSave = async () => {
    if (!customerName.trim()) {
      alert("Vui lòng nhập tên khách hàng");
      return;
    }

    setSaving(true);
    try {
      const data = {
        orderCode: orderCode.trim() || undefined,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        notes: notes.trim(),
        discountType,
        discountValue: parseNumber(discountValue),
        shippingFee: shippingFeeNum,
        orderType,
        platformFeeType,
        platformFeeValue: platformFeeNum,
        deposit: depositNum,
        items: items.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
          unitPrice: i.product.price,
          isGift: i.isGift,
          productName: i.product.name,
          productSku: i.product.sku,
          productColor: i.product.color,
          productSize: i.product.size,
          productImageUri: i.product.imageUri,
          costPrice: i.product.costPrice,
        })),
      };

      if (editId) {
        await orderService.update(editId, data);
        router.push(`/orders/${editId}`);
      } else {
        const order = await orderService.create(data);
        router.push(`/orders/${order.id}`);
      }
    } catch (e) {
      alert("Không thể lưu đơn hàng");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 pb-24 lg:pb-8 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="text-sm text-muted hover:text-gray-700">
          ← Quay lại
        </button>
        <h1 className="text-lg font-bold text-gray-900">
          {editId ? "Chỉnh sửa đơn hàng" : "Tạo đơn hàng mới"}
        </h1>
        <div className="w-16" />
      </div>

      {/* Customer info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900">Thông tin khách hàng</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted font-medium">Mã đơn</label>
            <input
              value={orderCode}
              onChange={(e) => setOrderCode(e.target.value)}
              placeholder="Mã đơn hàng (tùy chọn)"
              className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs text-muted font-medium">Tên khách hàng *</label>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Tên khách hàng"
              className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <div>
            <label className="text-xs text-muted font-medium">Số điện thoại</label>
            <input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Số điện thoại"
              type="tel"
              className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-muted font-medium">Địa chỉ</label>
            <input
              value={customerAddress}
              onChange={(e) => setCustomerAddress(e.target.value)}
              placeholder="Địa chỉ giao hàng"
              className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-muted font-medium">Ghi chú</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ghi chú cho đơn hàng..."
              rows={2}
              className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
            />
          </div>
        </div>
      </div>

      {/* Order type */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900">Loại đơn</h3>
        <div className="flex gap-2">
          {ORDER_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setOrderType(t.value)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                orderType === t.value
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {orderType !== "normal" && (
          <div className="flex items-center gap-2 mt-2">
            <label className="text-xs text-muted font-medium">Phí nền tảng</label>
            <div className="flex gap-1">
              {(["percent", "vnd"] as PlatformFeeType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setPlatformFeeType(t)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold ${
                    platformFeeType === t ? "bg-primary text-white" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {t === "percent" ? "%" : "VND"}
                </button>
              ))}
            </div>
            <input
              value={platformFeeValue}
              onChange={(e) => setPlatformFeeValue(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="0"
              className="w-24 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        )}
      </div>

      {/* Products */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">Sản phẩm ({items.length})</h3>
          <button
            onClick={() => setPickerVisible(true)}
            className="text-xs font-semibold text-primary hover:underline"
          >
            + Thêm sản phẩm
          </button>
        </div>

        {items.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-muted">Chưa có sản phẩm nào</p>
            <button
              onClick={() => setPickerVisible(true)}
              className="mt-2 text-sm font-semibold text-primary hover:underline"
            >
              Thêm sản phẩm
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {items.map((item) => (
              <div key={item.product.id} className="px-5 py-3 flex items-start gap-3">
                {item.product.imageUri ? (
                  <img
                    src={item.product.imageUri}
                    alt={item.product.name}
                    className="w-10 h-10 rounded-lg object-cover bg-gray-100 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                    <span className="text-gray-400 text-xs">📦</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.product.name}</p>
                  <p className="text-xs text-muted">
                    {[item.product.color, item.product.size].filter(Boolean).join(" | ")}
                  </p>
                  <p className="text-xs text-primary font-semibold mt-0.5">
                    {item.isGift ? "Quà tặng" : formatVND(item.product.price)}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <div className="flex items-center border border-gray-200 rounded-lg">
                      <button
                        onClick={() => updateQuantity(item.product.id, -1)}
                        className="px-2.5 py-1 text-gray-500 hover:bg-gray-50 text-sm"
                      >
                        -
                      </button>
                      <span className="px-2 text-sm font-semibold min-w-[24px] text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.product.id, 1)}
                        className="px-2.5 py-1 text-gray-500 hover:bg-gray-50 text-sm"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => toggleGift(item.product.id)}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        item.isGift
                          ? "bg-pink-100 text-pink-600"
                          : "bg-gray-100 text-gray-400 hover:bg-pink-50 hover:text-pink-500"
                      }`}
                    >
                      {item.isGift ? "✓ Quà tặng" : "Tặng"}
                    </button>
                    <button
                      onClick={() => removeItem(item.product.id)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Xóa
                    </button>
                  </div>
                </div>
                <span className="text-sm font-semibold text-gray-900 shrink-0">
                  {item.isGift ? "-" : formatVND(item.product.price * item.quantity)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pricing */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900">Chi phí</h3>

        {/* Discount */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted font-medium w-20">Giảm giá</label>
          <div className="flex gap-1">
            {(["percent", "vnd"] as DiscountType[]).map((t) => (
              <button
                key={t}
                onClick={() => setDiscountType(t)}
                className={`px-2.5 py-1 rounded text-xs font-semibold ${
                  discountType === t ? "bg-primary text-white" : "bg-gray-100 text-gray-500"
                }`}
              >
                {t === "percent" ? "%" : "VND"}
              </button>
            ))}
          </div>
          <input
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="0"
            className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Shipping */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted font-medium w-20">Ship</label>
          <input
            value={shippingFee ? formatInputNumber(shippingFee) : ""}
            onChange={(e) => setShippingFee(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="0"
            className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Deposit */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted font-medium w-20">Cọc</label>
          <input
            value={deposit ? formatInputNumber(deposit) : ""}
            onChange={(e) => setDeposit(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="0"
            className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted">Tạm tính</span>
          <span>{formatVND(subtotal)}</span>
        </div>
        {discountAmount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted">Giảm giá</span>
            <span className="text-red-500">-{formatVND(discountAmount)}</span>
          </div>
        )}
        {shippingFeeNum > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted">Phí ship</span>
            <span>{formatVND(shippingFeeNum)}</span>
          </div>
        )}
        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
          <span className="font-bold text-gray-900">Tổng cộng</span>
          <span className="text-xl font-bold text-primary">{formatVND(total)}</span>
        </div>
        {depositNum > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted">Còn thu hộ (COD)</span>
            <span className="font-semibold">{formatVND(Math.max(0, total - depositNum))}</span>
          </div>
        )}
      </div>

      {/* Save button */}
      <div className="sticky bottom-0 bg-background pt-2 pb-4 lg:pb-0 safe-area-bottom">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-hover disabled:opacity-50 shadow-lg"
        >
          {saving ? "Đang lưu..." : editId ? "Cập nhật đơn hàng" : "Lưu đơn nháp"}
        </button>
      </div>

      {/* Product picker */}
      <ProductPickerModal
        open={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={handleAddProduct}
        excludeIds={[]}
      />
    </div>
  );
}

export default function CreateOrderPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <CreateOrderForm />
    </Suspense>
  );
}
