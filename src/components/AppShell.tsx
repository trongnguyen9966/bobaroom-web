"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ensureAuth } from "@/services/firebase";
import { authService } from "@/services/authService";
import { LoginScreen } from "@/components/LoginScreen";

const NAV_ITEMS = [
  { href: "/orders", label: "Đơn hàng", icon: "📋", activeIcon: "📋" },
  { href: "/inventory", label: "Kho hàng", icon: "📦", activeIcon: "📦" },
  { href: "/history", label: "Doanh thu", icon: "📊", activeIcon: "📊" },
  { href: "/settings", label: "Cài đặt", icon: "⚙️", activeIcon: "⚙️" },
];

type AppState = "loading" | "login" | "auth" | "ready";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<AppState>("loading");

  useEffect(() => {
    if (state === "loading") {
      Promise.resolve().then(() => {
        setState(authService.isLoggedIn() ? "auth" : "login");
      });
    } else if (state === "auth") {
      ensureAuth().then(() => setState("ready")).catch(console.error);
    }
  }, [state]);

  if (state === "loading" || state === "auth") {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-muted text-sm">Đang kết nối...</p>
        </div>
      </div>
    );
  }

  if (state === "login") {
    return (
      <LoginScreen
        onSuccess={() => setState("auth")}
      />
    );
  }

  return (
    <div className="flex flex-col lg:flex-row h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-56 bg-white border-r border-border shrink-0">
        <div className="p-5 border-b border-border">
          <Link href="/orders" className="text-xl font-bold text-primary">
            BobaRoom
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-50 text-primary"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-h-0 pb-16 lg:pb-0 overflow-hidden">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-border z-50 safe-area-bottom">
        <div className="flex items-center justify-around h-14">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1 ${
                  isActive ? "text-primary" : "text-gray-400"
                }`}
              >
                <span className="text-lg">{item.icon}</span>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
