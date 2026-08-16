"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";

interface AutoFillModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (text: string) => void;
}

export function AutoFillModal({ open, onClose, onConfirm }: AutoFillModalProps) {
  const [text, setText] = useState("");

  const handleConfirm = () => {
    if (!text.trim()) return;
    onConfirm(text);
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
