/**
 * Pure function: compute how many items of a given size fit on a paper
 * given margins and inter-item gaps, plus the exact mm coordinates of
 * each item on the paper.
 *
 * @param {{w:number, h:number}} sourceSize - target item size (mm)
 * @param {{w:number, h:number}} paper       - paper size (mm)
 * @param {{top:number, bottom:number, left:number, right:number}} margin (mm)
 * @param {{h:number, v:number}} gap        - horizontal & vertical gaps (mm)
 * @returns {{cols:number, rows:number, count:number, positions:Array<{x:number,y:number}>, paperSize:{w:number,h:number}}}
 */
export function calculateLayout(sourceSize, paper, margin, gap) {
  const usableW = paper.w - margin.left - margin.right;
  const usableH = paper.h - margin.top - margin.bottom;

  const cols = Math.floor((usableW + gap.h) / (sourceSize.w + gap.h));
  const rows = Math.floor((usableH + gap.v) / (sourceSize.h + gap.v));

  const positions = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      positions.push({
        x: margin.left + c * (sourceSize.w + gap.h),
        y: margin.top + r * (sourceSize.h + gap.v),
      });
    }
  }

  return { cols, rows, count: cols * rows, positions, paperSize: paper };
}