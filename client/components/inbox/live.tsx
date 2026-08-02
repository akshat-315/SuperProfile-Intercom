"use client";

import { useEffect } from "react";

import { connectInbox } from "@/lib/socket";

export function Live() {
  useEffect(() => connectInbox(), []);
  return null;
}
