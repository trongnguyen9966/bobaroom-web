"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CategoryPickerModal } from "@/components/inventory/CategoryPickerModal";
import { ImagePicker } from "@/components/ui/ImagePicker";
import { productService } from "@/services/productService";
import { categoryService } from "@/services/categoryService";
import { imageService } from "@/services/imageService";
import { ProductCategory } from "@/types";
import { formatInputNumber, parseNumber } from "@/utils/currency";

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
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
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
      setLoading(false);
    })();
  }, [editId, router]);

  const handleSave = async () => {
    if (!name.trim()) {
      alert("Vui lòng nhập tên sản phẩm");
      return;
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

      const data = {
        name: name.trim(),
        sku: sku.trim(),
        color: color.trim(),
        size: size.trim(),
        price: parseNumber(price),
        costPrice: parseNumber(costPrice),
        stock: parseNumber(stock),
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
          <div>
            <label className="text-sm text-muted font-medium">Kích thước</label>
            <input
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="Size"
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
