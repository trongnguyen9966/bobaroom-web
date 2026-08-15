"use client";

import { useEffect, useState } from "react";
import { settingsService } from "@/services/settingsService";
import { categoryService } from "@/services/categoryService";
import { authService } from "@/services/authService";
import { AppSettings, ProductCategory } from "@/types";
import { formatInputNumber, parseNumber } from "@/utils/currency";

const PAYMENT_METHOD_OPTIONS = [
  { value: "paid" as const, label: "Chuyển khoản" },
  { value: "cod" as const, label: "COD" },
  { value: "both" as const, label: "Tất cả" },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    const unsubSettings = settingsService.subscribe((s) => {
      setSettings(s);
      setLoading(false);
    });
    const unsubCats = categoryService.subscribeToAll(setCategories);
    return () => { unsubSettings(); unsubCats(); };
  }, []);

  const updateSetting = async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSaving(key);
    try {
      await settingsService.set(key, value);
    } catch {
      alert("Không thể lưu cài đặt");
    } finally {
      setSaving(null);
    }
  };

  const updateMultiple = async (entries: Partial<AppSettings>) => {
    setSaving("multiple");
    try {
      await settingsService.setMultiple(entries);
    } catch {
      alert("Không thể lưu cài đặt");
    } finally {
      setSaving(null);
    }
  };

  const handleLogout = () => {
    if (!confirm("Đăng xuất khỏi BobaRoom?")) return;
    authService.logout();
    window.location.reload();
  };

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b border-border px-4 sm:px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Cài đặt</h1>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 pb-24 lg:pb-8 space-y-4">

          {/* Free Shipping */}
          <SettingCard title="Miễn phí ship">
            <ToggleRow
              label="Bật miễn phí ship"
              checked={settings.freeShippingEnabled}
              onChange={(v) => updateSetting("freeShippingEnabled", v)}
            />
            {settings.freeShippingEnabled && (
              <div className="space-y-3 mt-3 pt-3 border-t border-gray-100">
                <NumberInput
                  label="Đơn tối thiểu (VND)"
                  value={settings.freeShippingThreshold}
                  onChange={(v) => updateSetting("freeShippingThreshold", v)}
                />
                <div>
                  <p className="text-sm text-muted font-medium mb-2">Hình thức thanh toán</p>
                  <div className="flex gap-2">
                    {PAYMENT_METHOD_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => updateSetting("freeShippingPaymentMethod", opt.value)}
                        className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                          settings.freeShippingPaymentMethod === opt.value
                            ? "bg-primary text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </SettingCard>

          {/* Price Rounding */}
          <SettingCard title="Làm tròn giá">
            <ToggleRow
              label="Bật làm tròn giá"
              checked={settings.priceRoundingEnabled}
              onChange={(v) => updateSetting("priceRoundingEnabled", v)}
            />
            {settings.priceRoundingEnabled && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-sm text-muted font-medium mb-2">Chế độ</p>
                <div className="flex gap-2">
                  {([
                    { value: "down" as const, label: "Làm tròn xuống" },
                    { value: "up" as const, label: "Làm tròn lên" },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateSetting("priceRoundingMode", opt.value)}
                      className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                        settings.priceRoundingMode === opt.value
                          ? "bg-primary text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </SettingCard>

          {/* Actual Shipping Fee */}
          <SettingCard title="Phí vận chuyển thực tế">
            <ToggleRow
              label="Trừ phí ship thực tế vào doanh thu"
              checked={settings.actualShippingFeeEnabled}
              onChange={(v) => updateSetting("actualShippingFeeEnabled", v)}
            />
            {settings.actualShippingFeeEnabled && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <NumberInput
                  label="Phí ship thực tế (VND)"
                  value={settings.actualShippingFee}
                  onChange={(v) => updateSetting("actualShippingFee", v)}
                />
              </div>
            )}
          </SettingCard>

          {/* Default Shipping Fee */}
          <SettingCard title="Phí vận chuyển mặc định">
            <ToggleRow
              label="Tự động điền phí ship khi tạo đơn"
              checked={settings.defaultShippingFeeEnabled}
              onChange={(v) => updateSetting("defaultShippingFeeEnabled", v)}
            />
            {settings.defaultShippingFeeEnabled && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <NumberInput
                  label="Phí ship mặc định (VND)"
                  value={settings.defaultShippingFee}
                  onChange={(v) => updateSetting("defaultShippingFee", v)}
                />
              </div>
            )}
          </SettingCard>

          {/* Gift Items */}
          <SettingCard title="Sản phẩm tặng kèm">
            <ToggleRow
              label="Hiển thị mục quà tặng khi tạo đơn"
              checked={settings.giftItemsEnabled}
              onChange={(v) => updateSetting("giftItemsEnabled", v)}
            />
          </SettingCard>

          {/* Promotion */}
          <SettingCard title="Khuyến mãi sản phẩm">
            <ToggleRow
              label="Bật chương trình khuyến mãi"
              checked={settings.promotionEnabled}
              onChange={(v) => updateSetting("promotionEnabled", v)}
            />
            {settings.promotionEnabled && (
              <div className="space-y-3 mt-3 pt-3 border-t border-gray-100">
                <div>
                  <p className="text-sm text-muted font-medium mb-2">Loại giảm giá</p>
                  <div className="flex gap-2">
                    {([
                      { value: "percent" as const, label: "%" },
                      { value: "vnd" as const, label: "VND" },
                    ]).map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => updateSetting("promotionDiscountType", opt.value)}
                        className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                          settings.promotionDiscountType === opt.value
                            ? "bg-primary text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <NumberInput
                  label={settings.promotionDiscountType === "percent" ? "Giảm giá (%)" : "Giảm giá (VND)"}
                  value={settings.promotionDiscountValue}
                  onChange={(v) => updateSetting("promotionDiscountValue", v)}
                />
              </div>
            )}
          </SettingCard>

          {/* Order Confirmation Rule */}
          <SettingCard title="Xác nhận đơn hàng">
            <ToggleRow
              label="Yêu cầu thanh toán trước khi xác nhận"
              checked={settings.confirmationRequiredEnabled}
              onChange={(v) => updateSetting("confirmationRequiredEnabled", v)}
            />
            {settings.confirmationRequiredEnabled && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <CategoryMultiSelect
                  label="Áp dụng cho danh mục"
                  categories={categories}
                  selectedIds={settings.confirmationRequiredCategoryIds}
                  onChange={(ids) => updateSetting("confirmationRequiredCategoryIds", ids)}
                />
              </div>
            )}
          </SettingCard>

          {/* Exchange */}
          <SettingCard title="Đổi sản phẩm">
            <ToggleRow
              label="Cho phép đổi sản phẩm"
              checked={settings.exchangeEnabled}
              onChange={(v) => updateSetting("exchangeEnabled", v)}
            />
            {settings.exchangeEnabled && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <CategoryMultiSelect
                  label="Danh mục cho phép đổi"
                  categories={categories}
                  selectedIds={settings.exchangeCategoryIds}
                  onChange={(ids) => updateSetting("exchangeCategoryIds", ids)}
                />
              </div>
            )}
          </SettingCard>

          {/* Waiting Order */}
          <SettingCard title="Xác nhận hoàn tất">
            <ToggleRow
              label="Yêu cầu xác nhận trước khi chuẩn bị hàng"
              checked={settings.waitingOrderEnabled}
              onChange={(v) => updateSetting("waitingOrderEnabled", v)}
            />
            {settings.waitingOrderEnabled && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <CategoryMultiSelect
                  label="Áp dụng cho danh mục"
                  categories={categories}
                  selectedIds={settings.waitingOrderCategoryIds}
                  onChange={(ids) => updateSetting("waitingOrderCategoryIds", ids)}
                />
              </div>
            )}
          </SettingCard>

          {/* Google Sheets */}
          <SettingCard title="Google Sheets">
            <div>
              <p className="text-sm text-muted font-medium mb-2">Spreadsheet ID</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.googleSheetsId}
                  onChange={(e) => setSettings({ ...settings, googleSheetsId: e.target.value })}
                  placeholder="Nhập Spreadsheet ID"
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <button
                  onClick={() => updateSetting("googleSheetsId", settings.googleSheetsId)}
                  className="px-5 py-3 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary-hover active:bg-primary-hover"
                >
                  Lưu
                </button>
              </div>
            </div>
          </SettingCard>

          {/* Logout */}
          <div className="pt-4">
            <button
              onClick={handleLogout}
              className="w-full py-4 rounded-xl text-base font-bold text-red-500 bg-red-50 hover:bg-red-100 active:bg-red-200"
            >
              Đăng xuất
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

