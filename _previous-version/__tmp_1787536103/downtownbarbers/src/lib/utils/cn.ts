import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Slår sammen Tailwind-klasser trygt. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
