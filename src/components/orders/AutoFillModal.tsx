"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";

export type AddressLevel = "2level" | "3level";

interface AutoFillModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (text: string, addressLevel: AddressLevel) => void;
}

export function AutoFillModal({ open, onClose, onConfirm }: AutoFillModalProps) {
  const [text, setText] = useState("");
  const [addressLevel, setAddressLevel] = useState<AddressLevel>("2level");

  const handleConfirm = () => {
    if (!text.trim()) return;
    onConfirm(text, addressLevel);
    setText("");
    onClose();
  };

  return (
    <Modal open={open} onClose={() => { setText(""); onClose(); }} title="Tự điền thông tin" size="md">
      <div className="space-y-3">
        <p className="text-xs text-muted">
          Dán thông tin khách hàng (tên, SĐT, địa chỉ) từ Zalo/Facebook vào đây.
          Hệ thống sẽ tự động nhận diện và điền vào form.
        </p>

        {/* Address format toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAddressLevel("2level")}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
              addressLevel === "2level"
                ? "bg-primary text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            Địa chỉ MỚI (2 cấp)
          </button>
          <button
            type="button"
            onClick={() => setAddressLevel("3level")}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
              addressLevel === "3level"
                ? "bg-amber-500 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            Địa chỉ CŨ (3 cấp)
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"VD:\nNguyễn Văn A\n0901234567\n123 đường ABC, Phường 1, TP. Hồ Chí Minh"}
          rows={6}
          autoFocus
          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
        />
        <button
          onClick={handleConfirm}
          disabled={!text.trim()}
          className="w-full py-3 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-hover disabled:opacity-50"
        >
          Tự điền
        </button>
      </div>
    </Modal>
  );
}
