"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ensureAuth } from "@/services/firebase";
import { catalogService } from "@/services/catalogService";
import { settingsService } from "@/services/settingsService";
import { Product, ProductCategory } from "@/types";
import { formatVND } from "@/utils/currency";

// ─── Types ───────────────────────────────────────────────────────
interface SelectedCharm {
  id: string; // unique instance id
  product: Product;
}

type ViewMode = "round" | "horizontal";

interface HistoryEntry {
  charms: SelectedCharm[];
  bracelet: Product | null;
}

const ZALO_PHONE = "0836879035";
const FB_PAGE_URL = "https://m.me/bobaroomdiary";
const MAX_HISTORY = 50;

function isWebUrl(uri: string | null | undefined): boolean {
  if (!uri) return false;
  return uri.startsWith("https://") || uri.startsWith("http://");
}

// ─── Helpers ─────────────────────────────────────────────────────
function isHangingCharm(product: Product): boolean {
  return product.charmType === 'treo';
}

// Ưu tiên builderImageUri, fallback về imageUri
function getBuilderImage(product: Product): string | null {
  return product.builderImageUri || product.imageUri;
}

// ─── Canvas-based background removal ────────────────────────────
// Xóa nền trắng/gần trắng bằng canvas, trả về data URL PNG transparent
const bgRemovedCache = new Map<string, string>();

function removeWhiteBackground(imageUrl: string): Promise<string> {
  const cached = bgRemovedCache.get(imageUrl);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const proxyUrl = imageUrl.includes("firebasestorage.googleapis.com")
      ? `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`
      : imageUrl;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const maxSize = 480;
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imageData.data;

        // Chuyển pixel trắng/gần trắng thành transparent
        const threshold = 240; // R, G, B đều >= 240 → coi là trắng
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] >= threshold && d[i + 1] >= threshold && d[i + 2] >= threshold) {
            d[i + 3] = 0; // set alpha = 0
          }
        }

        ctx.putImageData(imageData, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        bgRemovedCache.set(imageUrl, dataUrl);
        resolve(dataUrl);
      } catch {
        resolve(imageUrl); // fallback to original
      }
    };
    img.onerror = () => resolve(imageUrl);
    img.src = proxyUrl;
  });
}

// Pre-process all product images for background removal (runs on page load)
function usePreprocessedImages(products: Product[]): Map<string, string> {
  const [map, setMap] = useState<Map<string, string>>(new Map());
  const processedUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const urls = products
      .map((p) => getBuilderImage(p))
      .filter((u): u is string => !!u && isWebUrl(u))
      .filter((u) => !processedUrlsRef.current.has(u));

    if (urls.length === 0) return;

    let cancelled = false;
    // Process in small batches to avoid overwhelming the browser
    const batchSize = 6;
    const unique = [...new Set(urls)];

    (async () => {
      for (let i = 0; i < unique.length; i += batchSize) {
        if (cancelled) return;
        const batch = unique.slice(i, i + batchSize);
        const results = await Promise.all(
          batch.map(async (url) => {
            const result = await removeWhiteBackground(url);
            return [url, result] as const;
          })
        );
        if (cancelled) return;
        setMap((prev) => {
          const next = new Map(prev);
          for (const [url, result] of results) {
            next.set(url, result);
            processedUrlsRef.current.add(url);
          }
          return next;
        });
      }
    })();

    return () => { cancelled = true; };
  }, [products]);

  return map;
}

// Detect vòng tròn trong ảnh bracelet bằng canvas pixel analysis
interface DetectedCircle {
  cx: number; // 0-1 normalized
  cy: number;
  radius: number; // 0-1 normalized (relative to image size)
}

const circleCache = new Map<string, DetectedCircle>();

