// Liveblocks realtime collaboration client wrapper.
//
// This module lazily creates a Liveblocks client (from @liveblocks/client) and exposes a
// small API for joining a workspace room and syncing the active file's content between
// collaborators. It is intentionally dependency-light: we use the low-level client (not
// @liveblocks/react) so we can integrate with Monaco's controlled value without a big
// provider tree.
//
// Auth: POST /api/liveblocks/auth returns an ID token signed with LIVEBLOCKS_SECRET_KEY.
// When the env var is missing the endpoint returns 503 and we fall back to offline editing.

import { createClient, LiveObject, type Client, type Room } from '@liveblocks/client';
import { getToken } from '@/lib/client/auth';

let clientPromise: Promise<Client> | null = null;

// Lazily create the Liveblocks client. The auth endpoint is called on every room join
// (Liveblocks refreshes tokens automatically via the authEndpoint callback).
function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = Promise.resolve(
      createClient({
        authEndpoint: async (room?: string) => {
          const res = await fetch('/api/liveblocks/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ room: room ?? '' }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body?.error || `Liveblocks auth failed (${res.status})`);
          }
          const data = (await res.json()) as { token: string };
          return { token: data.token };
        },
      }),
    );
  }
  return clientPromise;
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Room id for a workspace.
export function roomForWorkspace(workspaceId: string): string {
  return `cfos-ws-${workspaceId}`;
}

// Join a workspace room. Returns the Room + leave function (or null when Liveblocks is
// not configured).
export async function joinWorkspaceRoom(
  workspaceId: string,
): Promise<{ room: Room; leave: () => void } | null> {
  try {
    const client = await getClient();
    const { room, leave } = client.enterRoom(roomForWorkspace(workspaceId), {
      initialPresence: { cursor: null },
      initialStorage: {
        fileContent: new LiveObject<Record<string, string>>({}),
        activeFile: new LiveObject<{ path: string | null }>({ path: null }),
      },
    });
    // Wait until the connection is actually established. `getStatus()` is synchronous and
    // returns the *current* status, so poll it: when auth fails (e.g. a bad secret key)
    // the room transitions to "disconnected" and we must NOT report success — the UI
    // degrades to offline editing instead of showing a fake "realtime on" badge. Leaving
    // the room on failure also stops the client's automatic reconnection attempts.
    const deadline = Date.now() + 5_000;
    for (;;) {
      const status = room.getStatus();
      if (status === 'connected') return { room, leave };
      if (status === 'disconnected' || Date.now() > deadline) {
        try {
          leave();
        } catch {
          /* ignore */
        }
        return null;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  } catch {
    return null;
  }
}

// Leave a workspace room.
export function leaveWorkspaceRoom(leave: (() => void) | null): void {
  try {
    leave?.();
  } catch {
    /* ignore */
  }
}

// Storage keys used inside the room.
export const FILE_CONTENT_KEY = 'fileContent'; // LiveObject<Record<path, string>>
export const ACTIVE_FILE_KEY = 'activeFile'; // LiveObject<{ path: string | null }>

// Narrow a storage value to a LiveObject (the union includes primitives).
function asLiveObject(v: unknown): LiveObject<Record<string, string>> | null {
  return v && typeof v === 'object' && 'toJSON' in v && 'set' in v
    ? (v as unknown as LiveObject<Record<string, string>>)
    : null;
}

// Read the current content map from the room storage.
export async function readFileContents(room: Room): Promise<Record<string, string>> {
  const { root } = await room.getStorage();
  const live = asLiveObject(root.get(FILE_CONTENT_KEY));
  if (!live) return {};
  return live.toJSON() as Record<string, string>;
}

// Update a single file's content in the room storage (no-op when the room has no storage).
export async function updateFileContent(room: Room, path: string, content: string): Promise<void> {
  const { root } = await room.getStorage();
  const live = asLiveObject(root.get(FILE_CONTENT_KEY));
  if (!live) return;
  live.set(path, content);
}

// Set the active file so other collaborators see which file you're editing.
export async function setActiveFile(room: Room, path: string | null): Promise<void> {
  const { root } = await room.getStorage();
  const live = asLiveObject(root.get(ACTIVE_FILE_KEY));
  if (!live) return;
  live.set('path', path ?? '');
}

// Subscribe to storage changes. Returns an unsubscribe function.
export function subscribeStorage(
  room: Room,
  callback: (contents: Record<string, string>, activePath: string | null) => void,
): () => void {
  // Subscribe to the storage root (a LiveObject) with deep updates. The callback
  // receives the root; we read the two known keys from it.
  const root = room.getStorageOrNull();
  if (!root) return () => {};
  return room.subscribe(
    root,
    () => {
      const contents = asLiveObject(root.get(FILE_CONTENT_KEY))?.toJSON() as
        | Record<string, string>
        | undefined;
      const active = asLiveObject(root.get(ACTIVE_FILE_KEY))?.get('path') ?? null;
      callback(contents ?? {}, active as string | null);
    },
    { isDeep: true },
  );
}

// Subscribe to presence changes (who is in the room). Returns an unsubscribe function.
export function subscribePresence(
  room: Room,
  callback: (others: { connectionId: number; presence: { cursor: unknown } }[]) => void,
): () => void {
  return room.subscribe('others', (others) => {
    callback(
      others.map((o) => ({
        connectionId: o.connectionId,
        presence: (o.presence ?? {}) as { cursor: unknown },
      })),
    );
  });
}