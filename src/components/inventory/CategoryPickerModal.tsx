"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { categoryService } from "@/services/categoryService";
import { ProductCategory } from "@/types";

interface CategoryPickerModalProps {
  open: boolean;
  onClose: () => void;
  categories: ProductCategory[];
  onSelect?: (category: ProductCategory) => void;
  selectedId?: string | null;
}

export function CategoryPickerModal({
  open,
  onClose,
  categories,
  onSelect,
  selectedId,
}: CategoryPickerModalProps) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const cat = await categoryService.create(newName.trim());
      setNewName("");
      if (onSelect) onSelect(cat);
    } catch {
      alert("Không thể tạo danh mục");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Xóa danh mục "${name}"? Sản phẩm trong danh mục sẽ không bị xóa.`)) return;
    try {
      await categoryService.delete(id);
    } catch {
      alert("Không thể xóa danh mục");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Quản lý danh mục">
      <div className="space-y-4">
        {/* Create new */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Tên danh mục mới..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim()}
            className="px-5 py-3 rounded-xl text-base font-semibold text-white bg-primary hover:bg-primary-hover active:bg-primary-hover disabled:opacity-50"
          >
            Thêm
          </button>
        </div>

        {/* Category list */}
        {categories.length === 0 ? (
          <p className="text-center text-sm text-muted py-4">Chưa có danh mục nào</p>
        ) : (
          <div className="divide-y divide-gray-50 max-h-72 overflow-auto">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className={`flex items-center justify-between px-4 py-4 rounded-xl ${
                  selectedId === cat.id ? "bg-blue-50" : "hover:bg-gray-50 active:bg-gray-100"
                }`}
              >
                <button
                  onClick={() => {
                    if (onSelect) {
                      onSelect(cat);
                      onClose();
                    }
                  }}
                  className="flex-1 text-left text-base font-medium text-gray-900"
                >
                  {cat.name}
                  {selectedId === cat.id && (
                    <span className="ml-2 text-primary text-xs font-bold">✓</span>
                  )}
                </button>
                <button
                  onClick={() => handleDelete(cat.id, cat.name)}
                  className="text-red-400 hover:text-red-600 text-sm font-bold ml-3 shrink-0 px-3 py-2 rounded-lg hover:bg-red-50 active:bg-red-100"
                >
                  Xóa
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
