"use client";

// Browser details HMRC requires in its fraud prevention headers
// (WEB_APP_VIA_SERVER). Collected fresh for each HMRC call.

const DEVICE_KEY = "scorpbook_device_id";

function deviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    // Storage blocked: fall back to a per-page ID rather than failing the request.
    return crypto.randomUUID();
  }
}

function timezone(): string {
  const offset = -new Date().getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

export function collectClientInfo() {
  return {
    userAgent: navigator.userAgent,
    deviceId: deviceId(),
    screens: [{ width: window.screen.width, height: window.screen.height, scalingFactor: window.devicePixelRatio || 1, colourDepth: window.screen.colorDepth }],
    windowSize: { width: window.innerWidth, height: window.innerHeight },
    timezone: timezone(),
  };
}
