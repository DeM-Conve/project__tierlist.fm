// Interactively merges two already-ordered id lists, yielding [a, b] each
// time it needs the human to say which one wins, resuming via .next(leftWins).
export function* merge(left, right) {
  const result = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const leftWins = yield [left[i], right[j]];
    if (leftWins) result.push(left[i++]);
    else result.push(right[j++]);
  }
  while (i < left.length) result.push(left[i++]);
  while (j < right.length) result.push(right[j++]);
  return result;
}
