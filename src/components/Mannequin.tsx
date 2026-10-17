type P = [number, number];

function smoothClosed(pts: P[]): string {
  const n = pts.length;
  const f = (p: P) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  let d = `M${f(pts[0])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1: P = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: P = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1)} ${f(c2)} ${f(p2)}`;
  }
  return d + 'Z';
}

const mirror = (p: P): P => [300 - p[0], p[1]];

// Правая половина силуэта: от шеи вниз до паха (viewBox 300×600)
const BODY_RIGHT: P[] = [
  [158, 74], [160, 92], [176, 101], [196, 108], [205, 118], [205, 140], [199, 170], [189, 212], [186, 238],
  [194, 268], [201, 298], [200, 330], [194, 385], [186, 440], [187, 470], [186, 505], [178, 548], [181, 566],
  [188, 579], [184, 588], [166, 588], [160, 575], [160, 550], [162, 505], [160, 465], [158, 440], [156, 385], [152, 338],
];
const BODY = smoothClosed([...BODY_RIGHT, ...[...BODY_RIGHT].reverse().map(mirror)]);

const ARM_RIGHT: P[] = [
  [198, 110], [210, 118], [216, 140], [219, 180], [224, 230], [230, 280], [236, 318], [240, 336], [237, 350],
  [230, 352], [225, 340], [222, 320], [214, 282], [206, 232], [201, 190], [198, 160],
];
const ARM_R = smoothClosed(ARM_RIGHT);
const ARM_L = smoothClosed(ARM_RIGHT.map(mirror).reverse());

export function Mannequin({ dark }: { dark?: boolean }) {
  const top = dark ? '#57524c' : '#ece5dc';
  const bottom = dark ? '#3f3b37' : '#ddd3c6';
  const stroke = dark ? '#6a645d' : '#d2c7b9';
  const id = dark ? 'mq-d' : 'mq-l';
  return (
    <svg className="mannequin" viewBox="0 0 300 600" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
        <radialGradient id={`${id}-sh`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={dark ? '#000' : '#8a7c6c'} stopOpacity={dark ? 0.45 : 0.22} />
          <stop offset="1" stopColor={dark ? '#000' : '#8a7c6c'} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="150" cy="590" rx="70" ry="9" fill={`url(#${id}-sh)`} />
      <g fill={`url(#${id})`} stroke={stroke} strokeWidth="0.8" strokeLinejoin="round">
        <path d={ARM_L} />
        <path d={ARM_R} />
        <path d={BODY} />
        <ellipse cx="150" cy="48" rx="23" ry="28" />
      </g>
    </svg>
  );
}
