"use client";

import { useState } from "react";
import { authService } from "@/services/authService";

interface LoginScreenProps {
  onSuccess: () => void;
}

export function LoginScreen({ onSuccess }: LoginScreenProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);
    setLoading(true);

    // Small delay for UX
    setTimeout(() => {
      const success = authService.login(username.trim(), password);
      if (success) {
        onSuccess();
      } else {
        setError(true);
        setLoading(false);
      }
    }, 300);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">BobaRoom</h1>
          <p className="text-sm text-muted mt-1">Quản lý đơn hàng & kho hàng</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Tài khoản</label>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(false); }}
              placeholder="Nhập tài khoản"
              autoComplete="username"
              className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Mật khẩu</label>
            <input
              type="password"
              inputMode="numeric"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(false); }}
              placeholder="Nhập mật khẩu"
              autoComplete="current-password"
              className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500 font-medium text-center">
              Sai tài khoản hoặc mật khẩu
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !username.trim() || !password}
            className="w-full py-4 rounded-xl text-base font-bold text-white bg-primary hover:bg-primary-hover active:bg-primary-hover disabled:opacity-50 shadow-lg"
          >
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>
      </div>
    </div>
  );
}
