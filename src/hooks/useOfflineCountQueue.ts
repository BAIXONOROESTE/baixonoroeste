import { useCallback, useEffect, useRef, useState } from "react";
import { get, set, del, keys } from "idb-keyval";
import { supabase } from "@/integrations/supabase/client";
import { useOnlineStatus } from "./useOnlineStatus";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export interface QueuedCount {
  client_mutation_id: string;
  inventory_id: string;
  product_id: string;
  counted_by: string;
  quantity_before: number;
  quantity_counted: number;
  unit_cost: number;
  status: "correto" | "divergencia";
  created_at: string;
  synced_at?: string;
  error?: string;
}

const KEY_PREFIX = "count-queue:";
const LAST_SYNC_KEY = "count-queue:last-sync";

function makeKey(id: string) {
  return `${KEY_PREFIX}${id}`;
}

async function readAll(): Promise<QueuedCount[]> {
  const allKeys = await keys();
  const relevant = allKeys.filter((k) => typeof k === "string" && k.startsWith(KEY_PREFIX) && k !== LAST_SYNC_KEY);
  const values = await Promise.all(relevant.map((k) => get<QueuedCount>(k as string)));
  return values.filter(Boolean) as QueuedCount[];
}

/**
 * Offline-first count queue backed by IndexedDB.
 * Enqueue always writes locally first; flush pushes pending mutations to Supabase
 * with idempotent upsert via unique index on client_mutation_id.
 */
export function useOfflineCountQueue(inventoryId?: string) {
  const online = useOnlineStatus();
  const qc = useQueryClient();
  const [pending, setPending] = useState<QueuedCount[]>([]);
  const [flushing, setFlushing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const flushingRef = useRef(false);

  const refresh = useCallback(async () => {
    const all = await readAll();
    const scoped = inventoryId ? all.filter((q) => q.inventory_id === inventoryId && !q.synced_at) : all.filter((q) => !q.synced_at);
    setPending(scoped);
    const ls = await get<string>(LAST_SYNC_KEY);
    if (ls) setLastSync(ls);
  }, [inventoryId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const flush = useCallback(async () => {
    if (flushingRef.current) return { ok: true, synced: 0 };
    if (!navigator.onLine) return { ok: false, synced: 0, reason: "offline" };
    const all = await readAll();
    const todo = all.filter((q) => !q.synced_at);
    if (!todo.length) return { ok: true, synced: 0 };

    flushingRef.current = true;
    setFlushing(true);
    let synced = 0;
    try {
      // Upsert in batches; unique index on client_mutation_id dedupes retries.
      for (let i = 0; i < todo.length; i += 25) {
        const batch = todo.slice(i, i + 25);
        const rows = batch.map((q) => ({
          client_mutation_id: q.client_mutation_id,
          inventory_id: q.inventory_id,
          product_id: q.product_id,
          counted_by: q.counted_by,
          quantity_before: q.quantity_before,
          quantity_counted: q.quantity_counted,
          unit_cost: q.unit_cost,
          status: q.status,
        }));
        const { error } = await supabase
          .from("count_items")
          .upsert(rows, { onConflict: "inventory_id,product_id" });
        if (error) {
          // mark failure locally, keep in queue
          for (const q of batch) {
            await set(makeKey(q.client_mutation_id), { ...q, error: error.message });
          }
          throw error;
        }
        for (const q of batch) {
          await set(makeKey(q.client_mutation_id), { ...q, synced_at: new Date().toISOString(), error: undefined });
          synced++;
        }
      }
      const now = new Date().toISOString();
      await set(LAST_SYNC_KEY, now);
      setLastSync(now);

      // Cleanup synced entries older than 60s
      const remaining = await readAll();
      const cutoff = Date.now() - 60_000;
      for (const q of remaining) {
        if (q.synced_at && new Date(q.synced_at).getTime() < cutoff) {
          await del(makeKey(q.client_mutation_id));
        }
      }
      await refresh();
      qc.invalidateQueries({ queryKey: ["count-items"] });
      return { ok: true, synced };
    } catch (e) {
      await refresh();
      return { ok: false, synced, reason: e instanceof Error ? e.message : String(e) };
    } finally {
      flushingRef.current = false;
      setFlushing(false);
    }
  }, [qc, refresh]);

  // Auto-flush when we come online, and periodically while online with pending items.
  useEffect(() => {
    if (!online) return;
    void flush();
    const t = window.setInterval(() => { void flush(); }, 15000);
    return () => window.clearInterval(t);
  }, [online, flush]);

  const enqueue = useCallback(async (mutation: Omit<QueuedCount, "created_at" | "synced_at" | "client_mutation_id"> & { client_mutation_id?: string }) => {
    const client_mutation_id = mutation.client_mutation_id ?? crypto.randomUUID();
    const record: QueuedCount = {
      ...mutation,
      client_mutation_id,
      created_at: new Date().toISOString(),
    };
    await set(makeKey(client_mutation_id), record);
    await refresh();
    if (navigator.onLine) {
      // Fire-and-forget: try to sync immediately
      void flush();
    } else {
      toast.message("Salvo offline", { description: "Vamos sincronizar assim que a internet voltar." });
    }
    return record;
  }, [flush, refresh]);

  return { pending, flushing, online, lastSync, enqueue, flush, refresh };
}

export async function getPendingCountForInventory(inventoryId: string): Promise<number> {
  const all = await readAll();
  return all.filter((q) => q.inventory_id === inventoryId && !q.synced_at).length;
}

export async function getAllPendingCounts(): Promise<QueuedCount[]> {
  const all = await readAll();
  return all.filter((q) => !q.synced_at);
}
