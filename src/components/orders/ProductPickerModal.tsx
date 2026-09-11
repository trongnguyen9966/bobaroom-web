"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { productService } from "@/services/productService";
import { Product } from "@/types";
import { formatVND } from "@/utils/currency";

export interface PickerSelection {
  product: Product;
  quantity: number;
  selectedSize?: string;
}

interface DraftEntry {
  product: Product;
  quantity: number;
  selectedSize?: string;
}

interface ProductPickerModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (selections: PickerSelection[]) => void;
  initialSelections?: PickerSelection[];
}

/** Unique key for a product+size combination */
function draftKey(productId: string, sizeName?: string): string {
  return sizeName ? `${productId}::${sizeName}` : productId;
}

export function ProductPickerModal({ open, onClose, onConfirm, initialSelections = [] }: ProductPickerModalProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Map<string, DraftEntry>>(new Map());

  useEffect(() => {
    if (!open) return;
    setSearch("");
    const map = new Map<string, DraftEntry>();
    for (const s of initialSelections) {
      const key = draftKey(s.product.id, s.selectedSize);
      map.set(key, { product: s.product, quantity: s.quantity, selectedSize: s.selectedSize });
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
          (p.size ?? "").toLowerCase().includes(q) ||
          (p.sizes ?? []).some((s) => s.name.toLowerCase().includes(q))
        );
      })
    : products;

  const hasSizes = (product: Product) => (product.sizes ?? []).length > 0;

  const getSizeStock = (product: Product, sizeName: string) => {
    return product.sizes?.find((s) => s.name === sizeName)?.stock ?? 0;
  };

  const getSizePrice = (product: Product, sizeName: string) => {
    return product.sizes?.find((s) => s.name === sizeName)?.price ?? product.price;
  };

  const toggleProduct = (product: Product) => {
    if (hasSizes(product)) return; // Sized products are toggled per-size
    if (product.stock <= 0) return;
    setDraft((prev) => {
      const next = new Map(prev);
      const key = draftKey(product.id);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, { product, quantity: 1 });
      }
      return next;
    });
  };

  const toggleSize = (product: Product, sizeName: string) => {
    const stock = getSizeStock(product, sizeName);
    if (stock <= 0) return;
    setDraft((prev) => {
      const next = new Map(prev);
      const key = draftKey(product.id, sizeName);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, { product, quantity: 1, selectedSize: sizeName });
      }
      return next;
    });
  };

  const changeQuantity = (key: string, delta: number) => {
    setDraft((prev) => {
      const next = new Map(prev);
      const entry = next.get(key);
      if (!entry) return prev;
      const newQty = entry.quantity + delta;
      const maxStock = entry.selectedSize
        ? getSizeStock(entry.product, entry.selectedSize)
        : entry.product.stock;
      if (newQty <= 0) {
        next.delete(key);
      } else if (newQty > maxStock) {
        return prev;
      } else {
        next.set(key, { ...entry, quantity: newQty });
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const selections: PickerSelection[] = Array.from(draft.values()).map((e) => ({
      product: e.product,
      quantity: e.quantity,
      selectedSize: e.selectedSize,
    }));
    onConfirm(selections);
    onClose();
  };

  const selectedCount = draft.size;

  // Count selected sizes for a product
  const getProductSelectedSizes = (productId: string): string[] => {
    const selected: string[] = [];
    draft.forEach((entry, key) => {
      if (key.startsWith(productId + "::") && entry.selectedSize) {
        selected.push(entry.selectedSize);
      }
    });
    return selected;
  };

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
              const productHasSizes = hasSizes(product);
              const key = draftKey(product.id);
              const entry = draft.get(key);
              const qty = entry?.quantity ?? 0;
              const isSelected = qty > 0;
              const isOutOfStock = product.stock <= 0;
              const isLowStock = product.stock > 0 && product.stock <= 3;
              const selectedSizes = productHasSizes ? getProductSelectedSizes(product.id) : [];

              return (
                <div key={product.id} className="px-1">
                  <div
                    className={`flex items-start gap-3 px-3 py-3 rounded-lg transition-colors ${
                      isSelected || selectedSizes.length > 0 ? "bg-blue-50" : isOutOfStock ? "opacity-50" : ""
                    }`}
                  >
                    <button
                      onClick={() => !productHasSizes && toggleProduct(product)}
                      disabled={(isOutOfStock && !isSelected) || productHasSizes}
                      className={`flex items-start gap-3 flex-1 min-w-0 text-left ${
                        (isOutOfStock && !isSelected) || productHasSizes ? "cursor-default" : ""
                      }`}
                    >
                      {!productHasSizes && (
                        <span className={`mt-0.5 shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center ${
                          isSelected ? "bg-primary border-primary" : isOutOfStock ? "border-gray-200 bg-gray-100" : "border-gray-300"
                        }`}>
                          {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                        </span>
                      )}

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
                        {!productHasSizes && (
                          isOutOfStock ? (
                            <p className="text-xs font-semibold text-red-500 mt-0.5">Hết hàng</p>
                          ) : isLowStock ? (
                            <p className="text-xs font-semibold text-amber-500 mt-0.5">
                              {product.stock === 1 ? "Còn 1 sản phẩm" : `Sắp hết hàng (còn ${product.stock})`}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-light mt-0.5">Tồn kho: {product.stock}</p>
                          )
                        )}
                      </div>
                    </button>

                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                      {!productHasSizes && (
                        <span className="text-sm font-semibold text-primary">
                          {formatVND(product.price)}
                        </span>
                      )}
                      {!productHasSizes && isSelected && (
                        <div className="flex items-center border border-gray-200 rounded-lg bg-white">
                          <button
                            onClick={() => changeQuantity(key, -1)}
                            className="w-7 h-7 flex items-center justify-center text-gray-500 hover:bg-gray-50 rounded-l-lg text-sm font-bold"
                          >
                            -
                          </button>
                          <span className="w-7 h-7 flex items-center justify-center text-xs font-bold text-gray-900">
                            {qty}
                          </span>
                          <button
                            onClick={() => changeQuantity(key, 1)}
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

                  {/* Size options */}
                  {productHasSizes && (
                    <div className="pl-8 pr-3 pb-3 space-y-1">
                      {product.sizes.map((s) => {
                        const sizeKey = draftKey(product.id, s.name);
                        const sizeEntry = draft.get(sizeKey);
                        const sizeQty = sizeEntry?.quantity ?? 0;
                        const sizeSelected = sizeQty > 0;
                        const sizeOutOfStock = s.stock <= 0;

                        return (
                          <div
                            key={s.name}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                              sizeSelected ? "bg-blue-100" : sizeOutOfStock ? "opacity-40" : "bg-gray-50"
                            }`}
                          >
                            <button
                              onClick={() => toggleSize(product, s.name)}
                              disabled={sizeOutOfStock && !sizeSelected}
                              className="flex items-center gap-2 flex-1 min-w-0 text-left"
                            >
                              <span className={`shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center ${
                                sizeSelected ? "bg-primary border-primary" : sizeOutOfStock ? "border-gray-200 bg-gray-100" : "border-gray-300"
                              }`}>
                                {sizeSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                              </span>
                              <span className="text-sm font-medium text-gray-700">{s.name}</span>
                              <span className="text-xs text-muted">
                                {sizeOutOfStock ? "Hết hàng" : `SL: ${s.stock}`}
                              </span>
                            </button>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-primary">{formatVND(s.price)}</span>
                              {sizeSelected && (
                                <div className="flex items-center border border-gray-200 rounded-lg bg-white">
                                  <button
                                    onClick={() => changeQuantity(sizeKey, -1)}
                                    className="w-6 h-6 flex items-center justify-center text-gray-500 hover:bg-gray-50 rounded-l-lg text-xs font-bold"
                                  >
                                    -
                                  </button>
                                  <span className="w-6 h-6 flex items-center justify-center text-xs font-bold text-gray-900">
                                    {sizeQty}
                                  </span>
                                  <button
                                    onClick={() => changeQuantity(sizeKey, 1)}
                                    disabled={sizeQty >= s.stock}
                                    className={`w-6 h-6 flex items-center justify-center rounded-r-lg text-xs font-bold ${
                                      sizeQty >= s.stock ? "text-gray-300 cursor-not-allowed" : "text-gray-500 hover:bg-gray-50"
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
