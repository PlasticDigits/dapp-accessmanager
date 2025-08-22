"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export interface DateTimePickerProps {
  id?: string;
  label?: string;
  value?: Date;
  onChange?: (value?: Date) => void;
}

function toLocalInputValue(date?: Date): string {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function fromLocalInputValue(s: string): Date | undefined {
  if (!s) return undefined;
  // Treat input as local time
  const date = new Date(s);
  return isNaN(date.getTime()) ? undefined : date;
}

export function DateTimePicker({ id, label, value, onChange }: DateTimePickerProps) {
  return (
    <div className="grid gap-1.5">
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      <Input
        id={id}
        type="datetime-local"
        value={toLocalInputValue(value)}
        onChange={(e) => onChange?.(fromLocalInputValue(e.target.value))}
      />
    </div>
  );
}


