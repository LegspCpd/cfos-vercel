// Client-side local IP detection (IPv4 and IPv6) via WebRTC ICE candidate gathering.
// Returns a { v4, v6 } pair of the first non-address-specific candidate of each family.
// Used by the analytics page to show "my IP" in both families. Best-effort: on failure
// or when WebRTC is unavailable (e.g. some mobile browsers), returns empty strings.

export interface DetectedIps {
  v4: string;
  v6: string;
}

export function detectMyIps(timeoutMs = 2000): Promise<DetectedIps> {
  return new Promise((resolve) => {
    const result: DetectedIps = { v4: '', v6: '' };
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        pc?.close();
      } catch {
        /* ignore */
      }
      resolve(result);
    };

    if (typeof window === 'undefined' || typeof RTCPeerConnection === 'undefined') {
      resolve(result);
      return;
    }

    let pc: RTCPeerConnection | null = null;
    try {
      pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    } catch {
      resolve(result);
      return;
    }

    const timer = setTimeout(finish, timeoutMs);

    // Creating a data channel forces ICE candidate generation without needing media.
    try {
      pc.createDataChannel('ip-probe');
    } catch {
      /* ignore */
    }

    pc.onicecandidate = (e) => {
      if (!e.candidate || settled) return;
      const cand = e.candidate.candidate;
      // srflx = server-reflexive (public) address; host = local interface.
      const m = /candidate:.+\s(\d+) srflx\s[\d\w]+\s(\S+)\s(\d+)/.exec(cand) || /candidate:.+\s(\d+) host\s[\d\w]+\s(\S+)\s(\d+)/.exec(cand);
      if (!m) return;
      const ip = m[2];
      if (!ip || ip.includes(':')) {
        if (!result.v6 && ip && ip.includes(':')) result.v6 = ip;
      } else {
        if (!result.v4) result.v4 = ip;
      }
      if (result.v4 && result.v6) {
        clearTimeout(timer);
        finish();
      }
    };

    pc.onicegatheringstatechange = () => {
      if (pc && pc.iceGatheringState === 'complete') finish();
    };

    // Kick off gathering.
    pc.createOffer()
      .then((offer) => pc?.setLocalDescription(offer))
      .catch(() => {});
  });
}
