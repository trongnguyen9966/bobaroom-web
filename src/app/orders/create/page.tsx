"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ProductPickerModal } from "@/components/orders/ProductPickerModal";
import { AddressPickerModal } from "@/components/orders/AddressPickerModal";
import { AutoFillModal } from "@/components/orders/AutoFillModal";
import { orderService } from "@/services/orderService";
import { settingsService } from "@/services/settingsService";
import {
  lookupAddress,
  detectOldAddress,
  getProvinceNames,
  getWardNames,
  OldAddressWarning,
} from "@/services/addressLookupService";
import { parseCustomerText } from "@/utils/parseCustomerText";
import {
  AppSettings,
  DiscountType,
  OrderType,
  PaymentMethod,
  PlatformFeeType,
  Product,
} from "@/types";
import { formatInputNumber, formatVND, parseNumber } from "@/utils/currency";
import { generateId } from "@/utils/uuid";

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

  // Customer fields
  const [orderCode, setOrderCode] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerProvince, setCustomerProvince] = useState("");
  const [customerWard, setCustomerWard] = useState("");
  const [notes, setNotes] = useState("");
  const [oldAddressWarning, setOldAddressWarning] = useState<OldAddressWarning | null>(null);

  // Order config
  const [orderType, setOrderType] = useState<OrderType>("normal");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [shippingFee, setShippingFee] = useState("");
  const [platformFeeType, setPlatformFeeType] = useState<PlatformFeeType>("percent");
  const [platformFeeValue, setPlatformFeeValue] = useState("");
  const [deposit, setDeposit] = useState("");

  // Items
  const [items, setItems] = useState<DraftItem[]>([]);
  const [giftItems, setGiftItems] = useState<DraftItem[]>([]);

  // Modals
  const [pickerVisible, setPickerVisible] = useState(false);
  const [giftPickerVisible, setGiftPickerVisible] = useState(false);
  const [addressPickerField, setAddressPickerField] = useState<"province" | "ward" | null>(null);
  const [autoFillVisible, setAutoFillVisible] = useState(false);

  // State
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!editId);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [editingConfirmedOrder, setEditingConfirmedOrder] = useState(false);
  const sessionIdRef = useRef(generateId());

  // Load settings + default shipping fee
  useEffect(() => {
    settingsService.get().then((s) => {
      setAppSettings(s);
      if (!editId && s.defaultShippingFeeEnabled && s.defaultShippingFee > 0) {
        setShippingFee(String(s.defaultShippingFee));
      }
    });
  }, [editId]);

  // Load existing order for edit mode
  useEffect(() => {
    if (!editId) return;
    const sessionId = sessionIdRef.current;

    (async () => {
      const order = await orderService.getById(editId);
      if (!order) {
        router.push("/orders");
        return;
      }
      await orderService.setEditingBy(editId, sessionId);
      setOrderCode(order.orderCode ?? "");
      setCustomerName(order.customerName);
      setCustomerPhone(order.customerPhone);
      setCustomerAddress(order.customerAddress);
      setCustomerProvince(order.customerProvince ?? "");
      setCustomerWard(order.customerWard ?? "");
      setNotes(order.notes);
      setDiscountType(order.discountType);
      setDiscountValue(order.discountValue > 0 ? String(order.discountValue) : "");
      setShippingFee(order.shippingFee > 0 ? String(order.shippingFee) : "");
      if (order.paymentMethod) setPaymentMethod(order.paymentMethod);
      if (order.status !== "draft") setEditingConfirmedOrder(true);
      setOrderType(order.orderType ?? "normal");
      setPlatformFeeType(order.platformFeeType ?? "percent");
      setPlatformFeeValue(order.platformFeeValue > 0 ? String(order.platformFeeValue) : "");
      setDeposit(order.deposit > 0 ? String(order.deposit) : "");
      const allItems = order.items.map((i) => ({
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
        } as Product,
        quantity: i.quantity,
        isGift: i.isGift,
      }));
      setItems(allItems.filter((i) => !i.isGift));
      setGiftItems(allItems.filter((i) => i.isGift));
      setLoading(false);
    })();

    const handleBeforeUnload = () => {
      orderService.clearEditingBy(editId, sessionId);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      orderService.clearEditingBy(editId, sessionId);
    };
  }, [editId, router]);

  // Handlers
  const handlePickerConfirm = (selections: { product: Product; quantity: number }[]) => {
    setItems(selections.map((s) => ({ product: s.product, quantity: s.quantity, isGift: false })));
  };

  const handleGiftPickerConfirm = (selections: { product: Product; quantity: number }[]) => {
    setGiftItems(selections.map((s) => ({ product: s.product, quantity: s.quantity, isGift: true })));
  };

  const updateQuantity = (productId: string, delta: number) => {
    setItems((prev) =>
      prev.map((i) => i.product.id === productId ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i),
    );
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const updateGiftQuantity = (productId: string, delta: number) => {
    setGiftItems((prev) =>
      prev.map((i) => i.product.id === productId ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i),
    );
  };

  const removeGiftItem = (productId: string) => {
    setGiftItems((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const handleAutoFill = (text: string) => {
    const result = parseCustomerText(text);
    if (result.name) setCustomerName(result.name);
    if (result.phone) setCustomerPhone(result.phone);
    if (result.address) setCustomerAddress(result.address);
    const addrSource = result.address || text;
    const addrResult = lookupAddress(addrSource);
    if (addrResult.province) setCustomerProvince(addrResult.province);
    if (addrResult.ward) setCustomerWard(addrResult.ward);
    setOldAddressWarning(detectOldAddress(addrSource));
  };

  const handleAddressChange = (text: string) => {
    setCustomerAddress(text);
    setOldAddressWarning(detectOldAddress(text));
  };

  const handleProvinceSelect = (province: string) => {
    setCustomerProvince(province);
    setCustomerWard(""); // Reset ward when province changes
    setAddressPickerField(null);
  };

  const handleWardSelect = (ward: string) => {
    setCustomerWard(ward);
    setAddressPickerField(null);
  };

  // Calculations
  const allItems = [...items, ...giftItems];
  const subtotal = items.reduce((s, i) => s + i.product.price * i.quantity, 0);
  const discountNum = parseNumber(discountValue);
  const discountAmount = discountType === "percent" ? subtotal * (discountNum / 100) : discountNum;
  const shippingNum = parseNumber(shippingFee);
  const subtotalAfterDiscount = Math.max(0, subtotal - discountAmount);

  const freeShippingQualifies = Boolean(
    appSettings?.freeShippingEnabled &&
    subtotalAfterDiscount >= (appSettings?.freeShippingThreshold ?? 0) &&
    (appSettings?.freeShippingPaymentMethod === "both" ||
     (appSettings?.freeShippingPaymentMethod === "cod" && paymentMethod === "cod") ||
     (appSettings?.freeShippingPaymentMethod === "paid" && paymentMethod !== "cod")),
  );

  const total = subtotalAfterDiscount + (freeShippingQualifies ? 0 : shippingNum);
  const depositNum = parseNumber(deposit);
  const platformFeeNum = parseNumber(platformFeeValue);
  const platformFeeAmount = platformFeeType === "percent"
    ? total * (platformFeeNum / 100)
    : platformFeeNum;
  const netRevenue = total - platformFeeAmount;

  // Price rounding for display
  const displayTotal = (appSettings?.priceRoundingEnabled && orderType === "normal")
    ? settingsService.applyRounding(total, appSettings.priceRoundingMode)
    : total;

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
        customerProvince: customerProvince.trim(),
        customerDistrict: "",
        customerWard: customerWard.trim(),
        notes: notes.trim(),
        paymentMethod,
        discountType,
        discountValue: discountNum,
        shippingFee: freeShippingQualifies ? 0 : shippingNum,
        orderType,
        platformFeeType,
        platformFeeValue: platformFeeNum,
        deposit: depositNum,
        items: allItems.map((i) => ({
          productId: i.product.id,
          quantity: i.quantity,
          unitPrice: i.isGift ? 0 : i.product.price,
          originalUnitPrice: i.isGift ? 0 : i.product.price,
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
        await orderService.clearEditingBy(editId, sessionIdRef.current);
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
        <button onClick={() => router.push("/orders")} className="text-sm text-muted hover:text-gray-700">
          ← Quay lại
        </button>
        <h1 className="text-lg font-bold text-gray-900">
          {editId ? "Chỉnh sửa đơn hàng" : "Tạo đơn hàng mới"}
        </h1>
        <div className="w-16" />
      </div>

      {/* Order type */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900">Loại đơn hàng</h3>
        <div className="flex gap-2">
          {ORDER_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setOrderType(t.value)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                orderType === t.value
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Customer info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">Thông tin khách hàng</h3>
          <button
            onClick={() => setAutoFillVisible(true)}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Tự điền
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted font-medium">Mã đơn hàng</label>
            <input
              value={orderCode}
              onChange={(e) => setOrderCode(e.target.value)}
              placeholder="VD: DH001"
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
              placeholder="0900 000 000"
              type="tel"
              className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-muted font-medium">Địa chỉ</label>
            <input
              value={customerAddress}
              onChange={(e) => handleAddressChange(e.target.value)}
              placeholder="Địa chỉ giao hàng"
              className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            {oldAddressWarning && (
              <div className="mt-2 bg-red-50 border border-red-300 rounded-lg px-3 py-2">
                <p className="text-xs font-semibold text-red-600">Địa chỉ cũ (trước sát nhập)</p>
                <p className="text-xs text-red-600 mt-0.5">{oldAddressWarning.message}</p>
                {oldAddressWarning.newProvince && (
                  <div className="bg-orange-50 rounded-md px-2 py-1.5 mt-1.5">
                    <p className="text-xs text-orange-700 font-medium">
                      Gợi ý: Tỉnh/TP mới là &quot;{oldAddressWarning.newProvince}&quot;
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-muted font-medium">Tỉnh/Thành phố</label>
            <button
              onClick={() => setAddressPickerField("province")}
              className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <span className={customerProvince ? "text-gray-900" : "text-gray-400"}>
                {customerProvince || "Chọn tỉnh/thành phố"}
              </span>
              <span className="text-gray-400 text-xs">▼</span>
            </button>
          </div>
          <div>
            <label className="text-xs text-muted font-medium">Phường/Xã/Ấp</label>
            <button
              onClick={() => customerProvince && setAddressPickerField("ward")}
              disabled={!customerProvince}
              className={`mt-1 w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-2 focus:ring-primary/20 ${!customerProvince ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <span className={customerWard ? "text-gray-900" : "text-gray-400"}>
                {customerWard || (customerProvince ? "Chọn phường/xã/ấp" : "Chọn tỉnh trước")}
              </span>
              <span className="text-gray-400 text-xs">▼</span>
            </button>
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
                    {formatVND(item.product.price)}
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
                      onClick={() => removeItem(item.product.id)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Xóa
                    </button>
                  </div>
                </div>
                <span className="text-sm font-semibold text-gray-900 shrink-0">
                  {formatVND(item.product.price * item.quantity)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gift Items */}
      {appSettings?.giftItemsEnabled && (
        <div className="bg-white rounded-xl shadow-sm border border-green-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-green-100 flex items-center justify-between bg-green-50/50">
            <h3 className="text-sm font-bold text-green-600">Quà tặng kèm ({giftItems.length})</h3>
            <button
              onClick={() => setGiftPickerVisible(true)}
              className="text-xs font-semibold text-green-600 hover:underline"
            >
              + Thêm quà tặng
            </button>
          </div>

          {giftItems.length === 0 ? (
            <div className="px-5 py-6 text-center">
              <p className="text-sm text-muted">Chưa có quà tặng</p>
              <button
                onClick={() => setGiftPickerVisible(true)}
                className="mt-1.5 text-sm font-semibold text-green-600 hover:underline"
              >
                Thêm quà tặng
              </button>
            </div>
          ) : (
            <div className="divide-y divide-green-50">
              {giftItems.map((item) => (
                <div key={item.product.id} className="px-5 py-3 flex items-start gap-3">
                  {item.product.imageUri ? (
                    <img
                      src={item.product.imageUri}
                      alt={item.product.name}
                      className="w-10 h-10 rounded-lg object-cover bg-gray-100 shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <span className="text-gray-400 text-xs">🎁</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.product.name}</p>
                    <p className="text-xs text-muted">
                      {[item.product.color, item.product.size].filter(Boolean).join(" | ")}
                    </p>
                    <p className="text-xs text-green-600 font-semibold mt-0.5">Quà tặng</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <div className="flex items-center border border-gray-200 rounded-lg">
                        <button
                          onClick={() => updateGiftQuantity(item.product.id, -1)}
                          className="px-2.5 py-1 text-gray-500 hover:bg-gray-50 text-sm"
                        >
                          -
                        </button>
                        <span className="px-2 text-sm font-semibold min-w-[24px] text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateGiftQuantity(item.product.id, 1)}
                          className="px-2.5 py-1 text-gray-500 hover:bg-gray-50 text-sm"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => removeGiftItem(item.product.id)}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        Xóa
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Payment method */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900">Phương thức thanh toán</h3>
        <div className="flex gap-2">
          {([["cod", "COD"], ["paid", "Đã thanh toán"]] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => {
                setPaymentMethod(val);
                // Restore default shipping fee if switching away from free-shipping-qualifying method
                if (appSettings && parseNumber(shippingFee) === 0) {
                  const wouldQualifyFree = Boolean(
                    appSettings.freeShippingEnabled &&
                    subtotalAfterDiscount >= appSettings.freeShippingThreshold &&
                    (appSettings.freeShippingPaymentMethod === "both" ||
                      (appSettings.freeShippingPaymentMethod === "cod" && val === "cod") ||
                      (appSettings.freeShippingPaymentMethod === "paid" && val !== "cod")),
                  );
                  if (!wouldQualifyFree && appSettings.defaultShippingFeeEnabled && appSettings.defaultShippingFee > 0) {
                    setShippingFee(String(appSettings.defaultShippingFee));
                  }
                }
              }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                paymentMethod === val
                  ? val === "cod"
                    ? "bg-amber-100 text-amber-800 border-2 border-amber-300"
                    : "bg-green-100 text-green-800 border-2 border-green-300"
                  : "bg-gray-100 text-gray-500 border-2 border-transparent hover:bg-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Discount & Shipping */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900">Giảm giá & Phí vận chuyển</h3>

        {/* Discount */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted font-medium w-20 shrink-0">Giảm giá</label>
          <div className="flex gap-1">
            {(["percent", "vnd"] as DiscountType[]).map((t) => (
              <button
                key={t}
                onClick={() => setDiscountType(t)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                  discountType === t ? "bg-primary text-white" : "bg-gray-100 text-gray-500"
                }`}
              >
                {t === "percent" ? "%" : "VND"}
              </button>
            ))}
          </div>
          <input
            value={discountType === "vnd" ? (discountValue ? formatInputNumber(discountValue) : "") : discountValue}
            onChange={(e) => setDiscountValue(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="0"
            className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {/* Shipping */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted font-medium w-20 shrink-0">Ship</label>
          <input
            value={shippingFee ? formatInputNumber(shippingFee) : ""}
            onChange={(e) => setShippingFee(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="0"
            className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Platform fee (TikTok / Shopee) */}
      {orderType !== "normal" && (
        <div className="bg-white rounded-xl shadow-sm border border-purple-100 p-5 space-y-3">
          <h3 className="text-sm font-bold text-purple-600">
            Phí sàn {orderType === "tiktok" ? "TikTok" : "Shopee"}
          </h3>
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {(["percent", "vnd"] as PlatformFeeType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setPlatformFeeType(t)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold ${
                    platformFeeType === t ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {t === "percent" ? "%" : "VND"}
                </button>
              ))}
            </div>
            <input
              value={platformFeeType === "vnd" ? (platformFeeValue ? formatInputNumber(platformFeeValue) : "") : platformFeeValue}
              onChange={(e) => setPlatformFeeValue(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="0"
              className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-2">
        <h3 className="text-sm font-bold text-gray-900 pb-1">Tóm tắt đơn hàng</h3>
        <div className="flex justify-between text-sm">
          <span className="text-muted">Tạm tính</span>
          <span>{formatVND(subtotal)}</span>
        </div>
        {discountAmount > 0 && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Giảm giá</span>
              <span className="text-red-500">-{formatVND(discountAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted">Giá sau giảm</span>
              <span className="text-green-600 font-semibold">{formatVND(subtotalAfterDiscount)}</span>
            </div>
          </>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-muted">Phí vận chuyển</span>
          {freeShippingQualifies ? (
            shippingNum > 0 ? (
              <span className="flex items-center gap-2">
                <span className="line-through text-gray-400">{formatVND(shippingNum)}</span>
                <span className="text-xs font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">Miễn phí</span>
              </span>
            ) : (
              <span className="text-xs font-semibold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">Miễn phí</span>
            )
          ) : shippingNum > 0 ? (
            <span>{formatVND(shippingNum)}</span>
          ) : (
            <span className="text-green-600 font-semibold">Miễn phí</span>
          )}
        </div>
        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
          <span className="font-bold text-gray-900">Tổng cộng</span>
          <span className="text-xl font-bold text-primary">{formatVND(displayTotal)}</span>
        </div>
        {orderType !== "normal" && platformFeeAmount > 0 && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-muted">
                Phí sàn {orderType === "tiktok" ? "TikTok" : "Shopee"}
                {platformFeeType === "percent" ? ` (${platformFeeValue}%)` : ""}
              </span>
              <span className="text-red-500">-{formatVND(platformFeeAmount)}</span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
              <span className="font-semibold text-gray-900">Doanh thu thực tế</span>
              <span className="font-bold text-green-600">{formatVND(netRevenue)}</span>
            </div>
          </>
        )}
      </div>

      {/* Deposit */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted font-medium w-20 shrink-0">Khách cọc</label>
          <input
            value={deposit ? formatInputNumber(deposit) : ""}
            onChange={(e) => {
              const val = e.target.value.replace(/[^\d]/g, "");
              setDeposit(val);
              if (parseNumber(val) > 0) setPaymentMethod("cod");
            }}
            placeholder="0"
            className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        {depositNum > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted">Còn thu hộ (COD)</span>
            <span className="font-bold text-gray-900">{formatVND(Math.max(0, displayTotal - depositNum))}</span>
          </div>
        )}
      </div>

      {/* Save buttons */}
      <div className="sticky bottom-0 bg-background pt-2 pb-4 lg:pb-0 safe-area-bottom space-y-2">
        {editingConfirmedOrder ? (
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-hover disabled:opacity-50 shadow-lg"
          >
            {saving ? "Đang lưu..." : "Cập nhật đơn hàng"}
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-hover disabled:opacity-50 shadow-lg"
          >
            {saving ? "Đang lưu..." : "Lưu đơn nháp"}
          </button>
        )}
      </div>

      {/* Modals */}
      <ProductPickerModal
        open={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onConfirm={handlePickerConfirm}
        initialSelections={items.map((i) => ({ product: i.product, quantity: i.quantity }))}
      />

      <ProductPickerModal
        open={giftPickerVisible}
        onClose={() => setGiftPickerVisible(false)}
        onConfirm={handleGiftPickerConfirm}
        initialSelections={giftItems.map((i) => ({ product: i.product, quantity: i.quantity }))}
      />

      <AddressPickerModal
        open={addressPickerField === "province"}
        onClose={() => setAddressPickerField(null)}
        title="Chọn Tỉnh/Thành phố"
        items={getProvinceNames()}
        onSelect={handleProvinceSelect}
      />

      <AddressPickerModal
        open={addressPickerField === "ward"}
        onClose={() => setAddressPickerField(null)}
        title="Chọn Phường/Xã/Ấp"
        items={customerProvince ? getWardNames(customerProvince) : []}
        onSelect={handleWardSelect}
      />

      <AutoFillModal
        open={autoFillVisible}
        onClose={() => setAutoFillVisible(false)}
        onConfirm={handleAutoFill}
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
