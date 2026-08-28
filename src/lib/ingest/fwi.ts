/**
 * Canadian Forest Fire Weather Index (CFFDRS) daily equations.
 * Inputs are noon-ish conditions: temp (C), rh (%), wind (km/h), rain (mm/24h).
 */
export type FwiState = { ffmc: number; dmc: number; dc: number };

export const FWI_START: FwiState = { ffmc: 85, dmc: 6, dc: 15 };

const DAY_LENGTH_DMC = [
  6.5, 7.5, 9.0, 12.8, 13.9, 13.9, 12.4, 10.9, 9.4, 8.0, 7.0, 6.0,
];
const DAY_LENGTH_DC = [
  -1.6, -1.6, -1.6, 0.9, 3.8, 5.8, 6.4, 5.0, 2.4, 0.4, -1.6, -1.6,
];

export function nextFfmc(
  prev: number,
  temp: number,
  rh: number,
  wind: number,
  rain: number,
) {
  let mo = (147.2 * (101 - prev)) / (59.5 + prev);
  if (rain > 0.5) {
    const rf = rain - 0.5;
    let mr =
      mo <= 150
        ? mo +
          42.5 * rf * Math.exp(-100 / (251 - mo)) * (1 - Math.exp(-6.93 / rf))
        : mo +
          42.5 * rf * Math.exp(-100 / (251 - mo)) * (1 - Math.exp(-6.93 / rf)) +
          0.0015 * Math.pow(mo - 150, 2) * Math.sqrt(rf);
    if (mr > 250) mr = 250;
    mo = mr;
  }
  const ed =
    0.942 * Math.pow(rh, 0.679) +
    11 * Math.exp((rh - 100) / 10) +
    0.18 * (21.1 - temp) * (1 - Math.exp(-0.115 * rh));
  let m: number;
  if (mo > ed) {
    const ko =
      0.424 * (1 - Math.pow(rh / 100, 1.7)) +
      0.0694 * Math.sqrt(wind) * (1 - Math.pow(rh / 100, 8));
    const kd = ko * 0.581 * Math.exp(0.0365 * temp);
    m = ed + (mo - ed) * Math.pow(10, -kd);
  } else {
    const ew =
      0.618 * Math.pow(rh, 0.753) +
      10 * Math.exp((rh - 100) / 10) +
      0.18 * (21.1 - temp) * (1 - Math.exp(-0.115 * rh));
    if (mo < ew) {
      const kl =
        0.424 * (1 - Math.pow((100 - rh) / 100, 1.7)) +
        0.0694 * Math.sqrt(wind) * (1 - Math.pow((100 - rh) / 100, 8));
      const kw = kl * 0.581 * Math.exp(0.0365 * temp);
      m = ew - (ew - mo) * Math.pow(10, -kw);
    } else {
      m = mo;
    }
  }
  return Math.min(101, Math.max(0, (59.5 * (250 - m)) / (147.2 + m)));
}

export function nextDmc(
  prev: number,
  temp: number,
  rh: number,
  rain: number,
  month: number,
) {
  let p = prev;
  if (rain > 1.5) {
    const re = 0.92 * rain - 1.27;
    const mo = 20 + Math.exp(5.6348 - p / 43.43);
    let b: number;
    if (p <= 33) b = 100 / (0.5 + 0.3 * p);
    else if (p <= 65) b = 14 - 1.3 * Math.log(p);
    else b = 6.2 * Math.log(p) - 17.2;
    const mr = mo + (1000 * re) / (48.77 + b * re);
    p = Math.max(0, 244.72 - 43.43 * Math.log(mr - 20));
  }
  const t = Math.max(-1.1, temp);
  const k =
    1.894 * (t + 1.1) * (100 - rh) * (DAY_LENGTH_DMC[month - 1] ?? 9) * 1e-6;
  return Math.max(0, p + 100 * k);
}

export function nextDc(
  prev: number,
  temp: number,
  rain: number,
  month: number,
) {
  let d = prev;
  if (rain > 2.8) {
    const rd = 0.83 * rain - 1.27;
    const qo = 800 * Math.exp(-d / 400);
    const qr = qo + 3.937 * rd;
    d = Math.max(0, 400 * Math.log(800 / qr));
  }
  const t = Math.max(-2.8, temp);
  const v = 0.36 * (t + 2.8) + (DAY_LENGTH_DC[month - 1] ?? 1.4);
  return Math.max(0, d + 0.5 * Math.max(0, v));
}

export function computeFwi(
  ffmc: number,
  dmc: number,
  dc: number,
  wind: number,
) {
  const m = (147.2 * (101 - ffmc)) / (59.5 + ffmc);
  const ff = 91.9 * Math.exp(-0.1386 * m) * (1 + Math.pow(m, 5.31) / 4.93e7);
  const isi = 0.208 * Math.exp(0.05039 * wind) * ff;
  const bui =
    dmc === 0
      ? 0
      : dmc <= 0.4 * dc
        ? (0.8 * dmc * dc) / (dmc + 0.4 * dc)
        : dmc -
          (1 - (0.8 * dc) / (dmc + 0.4 * dc)) *
            (0.92 + Math.pow(0.0114 * dmc, 1.7));
  const fd =
    bui <= 80
      ? 0.626 * Math.pow(bui, 0.809) + 2
      : 1000 / (25 + 108.64 * Math.exp(-0.023 * bui));
  const b = 0.1 * isi * fd;
  const fwi = b > 1 ? Math.exp(2.72 * Math.pow(0.434 * Math.log(b), 0.647)) : b;
  return { isi, bui, fwi: Math.max(0, fwi) };
}

/** EFFIS danger classes (1..5) from FWI, per ORIGINAL-SPEC 9.1. */
export function dangerFromFwi(fwi: number) {
  if (fwi < 11.2) return 1;
  if (fwi < 21.3) return 2;
  if (fwi < 38) return 3;
  if (fwi < 50) return 4;
  return 5;
}
