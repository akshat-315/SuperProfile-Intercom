"use client";

import { AnimatePresence, motion } from "motion/react";
import { AlertCircle } from "lucide-react";

export function FormError({ message }: { message: string | null }) {
  return (
    <AnimatePresence initial={false}>
      {message !== null && (
        <motion.p
          role="alert"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.15 }}
          className="flex items-start gap-2 overflow-hidden text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{message}</span>
        </motion.p>
      )}
    </AnimatePresence>
  );
}
