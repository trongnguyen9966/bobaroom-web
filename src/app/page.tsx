"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import Link from "next/link";
import { ensureAuth } from "@/services/firebase";
import { catalogService, TopSeller } from "@/services/catalogService";
import { Product, ProductCategory } from "@/types";
import { formatVND } from "@/utils/currency";
import { ImageLightbox } from "@/components/catalog/ImageLightbox";

function getProductImages(product: Product): string[] {
  const imgs: string[] = [];
  if (product.imageUri) imgs.push(product.imageUri);
  if (product.realImageUris?.length) imgs.push(...product.realImageUris);
  return imgs;
}

const EXCLUDED_CATEGORIES = ["chặn charm", "tặng"];

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [topSellers, setTopSellers] = useState<TopSeller[]>([]);
  const [topPeriod, setTopPeriod] = useState<"month" | "year">("month");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [lightboxImages, setLightboxImages] = useState<string[] | null>(null);
  const [lightboxAlt, setLightboxAlt] = useState("");
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);

  const openLightbox = (product: Product) => {
    const imgs = getProductImages(product);
    if (imgs.length > 0) {
      setLightboxImages(imgs);
      setLightboxAlt(product.name);
    }
  };

  useEffect(() => {
    let unsubProducts: (() => void) | undefined;
    let unsubCategories: (() => void) | undefined;

    ensureAuth().then(() => {
      unsubProducts = catalogService.subscribeToProducts((list) => {
        setProducts(list);
        setLoading(false);
      });
      unsubCategories = catalogService.subscribeToCategories(setCategories);
      catalogService.getTopSellers("month").then(setTopSellers);
    });

    return () => { unsubProducts?.(); unsubCategories?.(); };
  }, []);

  const handlePeriodChange = useCallback((period: "month" | "year") => {
    setTopPeriod(period);
    catalogService.getTopSellers(period).then(setTopSellers);
  }, []);

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  const colors = useMemo(() => {
    const colorSet = new Set<string>();
    products.forEach((p) => {
      if (p.color && p.color.trim()) colorSet.add(p.color.trim());
    });
    return Array.from(colorSet).sort();
  }, [products]);

  const topSellerMap = useMemo(() => {
    const map = new Map<string, number>();
    topSellers.forEach((t, i) => map.set(t.productId, i + 1));
    return map;
  }, [topSellers]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (selectedCategory && p.categoryId !== selectedCategory) return false;
      if (selectedColor && p.color.trim() !== selectedColor) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.color.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [products, selectedCategory, selectedColor, search]);

  // Sort: in-stock first, then by createdAt desc (newest first)
  const sortedProducts = useMemo(() => {
    const inStock = filtered.filter((p) => p.stock > 0);
    const outOfStock = filtered.filter((p) => p.stock === 0);
    return [...inStock, ...outOfStock];
  }, [filtered]);

  // Top sellers: exclude "Chặn charm" / "Tặng" categories
  const topSellerProducts = useMemo(() => {
    return topSellers
      .map((t) => products.find((p) => p.id === t.productId))
      .filter((p): p is Product => {
        if (!p) return false;
        const catLower = (p.categoryName ?? "").toLowerCase();
        return !EXCLUDED_CATEGORIES.some((ex) => catLower.includes(ex));
      })
      .slice(0, 5);
  }, [topSellers, products]);

  const periodLabel = topPeriod === "month"
    ? new Date().toLocaleDateString("vi-VN", { month: "long", year: "numeric" })
    : `Năm ${new Date().getFullYear()}`;

  const isFiltering = !!(search || selectedCategory || selectedColor);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF8F5] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-pink-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-pink-400 text-sm font-medium">Đang tải...</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="min-h-screen bg-[#FFF8F5]">
      {/* Header */}
      <header className="bg-gradient-to-r from-pink-100 via-pink-50 to-amber-50 border-b border-pink-100">
        <div className="max-w-6xl mx-auto px-4 py-5 sm:py-6">
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Logo */}
            <img
              src="/logo.png"
              alt="Boba Room"
              className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 object-contain rounded-full bg-white"
            />

            {/* Badge "Lắc charm titan" */}
            <div className="shrink-0 bg-[#FFF5F0] border border-pink-100 rounded-xl px-4 sm:px-5 py-2.5 sm:py-3 text-center relative">
              <span className="text-pink-300 text-[10px] absolute top-1 left-2">✦</span>
              <span className="text-pink-300 text-[10px] absolute top-1 right-2">✦</span>
              <span className="text-pink-300 text-[10px] absolute bottom-1 left-2">✦</span>
              <span className="text-pink-300 text-[10px] absolute bottom-1 right-2">✦</span>
              <p className="text-sm sm:text-base font-extrabold text-amber-900 leading-tight">Lắc charm</p>
              <p className="text-sm sm:text-base font-extrabold text-amber-900 leading-tight">titan</p>
            </div>

            {/* Product highlights */}
            <div className="flex-1 min-w-0 bg-[#FFF5F0] rounded-xl px-4 py-3 border border-pink-100 relative">
              <span className="text-pink-300 text-[10px] absolute top-1 left-2">✦</span>
              <span className="text-pink-300 text-[10px] absolute top-1 right-2">✦</span>
              <span className="text-pink-300 text-[10px] absolute bottom-1 right-2">✦</span>
              <ul className="space-y-0.5">
                {[
                  "Lắc thép không gỉ, charm thép không gỉ",
                  "Đụng nước thoải mái",
                  "Không đen gỉ, bền bỉ theo thời gian",
                  "Giá thành hợp lý, sở hữu trọn đời",
                ].map((text) => (
                  <li key={text} className="flex items-start gap-1.5">
                    <span className="text-amber-800 mt-0.5 text-xs leading-none shrink-0">•</span>
                    <span className="text-xs sm:text-sm font-bold text-amber-900">{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </header>

      {/* Search & Filters */}
      <div className="sticky top-0 z-40 bg-[#FFF8F5]/95 backdrop-blur-sm border-b border-pink-100">
        <div className="max-w-6xl mx-auto px-4 py-3 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Tìm kiếm sản phẩm..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white border border-pink-200 rounded-full px-5 py-3 pl-11 text-sm placeholder-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-300"
              />
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-pink-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <button
              onClick={() => guideRef.current?.scrollIntoView({ behavior: "smooth" })}
              className="shrink-0 px-3 py-3 rounded-full bg-pink-500 text-white text-xs font-semibold hover:bg-pink-600 active:bg-pink-700 transition-colors shadow-sm whitespace-nowrap"
            >
              Đo size
            </button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                !selectedCategory
                  ? "bg-pink-500 text-white shadow-sm"
                  : "bg-white text-pink-500 border border-pink-200 hover:bg-pink-50"
              }`}
            >
              Tất cả
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                  selectedCategory === cat.id
                    ? "bg-pink-500 text-white shadow-sm"
                    : "bg-white text-pink-500 border border-pink-200 hover:bg-pink-50"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {colors.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <span className="shrink-0 text-xs text-pink-400 font-medium self-center mr-1">Màu sắc:</span>
              {selectedColor && (
                <button
                  onClick={() => setSelectedColor(null)}
                  className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold bg-pink-500 text-white"
                >
                  {selectedColor} ✕
                </button>
              )}
              {colors.filter((c) => c !== selectedColor).map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-white text-gray-600 border border-pink-200 hover:bg-pink-50"
                >
                  {color}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        {/* Top Sellers */}
        {topSellerProducts.length > 0 && !isFiltering && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-pink-700">Bán chạy nhất</h2>
                <span className="text-xs text-pink-400 font-medium">({periodLabel})</span>
              </div>
              <div className="flex bg-pink-100 rounded-full p-0.5">
                <button
                  onClick={() => handlePeriodChange("month")}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    topPeriod === "month" ? "bg-pink-500 text-white shadow-sm" : "text-pink-500"
                  }`}
                >
                  Tháng
                </button>
                <button
                  onClick={() => handlePeriodChange("year")}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    topPeriod === "year" ? "bg-pink-500 text-white shadow-sm" : "text-pink-500"
                  }`}
                >
                  Năm
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {topSellerProducts.map((product, idx) => (
                <div
                  key={product.id}
                  className="relative bg-white rounded-xl border border-pink-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="absolute top-2 left-2 z-10 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    TOP {idx + 1}
                  </div>
                  <button
                    onClick={() => openLightbox(product)}
                    className="w-full aspect-square bg-pink-50 flex items-center justify-center overflow-hidden"
                  >
                    {product.imageUri ? (
                      <img src={product.imageUri} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-3xl text-pink-200">📦</span>
                    )}
                  </button>
                  <div className="p-2.5">
                    <p className="text-xs font-bold text-gray-800 truncate">{product.sku || product.name}</p>
                    <p className="text-sm font-bold text-pink-600 mt-0.5">{formatVND(product.price)}</p>
                  </div>
                  {product.realImageUris?.length > 0 && (
                    <div className="absolute top-2 right-2 z-10 bg-white/80 backdrop-blur text-[10px] font-bold text-pink-500 px-1.5 py-0.5 rounded-full">
                      +{product.realImageUris.length} ảnh
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Product Grid — grouped by SKU prefix */}
        <section>
          {isFiltering && (
            <p className="text-sm text-pink-400 mb-3">
              {filtered.length} sản phẩm
              {selectedCategory && ` trong "${categories.find((c) => c.id === selectedCategory)?.name}"`}
              {selectedColor && ` màu "${selectedColor}"`}
            </p>
          )}

          {sortedProducts.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-pink-300 text-lg mb-1">Không tìm thấy sản phẩm</p>
              <p className="text-pink-200 text-sm">Thử thay đổi bộ lọc hoặc từ khóa</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {sortedProducts.map((product) => {
                const outOfStock = product.stock === 0;
                const topRank = topSellerMap.get(product.id);
                const hasRealImages = product.realImageUris?.length > 0;
                return (
                  <div
                    key={product.id}
                    className={`relative bg-white rounded-xl border overflow-hidden transition-shadow ${
                      outOfStock
                        ? "border-gray-200 opacity-60"
                        : "border-pink-100 shadow-sm hover:shadow-md"
                    }`}
                  >
                    {outOfStock && (
                      <div className="absolute top-2 right-2 z-10 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                        Hết hàng
                      </div>
                    )}

                    {topRank && !outOfStock && (
                      <div className="absolute top-2 left-2 z-10 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                        TOP {topRank}
                      </div>
                    )}

                    {hasRealImages && !outOfStock && (
                      <div className="absolute bottom-[calc(50%+8px)] right-2 z-10 bg-white/80 backdrop-blur text-[10px] font-bold text-pink-500 px-1.5 py-0.5 rounded-full">
                        +{product.realImageUris.length} ảnh
                      </div>
                    )}

                    <button
                      onClick={() => openLightbox(product)}
                      className="w-full aspect-square bg-pink-50/50 flex items-center justify-center overflow-hidden"
                      disabled={!product.imageUri && !hasRealImages}
                    >
                      {product.imageUri ? (
                        <img
                          src={product.imageUri}
                          alt={product.name}
                          className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-3xl text-pink-200">📦</span>
                      )}
                    </button>

                    <div className="p-2.5 space-y-0.5">
                      <p className="text-xs font-bold text-gray-800 truncate" title={product.name}>
                        {product.sku || product.name}
                      </p>
                      {product.color && (
                        <p className="text-[10px] text-pink-400">{product.color}</p>
                      )}
                      <div className="flex items-center justify-between pt-1">
                        <p className="text-sm font-bold text-pink-600">{formatVND(product.price)}</p>
                        {!outOfStock && (
                          <span className="text-[9px] font-semibold text-green-500 bg-green-50 px-1.5 py-0.5 rounded-full">
                            Còn hàng
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Size guide */}
      <div ref={guideRef} className="max-w-6xl mx-auto px-4 pb-4 space-y-3">
        {[
          { src: "/guide-1.jpg", alt: "Hướng dẫn đo lắc tay" },
          { src: "/guide-2.jpg", alt: "Cách đo và gợi ý chọn size" },
          { src: "/guide-3.jpg", alt: "Bảng size tham khảo Boba Room" },
        ].map((img) => (
          <div key={img.src} className="rounded-xl overflow-hidden border border-pink-100 shadow-sm">
            <img src={img.src} alt={img.alt} className="w-full object-cover" loading="lazy" />
          </div>
        ))}
      </div>

      {/* Footer */}
      <footer className="bg-pink-50 border-t border-pink-100">
        <div className="max-w-6xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-pink-600">boba.room</p>
            <p className="text-xs text-pink-400">accessories & more</p>
          </div>
          <Link
            href="/login"
            className="text-xs text-pink-300 hover:text-pink-500 transition-colors"
          >
            Admin
          </Link>
        </div>
      </footer>

      {/* Scroll to top */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-pink-500 text-white shadow-lg hover:bg-pink-600 active:bg-pink-700 flex items-center justify-center transition-all"
          aria-label="Lên đầu trang"
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      )}

      {/* Product lightbox */}
      {lightboxImages && (
        <ImageLightbox
          images={lightboxImages}
          alt={lightboxAlt}
          onClose={() => setLightboxImages(null)}
        />
      )}
    </div>
  );
}
