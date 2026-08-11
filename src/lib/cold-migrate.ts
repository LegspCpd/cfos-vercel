// Cold-data status reporting for the multi-database feature.
//
// NOTE (conservative): this deliberately does NOT move or delete any data. The old
// "migrate cold rows from primary to secondary then delete the primary copy" approach
// was removed because cross-DB migration + deletion is a data-loss risk. Instead:
//   - NEW cold data (audit logs, verification codes) is written straight to a secondary
//     when multi-db is enabled, so the primary stops growing.
//   - The primary's existing rows are left untouched and remain visible through the
//     merged reads (queryAudit / countAudit / verification fallback).
// This means the primary never shrinks automatically — the feature's job is to stop
// the primary from growing, which is the safe part.

import { getColdStore, multiDbStatus } from './db-secondary';

export interface ColdStatus {
  enabled: boolean;
  shards: number;
  coldTables: { audit: boolean; verification: boolean };
}

export async function getColdStatus(): Promise<ColdStatus> {
  const status = multiDbStatus();
  if (!status.enabled) {
    return {
      enabled: false,
      shards: 0,
      coldTables: { audit: false, verification: false },
    };
  }

  const store = getColdStore();
  return {
    enabled: status.enabled,
    shards: status.shards,
    coldTables: {
      audit: store.coldTables.audit?.on ?? false,
      verification: store.coldTables.verification?.on ?? false,
    },
  };
}
