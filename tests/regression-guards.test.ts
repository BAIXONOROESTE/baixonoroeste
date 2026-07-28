import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const KNOWN_BROKEN_FKEY_TARGETS = [
  "checklist_assignments_assigned_to_fkey",
  "checklist_runs_started_by_fkey",
  "losses_created_by_fkey",
  "count_items_counted_by_fkey",
];

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if ([".ts", ".tsx"].includes(extname(full))) files.push(full);
  }
  return files;
}

function readAllSourceFiles() {
  return walk(SRC_DIR).map((path) => ({ path, content: readFileSync(path, "utf-8") }));
}

describe("regression guard: embed profiles!<fkey> quebrado", () => {
  it("não usa nenhum dos embeds profiles!<constraint> já conhecidos como quebrados", () => {
    const offenders: string[] = [];
    for (const { path, content } of readAllSourceFiles()) {
      for (const badTarget of KNOWN_BROKEN_FKEY_TARGETS) {
        if (content.includes(`profiles!${badTarget}`)) {
          offenders.push(`${path} usa "profiles!${badTarget}"`);
        }
      }
    }
    expect(
      offenders,
      `Encontrado(s) embed(s) profiles! que sabidamente quebram:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("qualquer novo embed profiles!<algo> é sinalizado para revisão manual", () => {
    const found: string[] = [];
    const pattern = /profiles!([a-zA-Z0-9_]+)/g;
    for (const { path, content } of readAllSourceFiles()) {
      for (const match of content.matchAll(pattern)) {
        found.push(`${path}: profiles!${match[1]}`);
      }
    }
    const ALLOWLIST_SUBSTRINGS = ["inventories_assigned_counter_id_fkey", "inventories_assigned_supervisor_id_fkey"];
    const unexpected = found.filter((f) => !ALLOWLIST_SUBSTRINGS.some((a) => f.includes(a)));
    expect(
      unexpected,
      `Novo(s) embed(s) profiles! não catalogado(s), confira manualmente:\n${unexpected.join("\n")}`,
    ).toEqual([]);
  });
});

describe("regression guard: fechamento de inventário sempre empurra divergências", () => {
  it("respondCloseRequest não volta a condicionar o envio de divergências ao flag push_to_omie", () => {
    const closeRequests = readFileSync(join(SRC_DIR, "lib", "close-requests.functions.ts"), "utf-8");
    expect(
      closeRequests,
      "respondCloseRequest não deve mais ter um bloco `if (req.push_to_omie) {` envolvendo a busca/envio dos itens divergentes.",
    ).not.toMatch(/if\s*\(\s*req\.push_to_omie\s*\)\s*\{/);
  });

  it("closeInventory checa erro explicitamente ao buscar itens divergentes", () => {
    const omieFns = readFileSync(join(SRC_DIR, "lib", "omie.functions.ts"), "utf-8");
    expect(omieFns, "closeInventory precisa checar `pendingErr` explicitamente.").toMatch(/pendingErr/);
  });
});
