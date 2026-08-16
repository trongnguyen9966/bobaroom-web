"use client";

import { useState, useMemo } from "react";
import { Modal } from "@/components/ui/Modal";

interface AddressPickerModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  items: string[];
  onSelect: (item: string) => void;
}

function removeDiacritics(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

export function AddressPickerModal({ open, onClose, title, items, onSelect }: AddressPickerModalProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = removeDiacritics(search.toLowerCase());
    return items.filter((item) => removeDiacritics(item.toLowerCase()).includes(q));
  }, [items, search]);

  const handleSelect = (item: string) => {
    onSelect(item);
    setSearch("");
    onClose();
  };

  return (
    <Modal open={open} onClose={() => { setSearch(""); onClose(); }} title={title} size="md">
      <div className="space-y-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm kiếm..."
          autoFocus
          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <div className="max-h-[50vh] overflow-auto -mx-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">Không tìm thấy kết quả</p>
          ) : (
            filtered.map((item) => (
              <button
                key={item}
                onClick={() => handleSelect(item)}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 active:bg-gray-100 rounded-lg transition-colors"
              >
                {item}
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
