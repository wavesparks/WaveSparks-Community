import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseTags(value: FormDataEntryValue | null) {
  if (!value || typeof value !== "string") {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseBoolean(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
}

export function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
  }).format(new Date(iso));
}

export function formatRelativeCount(value: number, label: string) {
  return `${value.toLocaleString()} ${label}`;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
