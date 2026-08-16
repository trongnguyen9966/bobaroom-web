"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { productService } from "@/services/productService";
import { Product } from "@/types";
import { formatVND } from "@/utils/currency";

export interface PickerSelection {
  product: Product;
  quantity: number;
}

interface ProductPickerModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (selections: PickerSelection[]) => void;
  initialSelections?: PickerSelection[];
}

export function ProductPickerModal({ open, onClose, onConfirm, initialSelections = [] }: ProductPickerModalProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  // Draft state — only committed on confirm
  const [draft, setDraft] = useState<Map<string, { product: Product; quantity: number }>>(new Map());

  // Reset draft from initialSelections when modal opens
  useEffect(() => {
    if (!open) return;
    setSearch("");
    const map = new Map<string, { product: Product; quantity: number }>();
    for (const s of initialSelections) {
      map.set(s.product.id, { product: s.product, quantity: s.quantity });
    }
    setDraft(map);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const unsub = productService.subscribeToAll((list) => {
      setProducts(list);
      setLoading(false);
    });
    return () => unsub();
  }, [open]);

  const filtered = search.trim()
    ? products.filter((p) => {
        const q = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.color.toLowerCase().includes(q) ||
          (p.size ?? "").toLowerCase().includes(q)
        );
      })
    : products;

  const toggleProduct = (product: Product) => {
    if (product.stock <= 0) return; // Don't allow adding out-of-stock products
    setDraft((prev) => {
      const next = new Map(prev);
      if (next.has(product.id)) {
        next.delete(product.id);
      } else {
        next.set(product.id, { product, quantity: 1 });
      }
      return next;
    });
  };

  const changeQuantity = (productId: string, delta: number) => {
    setDraft((prev) => {
      const next = new Map(prev);
      const entry = next.get(productId);
      if (!entry) return prev;
      const newQty = entry.quantity + delta;
      if (newQty <= 0) {
        next.delete(productId);
      } else if (newQty > entry.product.stock) {
        return prev; // Don't exceed stock
      } else {
        next.set(productId, { ...entry, quantity: newQty });
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const selections: PickerSelection[] = Array.from(draft.values());
    onConfirm(selections);
    onClose();
  };

  const selectedCount = draft.size;

  return (
    <Modal open={open} onClose={onClose} title="Chọn sản phẩm" size="lg">
      <div className="space-y-3">
        <input
          type="text"
          placeholder="Tìm sản phẩm..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          autoFocus
        />

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-3 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted py-8">Không tìm thấy sản phẩm</p>
        ) : (
          <div className="max-h-80 overflow-auto divide-y divide-gray-50 -mx-1">
            {filtered.map((product) => {
              const entry = draft.get(product.id);
              const qty = entry?.quantity ?? 0;
              const isSelected = qty > 0;
              const isLowStock = product.stock > 0 && product.stock <= 3;
              const isOutOfStock = product.stock <= 0;

              return (
                <div
                  key={product.id}
                  className={`flex items-start gap-3 px-3 py-3 rounded-lg transition-colors ${
                    isSelected ? "bg-blue-50" : isOutOfStock ? "opacity-50" : ""
                  }`}
                >
                  <button
                    onClick={() => toggleProduct(product)}
                    disabled={isOutOfStock && !isSelected}
                    className={`flex items-start gap-3 flex-1 min-w-0 text-left ${isOutOfStock && !isSelected ? "cursor-not-allowed" : ""}`}
                  >
                    <span className={`mt-0.5 shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                      isSelected ? "bg-primary border-primary" : isOutOfStock ? "border-gray-200 bg-gray-100" : "border-gray-300"
                    }`}>
                      {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                    </span>

                    {product.imageUri ? (
                      <img
                        src={product.imageUri}
                        alt={product.name}
                        className="w-10 h-10 rounded-lg object-cover bg-gray-100 shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                        <span className="text-gray-400 text-xs">📦</span>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                      <p className="text-xs text-muted">
                        {[product.color, product.size].filter(Boolean).join(" | ")}
                        {product.sku ? ` - ${product.sku}` : ""}
                      </p>
                      {isOutOfStock ? (
                        <p className="text-xs font-semibold text-red-500 mt-0.5">Hết hàng</p>
                      ) : isLowStock ? (
                        <p className="text-xs font-semibold text-amber-500 mt-0.5">
                          {product.stock === 1 ? "Còn 1 sản phẩm" : `Sắp hết hàng (còn ${product.stock})`}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-light mt-0.5">Tồn kho: {product.stock}</p>
                      )}
                    </div>
                  </button>

                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <span className="text-sm font-semibold text-primary">
                      {formatVND(product.price)}
                    </span>
                    {isSelected && (
                      <div className="flex items-center border border-gray-200 rounded-lg bg-white">
                        <button
                          onClick={() => changeQuantity(product.id, -1)}
                          className="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-50 rounded-l-lg text-sm font-bold"
                        >
                          -
                        </button>
                        <span className="w-7 h-7 flex items-center justify-center text-xs font-bold text-gray-900">
                          {qty}
                        </span>
                        <button
                          onClick={() => changeQuantity(product.id, 1)}
                          disabled={qty >= product.stock}
                          className={`w-7 h-7 flex items-center justify-center rounded-r-lg text-sm font-bold ${
                            qty >= product.stock ? "text-gray-300 cursor-not-allowed" : "text-gray-500 hover:bg-gray-50"
                          }`}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Confirm button */}
        <button
          onClick={handleConfirm}
          className="w-full py-3 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-hover disabled:opacity-50 shadow-sm"
        >
          {selectedCount > 0 ? `Xác nhận (${selectedCount} sản phẩm)` : "Xác nhận"}
        </button>
      </div>
    </Modal>
  );
}
