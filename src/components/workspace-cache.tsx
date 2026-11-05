"use client";
import { createContext, useContext } from "react";
import { PrivateCache } from "@/lib/private-cache";
export const WorkspaceCacheContext = createContext<PrivateCache | null>(null);
export const useWorkspaceCache = () => useContext(WorkspaceCacheContext);
