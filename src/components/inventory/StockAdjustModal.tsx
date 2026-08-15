"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";

interface StockAdjustModalProps {
  open: boolean;
  onClose: () => void;
  currentStock: number;
  productName: string;
  onSave: (newStock: number) => Promise<void>;
}

export function StockAdjustModal({
  open,
  onClose,
  currentStock,
  productName,
  onSave,
}: StockAdjustModalProps) {
  const [addQty, setAddQty] = useState("");
  const [saving, setSaving] = useState(false);

  const qty = parseInt(addQty, 10) || 0;
  const newStock = currentStock + qty;

  const handleSave = async () => {
    if (qty === 0) return;
    setSaving(true);
    try {
      await onSave(newStock);
      setAddQty("");
      onClose();
    } catch {
      alert("Không thể cập nhật tồn kho");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nhập thêm hàng">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 truncate">{productName}</p>

        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted">Tồn kho hiện tại</span>
            <span className="font-semibold">{currentStock}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted">Số lượng nhập thêm</span>
            <input
              type="number"
              value={addQty}
              onChange={(e) => setAddQty(e.target.value)}
              placeholder="0"
              min="1"
              autoFocus
              className="w-28 text-right bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
            <span className="font-bold text-gray-900">Tồn kho mới</span>
            <span className="font-bold text-primary">{newStock >= 0 ? newStock : 0}</span>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || qty === 0}
          className="w-full py-4 rounded-xl text-base font-bold text-white bg-primary hover:bg-primary-hover active:bg-primary-hover disabled:opacity-50"
        >
          {saving ? "Đang lưu..." : "Cập nhật tồn kho"}
        </button>
      </div>
    </Modal>
  );
}
