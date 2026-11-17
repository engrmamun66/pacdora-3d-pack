"use client";

import { createContext, useContext, type ReactNode } from "react";

/** How the Client's shared pages are branded (business name and logo). Printed QR sheets use it too. */
export interface Brand {
  name: string;
  /** Address of the logo on this site, or null. */
  logoUrl: string | null;
}

const BrandContext = createContext<Brand>({ name: "", logoUrl: null });

export function BrandProvider({ brand, children }: { brand: Brand; children: ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export const useBrand = () => useContext(BrandContext);
