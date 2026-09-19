// @author AVRG3
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
export const fx = (name: string): string => path.join(FIX, name);
