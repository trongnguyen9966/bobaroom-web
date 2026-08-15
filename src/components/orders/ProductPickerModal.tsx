"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { productService } from "@/services/productService";
import { Product } from "@/types";
import { formatVND } from "@/utils/currency";

interface ProductPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (product: Product) => void;
  excludeIds?: string[];
}

export function ProductPickerModal({ open, onClose, onSelect, excludeIds = [] }: ProductPickerModalProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

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

  const available = filtered.filter((p) => !excludeIds.includes(p.id));

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
        ) : available.length === 0 ? (
          <p className="text-center text-sm text-muted py-8">Không tìm thấy sản phẩm</p>
        ) : (
          <div className="max-h-96 overflow-auto divide-y divide-gray-50 -mx-1">
            {available.map((product) => (
              <button
                key={product.id}
                onClick={() => {
                  onSelect(product);
                  onClose();
                }}
                className="w-full text-left flex items-start gap-3 px-3 py-3 hover:bg-gray-50 rounded-lg transition-colors"
              >
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
                  <p className="text-xs text-muted-light mt-0.5">
                    Tồn kho: {product.stock}
                  </p>
                </div>
                <span className="text-sm font-semibold text-primary shrink-0">
                  {formatVND(product.price)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
