/**
 * Turns phone motion sensors into a viewing direction for the sky view.
 * Nothing here asks for location; the observer is always the chosen city.
 * Motion permission is requested only from a tap (iOS requires that), and readings stay in memory.
 *
 * World frame: x = east, y = north, z = up. Device frame (W3C): x = right edge, y = top edge, z = out of the screen.
 * The back camera looks along device -z.
 */

export type Vec3 = [number, number, number];

export interface ViewBasis {
  forward: Vec3;
  right: Vec3;
  up: Vec3;
}

const RAD = Math.PI / 180;

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Unit vector toward an azimuth (clockwise from north) and altitude. */
export function directionVector(azimuthDeg: number, altitudeDeg: number): Vec3 {
  const az = azimuthDeg * RAD;
  const alt = altitudeDeg * RAD;
  return [Math.cos(alt) * Math.sin(az), Math.cos(alt) * Math.cos(az), Math.sin(alt)];
}

export function azAltFromVector(v: Vec3): { azimuthDeg: number; altitudeDeg: number } {
  const n = normalize(v);
  const azimuthDeg = ((Math.atan2(n[0], n[1]) / RAD) % 360 + 360) % 360;
  const altitudeDeg = Math.asin(Math.max(-1, Math.min(1, n[2]))) / RAD;
  return { azimuthDeg, altitudeDeg };
}

/** Rotation matrix for W3C device orientation (intrinsic Z-X'-Y''), as rows. */
function rotation(alphaDeg: number, betaDeg: number, gammaDeg: number): [Vec3, Vec3, Vec3] {
  const a = alphaDeg * RAD;
  const b = betaDeg * RAD;
  const g = gammaDeg * RAD;
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
  return [
    [ca * cg - sa * sb * sg, -sa * cb, ca * sg + sa * sb * cg],
    [sa * cg + ca * sb * sg, ca * cb, sa * sg - ca * sb * cg],
    [-cb * sg, sb, cb * cg],
  ];
}

