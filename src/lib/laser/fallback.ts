// In-process fallback transport. Same publish/poll shape as a real Laser
// topic (append-only, offset-addressable), used only when the real
// Apache Iggy connection can't be established. See client.ts for why.

interface FallbackRecord {
  offset: number;
  value: unknown;
  timestamp: number;
}

const topics = new Map<string, FallbackRecord[]>();

function topicFor(name: string): FallbackRecord[] {
  let t = topics.get(name);
  if (!t) {
    t = [];
    topics.set(name, t);
  }
  return t;
}

export function fallbackPublish(topic: string, value: unknown) {
  const t = topicFor(topic);
  t.push({ offset: t.length, value, timestamp: Date.now() });
}

export function fallbackPoll(topic: string, sinceOffset = 0): FallbackRecord[] {
  return topicFor(topic).filter((r) => r.offset >= sinceOffset);
}

export function fallbackLatestOffset(topic: string): number {
  return topicFor(topic).length;
}
