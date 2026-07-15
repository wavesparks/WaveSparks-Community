import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type ScriptEnvMode = "development" | "production" | "test";

function unquoteEnvValue(value: string) {
  const trimmed = value.trim();
  const quote = trimmed.at(0);

  if ((quote === "\"" || quote === "'" || quote === "`") && trimmed.endsWith(quote)) {
    const unquoted = trimmed.slice(1, -1);

    if (quote === "\"") {
      return unquoted
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\"/g, "\"");
    }

    return unquoted;
  }

  return trimmed;
}

function parseEnvFile(contents: string) {
  const values: Record<string, string> = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    values[match[1]] = unquoteEnvValue(match[2] ?? "");
  }

  return values;
}

function scriptEnvCandidates(mode: ScriptEnvMode) {
  return [
    `.env.${mode}.local`,
    mode === "test" ? undefined : ".env.local",
    `.env.${mode}`,
    ".env",
  ].filter(Boolean) as string[];
}

export function readScriptEnv(mode: ScriptEnvMode, cwd = process.cwd()) {
  const values: Record<string, string> = {};
  const loadedFiles: string[] = [];

  for (const file of scriptEnvCandidates(mode)) {
    const filePath = path.join(cwd, file);
    if (!existsSync(filePath)) {
      continue;
    }

    for (const [key, value] of Object.entries(parseEnvFile(readFileSync(filePath, "utf8")))) {
      values[key] ??= value;
    }
    loadedFiles.push(file);
  }

  return { loadedFiles, values };
}

export function loadScriptEnv(mode: ScriptEnvMode = "production", cwd = process.cwd()) {
  const { loadedFiles, values } = readScriptEnv(mode, cwd);
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return loadedFiles;
}
