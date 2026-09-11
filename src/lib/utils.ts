import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn-style class combiner used by ui/ primitives (e.g. HaloReel). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
