import * as THREE from 'three';

export interface SpacePoint {
  id: string;
  azimuthDeg: number;
  elevationDeg: number;
  kind: 'satellite' | 'planet' | 'moon' | 'sun';
  selected: boolean;
}

export type SpaceMount = { update(points: SpacePoint[]): void; destroy(): void } | { error: string };

/** Observational sky. Marker directions use calculated azimuth and elevation. Sizes are not to scale. */
export function mountSpaceScene(container: HTMLElement, points: SpacePoint[], onSelect: (id: string) => void): SpaceMount {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  if (!renderer.getContext()) {
    renderer.dispose();
    return { error: '3D sky needs WebGL. The list still has every direction.' };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x060607);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-label', '3D sky. Drag to look. The list is the accessible way to choose an object.');
  container.append(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 50);
  camera.position.set(0, 0, 0);
  let yaw = 0;
  let pitch = 0.25;
  const aim = () => {
    camera.lookAt(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw));
  };
  const horizon = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(Array.from({ length: 65 }, (_, index) => {
      const angle = (index / 64) * Math.PI * 2;
      return new THREE.Vector3(Math.sin(angle) * 8, 0, -Math.cos(angle) * 8);
    })),
    new THREE.LineBasicMaterial({ color: 0xffe81f }),
  );
  const north = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.5), new THREE.MeshBasicMaterial({ color: 0xffe81f }));
  north.position.copy(direction(0, 0));
  scene.add(horizon, north);
  const markers = new THREE.Group();
  scene.add(markers);
  const resize = () => {
    const width = container.clientWidth || 320;
    const height = 280;
    renderer.setSize(width, height, false);
    canvas.style.width = '100%';
    canvas.style.height = '280px';
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    aim();
    renderer.render(scene, camera);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  const meshes: THREE.Mesh[] = [];
  const rebuild = (next: SpacePoint[]) => {
    for (const mesh of meshes) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    meshes.length = 0;
    markers.clear();
    for (const point of next) {
      const satellite = point.kind === 'satellite';
      const geometry = satellite
        ? new THREE.OctahedronGeometry(point.selected ? 0.28 : 0.16)
        : new THREE.SphereGeometry(point.kind === 'sun' ? 0.34 : point.kind === 'moon' ? 0.22 : 0.14, 16, 12);
      const material = new THREE.MeshBasicMaterial({ color: satellite || point.kind === 'sun' ? 0xffe81f : 0xfafafa });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(direction(point.azimuthDeg, point.elevationDeg));
      mesh.userData.id = point.id;
      markers.add(mesh);
      meshes.push(mesh);
    }
    renderer.render(scene, camera);
  };
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let moved = 0;
  const onPointerDown = (event: PointerEvent) => {
    dragging = true;
    moved = 0;
    lastX = event.clientX;
    lastY = event.clientY;
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    lastX = event.clientX;
    lastY = event.clientY;
    yaw -= dx * 0.005;
    pitch = Math.max(-1.2, Math.min(1.2, pitch + dy * 0.005));
    aim();
    renderer.render(scene, camera);
  };
  const onPointerUp = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    if (moved > 6) return;
    const rect = canvas.getBoundingClientRect();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    ), camera);
    const hit = raycaster.intersectObjects(meshes)[0];
    const id = hit?.object.userData.id;
    if (typeof id === 'string') onSelect(id);
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  resize();
  rebuild(points);
  return {
    update: rebuild,
    destroy() {
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      rebuild([]);
      horizon.geometry.dispose();
      (horizon.material as THREE.Material).dispose();
      north.geometry.dispose();
      (north.material as THREE.Material).dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}

function direction(azimuthDeg: number, elevationDeg: number, distance = 8): THREE.Vector3 {
  const azimuth = (azimuthDeg * Math.PI) / 180;
  const elevation = (elevationDeg * Math.PI) / 180;
  return new THREE.Vector3(
    Math.cos(elevation) * Math.sin(azimuth) * distance,
    Math.sin(elevation) * distance,
    -Math.cos(elevation) * Math.cos(azimuth) * distance,
  );
}
