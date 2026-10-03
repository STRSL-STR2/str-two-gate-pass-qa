import { useState, useEffect } from "react";
import { format, subDays, startOfWeek } from "date-fns";
import { Button } from "@/components/ui/button";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

export type PresetRange = "today" | "this-week" | "last-7-days" | "current-month" | "custom";

interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  preset: string;
  onRangeChange?: (startDate: string, endDate: string, preset: PresetRange) => void;
  onPresetChange?: (preset: PresetRange) => void;
  onStartDateChange?: (date: string) => void;
  onEndDateChange?: (date: string) => void;
  isLoading?: boolean;
}

export function DateRangeFilter({
  startDate,
  endDate,
  preset,
  onRangeChange,
  onPresetChange,
  onStartDateChange,
  onEndDateChange,
  isLoading = false,
}: DateRangeFilterProps) {
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);
  const [localPreset, setLocalPreset] = useState(preset);

  // Keep local state in sync when parent props change
  useEffect(() => {
    setLocalStart(startDate);
    setLocalEnd(endDate);
    setLocalPreset(preset);
  }, [startDate, endDate, preset]);

  const applyRange = (newStart: string, newEnd: string, newPreset: PresetRange) => {
    if (!newStart || !newEnd) {
      toast.error("Please select both start and end dates");
      return;
    }
    if (newStart > newEnd) {
      toast.error("Start date cannot be after end date");
      return;
    }

    if (onRangeChange) {
      onRangeChange(newStart, newEnd, newPreset);
    } else {
      if (onPresetChange) onPresetChange(newPreset);
      if (onStartDateChange) onStartDateChange(newStart);
      if (onEndDateChange) onEndDateChange(newEnd);
    }
  };

  const handlePresetChange = (value: string) => {
    const nextPreset = value as PresetRange;
    setLocalPreset(nextPreset);
    const now = new Date();

    if (nextPreset === "today") {
      const todayStr = format(now, "yyyy-MM-dd");
      setLocalStart(todayStr);
      setLocalEnd(todayStr);
      applyRange(todayStr, todayStr, "today");
    } else if (nextPreset === "this-week") {
      const firstDayOfWeek = startOfWeek(now, { weekStartsOn: 1 });
      const s = format(firstDayOfWeek, "yyyy-MM-dd");
      const e = format(now, "yyyy-MM-dd");
      setLocalStart(s);
      setLocalEnd(e);
      applyRange(s, e, "this-week");
    } else if (nextPreset === "last-7-days") {
      const s = format(subDays(now, 7), "yyyy-MM-dd");
      const e = format(now, "yyyy-MM-dd");
      setLocalStart(s);
      setLocalEnd(e);
      applyRange(s, e, "last-7-days");
    } else if (nextPreset === "current-month") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const s = format(firstDay, "yyyy-MM-dd");
      const e = format(now, "yyyy-MM-dd");
      setLocalStart(s);
      setLocalEnd(e);
      applyRange(s, e, "current-month");
    } else if (nextPreset === "custom") {
      // In custom mode, user will adjust dates and click Apply
    }
  };

  const isDirty = localStart !== startDate || localEnd !== endDate;

  const handleApply = () => {
    applyRange(localStart, localEnd, "custom");
  };

  return (
    <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2 sm:gap-3 bg-slate-50 dark:bg-slate-900/50 p-2 sm:p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 w-full sm:w-auto shadow-sm">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">Range:</span>
        <select
          value={localPreset}
          onChange={(e) => handlePresetChange(e.target.value)}
          className="h-8 rounded-md border border-input bg-background/80 dark:bg-slate-950 px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-medium"
        >
          <option value="today">Today</option>
          <option value="this-week">This Week</option>
          <option value="last-7-days">Last 7 Days</option>
          <option value="current-month">Current Month</option>
          <option value="custom">Custom Range</option>
        </select>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <input
          type="date"
          value={localStart}
          onChange={(e) => {
            setLocalPreset("custom");
            setLocalStart(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleApply();
          }}
          className="h-8 rounded-md border border-input bg-background/80 dark:bg-slate-950 px-2.5 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-medium"
        />
        <span className="text-muted-foreground text-xs font-medium">to</span>
        <input
          type="date"
          value={localEnd}
          onChange={(e) => {
            setLocalPreset("custom");
            setLocalEnd(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleApply();
          }}
          className="h-8 rounded-md border border-input bg-background/80 dark:bg-slate-950 px-2.5 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-medium"
        />
        <Button
          type="button"
          size="sm"
          onClick={handleApply}
          disabled={isLoading || (!isDirty && localPreset === preset)}
          className={`h-8 px-2.5 text-xs font-semibold gap-1 transition-all ${
            isDirty
              ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm ring-2 ring-blue-500/30"
              : "bg-muted text-muted-foreground hover:bg-muted/80 opacity-70"
          }`}
          title={isDirty ? "Click to apply date range" : "Date range applied"}
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Apply
        </Button>
      </div>
    </div>
  );
}
