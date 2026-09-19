/**
 * Regex-based signatures per language for file_map (not a parser — good enough for an outline).
 */
export interface Signature {
  line: number;
  kind: "function" | "method" | "class" | "interface" | "type" | "enum" | "struct" | "trait" | "impl" | "module" | "export" | "const" | "sql";
  text: string;
  indent: number;
}

interface LangSpec {
  name: string;
  rules: Array<{ re: RegExp; kind: Signature["kind"]; text?: (m: RegExpMatchArray) => string }>;
  importRe?: RegExp;
}

const clean = (s: string) => s.replace(/\s+/g, " ").replace(/\s*\{\s*$/, "").replace(/\s*=>\s*$/, "").trim();
const CONTROL = /^(if|for|while|switch|catch|return|else|do|try|new|await|typeof|function)$/;

const TS_LIKE: LangSpec = {
  name: "TypeScript/JavaScript",
  importRe: /^\s*(?:import\b.*?\bfrom\s*["']([^"']+)["']|import\s*\(?["']([^"']+)["']\)?|(?:const|let|var)\s+.*?=\s*require\(\s*["']([^"']+)["']\s*\))/,
  rules: [
    { re: /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+\w+.*$/, kind: "class" },
    { re: /^\s*(?:export\s+)?(?:declare\s+)?interface\s+\w+.*$/, kind: "interface" },
    { re: /^\s*(?:export\s+)?(?:declare\s+)?type\s+\w+\s*(?:<[^>]*>)?\s*=.*$/, kind: "type", text: (m) => clean(m[0]).replace(/=.*$/, "").trim() },
    { re: /^\s*(?:export\s+)?(?:const\s+)?enum\s+\w+.*$/, kind: "enum" },
    { re: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*\w*\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?::\s*[^{=]+)?/, kind: "function" },
    { re: /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*(?::\s*[^=]+)?=>/, kind: "function", text: (m) => clean(m[0]) },
    { re: /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::[^=]+)?=\s*(?:async\s+)?function\b/, kind: "function", text: (m) => `${m[1]} = function` },
    { re: /^\s+(?:(?:public|private|protected|static|readonly|abstract|override|async|get|set)\s+)*(\w+)\s*(?:<[^>]*>)?\s*\([^)]*\)\s*(?::\s*[^{;]+)?\s*\{?\s*$/, kind: "method" },
    { re: /^\s*export\s+default\s+\w+\s*;?\s*$/, kind: "export" },
    { re: /^\s*export\s*\{[^}]*\}\s*(?:from\s*["'][^"']+["'])?\s*;?\s*$/, kind: "export" },
  ],
};

const PYTHON: LangSpec = {
  name: "Python",
  importRe: /^\s*(?:from\s+([\w.]+)\s+import\b|import\s+([\w.]+))/,
  rules: [
    { re: /^\s*class\s+\w+.*?:/, kind: "class", text: (m) => clean(m[0]).replace(/:$/, "") },
    { re: /^\s*(?:async\s+)?def\s+\w+\s*\([^)]*\)\s*(?:->\s*[^:]+)?:/, kind: "function", text: (m) => clean(m[0]).replace(/:$/, "") },
  ],
};

const GO: LangSpec = {
  name: "Go",
  importRe: /^\s*(?:import\s+)?"([^"]+)"\s*$/,
  rules: [
    { re: /^func\s+(?:\([^)]*\)\s*)?\w+\s*\([^)]*\).*?(?:\{|$)/, kind: "function" },
    { re: /^type\s+\w+\s+(?:struct|interface)\b/, kind: "struct" },
    { re: /^type\s+\w+\s+\w+/, kind: "type" },
  ],
};