// --- Reusable sub-components ---

function SettingCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-1">
      <h3 className="text-sm font-bold text-gray-900 mb-2">{title}</h3>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-12 h-7 rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-gray-300"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [localValue, setLocalValue] = useState(value > 0 ? String(value) : "");

  useEffect(() => {
    setLocalValue(value > 0 ? String(value) : "");
  }, [value]);

  const handleBlur = () => {
    const parsed = parseNumber(localValue);
    if (parsed !== value) {
      onChange(parsed);
    }
  };

  return (
    <div>
      <p className="text-sm text-muted font-medium mb-1">{label}</p>
      <input
        type="text"
        inputMode="numeric"
        value={localValue ? formatInputNumber(localValue) : ""}
        onChange={(e) => setLocalValue(e.target.value.replace(/[^\d]/g, ""))}
        onBlur={handleBlur}
        placeholder="0"
        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base text-right focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
      />
    </div>
  );
}

function CategoryMultiSelect({
  label,
  categories,
  selectedIds,
  onChange,
}: {
  label: string;
  categories: ProductCategory[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectAll = () => {
    if (selectedIds.length === categories.length) {
      onChange([]);
    } else {
      onChange(categories.map((c) => c.id));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-muted font-medium">{label}</p>
        <button
          onClick={selectAll}
          className="text-xs text-primary font-semibold hover:underline"
        >
          {selectedIds.length === categories.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}
        </button>
      </div>
      {categories.length === 0 ? (
        <p className="text-xs text-muted-light">Chưa có danh mục nào</p>
      ) : (
        <div className="space-y-1">
          {categories.map((cat) => {
            const checked = selectedIds.includes(cat.id);
            return (
              <button
                key={cat.id}
                onClick={() => toggle(cat.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-left transition-colors ${
                  checked
                    ? "bg-blue-50 text-primary"
                    : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                }`}
              >
                <span className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${
                  checked ? "bg-primary border-primary" : "border-gray-300"
                }`}>
                  {checked && <span className="text-white text-xs font-bold">✓</span>}
                </span>
                {cat.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
