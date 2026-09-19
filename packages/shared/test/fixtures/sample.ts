import { readFile } from "node:fs/promises";

export interface Config {
  name: string;
  retries: number;
}

export function parseConfig(raw: string): Config {
  return JSON.parse(raw) as Config;
}

export async function loadConfig(path: string): Promise<Config> {
  const raw = await readFile(path, "utf8");
  return parseConfig(raw);
}

export class Server {
  constructor(private cfg: Config) {}

  start(): void {
    console.log(this.cfg.name);
  }

  private stop(): void {
    // noop
  }
}

const helper = (x: number): number => x * 2;

export default helper;