const RUST: LangSpec = {
  name: "Rust",
  importRe: /^\s*use\s+([\w:]+)/,
  rules: [
    { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+\w+.*?(?:\{|where|$)/, kind: "function", text: (m) => clean(m[0]).replace(/\s*where$/, "") },
    { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?struct\s+\w+/, kind: "struct" },
    { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?enum\s+\w+/, kind: "enum" },
    { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?trait\s+\w+/, kind: "trait" },
    { re: /^\s*impl(?:<[^>]*>)?\s+.*?(?:\{|$)/, kind: "impl" },
    { re: /^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+\w+/, kind: "module" },
  ],
};

const C_LIKE: LangSpec = {
  name: "Java/Kotlin/C#/C/C++",
  importRe: /^\s*(?:import\s+(?:static\s+)?([\w.*]+)|using\s+([\w.]+)|#include\s*[<"]([^>"]+)[>"])/,
  rules: [
    { re: /^\s*(?:(?:public|private|protected|internal|static|final|abstract|sealed|partial|data|open)\s+)*(?:class|interface|enum|record|struct|object)\s+\w+.*?(?:\{|$)/, kind: "class" },
    { re: /^\s*(?:(?:public|private|protected|internal|static|final|abstract|virtual|override|async|synchronized|native|inline|suspend|open|extern|const|constexpr|unsigned)\s+)*[\w<>[\],?.*&:\s]+?\s+[\w:~]+\s*\([^;{]*\)\s*(?:const\s*)?(?:throws\s+[\w.,\s]+)?\s*(?:\{|$)/, kind: "method" },
    { re: /^\s*(?:(?:public|private|protected|internal|open)\s+)?fun\s+(?:<[^>]*>\s*)?[\w.]+\s*\([^)]*\).*?(?:\{|=|$)/, kind: "function" },
  ],
};

const RUBY: LangSpec = {
  name: "Ruby",
  importRe: /^\s*require(?:_relative)?\s+["']([^"']+)["']/,
  rules: [
    { re: /^\s*(?:class|module)\s+[\w:]+.*$/, kind: "class" },
    { re: /^\s*def\s+[\w.?!=]+.*$/, kind: "function" },
  ],
};

const PHP: LangSpec = {
  name: "PHP",
  importRe: /^\s*(?:use\s+([\w\\]+)|require(?:_once)?\s*\(?["']([^"']+)["'])/,
  rules: [
    { re: /^\s*(?:(?:abstract|final|readonly)\s+)*(?:class|interface|trait|enum)\s+\w+.*$/, kind: "class" },
    { re: /^\s*(?:(?:public|private|protected|static|abstract|final)\s+)*function\s+&?\w+\s*\([^)]*\).*$/, kind: "function" },
  ],
};

const SWIFT: LangSpec = {
  name: "Swift",
  importRe: /^\s*import\s+(\w+)/,
  rules: [
    { re: /^\s*(?:(?:public|private|internal|fileprivate|open|final)\s+)*(?:class|struct|enum|protocol|extension|actor)\s+\w+.*?(?:\{|$)/, kind: "class" },
    { re: /^\s*(?:(?:public|private|internal|fileprivate|open|static|override|mutating)\s+)*func\s+\w+.*?(?:\{|$)/, kind: "function" },
  ],
};

const SHELL: LangSpec = {
  name: "Shell",
  importRe: /^\s*(?:source|\.)\s+(\S+)/,
  rules: [{ re: /^\s*(?:function\s+)?[\w-]+\s*\(\)\s*\{?/, kind: "function", text: (m) => clean(m[0]) }],
};

const SQL: LangSpec = {
  name: "SQL",
  rules: [{ re: /^\s*create\s+(?:or\s+replace\s+)?(?:temp(?:orary)?\s+)?(?:table|view|function|procedure|index|schema|materialized\s+view)\s+(?:if\s+not\s+exists\s+)?[\w."]+/i, kind: "sql" }],
};

const BY_EXT: Record<string, LangSpec> = {
  ".ts": TS_LIKE, ".tsx": TS_LIKE, ".js": TS_LIKE, ".jsx": TS_LIKE, ".mjs": TS_LIKE, ".cjs": TS_LIKE, ".vue": TS_LIKE, ".svelte": TS_LIKE,
  ".py": PYTHON,
  ".go": GO,
  ".rs": RUST,
  ".java": C_LIKE, ".kt": C_LIKE, ".kts": C_LIKE, ".cs": C_LIKE, ".c": C_LIKE, ".h": C_LIKE, ".cpp": C_LIKE, ".hpp": C_LIKE, ".cc": C_LIKE, ".scala": C_LIKE, ".dart": C_LIKE,
  ".rb": RUBY,
  ".php": PHP,
  ".swift": SWIFT,
  ".sh": SHELL, ".bash": SHELL, ".zsh": SHELL,
  ".sql": SQL,
};

export function languageFor(ext: string): string | null {
  return BY_EXT[ext.toLowerCase()]?.name ?? null;
}

export interface CodeOutline {
  language: string | null;
  signatures: Signature[];
  imports: string[];
}

export function outlineCode(lines: string[], ext: string): CodeOutline {
  const spec = BY_EXT[ext.toLowerCase()];
  if (!spec) return { language: null, signatures: [], imports: [] };
  const signatures: Signature[] = [];
  const imports = new Set<string>();
  let inBlockComment = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (inBlockComment) {
      if (trimmed.includes("*/")) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) inBlockComment = true;
      continue;
    }
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#") || trimmed.startsWith("*") || trimmed.startsWith("--")) {
      if (spec === PYTHON || spec === SHELL) {
        if (trimmed.startsWith("#")) continue;
      } else if (spec !== C_LIKE || !trimmed.startsWith("#include")) continue;
    }
    if (spec.importRe) {
      const im = spec.importRe.exec(line);
      if (im) {
        const mod = im.slice(1).find(Boolean);
        if (mod) imports.add(mod);
        continue;
      }
    }
    for (const rule of spec.rules) {
      const m = rule.re.exec(line);
      if (!m) continue;
      const text = rule.text ? rule.text(m) : clean(m[0]);
      const nameMatch = /(\w+)\s*(?:<[^>]*>)?\s*\(/.exec(text);
      if (rule.kind === "method" && nameMatch && CONTROL.test(nameMatch[1]!)) break;
      if (rule.kind === "method" && /^\s*(?:return|new|await|throw|else)\b/.test(line)) break;
      if (rule.kind === "method" && /[=;]\s*$/.test(trimmed) && !/\)\s*(?::[^;]+)?;?\s*$/.test(trimmed)) break;
      if (rule.kind === "method" && spec === C_LIKE && /^\s*(?:if|for|while|switch|catch|return|else|do|try|new|sizeof)\b/.test(trimmed)) break;
      signatures.push({ line: i + 1, kind: rule.kind, text: text.slice(0, 160), indent: line.length - line.trimStart().length });
      break;
    }
  }
  return { language: spec.name, signatures, imports: [...imports] };
}
