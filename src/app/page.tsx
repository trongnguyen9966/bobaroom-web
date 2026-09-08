"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { ensureAuth } from "@/services/firebase";
import { catalogService, TopSeller } from "@/services/catalogService";
import { settingsService } from "@/services/settingsService";
import { Product, ProductCategory } from "@/types";
import { formatVND } from "@/utils/currency";
import { ImageLightbox } from "@/components/catalog/ImageLightbox";

function isWebUrl(uri: string | null | undefined): boolean {
  if (!uri) return false;
  return uri.startsWith("https://") || uri.startsWith("http://");
}

function getProductImages(product: Product): string[] {
  const imgs: string[] = [];
  if (isWebUrl(product.imageUri)) imgs.push(product.imageUri!);
  if (product.realImageUris?.length) imgs.push(...product.realImageUris.filter(isWebUrl));
  return imgs;
}

const EXCLUDED_CATEGORIES = ["chặn charm", "tặng"];
const ZALO_PHONE = "0836879035";
const FB_PAGE_URL = "https://m.me/bobaroomdiary";

interface SampleItem {
  product: Product;
  quantity: number;
}

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);

  // Sample selection state
  const [sampleItems, setSampleItems] = useState<SampleItem[]>([]);
  const [showSampleSheet, setShowSampleSheet] = useState(false);
  const [showSendOptions, setShowSendOptions] = useState(false);
  const [showSendGuide, setShowSendGuide] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sendToast, setSendToast] = useState<string | null>(null);
  const [showPromo, setShowPromo] = useState(false);
  const [promoDiscountValue, setPromoDiscountValue] = useState(15);

  const sampleCount = useMemo(() => sampleItems.reduce((sum, i) => sum + i.quantity, 0), [sampleItems]);

  const addToSample = (product: Product) => {
    setSampleItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev;
        return prev.map((i) => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const updateSampleQty = (productId: string, delta: number) => {
    setSampleItems((prev) => {
      return prev
        .map((i) => {
          if (i.product.id !== productId) return i;
          const next = i.quantity + delta;
          if (next <= 0) return null;
          if (next > i.product.stock) return i;
          return { ...i, quantity: next };
        })
        .filter(Boolean) as SampleItem[];
    });
  };

  const removeSampleItem = (productId: string) => {
    setSampleItems((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const buildSampleMessage = () => {
    const lines = sampleItems.map((i) => {
      const sku = i.product.sku ? `${i.product.sku} - ` : "";
      return `- ${sku}${i.product.name} x${i.quantity}`;
    });
    return `Em muon gui mau:\n${lines.join("\n")}\n\nGui tu boba.room catalog`;
  };

  const handleCopySample = async () => {
    const msg = buildSampleMessage();
    try {
      await navigator.clipboard.writeText(msg);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = msg;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSendZalo = async () => {
    await handleCopySample();
    setShowSampleSheet(false);
    setShowSendOptions(false);
    setSendToast("Đã copy nội dung! Dán (Ctrl+V) vào khung chat Zalo");
    setTimeout(() => {
      window.open(`https://zalo.me/${ZALO_PHONE}`, "_blank");
    }, 500);
    setTimeout(() => setSendToast(null), 5000);
  };

  const handleSendFacebook = async () => {
    await handleCopySample();
    setShowSampleSheet(false);
    setShowSendOptions(false);
    setSendToast("Đã copy nội dung! Dán (Ctrl+V) vào khung chat Facebook");
    setTimeout(() => {
      window.open(FB_PAGE_URL, "_blank");
    }, 500);
    setTimeout(() => setSendToast(null), 5000);
  };

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

  // Load promo settings and show popup on first visit
  useEffect(() => {
    settingsService.get().then((s) => {
      if (s.catalogPromoEnabled && s.catalogPromoDiscountValue > 0) {
        setPromoDiscountValue(s.catalogPromoDiscountValue);
        setShowPromo(true);
      }
    });
  }, []);

  const handlePeriodChange = useCallback((period: "month" | "year") => {
    setTopPeriod(period);
    catalogService.getTopSellers(period).then(setTopSellers);
  }, []);

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

  const sortedProducts = useMemo(() => {
    const inStock = filtered.filter((p) => p.stock > 0);
    const outOfStock = filtered.filter((p) => p.stock === 0);
    return [...inStock, ...outOfStock];
  }, [filtered]);

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

  const getSampleQty = (productId: string) => {
    const item = sampleItems.find((i) => i.product.id === productId);
    return item?.quantity ?? 0;
  };

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

  const renderProductCard = (product: Product, opts?: { topIdx?: number; showAddBtn?: boolean }) => {
    const outOfStock = product.stock === 0;
    const topRank = opts?.topIdx != null ? opts.topIdx : topSellerMap.get(product.id);
    const hasRealImages = product.realImageUris?.some(isWebUrl);
    const hasMainImage = isWebUrl(product.imageUri);
    const qty = getSampleQty(product.id);

    return (
      <div
        key={product.id}
        className={`relative bg-white rounded-xl border overflow-hidden transition-shadow ${
          outOfStock
            ? "border-gray-200 opacity-60"
            : "border-pink-100 shadow-sm hover:shadow-md"
        }`}
      >
        {topRank && !outOfStock && (
          <div className="absolute top-2 left-2 z-10 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
            TOP {topRank}
          </div>
        )}

        {hasRealImages && !outOfStock && (
          <div className="absolute bottom-[calc(50%+8px)] right-2 z-10 bg-white/80 backdrop-blur text-[10px] font-bold text-pink-500 px-1.5 py-0.5 rounded-full">
            +{product.realImageUris.filter(isWebUrl).length} ảnh
          </div>
        )}

        <button
          onClick={() => !outOfStock && openLightbox(product)}
          className={`w-full aspect-square bg-pink-50/50 flex items-center justify-center overflow-hidden relative ${outOfStock ? "cursor-default" : ""}`}
          disabled={outOfStock || (!hasMainImage && !hasRealImages)}
        >
          {hasMainImage ? (
            <img
              src={product.imageUri!}
              alt={product.name}
              className={`w-full h-full object-cover transition-transform duration-300 ${outOfStock ? "opacity-40" : "hover:scale-105"}`}
              loading="lazy"
            />
          ) : (
            <span className="text-3xl text-pink-200">📦</span>
          )}
          {outOfStock && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-pink-400 flex items-center justify-center shadow-lg">
                <span className="text-white text-[11px] font-bold leading-tight text-center">Hết<br/>hàng</span>
              </div>
            </div>
          )}
        </button>

        <div className="p-2.5 space-y-0.5">
          <p className="text-xs font-bold text-gray-800 truncate" title={product.name}>
            {product.sku ? `${product.sku} - ${product.name}` : product.name}
          </p>
          {product.color && (
            <p className="text-[10px] text-pink-400">{product.color}</p>
          )}
          {/* Product content badges */}
          <div className="flex items-center gap-1 pt-0.5">
            {[
              { icon: "🛡️", label: "Titan 100%" },
              { icon: "✨", label: "Không kích ứng" },
              { icon: "💎", label: "Không đen gỉ" },
            ].map((badge) => (
              <span key={badge.label} className="inline-flex items-center gap-0.5 bg-pink-50 text-[9px] font-semibold text-pink-500 px-1.5 py-0.5 rounded">
                <span className="text-[10px]">{badge.icon}</span>{badge.label}
              </span>
            ))}
          </div>
          <div className="flex items-center justify-between pt-1">
            <p className="text-sm font-bold text-pink-600">{formatVND(product.price)}</p>
            {!outOfStock && qty === 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); addToSample(product); }}
                className="text-[9px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-full transition-colors border border-blue-200"
              >
                + Chọn
              </button>
            )}
            {qty > 0 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); updateSampleQty(product.id, -1); }}
                  className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center hover:bg-blue-200"
                >
                  -
                </button>
                <span className="text-xs font-bold text-blue-600 min-w-[1rem] text-center">{qty}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); updateSampleQty(product.id, 1); }}
                  className={`w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center ${
                    qty >= product.stock ? "bg-gray-100 text-gray-400" : "bg-blue-100 text-blue-600 hover:bg-blue-200"
                  }`}
                  disabled={qty >= product.stock}
                >
                  +
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div ref={scrollRef} className="min-h-screen bg-[#FFF8F5]">
      {/* Header */}
      <header className="bg-gradient-to-r from-pink-100 via-pink-50 to-amber-50 border-b border-pink-100">
        <div className="max-w-6xl mx-auto px-4 py-5 sm:py-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <img
              src="/logo.png"
              alt="Boba Room"
              className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 object-contain rounded-full bg-white"
            />

            <div className="shrink-0 bg-[#FFF5F0] border border-pink-100 rounded-xl px-4 sm:px-5 py-2.5 sm:py-3 text-center relative">
              <span className="text-pink-300 text-[10px] absolute top-1 left-2">✦</span>
              <span className="text-pink-300 text-[10px] absolute top-1 right-2">✦</span>
              <span className="text-pink-300 text-[10px] absolute bottom-1 left-2">✦</span>
              <span className="text-pink-300 text-[10px] absolute bottom-1 right-2">✦</span>
              <p className="text-sm sm:text-base font-extrabold text-amber-900 leading-tight">Lắc charm</p>
              <p className="text-sm sm:text-base font-extrabold text-amber-900 leading-tight">titan</p>
            </div>

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
              {topSellerProducts.map((product, idx) => renderProductCard(product, { topIdx: idx + 1 }))}
            </div>
          </section>
        )}

        {/* Product Grid */}
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
              {sortedProducts.map((product) => renderProductCard(product))}
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
        <div className="max-w-6xl mx-auto px-4 py-6 text-center space-y-1">
          <p className="text-sm font-semibold text-pink-600">boba.room</p>
          <p className="text-xs text-pink-400">accessories & more</p>
        </div>
      </footer>

      {/* Floating buttons */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-3">
        {/* Zalo */}
        <a
          href={`https://zalo.me/${ZALO_PHONE}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-11 h-11 rounded-full bg-blue-500 text-white shadow-lg hover:bg-blue-600 active:bg-blue-700 flex items-center justify-center transition-all"
          aria-label="Chat Zalo"
        >
          <span className="text-xs font-bold leading-none">Zalo</span>
        </a>

        {/* Facebook */}
        <a
          href={FB_PAGE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="w-11 h-11 rounded-full bg-[#1877F2] text-white shadow-lg hover:bg-[#166FE5] active:bg-[#1565D8] flex items-center justify-center transition-all"
          aria-label="Chat Facebook"
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.477 2 2 6.145 2 11.243c0 2.907 1.453 5.497 3.727 7.191V22l3.405-1.868A10.4 10.4 0 0012 20.486c5.523 0 10-4.145 10-9.243S17.523 2 12 2zm1.07 12.445l-2.55-2.724-4.98 2.724 5.478-5.818 2.614 2.724 4.916-2.724-5.478 5.818z" />
          </svg>
        </a>

        {sampleCount > 0 && (
          <button
            onClick={() => setShowSampleSheet(true)}
            className="w-14 h-14 rounded-full bg-blue-500 text-white shadow-lg hover:bg-blue-600 active:bg-blue-700 flex items-center justify-center transition-all relative"
            aria-label="Xem bảng mẫu"
          >
            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 01-8 0" />
            </svg>
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold min-w-[20px] h-5 rounded-full flex items-center justify-center px-1">
              {sampleCount}
            </span>
          </button>
        )}
      </div>

      {/* Sample Sheet (Bottom Sheet) */}
      {showSampleSheet && (
        <div
          className="fixed inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) { setShowSampleSheet(false); setShowSendOptions(false); } }}
        >
          <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col animate-slide-up">
            {/* Sheet header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-pink-100">
              <h3 className="text-base font-bold text-gray-800">
                Mẫu đã chọn ({sampleCount})
              </h3>
              <button
                onClick={() => { setShowSampleSheet(false); setShowSendOptions(false); }}
                className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center hover:bg-gray-200 text-lg"
              >
                &times;
              </button>
            </div>

            {/* Sheet body */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
              {sampleItems.map((item) => (
                <div key={item.product.id} className="flex items-center gap-3 bg-pink-50/50 rounded-xl p-3">
                  {/* Product image */}
                  <div className="w-14 h-14 rounded-lg overflow-hidden bg-pink-100 shrink-0">
                    {isWebUrl(item.product.imageUri) ? (
                      <img src={item.product.imageUri!} alt={item.product.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-pink-300 text-lg">📦</div>
                    )}
                  </div>

                  {/* Product info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">
                      {item.product.sku || item.product.name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{item.product.name}</p>
                    {item.product.color && (
                      <p className="text-[10px] text-pink-400">{item.product.color}</p>
                    )}
                  </div>

                  {/* Quantity controls */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => updateSampleQty(item.product.id, -1)}
                      className="w-7 h-7 rounded-full bg-pink-100 text-pink-600 text-sm font-bold flex items-center justify-center hover:bg-pink-200"
                    >
                      -
                    </button>
                    <span className="text-sm font-bold text-gray-800 min-w-[1.5rem] text-center">{item.quantity}</span>
                    <button
                      onClick={() => updateSampleQty(item.product.id, 1)}
                      className={`w-7 h-7 rounded-full text-sm font-bold flex items-center justify-center ${
                        item.quantity >= item.product.stock
                          ? "bg-gray-100 text-gray-400"
                          : "bg-pink-100 text-pink-600 hover:bg-pink-200"
                      }`}
                      disabled={item.quantity >= item.product.stock}
                    >
                      +
                    </button>
                    <button
                      onClick={() => removeSampleItem(item.product.id)}
                      className="w-7 h-7 rounded-full bg-red-50 text-red-400 text-sm flex items-center justify-center hover:bg-red-100 ml-1"
                    >
                      &times;
                    </button>
                  </div>
                </div>
              ))}

              {sampleItems.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-pink-300 text-sm">Chưa chọn mẫu nào</p>
                </div>
              )}
            </div>

            {/* Sheet footer */}
            {sampleItems.length > 0 && (
              <div className="px-5 py-4 border-t border-pink-100 space-y-3">
                {!showSendOptions ? (
                  <button
                    onClick={() => setShowSendGuide(true)}
                    className="w-full py-3 rounded-full bg-pink-500 text-white font-semibold text-sm hover:bg-pink-600 active:bg-pink-700 transition-colors shadow-sm"
                  >
                    Gửi mẫu
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleSendZalo}
                        className="py-3 rounded-xl bg-blue-500 text-white font-semibold text-sm hover:bg-blue-600 active:bg-blue-700 transition-colors"
                      >
                        Zalo
                      </button>
                      <button
                        onClick={handleSendFacebook}
                        className="py-3 rounded-xl bg-[#1877F2] text-white font-semibold text-sm hover:bg-[#166FE5] active:bg-[#1565D8] transition-colors"
                      >
                        Facebook
                      </button>
                    </div>
                    <button
                      onClick={handleCopySample}
                      className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-700 font-semibold text-sm hover:bg-gray-200 transition-colors"
                    >
                      {copied ? "Đã copy!" : "Chỉ copy nội dung"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Send guide popup */}
      {showSendGuide && (
        <div
          className="fixed inset-0 z-[95] bg-black/50 flex items-center justify-center px-6"
          onClick={(e) => { if (e.target === e.currentTarget) setShowSendGuide(false); }}
        >
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-4 animate-slide-up">
            <h4 className="text-base font-bold text-gray-800 text-center">Hướng dẫn gửi mẫu</h4>
            <div className="space-y-2 text-sm text-gray-600">
              <p><strong>Bước 1:</strong> Chọn Zalo hoặc Facebook ở bước tiếp theo.</p>
              <p><strong>Bước 2:</strong> Nội dung mẫu sẽ được tự động copy.</p>
              <p><strong>Bước 3:</strong> Dán (<strong>Ctrl+V</strong> hoặc nhấn giữ rồi chọn <strong>Paste</strong>) vào khung chat và gửi.</p>
            </div>
            <button
              onClick={() => { setShowSendGuide(false); setShowSendOptions(true); }}
              className="w-full py-3 rounded-full bg-pink-500 text-white font-semibold text-sm hover:bg-pink-600 active:bg-pink-700 transition-colors"
            >
              Đã đọc
            </button>
          </div>
        </div>
      )}

      {/* Send toast notification */}
      {sendToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[110] bg-gray-900 text-white px-5 py-3 rounded-xl shadow-xl text-sm font-medium max-w-sm text-center animate-slide-down">
          {sendToast}
        </div>
      )}

      {/* Promotion popup */}
      {showPromo && (
        <div
          className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center px-6"
          onClick={(e) => { if (e.target === e.currentTarget) setShowPromo(false); }}
        >
          <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden animate-slide-up shadow-2xl">
            <div className="bg-gradient-to-br from-pink-500 via-pink-400 to-amber-400 px-6 py-5 text-center">
              <p className="text-white text-[10px] font-medium tracking-widest uppercase mb-1">Chương trình ưu đãi</p>
              <p className="text-white text-4xl font-extrabold">GIẢM {promoDiscountValue}%</p>
              <p className="text-white/90 text-xs font-medium mt-1">Áp dụng ngay khi mua hàng</p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div className="flex items-start gap-3 bg-pink-50 rounded-xl p-3">
                <span className="text-lg">🎁</span>
                <div>
                  <p className="text-sm font-bold text-gray-800">Combo Lắc/Kiềng + Charm</p>
                  <p className="text-xs text-gray-500 mt-0.5">Mua 1 lắc hoặc kiềng kèm charm bất kỳ</p>
                </div>
              </div>
              <div className="flex items-start gap-3 bg-pink-50 rounded-xl p-3">
                <span className="text-lg">✨</span>
                <div>
                  <p className="text-sm font-bold text-gray-800">Mua từ 3 Charm trở lên</p>
                  <p className="text-xs text-gray-500 mt-0.5">Áp dụng cho tất cả các loại charm</p>
                </div>
              </div>
              <button
                onClick={() => setShowPromo(false)}
                className="w-full py-3 rounded-full bg-pink-500 text-white font-bold text-sm hover:bg-pink-600 active:bg-pink-700 transition-colors shadow-sm mt-2"
              >
                Xem ngay
              </button>
            </div>
          </div>
        </div>
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