function detectBraceletCircle(imageUrl: string): Promise<DetectedCircle | null> {
  const cached = circleCache.get(imageUrl);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const s = Math.min(img.width, 256); // downsample for speed
        const scale = s / img.width;
        canvas.width = s;
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

        // Tìm tất cả pixel "tối" (non-white) => thuộc vòng lắc
        const threshold = 220;
        const darkPixels: { x: number; y: number }[] = [];
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4;
            const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
            if (gray < threshold) {
              darkPixels.push({ x, y });
            }
          }
        }

        if (darkPixels.length < 10) { resolve(null); return; }

        // Centroid = tâm vòng
        let sumX = 0, sumY = 0;
        for (const p of darkPixels) { sumX += p.x; sumY += p.y; }
        const centX = sumX / darkPixels.length;
        const centY = sumY / darkPixels.length;

        // Tính radius: dùng outer edge (percentile 85) thay vì trung bình
        // để charm nằm đúng viền ngoài vòng lắc
        const distances = darkPixels.map(
          (p) => Math.sqrt((p.x - centX) ** 2 + (p.y - centY) ** 2)
        );
        distances.sort((a, b) => a - b);
        const outerRadius = distances[Math.floor(distances.length * 0.85)];

        const result: DetectedCircle = {
          cx: centX / canvas.width,
          cy: centY / canvas.height,
          radius: outerRadius / Math.max(canvas.width, canvas.height),
        };
        circleCache.set(imageUrl, result);
        resolve(result);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = proxyUrl;
  });
}

function useDetectedCircle(imageUrl: string | null) {
  const [circle, setCircle] = useState<DetectedCircle | null>(null);
  useEffect(() => {
    if (!imageUrl || !isWebUrl(imageUrl)) { setCircle(null); return; }
    detectBraceletCircle(imageUrl).then(setCircle);
  }, [imageUrl]);
  return circle;
}

// ─── Preview Components ──────────────────────────────────────────
function RoundPreview({ bracelet, charms, showNumbers, processedImages }: {
  bracelet: Product | null;
  charms: SelectedCharm[];
  showNumbers: boolean;
  processedImages: Map<string, string>;
}) {
  const detected = useDetectedCircle(bracelet?.imageUri ?? null);

  if (!bracelet) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-400 text-sm">Chon vong/lac de bat dau</p>
      </div>
    );
  }

  const hasBraceletImage = isWebUrl(bracelet.imageUri);

  // Kích thước render ảnh bracelet
  const imgRenderSize = 280;
  const charmSize = 80;
  const pad = charmSize + 16;
  const containerSize = imgRenderSize + pad * 2;
  const imgOffset = pad; // top-left of bracelet image in container

  // Vị trí tâm và bán kính thực tế (pixel) dựa trên detect hoặc fallback
  let circleCx: number, circleCy: number, circleRadius: number;
  if (detected) {
    circleCx = imgOffset + detected.cx * imgRenderSize;
    circleCy = imgOffset + detected.cy * imgRenderSize;
    // Dùng outer edge radius trực tiếp (đã detect bằng percentile 85)
    circleRadius = detected.radius * imgRenderSize;
  } else {
    // Fallback: tâm ảnh, radius = 35% ảnh
    circleCx = containerSize / 2;
    circleCy = containerSize / 2;
    circleRadius = imgRenderSize * 0.35;
  }

  // Phân bổ charm quanh phần dưới vòng tròn
  const centerDeg = 180;
  const maxArc = 260;
  const spacingDeg = Math.min(25, maxArc / Math.max(charms.length, 1));

  function charmDeg(i: number, n: number): number {
    if (n === 1) return centerDeg;
    const totalSpread = (n - 1) * spacingDeg;
    const startAngle = centerDeg - totalSpread / 2;
    return startAngle + i * spacingDeg;
  }

  return (
    <div className="flex flex-col items-center justify-center py-4 gap-2">
      <div className="relative bg-white" style={{ width: containerSize, height: containerSize }}>
        {/* Ảnh vòng lắc */}
        {hasBraceletImage && (
          <img
            src={bracelet.imageUri!}
            alt={bracelet.name}
            className="absolute object-contain"
            style={{
              left: imgOffset,
              top: imgOffset,
              width: imgRenderSize,
              height: imgRenderSize,
              mixBlendMode: "multiply",
              transform: "rotate(180deg)",
            }}
          />
        )}

        {/* Vòng tròn SVG fallback (khi không có ảnh) */}
        {!hasBraceletImage && (
          <svg
            className="absolute"
            style={{ left: circleCx - circleRadius, top: circleCy - circleRadius, width: circleRadius * 2, height: circleRadius * 2 }}
            viewBox={`0 0 ${circleRadius * 2} ${circleRadius * 2}`}
          >
            <circle cx={circleRadius} cy={circleRadius} r={circleRadius - 6} fill="none" stroke="#E5E7EB" strokeWidth="10" />
            <defs>
              <linearGradient id="braceletGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#F9A8D4" />
                <stop offset="30%" stopColor="#C084FC" />
                <stop offset="70%" stopColor="#93C5FD" />
                <stop offset="100%" stopColor="#F9A8D4" />
              </linearGradient>
            </defs>
            <circle cx={circleRadius} cy={circleRadius} r={circleRadius - 6} fill="none" stroke="url(#braceletGrad)" strokeWidth="8" />
          </svg>
        )}

        {/* Charm xung quanh vòng */}
        {charms.map((charm, i) => {
          const n = charms.length;
          const deg = charmDeg(i, n);
          const rad = ((deg - 90) * Math.PI) / 180;
          const hanging = isHangingCharm(charm.product);
          const r = hanging ? circleRadius + charmSize * 0.25 : circleRadius;
          const x = circleCx + Math.cos(rad) * r;
          const y = circleCy + Math.sin(rad) * r;

          // Xoay charm theo tiếp tuyến vòng tròn: 0° ở đáy, nghiêng dần ra 2 bên
          const rotateDeg = deg - 180;
          const origUrl = getBuilderImage(charm.product);
          const processedUrl = origUrl ? processedImages.get(origUrl) : null;

          return (
            <div
              key={charm.id}
              className="absolute group"
              style={{ left: x - charmSize / 2, top: y - charmSize / 2, transform: `rotate(${rotateDeg}deg)` }}
            >
              <div
                className="flex items-center justify-center"
                style={{ width: charmSize, height: charmSize }}
              >
                {origUrl && isWebUrl(origUrl) ? (
                  <img
                    src={processedUrl || origUrl}
                    alt={charm.product.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-xs font-bold text-pink-500">{i + 1}</span>
                )}
              </div>
              {showNumbers && (
                <span className="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full bg-gray-800 text-white text-[9px] font-bold flex items-center justify-center shadow">
                  {i + 1}
                </span>
              )}
            </div>
          );
        })}

        {/* Placeholder */}
        {charms.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-gray-400 text-xs">Them charm vao vong</p>
          </div>
        )}
      </div>

      <p className="text-sm font-semibold text-gray-700">{bracelet.name}</p>
    </div>
  );
}

