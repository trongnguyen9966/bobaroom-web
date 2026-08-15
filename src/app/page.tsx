"use client";

import { useEffect, useState } from "react";
import { ensureAuth } from "@/services/firebase";

export default function HomePage() {
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    ensureAuth().then(() => setAuthReady(true)).catch(console.error);
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-blue-600">BobaRoom</h1>
        <div className="flex gap-6 text-sm font-medium text-gray-600">
          <a href="/orders" className="hover:text-blue-600">Đơn hàng</a>
          <a href="/inventory" className="hover:text-blue-600">Kho hàng</a>
          <a href="/revenue" className="hover:text-blue-600">Doanh thu</a>
        </div>
        <div className="text-xs text-gray-400">
          {authReady ? "Connected" : "Connecting..."}
        </div>
      </nav>

      <main className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              BobaRoom Web
            </h2>
            <p className="text-gray-500">
              Hệ thống quản lý đơn hàng và kho hàng
            </p>
            {authReady && (
              <p className="mt-4 text-sm text-green-600 font-medium">
                Firebase connected
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
