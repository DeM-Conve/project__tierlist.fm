// Splits `items` into at most `n` contiguous, non-empty columns whose
// weights are as even as possible (minimises the tallest column). Order is
// kept, so reading down column 1 then column 2 is the original order - and
// the same order when the columns stack on a phone.
export function splitIntoColumns(items, n, weight = () => 1) {
  const count = Math.max(1, Math.min(n, items.length));
  if (count === 1) return items.length ? [items] : [];
  const w = items.map(weight);
  // best[k][i]: the smallest possible tallest column for items[i..] in k columns.
  const memo = new Map();
  function best(k, i) {
    const key = `${k}:${i}`;
    if (memo.has(key)) return memo.get(key);
    let result;
    if (k === 1) {
      result = { height: w.slice(i).reduce((a, b) => a + b, 0), cut: items.length };
    } else {
      result = { height: Infinity, cut: i + 1 };
      let sum = 0;
      for (let j = i; j <= items.length - k; j++) {
        sum += w[j];
        const height = Math.max(sum, best(k - 1, j + 1).height);
        if (height < result.height) result = { height, cut: j + 1 };
      }
    }
    memo.set(key, result);
    return result;
  }
  const columns = [];
  let i = 0;
  for (let k = count; k >= 1; k--) {
    const { cut } = best(k, i);
    columns.push(items.slice(i, cut));
    i = cut;
  }
  return columns;
}
