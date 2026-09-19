import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
export const fx = (name: string): string => path.join(FIX, name);
export const LEDGER = /Returned ~[\d,]+ tokens · raw ≈ [\d,]+ tokens · [\d.]+% saved · [\d.]+m?s/;
