import { promises as fs } from "node:fs";
import * as path from "node:path";
import { teach } from "./errors.js";

/**
 * System-binary detection (§2). Finds a binary on PATH and in common install locations.
 * Missing → teach-error with the exact install command per platform. Cached per process.
 * Override with `TINY_TOOLS_<NAME>_PATH` (e.g. TINY_TOOLS_FFMPEG_PATH=/opt/ffmpeg/bin/ffmpeg).
 */
type Platform = "darwin" | "win32" | "linux";

interface BinarySpec {
  names: string[];
  extra: Partial<Record<Platform, string[]>>;
  install: Record<Platform, string>;
}

const PF = (p: string) => process.env["PROGRAMFILES"] ? path.join(process.env["PROGRAMFILES"]!, p) : "";
const PFX86 = (p: string) => process.env["PROGRAMFILES(X86)"] ? path.join(process.env["PROGRAMFILES(X86)"]!, p) : "";
const LAD = (p: string) => process.env["LOCALAPPDATA"] ? path.join(process.env["LOCALAPPDATA"]!, p) : "";

export const BINARIES: Record<string, BinarySpec> = {
  ffmpeg: {
    names: ["ffmpeg"],
    extra: { darwin: ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"], linux: ["/usr/bin/ffmpeg", "/snap/bin/ffmpeg"] },
    install: { darwin: "brew install ffmpeg", win32: "winget install ffmpeg", linux: "sudo apt install ffmpeg" },
  },
  ffprobe: {
    names: ["ffprobe"],
    extra: { darwin: ["/opt/homebrew/bin/ffprobe", "/usr/local/bin/ffprobe"], linux: ["/usr/bin/ffprobe"] },
    install: { darwin: "brew install ffmpeg", win32: "winget install ffmpeg", linux: "sudo apt install ffmpeg" },
  },
  "whisper-cli": {
    names: ["whisper-cli", "whisper-cpp"],
    extra: { darwin: ["/opt/homebrew/bin/whisper-cli", "/usr/local/bin/whisper-cli"] },
    install: {
      darwin: "brew install whisper-cpp",
      win32: "download a release from github.com/ggml-org/whisper.cpp and add it to PATH",
      linux: "build whisper.cpp from github.com/ggml-org/whisper.cpp and add whisper-cli to PATH",
    },
  },
  soffice: {
    names: ["soffice", "libreoffice"],
    extra: {
      darwin: ["/Applications/LibreOffice.app/Contents/MacOS/soffice"],
      win32: [PF("LibreOffice/program/soffice.exe")],
      linux: ["/usr/bin/soffice", "/usr/lib/libreoffice/program/soffice", "/snap/bin/libreoffice"],
    },
    install: {
      darwin: "brew install --cask libreoffice",
      win32: "winget install TheDocumentFoundation.LibreOffice",
      linux: "sudo apt install libreoffice",
    },
  },
  chrome: {
    names: ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome", "msedge", "brave-browser"],
    extra: {
      darwin: [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      ],
      win32: [
        PF("Google/Chrome/Application/chrome.exe"),
        PFX86("Google/Chrome/Application/chrome.exe"),
        LAD("Google/Chrome/Application/chrome.exe"),
        PF("Microsoft/Edge/Application/msedge.exe"),
        PFX86("Microsoft/Edge/Application/msedge.exe"),
      ],
      linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium", "/usr/bin/microsoft-edge"],
    },
    install: {
      darwin: "brew install --cask google-chrome",
      win32: "winget install Google.Chrome",
      linux: "sudo apt install chromium",
    },
  },
  pdftoppm: {
    names: ["pdftoppm"],
    extra: { darwin: ["/opt/homebrew/bin/pdftoppm", "/usr/local/bin/pdftoppm"], linux: ["/usr/bin/pdftoppm"] },
    install: { darwin: "brew install poppler", win32: "choco install poppler", linux: "sudo apt install poppler-utils" },
  },
  jq: {
    names: ["jq"],
    extra: { darwin: ["/usr/bin/jq", "/opt/homebrew/bin/jq", "/usr/local/bin/jq"], linux: ["/usr/bin/jq"] },
    install: { darwin: "brew install jq", win32: "winget install jqlang.jq", linux: "sudo apt install jq" },
  },
};

const cache = new Map<string, string | null>();

function platform(): Platform {
  const p = process.platform;
  return p === "darwin" || p === "win32" ? p : "linux";
}

async function isExecutable(p: string): Promise<boolean> {
  if (!p) return false;
  try {
    const st = await fs.stat(p);
    if (!st.isFile()) return false;
    if (process.platform === "win32") return true;
    await fs.access(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function pathDirs(): string[] {
  const raw = process.env["PATH"] ?? "";
  return raw.split(path.delimiter).filter(Boolean);
}

/** Absolute path of the binary, or null when missing. Results are cached per process. */
export async function detect(binary: string): Promise<string | null> {
  if (cache.has(binary)) return cache.get(binary)!;
  const override = process.env[`TINY_TOOLS_${binary.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_PATH`];
  if (override && (await isExecutable(override))) {
    cache.set(binary, override);
    return override;
  }
  const spec = BINARIES[binary] ?? { names: [binary], extra: {}, install: { darwin: "", win32: "", linux: "" } };
  const exts = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  for (const dir of pathDirs()) {
    for (const name of spec.names) {
      for (const ext of exts) {
        const candidate = path.join(dir, name + ext);
        if (await isExecutable(candidate)) {
          cache.set(binary, candidate);
          return candidate;
        }
      }
    }
  }
  for (const candidate of spec.extra[platform()] ?? []) {
    if (await isExecutable(candidate)) {
      cache.set(binary, candidate);
      return candidate;
    }
  }
  cache.set(binary, null);
  return null;
}

/** "Install: 'brew install ffmpeg' (macOS) · 'winget install ffmpeg' (Windows) · 'sudo apt install ffmpeg' (Linux), then retry." */
export function installHint(binary: string): string {
  const spec = BINARIES[binary];
  if (!spec) return `Install '${binary}' and make sure it is on PATH, then retry.`;
  return `Install: '${spec.install.darwin}' (macOS) · '${spec.install.win32}' (Windows) · '${spec.install.linux}' (Linux), then retry.`;
}

/** Path of the binary, or a teach-error naming the install command. */
export async function requireBinary(binary: string, purpose?: string): Promise<string> {
  const found = await detect(binary);
  if (found) return found;
  const why = purpose ? ` (needed to ${purpose})` : "";
  throw teach(`${binary} not found on PATH${why}.`, installHint(binary));
}

export function resetDetectCache(): void {
  cache.clear();
}
