"use client";

import { useState } from "react";
import { DateFilter } from "@/types";
import { getDaysInMonth, isSameDay } from "@/utils/date";

interface CalendarPickerProps {
  filter: DateFilter;
  onChange: (filter: DateFilter) => void;
}

const MODES: DateFilter["mode"][] = ["day", "month", "year", "custom"];
const MODE_LABELS: Record<string, string> = {
  day: "Ngày",
  month: "Tháng",
  year: "Năm",
  custom: "Tùy chọn",
};
const WEEKDAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export function CalendarPicker({ filter, onChange }: CalendarPickerProps) {
  const [viewDate, setViewDate] = useState(new Date(filter.date));
  // For custom range: track which end user is selecting
  const [customStep, setCustomStep] = useState<"start" | "end">("start");

  const handleModeChange = (mode: DateFilter["mode"]) => {
    if (mode === "custom") {
      setCustomStep("start");
      onChange({ mode, date: new Date(filter.date), endDate: new Date(filter.date) });
    } else {
      onChange({ ...filter, mode, date: new Date(filter.date), endDate: undefined });
    }
  };

  const navigateMonth = (dir: -1 | 1) => {
    const d = new Date(viewDate);
    d.setMonth(d.getMonth() + dir);
    setViewDate(d);
  };

  const navigateYear = (dir: -1 | 1) => {
    const d = new Date(viewDate);
    d.setFullYear(d.getFullYear() + dir);
    setViewDate(d);
  };

  const handleDayClick = (day: number) => {
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);

    if (filter.mode === "custom") {
      if (customStep === "start") {
        onChange({ ...filter, date: d, endDate: d });
        setCustomStep("end");
      } else {
        // If end date is before start date, swap them
        if (d < filter.date) {
          onChange({ ...filter, date: d, endDate: filter.date });
        } else {
          onChange({ ...filter, endDate: d });
        }
        setCustomStep("start");
      }
      return;
    }

    onChange({ ...filter, date: d });
  };

  const handleMonthClick = (month: number) => {
    const d = new Date(viewDate.getFullYear(), month, 1);
    setViewDate(d);
    onChange({ ...filter, date: d });
  };

  const handleYearClick = (year: number) => {
    const d = new Date(year, viewDate.getMonth(), 1);
    setViewDate(d);
    onChange({ ...filter, date: d });
  };

  const goToToday = () => {
    const today = new Date();
    setViewDate(today);
    if (filter.mode === "custom") {
      onChange({ ...filter, date: today, endDate: today });
      setCustomStep("start");
    } else {
      onChange({ ...filter, date: today });
    }
  };

  const isSelectedDay = (day: number) => {
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);

    if (filter.mode === "day") {
      return isSameDay(d, filter.date);
    }
    if (filter.mode === "custom" && filter.endDate) {
      const start = filter.date < filter.endDate ? filter.date : filter.endDate;
      const end = filter.date < filter.endDate ? filter.endDate : filter.date;
      const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      return d >= startDay && d <= endDay;
    }
    return false;
  };

  const isRangeEdge = (day: number) => {
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    if (filter.mode === "custom" && filter.endDate) {
      return isSameDay(d, filter.date) || isSameDay(d, filter.endDate);
    }
    if (filter.mode === "day") {
      return isSameDay(d, filter.date);
    }
    return false;
  };

  const isToday = (day: number) => {
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    return isSameDay(d, new Date());
  };

  const showDayGrid = filter.mode === "day" || filter.mode === "custom";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Mode tabs */}
      <div className="flex border-b border-gray-100">
        {MODES.map((mode) => (
          <button
            key={mode}
            onClick={() => handleModeChange(mode)}
            className={`flex-1 py-3 text-xs sm:text-sm font-semibold transition-colors ${
              filter.mode === mode
                ? "text-primary border-b-2 border-primary bg-blue-50/50"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {MODE_LABELS[mode]}
          </button>
        ))}
      </div>

      <div className="p-4">
        {/* Custom range hint */}
        {filter.mode === "custom" && (
          <div className="mb-3 px-3 py-2 bg-blue-50 rounded-lg">
            <p className="text-xs text-primary font-medium text-center">
              {customStep === "start"
                ? "Chọn ngày bắt đầu"
                : "Chọn ngày kết thúc"}
            </p>
            {filter.endDate && filter.date.getTime() !== filter.endDate.getTime() && (
              <p className="text-[10px] text-muted text-center mt-0.5">
                {new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(filter.date)}
                {" - "}
                {new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }).format(filter.endDate)}
              </p>
            )}
          </div>
        )}

        {filter.mode === "year" ? (
          <YearGrid
            viewDate={viewDate}
            selectedYear={filter.date.getFullYear()}
            onNavigate={navigateYear}
            onSelect={handleYearClick}
          />
        ) : filter.mode === "month" ? (
          <MonthGrid
            viewDate={viewDate}
            selectedMonth={filter.date.getMonth()}
            selectedYear={filter.date.getFullYear()}
            onNavigate={navigateYear}
            onSelect={handleMonthClick}
          />
        ) : showDayGrid ? (
          <>
            {/* Calendar header */}
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => navigateMonth(-1)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 active:bg-gray-200"
              >
                &lt;
              </button>
              <span className="text-sm font-semibold text-gray-900">
                {new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric" }).format(viewDate)}
              </span>
              <button
                onClick={() => navigateMonth(1)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 active:bg-gray-200"
              >
                &gt;
              </button>
            </div>

            {/* Weekday headers */}
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="text-center text-[10px] font-semibold text-muted py-1">
                  {label}
                </div>
              ))}
            </div>

            {/* Days grid */}
            <DaysGrid
              year={viewDate.getFullYear()}
              month={viewDate.getMonth()}
              isSelected={isSelectedDay}
              isEdge={isRangeEdge}
              isToday={isToday}
              onDayClick={handleDayClick}
              rangeMode={filter.mode === "custom"}
            />
          </>
        ) : null}

        {/* Today button */}
        <button
          onClick={goToToday}
          className="w-full mt-3 py-2.5 text-sm font-semibold text-primary rounded-lg hover:bg-blue-50 active:bg-blue-100"
        >
          Hôm nay
        </button>
      </div>
    </div>
  );
}

function DaysGrid({
  year,
  month,
  isSelected,
  isEdge,
  isToday,
  onDayClick,
  rangeMode,
}: {
  year: number;
  month: number;
  isSelected: (day: number) => boolean;
  isEdge: (day: number) => boolean;
  isToday: (day: number) => boolean;
  onDayClick: (day: number) => void;
  rangeMode: boolean;
}) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = new Date(year, month, 1).getDay();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="grid grid-cols-7 gap-y-1">
      {cells.map((day, i) => {
        if (!day) {
          return <div key={i} className="flex justify-center"><div className="w-9 h-9" /></div>;
        }
        const selected = isSelected(day);
        const edge = isEdge(day);
        const today = isToday(day);

        // In range mode: edges get full circle, inner range gets lighter bg
        let className = "w-9 h-9 flex items-center justify-center text-sm font-medium transition-colors relative ";
        if (edge) {
          className += "bg-primary text-white rounded-full";
        } else if (rangeMode && selected) {
          className += "bg-primary/15 text-primary rounded-sm";
        } else if (selected) {
          className += "bg-primary text-white rounded-full";
        } else if (today) {
          className += "bg-blue-50 text-primary font-bold rounded-full ring-2 ring-primary";
        } else {
          className += "text-gray-700 hover:bg-gray-100 active:bg-gray-200 rounded-full";
        }

        return (
          <div key={i} className="flex justify-center">
            <button onClick={() => onDayClick(day)} className={className}>
              {day}
              {today && (edge || selected) && (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white" />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function MonthGrid({
  viewDate,
  selectedMonth,
  selectedYear,
  onNavigate,
  onSelect,
}: {
  viewDate: Date;
  selectedMonth: number;
  selectedYear: number;
  onNavigate: (dir: -1 | 1) => void;
  onSelect: (month: number) => void;
}) {
  const MONTH_LABELS = [
    "Th1", "Th2", "Th3", "Th4", "Th5", "Th6",
    "Th7", "Th8", "Th9", "Th10", "Th11", "Th12",
  ];
  const year = viewDate.getFullYear();

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => onNavigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 active:bg-gray-200"
        >
          &lt;
        </button>
        <span className="text-sm font-semibold text-gray-900">{year}</span>
        <button
          onClick={() => onNavigate(1)}
          className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 active:bg-gray-200"
        >
          &gt;
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {MONTH_LABELS.map((label, i) => {
          const isSelected = i === selectedMonth && year === selectedYear;
          const isCurrent = i === new Date().getMonth() && year === new Date().getFullYear();
          return (
            <button
              key={i}
              onClick={() => onSelect(i)}
              className={`py-3 rounded-xl text-sm font-semibold transition-colors ${
                isSelected
                  ? "bg-primary text-white"
                  : isCurrent
                  ? "bg-blue-50 text-primary"
                  : "text-gray-700 hover:bg-gray-100 active:bg-gray-200"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </>
  );
}

function YearGrid({
  viewDate,
  selectedYear,
  onNavigate,
  onSelect,
}: {
  viewDate: Date;
  selectedYear: number;
  onNavigate: (dir: -1 | 1) => void;
  onSelect: (year: number) => void;
}) {
  const centerYear = viewDate.getFullYear();
  const startYear = centerYear - 5;
  const years = Array.from({ length: 12 }, (_, i) => startYear + i);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => onNavigate(-1)}
          className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 active:bg-gray-200"
        >
          &lt;
        </button>
        <span className="text-sm font-semibold text-gray-900">
          {years[0]} – {years[years.length - 1]}
        </span>
        <button
          onClick={() => onNavigate(1)}
          className="w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 active:bg-gray-200"
        >
          &gt;
        </button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {years.map((year) => {
          const isSelected = year === selectedYear;
          const isCurrent = year === new Date().getFullYear();
          return (
            <button
              key={year}
              onClick={() => onSelect(year)}
              className={`py-3 rounded-xl text-sm font-semibold transition-colors ${
                isSelected
                  ? "bg-primary text-white"
                  : isCurrent
                  ? "bg-blue-50 text-primary"
                  : "text-gray-700 hover:bg-gray-100 active:bg-gray-200"
              }`}
            >
              {year}
            </button>
          );
        })}
      </div>
    </>
  );
}