function HorizontalPreview({ bracelet, charms, showNumbers, processedImages }: {
  bracelet: Product | null;
  charms: SelectedCharm[];
  showNumbers: boolean;
  processedImages: Map<string, string>;
}) {

  if (!bracelet) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-400 text-sm">Chọn vòng/lắc để bắt đầu</p>
      </div>
    );
  }

  const W = 340;
  const H = 100;
  const charmSize = 64;
  const hangLen = 20;
  const hasBraceletImage = isWebUrl(bracelet.imageUri);

  // Đường cong nhẹ dạng dây chuyền
  const path = `M 20,25 Q ${W / 2},${H - 5} ${W - 20},25`;

  function quadPoint(t: number): { x: number; y: number } {
    const x0 = 20, y0 = 25;
    const x1 = W / 2, y1 = H - 5;
    const x2 = W - 20, y2 = 25;
    const mt = 1 - t;
    return {
      x: mt * mt * x0 + 2 * mt * t * x1 + t * t * x2,
      y: mt * mt * y0 + 2 * mt * t * y1 + t * t * y2,
    };
  }

  // Tangent for hanging direction
  function quadTangent(t: number): { dx: number; dy: number } {
    const x0 = 20, y0 = 25;
    const x1 = W / 2, y1 = H - 5;
    const x2 = W - 20, y2 = 25;
    const dx = 2 * (1 - t) * (x1 - x0) + 2 * t * (x2 - x1);
    const dy = 2 * (1 - t) * (y1 - y0) + 2 * t * (y2 - y1);
    return { dx, dy };
  }

  return (
    <div className="flex flex-col items-center justify-center py-6 gap-2 px-4">
      <div className="relative" style={{ width: W, height: H + charmSize + hangLen + 20 }}>
        {/* Đường cong SVG */}
        <svg className="absolute inset-0" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          <defs>
            <linearGradient id="braceletGradH" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#F9A8D4" />
              <stop offset="30%" stopColor="#C084FC" />
              <stop offset="70%" stopColor="#93C5FD" />
              <stop offset="100%" stopColor="#F9A8D4" />
            </linearGradient>
          </defs>
          <path d={path} fill="none" stroke={hasBraceletImage ? "rgba(0,0,0,0.08)" : "url(#braceletGradH)"} strokeWidth={hasBraceletImage ? "2" : "6"} strokeLinecap="round" />
          <circle cx={20} cy={25} r="4" fill="#E5E7EB" stroke="#D1D5DB" strokeWidth="2" />
          <circle cx={W - 20} cy={25} r="4" fill="#E5E7EB" stroke="#D1D5DB" strokeWidth="2" />
        </svg>

        {/* Bracelet image along curve */}
        {hasBraceletImage && (
          <div
            className="absolute overflow-hidden"
            style={{
              left: 15,
              top: 15,
              width: W - 30,
              height: H - 10,
              maskImage: `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${W - 30}' height='${H - 10}' viewBox='5 15 ${W - 30} ${H - 10}'><path d='${path}' fill='none' stroke='white' stroke-width='14' stroke-linecap='round'/></svg>`)}")`,
              WebkitMaskImage: `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${W - 30}' height='${H - 10}' viewBox='5 15 ${W - 30} ${H - 10}'><path d='${path}' fill='none' stroke='white' stroke-width='14' stroke-linecap='round'/></svg>`)}")`,
            }}
          >
            <img src={bracelet.imageUri!} alt={bracelet.name} className="w-full h-full object-cover" />
          </div>
        )}

        {/* Charm */}
        {charms.map((charm, i) => {
          const n = charms.length;
          const t = n === 1 ? 0.5 : 0.12 + (i / (n - 1)) * 0.76;
          const pt = quadPoint(t);
          const hanging = isHangingCharm(charm.product);

          const tan = quadTangent(t);
          // Góc xoay theo tiếp tuyến đường cong
          const tangentAngle = Math.atan2(tan.dy, tan.dx) * (180 / Math.PI);

          let charmX: number, charmY: number;
          if (!hanging) {
            // Charm xỏ: nằm giữa đường cong
            charmX = pt.x - charmSize / 2;
            charmY = pt.y - charmSize / 2;
          } else {
            // Charm treo: treo xuống dưới vuông góc với đường cong
            const len = Math.sqrt(tan.dx * tan.dx + tan.dy * tan.dy);
            const nx = -tan.dy / len;
            const ny = tan.dx / len;
            const dir = ny >= 0 ? 1 : -1;
            charmX = pt.x + nx * hangLen * dir - charmSize / 2;
            charmY = pt.y + ny * hangLen * dir - charmSize / 2;
          }

          const origUrl = getBuilderImage(charm.product);
          const processedUrl = origUrl ? processedImages.get(origUrl) : null;

          return (
            <div key={charm.id} className="absolute group" style={{ left: charmX, top: charmY, transform: `rotate(${tangentAngle}deg)` }}>
              <div
                className="flex items-center justify-center"
                style={{ width: charmSize, height: charmSize }}
              >
                {origUrl && isWebUrl(origUrl) ? (
                  <img
                    src={processedUrl || origUrl}
                    alt={charm.product.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-xs font-bold text-pink-500">{i + 1}</span>
                )}
              </div>
              {showNumbers && (
                <span className="absolute -top-2 -right-2 z-10 w-5 h-5 rounded-full bg-gray-800 text-white text-[9px] font-bold flex items-center justify-center shadow">
                  {i + 1}
                </span>
              )}
            </div>
          );
        })}

        {charms.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-gray-400 text-xs mt-4">Thêm charm vào vòng</p>
          </div>
        )}
      </div>

      <p className="text-sm font-semibold text-gray-700">{bracelet.name}</p>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────
