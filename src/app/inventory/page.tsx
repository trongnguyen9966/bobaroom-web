"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { CategoryPickerModal } from "@/components/inventory/CategoryPickerModal";
import { productService } from "@/services/productService";
import { categoryService } from "@/services/categoryService";
import { orderService } from "@/services/orderService";
import { Product, ProductCategory } from "@/types";
import { formatVND } from "@/utils/currency";

type StockFilter = "all" | "exact" | "out";

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [soldCounts, setSoldCounts] = useState<Map<string, number>>(new Map());
  const [stockFilterValue, setStockFilterValue] = useState("");

  useEffect(() => {
    const unsub = productService.subscribeToAll((list) => {
      setProducts(list);
      setLoading(false);
    });
    const unsubCat = categoryService.subscribeToAll(setCategories);
    orderService.getSoldCounts().then(setSoldCounts);
    return () => { unsub(); unsubCat(); };
  }, []);

  const filtered = products.filter((p) => {
    // Category filter
    if (categoryFilter && p.categoryId !== categoryFilter) return false;
    // Stock filter
    if (stockFilter === "exact" && stockFilterValue) {
      const target = parseInt(stockFilterValue, 10);
      if (!isNaN(target) && p.stock !== target) return false;
    }
    if (stockFilter === "out" && p.stock > 0) return false;
    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.color.toLowerCase().includes(q) ||
        (p.size ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalStock = filtered.reduce((s, p) => s + p.stock, 0);
  const totalSold = Array.from(soldCounts.values()).reduce((s, v) => s + v, 0);
  const outOfStockCount = products.filter((p) => p.stock === 0).length;
  const categoryName = categoryFilter
    ? categories.find((c) => c.id === categoryFilter)?.name ?? "Danh mục"
    : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-border px-4 sm:px-6 py-4 space-y-3 sticky top-0 z-40">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Kho hàng</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCategoryPickerOpen(true)}
              className="text-sm font-semibold text-primary px-4 py-2.5 rounded-lg hover:bg-blue-50 active:bg-blue-100"
            >
              Danh mục
            </button>
            <Link
              href="/products/create"
              className="bg-primary text-white px-5 py-2.5 rounded-xl text-base font-semibold hover:bg-primary-hover active:bg-primary-hover transition-colors"
            >
              + Thêm sản phẩm
            </Link>
          </div>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Tìm theo tên, SKU, màu, size..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />

        {/* Stats cards */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-blue-50 rounded-lg px-3 py-2 text-center">
            <p className="text-lg font-bold text-primary">{filtered.length}</p>
            <p className="text-[10px] text-muted font-medium">Sản phẩm</p>
          </div>
          <div className="bg-green-50 rounded-lg px-3 py-2 text-center">
            <p className="text-lg font-bold text-green-600">{totalStock.toLocaleString()}</p>
            <p className="text-[10px] text-muted font-medium">Tổng tồn kho</p>
          </div>
          <div className="bg-amber-50 rounded-lg px-3 py-2 text-center">
            <p className="text-lg font-bold text-amber-600">{totalSold.toLocaleString()}</p>
            <p className="text-[10px] text-muted font-medium">Đã bán</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => { setStockFilter("all"); setStockFilterValue(""); }}
            className={`px-4 py-2.5 rounded-full text-sm font-semibold transition-colors ${
              stockFilter === "all" ? "bg-primary text-white" : "bg-gray-100 text-gray-500"
            }`}
          >
            Tất cả
          </button>
          <button
            onClick={() => setStockFilter("out")}
            className={`px-4 py-2.5 rounded-full text-sm font-semibold transition-colors ${
              stockFilter === "out" ? "bg-primary text-white" : "bg-gray-100 text-gray-500"
            }`}
          >
            Hết hàng ({outOfStockCount})
          </button>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min="0"
              placeholder="Tồn kho ="
              value={stockFilterValue}
              onChange={(e) => {
                setStockFilterValue(e.target.value);
                if (e.target.value) setStockFilter("exact");
                else setStockFilter("all");
              }}
              className={`w-28 px-3 py-2.5 rounded-full text-sm font-semibold border-0 focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                stockFilter === "exact" ? "bg-primary text-white placeholder-white/60" : "bg-gray-100 text-gray-500 placeholder-gray-400"
              }`}
            />
          </div>

          {/* Category filter */}
          {categoryFilter ? (
            <button
              onClick={() => setCategoryFilter(null)}
              className="px-4 py-2.5 rounded-full text-sm font-semibold bg-blue-50 text-primary flex items-center gap-1"
            >
              {categoryName} <span className="text-blue-300">✕</span>
            </button>
          ) : categories.length > 0 ? (
            <select
              value=""
              onChange={(e) => setCategoryFilter(e.target.value || null)}
              className="px-4 py-2.5 rounded-full text-sm font-semibold bg-gray-100 text-gray-500 border-0 focus:outline-none"
            >
              <option value="">Danh mục</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      {/* Product list */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Không có sản phẩm" subtitle="Thêm sản phẩm mới để bắt đầu" />
        ) : (
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-50 overflow-hidden">
              {filtered.map((product) => (
                <Link
                  key={product.id}
                  href={`/products/${product.id}`}
                  className="flex items-center gap-3 px-4 py-4 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  {product.imageUri ? (
                    <img
                      src={product.imageUri}
                      alt={product.name}
                      className="w-12 h-12 rounded-lg object-cover bg-gray-100 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <span className="text-gray-400 text-lg">📦</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{product.name}</p>
                    <p className="text-xs text-muted">
                      {[product.color, product.size].filter(Boolean).join(" | ")}
                      {product.sku ? ` - ${product.sku}` : ""}
                    </p>
                    {product.categoryName && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 inline-block mt-0.5">
                        {product.categoryName}
                      </span>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-primary">{formatVND(product.price)}</p>
                    <p
                      className={`text-xs font-bold mt-0.5 ${
                        product.stock === 0
                          ? "text-red-500"
                          : product.stock <= 5
                          ? "text-amber-500"
                          : "text-green-600"
                      }`}
                    >
                      {product.stock === 0 ? "Hết hàng" : `Tồn: ${product.stock}`}
                    </p>
                    {(soldCounts.get(product.id) ?? 0) > 0 && (
                      <p className="text-[10px] text-muted mt-0.5">
                        Đã bán: {soldCounts.get(product.id)?.toLocaleString()}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Category picker modal */}
      <CategoryPickerModal
        open={categoryPickerOpen}
        onClose={() => setCategoryPickerOpen(false)}
        categories={categories}
      />
    </div>
  );
}
