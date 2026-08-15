"use client";

import { ChartDataPoint } from "@/types";
import { formatVND } from "@/utils/currency";

interface RevenueChartProps {
  data: ChartDataPoint[];
  height?: number;
}

export function RevenueChart({ data, height = 200 }: RevenueChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const barCount = data.length;
  // For month view (30+ bars), make them thinner
  const isCompact = barCount > 12;

  return (
    <div className="w-full">
      <div className="flex items-end gap-[2px] sm:gap-1" style={{ height }}>
        {data.map((point, i) => {
          const barHeight = maxValue > 0 ? (point.value / maxValue) * 100 : 0;
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center justify-end group relative"
              style={{ height: "100%" }}
            >
              {/* Tooltip */}
              {point.value > 0 && (
                <div className="absolute bottom-full mb-1 hidden group-hover:block z-10">
                  <div className="bg-gray-800 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap">
                    {point.label}: {formatVND(point.value)}
                  </div>
                </div>
              )}
              <div
                className={`w-full rounded-t transition-all ${
                  point.value > 0
                    ? "bg-primary/80 hover:bg-primary"
                    : "bg-gray-100"
                }`}
                style={{
                  height: `${Math.max(barHeight, point.value > 0 ? 4 : 1)}%`,
                  minHeight: point.value > 0 ? 4 : 1,
                }}
              />
            </div>
          );
        })}
      </div>
      {/* Labels */}
      {!isCompact && (
        <div className="flex gap-[2px] sm:gap-1 mt-1">
          {data.map((point, i) => (
            <div key={i} className="flex-1 text-center">
              <span className="text-[9px] text-muted-light">{point.label}</span>
            </div>
          ))}
        </div>
      )}
      {isCompact && (
        <div className="flex justify-between mt-1 px-1">
          <span className="text-[9px] text-muted-light">{data[0]?.label}</span>
          <span className="text-[9px] text-muted-light">
            {data[Math.floor(data.length / 2)]?.label}
          </span>
          <span className="text-[9px] text-muted-light">
            {data[data.length - 1]?.label}
          </span>
        </div>
      )}
    </div>
  );
}
