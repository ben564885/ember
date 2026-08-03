// In-memory ablation toggles for the demo's kill switches. Same
// accepted-for-a-demo-process pattern as guild/approval.ts's queue: a real
// deployment would back this with a table, but a single Node process is
// exactly what this app runs as.
//
// `edge` isn't tracked here — severing a KNOWS edge is a real graph
// mutation (see graph/queries.ts's deleteKnowsEdge/restoreKnowsEdge), not a
// toggle, so its ablation already lives in FalkorDB itself.

export interface AblationState {
  /** Disables the `sig.timestamp > passed.date` predicate in the flagship query. */
  ignoreTimePredicate: boolean;
  /** Forces every signal ingested while active to carry a deliberately wrong `type`. */
  forceTypeMismatch: boolean;
  /** Bypasses Skeptic's veto — a rumor-flavored draft reaches Approval unchecked. */
  bypassSkeptic: boolean;
}

declare global {
  var __ablationState: AblationState | undefined;
}

function store(): AblationState {
  if (!globalThis.__ablationState) {
    globalThis.__ablationState = {
      ignoreTimePredicate: false,
      forceTypeMismatch: false,
      bypassSkeptic: false,
    };
  }
  return globalThis.__ablationState;
}

export function getAblationState(): AblationState {
  return { ...store() };
}

export function setAblationToggle(key: keyof AblationState, value: boolean): AblationState {
  const s = store();
  s[key] = value;
  return { ...s };
}
