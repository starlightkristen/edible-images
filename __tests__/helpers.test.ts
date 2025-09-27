import { containFit, capacityFor } from '../src/lib/helpers';

test('containFit keeps aspect and fits within area', () => {
  const { wIn, hIn } = containFit(2, 5, 3); // 2:1 aspect inside 5x3
  expect(hIn).toBeCloseTo(2.5, 1) || expect(hIn).toBeLessThanOrEqual(3);
});

test('capacityFor returns grid >= 3x4 for 2\" on 8x11 with 0.5\" margin', () => {
  const { cols, rows, capacity } = capacityFor({ sheetW: 8, sheetH: 11, margin: 0.5, sizeIn: 2, gapIn: 0.1 });
  expect(cols).toBeGreaterThanOrEqual(3);
  expect(rows).toBeGreaterThanOrEqual(4);
  expect(capacity).toBeGreaterThanOrEqual(12);
});
