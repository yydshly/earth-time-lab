/** Reject a delayed result after its player loses ownership, even after re-entry. */
export function createAudioRequestGuard(isOwner) {
  if (typeof isOwner !== 'function') throw new TypeError('An audio owner predicate is required.');
  let generation=0;
  return {
    begin() {
      const claimed=++generation;
      return {isCurrent:()=>claimed===generation&&Boolean(isOwner())};
    },
    invalidate() {generation++;},
  };
}