function apply(m: [Vec3, Vec3, Vec3], v: Vec3): Vec3 {
  return [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
}

/**
 * Viewing basis from absolute device orientation (alpha measured from north) and the screen rotation angle.
 * screenAngleDeg is screen.orientation.angle: 0 for portrait, 90 when the top of the phone is turned to the left.
 */
export function basisFromOrientation(alphaDeg: number, betaDeg: number, gammaDeg: number, screenAngleDeg = 0): ViewBasis {
  const m = rotation(alphaDeg, betaDeg, gammaDeg);
  const s = screenAngleDeg * RAD;
  return {
    forward: normalize(apply(m, [0, 0, -1])),
    right: normalize(apply(m, [Math.cos(s), -Math.sin(s), 0])),
    up: normalize(apply(m, [Math.sin(s), Math.cos(s), 0])),
  };
}

/** Basis for dragging by hand: look toward an azimuth and altitude with the horizon kept level. */
export function basisFromLook(azimuthDeg: number, altitudeDeg: number): ViewBasis {
  const forward = directionVector(azimuthDeg, altitudeDeg);
  const right = normalize([Math.cos(azimuthDeg * RAD), -Math.sin(azimuthDeg * RAD), 0]);
  return { forward, right, up: normalize(cross(right, forward)) };
}

/** Blend two bases for smooth motion without angle wrap-around problems. */
export function smoothBasis(previous: ViewBasis | null, next: ViewBasis, amount = 0.25): ViewBasis {
  if (!previous) return next;
  const mix = (a: Vec3, b: Vec3): Vec3 => normalize([a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount]);
  const forward = mix(previous.forward, next.forward);
  const upGuess = mix(previous.up, next.up);
  const right = normalize(cross(forward, upGuess));
  return { forward, right, up: normalize(cross(right, forward)) };
}

/**
 * Gnomonic projection onto the screen. Returns null for points behind the viewer.
 * focalPx is the distance in pixels from the eye to the screen for the chosen field of view.
 */
export function projectToScreen(direction: Vec3, basis: ViewBasis, focalPx: number, width: number, height: number): { x: number; y: number } | null {
  const depth = dot(direction, basis.forward);
  if (depth <= 0.05) return null;
  return {
    x: width / 2 + (focalPx * dot(direction, basis.right)) / depth,
    y: height / 2 - (focalPx * dot(direction, basis.up)) / depth,
  };
}

export function unprojectFromScreen(x: number, y: number, basis: ViewBasis, focalPx: number, width: number, height: number): Vec3 {
  const dx = (x - width / 2) / focalPx;
  const dy = (height / 2 - y) / focalPx;
  return normalize([
    basis.forward[0] + dx * basis.right[0] + dy * basis.up[0],
    basis.forward[1] + dx * basis.right[1] + dy * basis.up[1],
    basis.forward[2] + dx * basis.right[2] + dy * basis.up[2],
  ]);
}

export function angleBetweenDeg(a: Vec3, b: Vec3): number {
  return Math.acos(Math.max(-1, Math.min(1, dot(normalize(a), normalize(b))))) / RAD;
}

type Listener = (basis: ViewBasis) => void;
type OrientationEventLike = Event & { alpha: number | null; beta: number | null; gamma: number | null; absolute?: boolean; webkitCompassHeading?: number };

export type MotionStatus = 'off' | 'waiting' | 'on' | 'denied' | 'unavailable' | 'no-compass';

/**
 * Listens to motion sensors after the person turns them on.
 * Android Chrome reports an absolute (north-referenced) alpha; iOS Safari reports a compass heading separately,
 * so the compass offset is measured while the phone is not pointing straight up or down and then kept.
 */
export class MotionSensor {
  private listener: Listener;
  private onStatus: (status: MotionStatus) => void;
  private handler: ((event: Event) => void) | null = null;
  private eventName = '';
  private compassOffset: number | null = null;
  private lastEvent = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(listener: Listener, onStatus: (status: MotionStatus) => void) {
    this.listener = listener;
    this.onStatus = onStatus;
  }

  static supported(): boolean {
    return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  }

  /** Must be called from a tap or click. */
  async start(): Promise<MotionStatus> {
    if (!MotionSensor.supported()) return this.report('unavailable');
    const ctor = (window as unknown as { DeviceOrientationEvent: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    if (typeof ctor.requestPermission === 'function') {
      try {
        if ((await ctor.requestPermission()) !== 'granted') return this.report('denied');
      } catch {
        return this.report('denied');
      }
    }
    this.stop();
    this.eventName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    this.handler = (event) => this.read(event as OrientationEventLike);
    window.addEventListener(this.eventName, this.handler);
    this.report('waiting');
    this.timer = setTimeout(() => {
      if (!this.lastEvent) {
        this.stop();
        this.report('unavailable');
      }
    }, 2500);
    return 'waiting';
  }

  stop() {
    if (this.handler) window.removeEventListener(this.eventName, this.handler);
    if (this.timer) clearTimeout(this.timer);
    this.handler = null;
    this.timer = null;
    this.lastEvent = 0;
    this.compassOffset = null;
  }

  private report(status: MotionStatus): MotionStatus {
    this.onStatus(status);
    return status;
  }

  private read(event: OrientationEventLike) {
    if (event.alpha == null || event.beta == null || event.gamma == null) return;
    const first = !this.lastEvent;
    this.lastEvent = Date.now();
    let alpha = event.alpha;
    if (typeof event.webkitCompassHeading === 'number' && Number.isFinite(event.webkitCompassHeading)) {
      // iOS: alpha starts from an arbitrary direction. Compass heading = 360 - absolute alpha when the phone is not upright.
      if (Math.abs(event.beta) < 60) {
        const measured = (((360 - event.webkitCompassHeading - event.alpha) % 360) + 360) % 360;
        this.compassOffset = this.compassOffset == null ? measured : blendAngle(this.compassOffset, measured, 0.05);
      }
      if (this.compassOffset == null) {
        if (first) this.report('waiting');
        return;
      }
      alpha = event.alpha + this.compassOffset;
    } else if (this.eventName === 'deviceorientation' && !event.absolute) {
      if (first) this.report('no-compass');
    }
    if (first || this.compassOffset != null) this.report('on');
    const angle = typeof screen !== 'undefined' && screen.orientation ? screen.orientation.angle : 0;
    this.listener(basisFromOrientation(alpha, event.beta, event.gamma, angle));
  }
}

export function blendAngle(fromDeg: number, toDeg: number, amount: number): number {
  const delta = ((toDeg - fromDeg + 540) % 360) - 180;
  return (((fromDeg + delta * amount) % 360) + 360) % 360;
}

/** Plain words for a direction, such as "high in the southeast". */
export function directionWords(azimuthDeg: number, altitudeDeg: number): string {
  const names = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
  const compass = names[Math.round((((azimuthDeg % 360) + 360) % 360) / 45) % 8];
  if (altitudeDeg >= 75) return 'almost straight overhead';
  if (altitudeDeg >= 45) return `high in the ${compass}`;
  if (altitudeDeg >= 15) return `partway up in the ${compass}`;
  if (altitudeDeg >= 0) return `low in the ${compass}`;
  return `below the horizon, toward the ${compass}`;
}
