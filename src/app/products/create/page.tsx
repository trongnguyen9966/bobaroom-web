"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CategoryPickerModal } from "@/components/inventory/CategoryPickerModal";
import { ImagePicker } from "@/components/ui/ImagePicker";
import { productService } from "@/services/productService";
import { categoryService } from "@/services/categoryService";
import { imageService } from "@/services/imageService";
import { ProductCategory, ProductSize } from "@/types";
import { formatInputNumber, parseNumber } from "@/utils/currency";

/** Pad single-digit suffix: "A1" → "A01", "A12" stays */
function formatSku(sku: string): string {
  return sku.replace(/(\D)(\d)$/, "$10$2");
}

function CreateProductForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("editId");

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [color, setColor] = useState("");
  const [size, setSize] = useState("");
  const [price, setPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [stock, setStock] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [sizes, setSizes] = useState<ProductSize[]>([]);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [bulkPrice, setBulkPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!editId);

  useEffect(() => {
    const unsub = categoryService.subscribeToAll(setCategories);
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!editId) return;
    (async () => {
      const product = await productService.getById(editId);
      if (!product) {
        router.push("/inventory");
        return;
      }
      setName(product.name);
      setSku(product.sku);
      setColor(product.color);
      setSize(product.size);
      setPrice(product.price > 0 ? String(product.price) : "");
      setCostPrice(product.costPrice > 0 ? String(product.costPrice) : "");
      setStock(String(product.stock));
      setQrCode(product.qrCode ?? "");
      setCategoryId(product.categoryId);
      setCategoryName(product.categoryName);
      setImageUri(product.imageUri);
      setSizes(product.sizes ?? []);
      setLoading(false);
    })();
  }, [editId, router]);

  const handleSave = async () => {
    if (!name.trim()) {
      alert("Vui lòng nhập tên sản phẩm");
      return;
    }

    // Check duplicate size names
    if (sizes.length > 0) {
      const sizeNames = sizes.map((s) => s.name.trim().toLowerCase()).filter(Boolean);
      const seen = new Set<string>();
      for (const n of sizeNames) {
        if (seen.has(n)) {
          alert(`Tên kích thước "${n}" bị trùng. Vui lòng đặt tên khác nhau cho mỗi size.`);
          return;
        }
        seen.add(n);
      }
    }

    setSaving(true);
    try {
      let finalImageUri = imageUri;

      // Upload image if a new file was selected
      if (imageFile) {
        setUploadingImage(true);
        const tempId = editId || `new_${Date.now()}`;
        finalImageUri = await imageService.uploadProductImage(tempId, imageFile);
        setUploadingImage(false);
      }

      const hasSizes = sizes.length > 0;
      const totalStock = hasSizes ? sizes.reduce((sum, s) => sum + s.stock, 0) : parseNumber(stock);
      const basePrice = hasSizes && sizes.length > 0 ? sizes[0].price : parseNumber(price);

      const data = {
        name: name.trim(),
        sku: formatSku(sku.trim()),
        color: color.trim(),
        size: size.trim(),
        price: basePrice,
        costPrice: parseNumber(costPrice),
        stock: totalStock,
        sizes: hasSizes ? sizes : [],
        qrCode: qrCode.trim() || null,
        categoryId,
        imageUri: finalImageUri,
      };

      if (editId) {
        await productService.update(editId, { ...data, categoryName });
        router.replace(`/products/${editId}`);
      } else {
        const product = await productService.create(data, categoryName);
        // Re-upload with actual product ID if we used a temp one
        if (imageFile && finalImageUri) {
          const realUri = await imageService.uploadProductImage(product.id, imageFile);
          await productService.update(product.id, { imageUri: realUri });
        }
        router.replace(`/products/${product.id}`);
      }
    } catch (e) {
      alert("Không thể lưu sản phẩm");
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
        <button onClick={() => router.push("/products")} className="text-base px-3 py-2 rounded-lg text-muted hover:text-gray-700 hover:bg-gray-100 active:bg-gray-200">
          ← Quay lại
        </button>
        <h1 className="text-lg font-bold text-gray-900">
          {editId ? "Chỉnh sửa sản phẩm" : "Thêm sản phẩm mới"}
        </h1>
        <div className="w-16" />
      </div>

      {/* Image */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Hình ảnh sản phẩm</h3>
        <ImagePicker
          imageUrl={imageUri}
          uploading={uploadingImage}
          onImageSelected={(file) => setImageFile(file)}
          onImageRemoved={() => {
            setImageFile(null);
            setImageUri(null);
          }}
        />
      </div>

      {/* Basic info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900">Thông tin sản phẩm</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-sm text-muted font-medium">Tên sản phẩm *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tên sản phẩm"
              className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <div>
            <label className="text-sm text-muted font-medium">SKU</label>
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="Mã SKU"
              className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <div>
            <label className="text-sm text-muted font-medium">Mã QR</label>
            <input
              value={qrCode}
              onChange={(e) => setQrCode(e.target.value)}
              placeholder="Mã QR (tùy chọn)"
              className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <div>
            <label className="text-sm text-muted font-medium">Màu sắc</label>
            <input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="Màu sắc"
              className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
        </div>
      </div>

      {/* Category */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900">Danh mục</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCategoryPickerOpen(true)}
            className="flex-1 text-left bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-base"
          >
            {categoryName ? (
              <span className="text-gray-900 font-medium">{categoryName}</span>
            ) : (
              <span className="text-gray-400">Chọn danh mục...</span>
            )}
          </button>
          {categoryId && (
            <button
              onClick={() => { setCategoryId(null); setCategoryName(null); }}
              className="text-sm text-red-400 hover:text-red-600 font-bold shrink-0 px-3 py-2 rounded-lg hover:bg-red-50 active:bg-red-100"
            >
              Bỏ chọn
            </button>
          )}
        </div>
      </div>

      {/* Pricing & Stock */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900">Giá & Tồn kho</h3>

        {sizes.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-sm text-muted font-medium">Giá bán (VNĐ)</label>
              <input
                value={price ? formatInputNumber(price) : ""}
                onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="0"
                className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base text-right focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-sm text-muted font-medium">Giá vốn (VNĐ)</label>
              <input
                value={costPrice ? formatInputNumber(costPrice) : ""}
                onChange={(e) => setCostPrice(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="0"
                className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base text-right focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-sm text-muted font-medium">Tồn kho</label>
              <input
                value={stock}
                onChange={(e) => setStock(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="0"
                type="text"
                className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base text-right focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-sm text-muted font-medium">Giá vốn (VNĐ)</label>
              <input
                value={costPrice ? formatInputNumber(costPrice) : ""}
                onChange={(e) => setCostPrice(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="0"
                className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base text-right focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <p className="text-xs text-muted">Giá bán & tồn kho được quản lý theo từng kích thước bên dưới</p>
          </div>
        )}
      </div>

      {/* Sizes */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-900">Kích thước</h3>

        {sizes.length > 0 && (
          <div>
            <label className="text-xs text-muted font-medium">Chỉnh giá hàng loạt (VNĐ)</label>
            <div className="flex gap-2 mt-1">
              <input
                value={bulkPrice ? formatInputNumber(bulkPrice) : ""}
                onChange={(e) => setBulkPrice(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="Nhập giá áp dụng cho tất cả size"
                className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <button
                onClick={() => {
                  const p = parseNumber(bulkPrice);
                  if (p > 0) {
                    setSizes(sizes.map((s) => ({ ...s, price: p })));
                    setBulkPrice("");
                  }
                }}
                disabled={!bulkPrice || parseNumber(bulkPrice) <= 0}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-hover disabled:opacity-40 shrink-0"
              >
                Áp dụng
              </button>
            </div>
          </div>
        )}

        {sizes.length > 0 && (
          <div className="space-y-2">
            {sizes.map((s, idx) => {
              const isDuplicate = s.name.trim() !== "" && sizes.some((other, i) => i !== idx && other.name.trim().toLowerCase() === s.name.trim().toLowerCase());
              return (
              <div key={idx} className="bg-gray-50 rounded-xl p-3 space-y-2 relative">
                <button
                  onClick={() => setSizes(sizes.filter((_, i) => i !== idx))}
                  className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-50 text-red-400 text-xs flex items-center justify-center hover:bg-red-100"
                >
                  &times;
                </button>
                <div>
                  <label className="text-xs text-muted font-medium">Tên kích thước</label>
                  <input
                    value={s.name}
                    onChange={(e) => {
                      const next = [...sizes];
                      next[idx] = { ...next[idx], name: e.target.value };
                      setSizes(next);
                    }}
                    placeholder="VD: size 13"
                    className={`mt-1 w-full bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${isDuplicate ? "border-red-400 focus:ring-red-200 focus:border-red-400" : "border-gray-200 focus:ring-primary/20 focus:border-primary"}`}
                  />
                  {isDuplicate && <p className="text-[11px] text-red-500 mt-0.5">Tên size bị trùng</p>}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted font-medium">Giá bán (VNĐ)</label>
                    <input
                      value={s.price > 0 ? formatInputNumber(String(s.price)) : ""}
                      onChange={(e) => {
                        const next = [...sizes];
                        next[idx] = { ...next[idx], price: parseNumber(e.target.value.replace(/[^\d]/g, "")) };
                        setSizes(next);
                      }}
                      placeholder="0"
                      className="mt-1 w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted font-medium">Tồn kho</label>
                    <input
                      value={s.stock > 0 ? String(s.stock) : ""}
                      onChange={(e) => {
                        const next = [...sizes];
                        next[idx] = { ...next[idx], stock: parseNumber(e.target.value.replace(/[^\d]/g, "")) };
                        setSizes(next);
                      }}
                      placeholder="0"
                      type="text"
                      className="mt-1 w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}

        <button
          onClick={() => setSizes([...sizes, { name: "", price: parseNumber(price) || 0, stock: 0 }])}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-primary bg-blue-50 hover:bg-blue-100 transition-colors"
        >
          + Thêm kích thước
        </button>
        {sizes.length > 0 && (
          <p className="text-xs text-muted">
            Tổng tồn kho: {sizes.reduce((sum, s) => sum + s.stock, 0)}
          </p>
        )}
      </div>

      {/* Save button */}
      <div className="sticky bottom-0 bg-background pt-2 pb-4 lg:pb-0 safe-area-bottom">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-4 rounded-xl text-base font-bold text-white bg-primary hover:bg-primary-hover active:bg-primary-hover disabled:opacity-50 shadow-lg"
        >
          {saving ? "Đang lưu..." : editId ? "Cập nhật sản phẩm" : "Tạo sản phẩm"}
        </button>
      </div>

      {/* Category picker */}
      <CategoryPickerModal
        open={categoryPickerOpen}
        onClose={() => setCategoryPickerOpen(false)}
        categories={categories}
        selectedId={categoryId}
        onSelect={(cat) => {
          setCategoryId(cat.id);
          setCategoryName(cat.name);
        }}
      />

      {/* Saving overlay */}
      {saving && (
        <div className="fixed inset-0 z-[200] bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded-2xl px-8 py-6 flex flex-col items-center gap-3 shadow-xl">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-base font-semibold text-gray-900">
              {uploadingImage ? "Đang tải ảnh lên..." : "Đang lưu sản phẩm..."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CreateProductPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <CreateProductForm />
    </Suspense>
  );
}
