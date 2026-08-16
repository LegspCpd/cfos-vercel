// Tests for the Liveblocks realtime collaboration wrapper.
//
// The realtime integration degrades to offline editing when the connection cannot be
// established (e.g. missing LIVEBLOCKS_SECRET_KEY or an invalid key). These tests verify
// the room-joining logic: a successful connection returns { room, leave }, while a failed
// connection (disconnected status or timeout) returns null AND leaves the room so the
// client stops reconnecting.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mocks must be hoisted above the imports below.
const { enterRoomMock, leaveMock } = vi.hoisted(() => ({
  enterRoomMock: vi.fn(),
  leaveMock: vi.fn(),
}));

vi.mock('@/lib/client/auth', () => ({
  getToken: () => 'test-token',
}));

vi.mock('@liveblocks/client', () => ({
  createClient: () => ({ enterRoom: (...args: unknown[]) => enterRoomMock(...args) }),
  LiveObject: class LiveObject {
    data: unknown;
    constructor(data: unknown) {
      this.data = data;
    }
  },
}));

import { joinWorkspaceRoom, roomForWorkspace } from '@/lib/liveblocks';

function mockRoom(statuses: string[]) {
  // When the queue is exhausted keep reporting "connecting" so the polling loop
  // only exits via 'connected', 'disconnected' or the deadline.
  const getStatus = vi
    .fn()
    .mockImplementation(() => statuses.shift() ?? 'connecting');
  const room = { getStatus };
  enterRoomMock.mockReturnValue({ room, leave: leaveMock });
  return { room, getStatus };
}

describe('roomForWorkspace', () => {
  it('scopes rooms per workspace', () => {
    expect(roomForWorkspace('ws_abc123')).toBe('cfos-ws-ws_abc123');
    expect(roomForWorkspace('abc')).toBe('cfos-ws-abc');
  });
});

describe('joinWorkspaceRoom', () => {
  beforeEach(() => {
    enterRoomMock.mockReset();
    leaveMock.mockReset();
    // Fake the timers AND Date so the polling deadline (`Date.now()`) advances together
    // with the 150ms poll interval.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns { room, leave } once the connection is established', async () => {
    const { room } = mockRoom(['connecting', 'connected']);
    const promise = joinWorkspaceRoom('ws_1');
    await vi.advanceTimersByTimeAsync(150);
    const result = await promise;
    expect(result).not.toBeNull();
    expect(result?.room).toBe(room);
    expect(result?.leave).toBe(leaveMock);
    expect(leaveMock).not.toHaveBeenCalled();
  });

  it('returns null and leaves the room when auth fails (disconnected)', async () => {
    mockRoom(['connecting', 'disconnected']);
    const promise = joinWorkspaceRoom('ws_1');
    await vi.advanceTimersByTimeAsync(150);
    const result = await promise;
    expect(result).toBeNull();
    expect(leaveMock).toHaveBeenCalledTimes(1);
  });

  it('returns null and leaves the room when the connection times out', async () => {
    // Always connecting -> never connects before the 5s deadline.
    mockRoom(['connecting']);
    const promise = joinWorkspaceRoom('ws_1');
    await vi.advanceTimersByTimeAsync(6_000);
    const result = await promise;
    expect(result).toBeNull();
    expect(leaveMock).toHaveBeenCalledTimes(1);
  });

  it('returns null when enterRoom throws (e.g. client error)', async () => {
    enterRoomMock.mockImplementation(() => {
      throw new Error('boom');
    });
    const result = await joinWorkspaceRoom('ws_1');
    expect(result).toBeNull();
  });
});