export default function BuilderPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [maxCharms, setMaxCharms] = useState(10);
  const [braceletCategoryIds, setBraceletCategoryIds] = useState<string[]>([]);
  const [builderEnabled, setBuilderEnabled] = useState(true);

  // Builder state
  const [selectedBracelet, setSelectedBracelet] = useState<Product | null>(null);
  const [charms, setCharms] = useState<SelectedCharm[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("round");
  const [search, setSearch] = useState("");
  const [selectedCharmCategory, setSelectedCharmCategory] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sendToast, setSendToast] = useState<string | null>(null);
  const [showNumbers, setShowNumbers] = useState(false);

  // History for undo/redo
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const skipHistoryRef = useRef(false);

  // Ref cho export ảnh
  const previewRef = useRef<HTMLDivElement>(null);

  // ─── Data loading ────────────────────────────────────────────
  useEffect(() => {
    let unsubProducts: (() => void) | undefined;
    let unsubCategories: (() => void) | undefined;

    ensureAuth().then(() => {
      unsubProducts = catalogService.subscribeToProducts((list) => {
        setProducts(list);
        setLoading(false);
      });
      unsubCategories = catalogService.subscribeToCategories(setCategories);
      settingsService.get().then((s) => {
        setMaxCharms(s.builderMaxCharms || 10);
        setBraceletCategoryIds(s.builderBraceletCategoryIds || []);
        setBuilderEnabled(s.builderEnabled);
      });
    });

    return () => { unsubProducts?.(); unsubCategories?.(); };
  }, []);

  // ─── Load saved draft from localStorage ────────────────────
  useEffect(() => {
    if (loading || products.length === 0) return;
    try {
      const saved = localStorage.getItem("builder_draft");
      if (!saved) return;
      const draft = JSON.parse(saved);
      if (draft.braceletId) {
        const b = products.find((p) => p.id === draft.braceletId);
        if (b) setSelectedBracelet(b);
      }
      if (draft.charmIds?.length) {
        let counter = 0;
        const restored: SelectedCharm[] = [];
        for (const cid of draft.charmIds) {
          const p = products.find((pp) => pp.id === cid);
          if (p) restored.push({ id: `charm_${counter++}`, product: p });
        }
        if (restored.length) setCharms(restored);
      }
    } catch { /* ignore */ }
  }, [loading, products]);

  // ─── Save draft to localStorage ────────────────────────────
  useEffect(() => {
    if (loading) return;
    const draft = {
      braceletId: selectedBracelet?.id ?? null,
      charmIds: charms.map((c) => c.product.id),
    };
    localStorage.setItem("builder_draft", JSON.stringify(draft));
  }, [selectedBracelet, charms, loading]);

  // ─── History management ────────────────────────────────────
  useEffect(() => {
    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      return;
    }
    const entry: HistoryEntry = { charms: [...charms], bracelet: selectedBracelet };
    setHistory((prev) => {
      const newHistory = prev.slice(0, historyIdx + 1);
      newHistory.push(entry);
      if (newHistory.length > MAX_HISTORY) newHistory.shift();
      return newHistory;
    });
    setHistoryIdx((prev) => Math.min(prev + 1, MAX_HISTORY - 1));
  }, [charms, selectedBracelet]);

  const canUndo = historyIdx > 0;
  const canRedo = historyIdx < history.length - 1;

  const undo = useCallback(() => {
    if (!canUndo) return;
    const newIdx = historyIdx - 1;
    const entry = history[newIdx];
    skipHistoryRef.current = true;
    setCharms(entry.charms);
    setSelectedBracelet(entry.bracelet);
    setHistoryIdx(newIdx);
  }, [canUndo, historyIdx, history]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    const newIdx = historyIdx + 1;
    const entry = history[newIdx];
    skipHistoryRef.current = true;
    setCharms(entry.charms);
    setSelectedBracelet(entry.bracelet);
    setHistoryIdx(newIdx);
  }, [canRedo, historyIdx, history]);

  // ─── Computed data ─────────────────────────────────────────
  const braceletProducts = useMemo(() => {
    if (braceletCategoryIds.length === 0) return [];
    return products.filter((p) => p.categoryId && braceletCategoryIds.includes(p.categoryId) && p.stock > 0);
  }, [products, braceletCategoryIds]);

  const charmCategories = useMemo(() => {
    return categories.filter((c) => !braceletCategoryIds.includes(c.id));
  }, [categories, braceletCategoryIds]);

  const charmProducts = useMemo(() => {
    return products.filter((p) => {
      if (p.categoryId && braceletCategoryIds.includes(p.categoryId)) return false;
      if (p.stock <= 0) return false;
      if (selectedCharmCategory && p.categoryId !== selectedCharmCategory) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      }
      return true;
    });
  }, [products, braceletCategoryIds, selectedCharmCategory, search]);

  // Pre-process background removal for all charm images on load
  const processedImages = usePreprocessedImages(charmProducts);

  const totalPrice = useMemo(() => {
    const braceletPrice = selectedBracelet?.price ?? 0;
    const charmsPrice = charms.reduce((sum, c) => sum + c.product.price, 0);
    return braceletPrice + charmsPrice;
  }, [selectedBracelet, charms]);

  // ─── Actions ───────────────────────────────────────────────
  let charmCounter = useRef(0);

  const addCharm = (product: Product) => {
    if (charms.length >= maxCharms) return;
    const id = `charm_${charmCounter.current++}`;
    setCharms((prev) => [...prev, { id, product }]);
  };

  const removeCharm = (instanceId: string) => {
    setCharms((prev) => prev.filter((c) => c.id !== instanceId));
  };

  const clearCharms = () => {
    if (charms.length === 0) return;
    setCharms([]);
  };

  const selectBracelet = (product: Product) => {
    setSelectedBracelet(product);
  };

  // ─── Export ────────────────────────────────────────────────
  const exportImage = async () => {
    const el = previewRef.current;
    if (!el) return;
    // Dynamic import html2canvas
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(el, { backgroundColor: "#FFFFFF", scale: 2, useCORS: true });
    const link = document.createElement("a");
    link.download = `boba-room-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const buildMessage = () => {
    const lines: string[] = [];
    if (selectedBracelet) {
      lines.push(`Vòng: ${selectedBracelet.sku ? selectedBracelet.sku + " - " : ""}${selectedBracelet.name} — ${formatVND(selectedBracelet.price)}`);
    }
    lines.push("");
    lines.push(`Charm (${charms.length}):`);
    // Group charms by product
    const grouped = new Map<string, { product: Product; count: number }>();
    charms.forEach((c) => {
      const key = c.product.id;
      const existing = grouped.get(key);
      if (existing) {
        existing.count++;
      } else {
        grouped.set(key, { product: c.product, count: 1 });
      }
    });
    grouped.forEach(({ product, count }) => {
      const sku = product.sku ? `${product.sku} - ` : "";
      lines.push(`- ${sku}${product.name} x${count} — ${formatVND(product.price * count)}`);
    });
    lines.push("");
    lines.push(`Tổng: ${formatVND(totalPrice)}`);
    lines.push("");
    lines.push("Phối từ boba.room builder");
    return lines.join("\n");
  };

  const handleCopy = async () => {
    const msg = buildMessage();
    try {
      await navigator.clipboard.writeText(msg);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = msg;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendZalo = async () => {
    await handleCopy();
    setShowExportModal(false);
    setSendToast("Đã copy nội dung! Dán vào khung chat Zalo");
    setTimeout(() => window.open(`https://zalo.me/${ZALO_PHONE}`, "_blank"), 500);
    setTimeout(() => setSendToast(null), 5000);
  };

  const handleSendFacebook = async () => {
    await handleCopy();
    setShowExportModal(false);
    setSendToast("Đã copy nội dung! Dán vào khung chat Facebook");
    setTimeout(() => window.open(FB_PAGE_URL, "_blank"), 500);
    setTimeout(() => setSendToast(null), 5000);
  };

  // ─── Loading / disabled ────────────────────────────────────
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

  if (!builderEnabled) {
    return (
      <div className="min-h-screen bg-[#FFF8F5] flex items-center justify-center">
        <div className="text-center px-6">
          <p className="text-xl font-bold text-gray-700 mb-2">Tính năng phối mẫu</p>
          <p className="text-gray-500 text-sm">Tính năng đang được cập nhật, vui lòng quay lại sau.</p>
          <a href="/" className="inline-block mt-4 px-6 py-3 rounded-full bg-pink-500 text-white font-semibold text-sm hover:bg-pink-600">
            Về trang chủ
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF8F5] flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-pink-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-50">
        <a href="/" className="text-pink-400 hover:text-pink-600">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </a>
        <h1 className="text-lg font-bold text-gray-900 flex-1">Phối mẫu</h1>
        <div className="text-right">
          <p className="text-xs text-gray-500">Tổng tiền</p>
          <p className="text-base font-bold text-pink-600">{formatVND(totalPrice)}</p>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row lg:h-[calc(100vh-56px)] lg:overflow-hidden">
        {/* LEFT: Preview */}
        <div className="lg:w-1/2 xl:w-[45%] flex flex-col bg-white lg:border-r border-pink-100 lg:overflow-auto">
          {/* View mode toggle */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
              {(["round", "horizontal"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    viewMode === mode ? "bg-white text-pink-600 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {mode === "round" ? "Tròn" : "Ngang"}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setShowNumbers(!showNumbers)}
                className={`p-1.5 rounded-lg transition-colors ${showNumbers ? "text-gray-700 bg-gray-100" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"}`}
                title={showNumbers ? "Ẩn số" : "Hiện số"}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>
              </button>
              <button onClick={undo} disabled={!canUndo} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30" title="Hoàn tác">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4" /></svg>
              </button>
              <button onClick={redo} disabled={!canRedo} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-30" title="Làm lại">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v2m15-7l-4-4m4 4l-4 4" /></svg>
              </button>
            </div>
          </div>

          {/* Preview */}
          <div ref={previewRef} className="bg-white">
            {viewMode === "round" ? (
              <RoundPreview bracelet={selectedBracelet} charms={charms} showNumbers={showNumbers} processedImages={processedImages} />
            ) : (
              <HorizontalPreview bracelet={selectedBracelet} charms={charms} showNumbers={showNumbers} processedImages={processedImages} />
            )}
          </div>

          {/* Selected charms list */}
          {charms.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-700">
                  Charm đã chọn ({charms.length}/{maxCharms})
                </p>
                <button onClick={clearCharms} className="text-xs text-red-400 hover:text-red-600 font-medium">
                  Xóa hết
                </button>
              </div>
              <div className="flex gap-3 overflow-x-auto pt-2 pr-2 pb-1 scrollbar-hide">
                {charms.map((charm, idx) => (
                  <div key={charm.id} className="relative shrink-0">
                    <div className="w-14 h-14 rounded-xl bg-pink-50 border border-pink-200 overflow-hidden flex items-center justify-center">
                      {isWebUrl(getBuilderImage(charm.product)) ? (
                        <img src={getBuilderImage(charm.product)!} alt={charm.product.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs text-pink-400 font-bold">{idx + 1}</span>
                      )}
                    </div>
                    <button
                      onClick={() => removeCharm(charm.id)}
                      className="absolute -top-2 -right-2 z-10 w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center shadow-md hover:bg-red-600 active:bg-red-700"
                    >
                      &times;
                    </button>
                    <p className="text-[9px] text-gray-500 text-center mt-0.5 w-14 truncate">{charm.product.name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="border-t border-gray-100 px-4 py-3 flex gap-2">
            <button
              onClick={exportImage}
              disabled={!selectedBracelet}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-40 transition-colors"
            >
              Lưu ảnh
            </button>
            <button
              onClick={() => setShowExportModal(true)}
              disabled={!selectedBracelet || charms.length === 0}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-pink-500 text-white hover:bg-pink-600 disabled:opacity-40 transition-colors"
            >
              Nhắn Shop
            </button>
          </div>
        </div>

        {/* RIGHT: Catalog */}
        <div className="lg:w-1/2 xl:w-[55%] flex flex-col min-h-0">
          {/* Bracelet selector */}
          <div className="bg-white border-b border-pink-100 px-4 py-3">
            <p className="text-xs font-bold text-gray-700 mb-2">Chọn vòng/lắc</p>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {braceletProducts.map((b) => (
                <button
                  key={b.id}
                  onClick={() => selectBracelet(b)}
                  className={`shrink-0 flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-colors min-w-[80px] ${
                    selectedBracelet?.id === b.id
                      ? "border-pink-500 bg-pink-50"
                      : "border-gray-200 bg-white hover:border-pink-300"
                  }`}
                >
                  <div className="w-14 h-14 rounded-lg bg-gray-50 overflow-hidden flex items-center justify-center">
                    {isWebUrl(b.imageUri) ? (
                      <img src={b.imageUri!} alt={b.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-lg">🔗</span>
                    )}
                  </div>
                  <span className="text-[10px] font-semibold text-gray-700 text-center leading-tight max-w-[70px] truncate">{b.name}</span>
                  <span className="text-[10px] text-pink-500 font-bold">{formatVND(b.price)}</span>
                </button>
              ))}
              {braceletProducts.length === 0 && (
                <p className="text-xs text-gray-400 py-2">Chưa cấu hình danh mục vòng/lắc trong cài đặt</p>
              )}
            </div>
          </div>

          {/* Charm search & filter */}
          <div className="bg-white border-b border-pink-100 px-4 py-2 space-y-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Tìm charm..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-full px-4 py-2 pl-9 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-300"
              />
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              <button
                onClick={() => setSelectedCharmCategory(null)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  !selectedCharmCategory
                    ? "bg-pink-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                Tất cả
              </button>
              {charmCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCharmCategory(selectedCharmCategory === cat.id ? null : cat.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    selectedCharmCategory === cat.id
                      ? "bg-pink-500 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Charm grid */}
          <div className="flex-1 overflow-auto p-4">
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {charmProducts.map((product) => {
                const count = charms.filter((c) => c.product.id === product.id).length;
                const atMax = charms.length >= maxCharms;
                return (
                  <button
                    key={product.id}
                    onClick={() => addCharm(product)}
                    disabled={atMax}
                    className={`relative bg-white rounded-xl border overflow-hidden text-left transition-all ${
                      atMax
                        ? "border-gray-200 opacity-50 cursor-not-allowed"
                        : "border-pink-100 hover:border-pink-300 hover:shadow-md active:scale-95"
                    }`}
                  >
                    {count > 0 && (
                      <div className="absolute top-1.5 right-1.5 z-10 bg-pink-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                        {count}
                      </div>
                    )}
                    <div className="aspect-square bg-pink-50/50 flex items-center justify-center overflow-hidden">
                      {isWebUrl(product.imageUri) ? (
                        <img src={product.imageUri!} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <span className="text-2xl text-pink-200">✨</span>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-[11px] font-semibold text-gray-800 leading-tight truncate">
                        {product.sku ? `${product.sku} - ` : ""}{product.name}
                      </p>
                      <p className="text-[11px] font-bold text-pink-500 mt-0.5">{formatVND(product.price)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            {charmProducts.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-400 text-sm">Không tìm thấy charm nào</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center" onClick={() => setShowExportModal(false)}>
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6 space-y-4 animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-gray-900">Gửi đơn phối mẫu</h3>

            {/* Summary */}
            <div className="bg-pink-50 rounded-xl p-4 text-sm space-y-1">
              <p className="font-semibold text-gray-800">{selectedBracelet?.name}</p>
              <p className="text-gray-600">{charms.length} charm</p>
              <p className="text-pink-600 font-bold text-base">{formatVND(totalPrice)}</p>
            </div>

            {/* Message preview */}
            <div className="bg-gray-50 rounded-xl p-3 max-h-40 overflow-auto">
              <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans">{buildMessage()}</pre>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleCopy}
                className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors ${
                  copied ? "bg-green-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {copied ? "Đã copy!" : "Copy nội dung"}
              </button>
              <button
                onClick={exportImage}
                className="w-full py-3 rounded-xl text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              >
                Tải ảnh thiết kế
              </button>
              <div className="flex gap-2">
                <button
                  onClick={handleSendZalo}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                >
                  Gửi Zalo
                </button>
                <button
                  onClick={handleSendFacebook}
                  className="flex-1 py-3 rounded-xl text-sm font-semibold bg-indigo-500 text-white hover:bg-indigo-600 transition-colors"
                >
                  Gửi Facebook
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {sendToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] bg-gray-900 text-white text-sm font-medium px-5 py-3 rounded-xl shadow-lg animate-slide-down">
          {sendToast}
        </div>
      )}
    </div>
  );
}
