"use client";

import { toast } from "@/components/ui/use-toast";
import { toErrorInfo } from "./api";

/** Show a destructive toast for any caught API/fetch error (contract envelope). */
export function toastError(err: unknown, title = "Something went wrong") {
  const { message, hint } = toErrorInfo(err);
  toast({
    variant: "destructive",
    title,
    description: hint ? `${message} — ${hint}` : message,
  });
}
