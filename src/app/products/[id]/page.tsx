"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { StockAdjustModal } from "@/components/inventory/StockAdjustModal";
import { ImagePicker } from "@/components/ui/ImagePicker";
import { Modal } from "@/components/ui/Modal";
import { productService } from "@/services/productService";
import { imageService } from "@/services/imageService";
import { Product } from "@/types";
import { formatVND } from "@/utils/currency";

export default function ProductDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  const load = useCallback(async () => {
    const data = await productService.getById(id);
    setProduct(data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Real-time updates
  useEffect(() => {
    const unsub = productService.subscribeToAll((products) => {
      const found = products.find((p) => p.id === id);
      if (found) setProduct(found);
    });
    return () => unsub();
  }, [id]);

  const handleDelete = async () => {
    if (!product) return;
    if (!confirm(`Xóa sản phẩm "${product.name}"? Hành động này không thể hoàn tác.`)) return;
    try {
      await productService.delete(id);
      router.push("/inventory");
    } catch {
      alert("Không thể xóa sản phẩm");
    }
  };

  const handleStockUpdate = async (newStock: number) => {
    await productService.update(id, { stock: newStock });
    await load();
  };

  const handleImageUpload = async (file: File) => {
    setUploadingImage(true);
    try {
      const url = await imageService.uploadProductImage(id, file);
      await productService.update(id, { imageUri: url });
      await load();
    } catch {
      alert("Không thể tải ảnh lên");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageRemove = async () => {
    try {
      await productService.update(id, { imageUri: null });
      await load();
    } catch {
      alert("Không thể xóa ảnh");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <h2 className="text-lg font-bold text-gray-700">Không tìm thấy sản phẩm</h2>
        <Link href="/inventory" className="text-primary text-sm mt-2">
          Quay lại kho hàng
        </Link>
      </div>
    );
  }

  const stockColor =
    product.stock === 0
      ? "text-red-500"
      : product.stock <= 5
      ? "text-amber-500"
      : "text-green-600";

  const stockLabel =
    product.stock === 0
      ? "Hết hàng"
      : product.stock <= 5
      ? "Sắp hết hàng"
      : "Còn hàng";

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 pb-24 lg:pb-8 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={() => router.push("/inventory")} className="text-base px-3 py-2 rounded-lg text-muted hover:text-gray-700 hover:bg-gray-100 active:bg-gray-200">
          ← Quay lại
        </button>
        <div className="flex items-center gap-3">
          <Link
            href={`/products/create?editId=${id}`}
            className="text-base font-semibold text-primary px-4 py-2 rounded-lg hover:bg-blue-50 active:bg-blue-100"
          >
            Chỉnh sửa
          </Link>
          <button
            onClick={() => setMenuOpen(true)}
            className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200"
          >
            <span className="text-gray-500 text-xl">⋮</span>
          </button>
        </div>
      </div>

      {/* Product info card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-4">
        <div className="flex items-start gap-4">
          <div className="shrink-0">
            <ImagePicker
              imageUrl={product.imageUri}
              uploading={uploadingImage}
              onImageSelected={handleImageUpload}
              onImageRemoved={handleImageRemove}
              size="sm"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900">{product.name}</h2>
            <p className="text-sm text-muted mt-0.5">
              {[product.color, product.size].filter(Boolean).join(" | ")}
            </p>
            {product.sku && (
              <p className="text-xs text-muted-light mt-0.5">SKU: {product.sku}</p>
            )}
            {product.qrCode && (
              <p className="text-xs text-muted-light">QR: {product.qrCode}</p>
            )}
            {product.categoryName && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-100 text-gray-500 inline-block mt-1">
                {product.categoryName}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Stock card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">Tồn kho</h3>
          <button
            onClick={() => setStockModalOpen(true)}
            className="text-sm font-semibold text-primary px-4 py-2 rounded-lg hover:bg-blue-50 active:bg-blue-100"
          >
            + Nhập thêm
          </button>
        </div>

        <div className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
          <div>
            <p className="text-3xl font-bold text-gray-900">{product.stock}</p>
            <p className={`text-xs font-semibold ${stockColor} mt-0.5`}>{stockLabel}</p>
          </div>
          <div
            className={`w-14 h-14 rounded-full flex items-center justify-center ${
              product.stock === 0
                ? "bg-red-100"
                : product.stock <= 5
                ? "bg-amber-100"
                : "bg-green-100"
            }`}
          >
            <span className="text-2xl">
              {product.stock === 0 ? "⚠️" : product.stock <= 5 ? "📉" : "✅"}
            </span>
          </div>
        </div>
      </div>

      {/* Pricing card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-2">
        <h3 className="text-sm font-bold text-gray-900 mb-3">Giá</h3>
        <div className="flex justify-between text-sm">
          <span className="text-muted">Giá bán</span>
          <span className="font-semibold text-primary">{formatVND(product.price)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted">Giá vốn</span>
          <span className="font-semibold">{formatVND(product.costPrice)}</span>
        </div>
        {product.price > 0 && product.costPrice > 0 && (
          <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
            <span className="text-muted">Lợi nhuận / sản phẩm</span>
            <span className="font-semibold text-green-600">
              {formatVND(product.price - product.costPrice)}
            </span>
          </div>
        )}
        {product.stock > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted">Giá trị tồn kho</span>
            <span className="font-semibold">{formatVND(product.price * product.stock)}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
        <button
          onClick={() => setStockModalOpen(true)}
          className="w-full py-4 rounded-xl text-base font-bold text-white bg-green-500 hover:bg-green-600 active:bg-green-700"
        >
          + Nhập thêm hàng
        </button>
        <Link
          href={`/products/create?editId=${id}`}
          className="block w-full py-4 rounded-xl text-base font-bold text-center text-primary bg-blue-50 hover:bg-blue-100 active:bg-blue-200"
        >
          Chỉnh sửa sản phẩm
        </Link>
        <button
          onClick={handleDelete}
          className="w-full py-4 rounded-xl text-base font-bold text-red-500 bg-red-50 hover:bg-red-100 active:bg-red-200"
        >
          Xóa sản phẩm
        </button>
      </div>

      {/* Stock adjust modal */}
      <StockAdjustModal
        open={stockModalOpen}
        onClose={() => setStockModalOpen(false)}
        currentStock={product.stock}
        productName={product.name}
        onSave={handleStockUpdate}
      />

      {/* Menu modal */}
      <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="Thao tác">
        <div className="space-y-2 pt-1">
          <Link
            href={`/products/create?editId=${id}`}
            onClick={() => setMenuOpen(false)}
            className="block w-full text-left px-5 py-4 rounded-xl hover:bg-gray-50 active:bg-gray-100 text-base font-medium text-gray-700"
          >
            ✏️ Chỉnh sửa sản phẩm
          </Link>
          <button
            onClick={() => { setMenuOpen(false); setStockModalOpen(true); }}
            className="w-full text-left px-5 py-4 rounded-xl hover:bg-gray-50 active:bg-gray-100 text-base font-medium text-gray-700"
          >
            📦 Nhập thêm hàng
          </button>
          <button
            onClick={() => { setMenuOpen(false); handleDelete(); }}
            className="w-full text-left px-5 py-4 rounded-xl hover:bg-gray-50 active:bg-gray-100 text-base font-medium text-red-500"
          >
            🗑️ Xóa sản phẩm
          </button>
        </div>
      </Modal>
    </div>
  );
}
