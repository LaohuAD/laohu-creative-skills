import * as THREE from './vendor/three.module.js';
import { createInterfaceTextures } from './ui.js';

window.__hf = window.__hf || {};
window.__hf.buildReady = window.__hf.buildReady || {};
window.__hf.buildReady.lark = initialize();

async function initialize() {
  await Promise.all([document.fonts.load('400 32px Inter'), document.fonts.load('700 48px Inter')]);
  const WIDTH = 1280;
  const HEIGHT = 720;
  const DURATION = 36.6;
  const variables = window.__hyperframes?.getVariables?.() || {};
  const colors = {
    blue: variables.blue || '#477aff',
    purple: variables.purple || '#743fea',
    cyan: variables.cyan || '#49e6ee',
    yellow: '#ffbc4b',
  };
  const canvas = document.getElementById('magic-canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: true,
  });
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, WIDTH / HEIGHT, 0.05, 150);
  const ambient = new THREE.AmbientLight('#c8d6ff', 1.5);
  const key = new THREE.DirectionalLight('#f3fbff', 3.5);
  key.position.set(-4, 8, 7);
  const rim = new THREE.DirectionalLight('#ca7bff', 2.3);
  rim.position.set(6, 2, -2);
  const cyanLight = new THREE.PointLight(colors.cyan, 18, 30, 1.4);
  cyanLight.position.set(-4, 3, 4);
  scene.add(ambient, key, rim, cyanLight);
  const environmentScene = new THREE.Scene();
  environmentScene.background = new THREE.Color('#a3b5e2');
  const strips = [[-4, 4, 3, 2, 8], [5, 1, -2, 2, 7], [0, 7, -4, 10, 1]];
  strips.forEach(([x, y, z, width, height]) => {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }));
    strip.position.set(x, y, z);
    strip.lookAt(0, 0, 0);
    environmentScene.add(strip);
  });
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(environmentScene, 0.08);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();
  const maps = createInterfaceTextures(THREE, variables);
  const clamp = value => Math.max(0, Math.min(1, value));
  const mix = (a, b, fraction) => a + (b - a) * fraction;
  const smooth = value => { const fraction = clamp(value); return fraction * fraction * (3 - 2 * fraction); };
  const phase = (time, start, end) => smooth((time - start) / (end - start));
  const out = value => 1 - Math.pow(1 - clamp(value), 3);
  const linear = (time, start, end) => clamp((time - start) / (end - start));
  const groups = [];
  const group = name => {
    const result = new THREE.Group();
    result.name = name;
    scene.add(result);
    groups.push(result);
    return result;
  };
  const material = (color, options = {}) => new THREE.MeshStandardMaterial({
    color, roughness: 0.3, metalness: 0.12, ...options,
  });
  const addMesh = (parent, name, geometry, paint, position = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(geometry, paint);
    mesh.name = name;
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  };
  function roundedShape(width, height, radius) {
    const x = -width / 2;
    const y = -height / 2;
    const shape = new THREE.Shape();
    shape.moveTo(x + radius, y);
    shape.lineTo(x + width - radius, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + radius);
    shape.lineTo(x + width, y + height - radius);
    shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    shape.lineTo(x + radius, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - radius);
    shape.lineTo(x, y + radius);
    shape.quadraticCurveTo(x, y, x + radius, y);
    return shape;
  }
  function roundedBox(parent, name, width, height, depth, color, position = [0, 0, 0]) {
    const geometry = new THREE.ExtrudeGeometry(roundedShape(width, height, Math.min(width, height) * 0.055), {
      depth, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.025, bevelThickness: 0.025,
    });
    geometry.translate(0, 0, -depth / 2);
    return addMesh(parent, name, geometry, material(color), position);
  }
  function panel(parent, name, map, width, height, position = [0, 0, 0]) {
    const object = new THREE.Group();
    object.name = name;
    object.position.set(...position);
    roundedBox(object, `${name} edge`, width, height, 0.05, '#d9dcfa', [0, 0, -0.036]);
    addMesh(object, `${name} editable interface`, new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map, transparent: true, side: THREE.DoubleSide }), [0, 0, 0.045]);
    parent.add(object);
    return object;
  }
  const line = (parent, name, points, color = '#d3f3ff', opacity = 0.7) => {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(point => new THREE.Vector3(...point)));
    const result = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
    result.name = name;
    parent.add(result);
    return result;
  };
  function texture(draw, width = 1024, height = 576) {
    const image = document.createElement('canvas');
    image.width = width;
    image.height = height;
    draw(image.getContext('2d'), width, height);
    const map = new THREE.CanvasTexture(image);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }
  const background = (a, b, c, glow) => texture((context, width, height) => {
    const fill = context.createLinearGradient(0, 0, width, height);
    fill.addColorStop(0, a);
    fill.addColorStop(0.52, b);
    fill.addColorStop(1, c);
    context.fillStyle = fill;
    context.fillRect(0, 0, width, height);
    const halo = context.createRadialGradient(width * 0.2, height * 0.15, 0, width * 0.2, height * 0.15, width * 0.65);
    halo.addColorStop(0, glow);
    halo.addColorStop(1, '#ffffff00');
    context.fillStyle = halo;
    context.fillRect(0, 0, width, height);
  });
  const backgrounds = {
    blue: background('#c5faff', '#69b8ee', '#507ae0', '#e1ffffbb'),
    pink: background('#ffd5e7', '#ed88c5', '#e7aeeb', '#ffeff9bb'),
    yellow: background('#fff49e', '#ffc75a', '#fbb05b', '#fff7c9bb'),
    dark: background('#10074c', '#131454', '#060d2d', '#462d9b44'),
    magic: background('#2762d7', '#9b4be4', '#2632ba', '#83e7ff66'),
    warm: background('#4882d9', '#b84fe3', '#3938cf', '#97e5ff44'),
    white: new THREE.Color('#ffffff'),
  };
  const wipeMap = texture(() => {});
  const wipeContext = wipeMap.image.getContext('2d');
  function backgroundWipe(from, to, fraction, vertical = false) {
    const width = wipeMap.image.width;
    const height = wipeMap.image.height;
    const paint = value => {
      if (value.isColor) {
        wipeContext.fillStyle = `#${value.getHexString()}`;
        wipeContext.fillRect(0, 0, width, height);
      } else wipeContext.drawImage(value.image, 0, 0, width, height);
    };
    paint(from);
    wipeContext.save();
    wipeContext.beginPath();
    if (vertical) wipeContext.rect(0, 0, width, height * fraction);
    else wipeContext.rect(width * (1 - fraction), 0, width * fraction, height);
    wipeContext.clip();
    paint(to);
    wipeContext.restore();
    wipeMap.needsUpdate = true;
    scene.background = wipeMap;
  }
  const sphereGeometry = new THREE.SphereGeometry(1, 32, 20);
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: '#5888ef', roughness: 0.15, metalness: 0.03,
    transparent: true, opacity: 0.5, clearcoat: 0.7, clearcoatRoughness: 0.16,
    envMapIntensity: 0.25,
    depthWrite: false, side: THREE.DoubleSide,
  });
  function ball(parent, name, radius, position, color = '#adceff', glass = false) {
    const mesh = addMesh(parent, name, sphereGeometry, glass ? glassMaterial.clone() : material(color), position);
    mesh.scale.setScalar(radius);
    return mesh;
  }
  function torus(parent, name, radius, color, position, tube = 0.18) {
    return addMesh(parent, name, new THREE.TorusGeometry(radius, tube, 16, 56), material(color), position);
  }
  function curvedPaper(parent, name, width, length, color, turns = 0.8) {
    const geometry = new THREE.PlaneGeometry(width, length, 12, 54);
    const vertices = geometry.attributes.position;
    for (let index = 0; index < vertices.count; index++) {
      const y = vertices.getY(index);
      const angle = (y / length + 0.5) * Math.PI * turns;
      vertices.setXYZ(index, vertices.getX(index), Math.sin(angle) * length / (Math.PI * turns), Math.cos(angle) * length / (Math.PI * turns));
    }
    geometry.computeVertexNormals();
    return addMesh(parent, name, geometry, material(color, { side: THREE.DoubleSide, roughness: 0.25 }));
  }
  function planeMark(parent, name, size = 1) {
    const object = new THREE.Group();
    object.name = name;
    const triangles = [
      { points: [-1.1, 0.4, 0, 1.1, 0, 0.04, -0.3, -0.02, 0.23], color: '#28f2d5' },
      { points: [-1.1, 0.4, 0, -0.3, -0.02, 0.23, -0.7, -0.32, 0.02], color: '#24c8da' },
      { points: [-0.7, -0.32, 0.02, 1.1, 0, 0.04, -0.9, -0.45, -0.14], color: '#3674ee' },
      { points: [-1.1, 0.4, 0, -0.9, -0.45, -0.14, -1.2, 0.18, -0.18], color: '#5c8df4' },
    ];
    triangles.forEach((triangle, index) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(triangle.points, 3));
      geometry.computeVertexNormals();
      addMesh(object, `${name} fold ${index}`, geometry, material(triangle.color, { side: THREE.DoubleSide, roughness: 0.4 }));
    });
    object.scale.setScalar(size);
    parent.add(object);
    return object;
  }
  function avatarStrip(parent, position = [2.8, 1.45, 0.7]) {
    return panel(parent, 'three collaborator portraits', maps.avatars, 0.64, 1.22, position);
  }
  function toolbar(parent, position = [0, -2.05, 0.9]) {
    const object = new THREE.Group();
    object.position.set(...position);
    roundedBox(object, 'meeting toolbar', 2.3, 0.28, 0.05, '#eff9ff');
    for (let index = 0; index < 6; index++) ball(object, `toolbar control ${index}`, 0.045, [-0.8 + index * 0.32, 0, 0.06], index === 2 ? '#3174dc' : '#8099df');
    parent.add(object);
    return object;
  }
  function monitor(parent) {
    const object = new THREE.Group();
    object.name = 'desktop shared workspace';
    roundedBox(object, 'monitor violet frame', 7.25, 4.5, 0.22, '#5265a9');
    roundedBox(object, 'monitor paper display', 7.02, 4.27, 0.04, '#eef0ff', [0, 0, 0.13]);
    const stem = addMesh(object, 'monitor pedestal stem', new THREE.CylinderGeometry(0.3, 0.55, 0.83, 32), material('#66b9e2'), [0, -2.65, -0.3]);
    stem.scale.z = 0.55;
    roundedBox(object, 'monitor foot', 2.15, 0.1, 1.05, '#89d4f1', [0, -3.08, 0]);
    const desktop = new THREE.Group();
    desktop.name = 'independent desktop windows';
    object.add(desktop);
    const windows = [
      panel(desktop, 'Project results window', maps.project, 2.65, 3.52, [-1.93, 0, 0.21]),
      panel(desktop, 'NEWS video window', maps.news, 3.02, 2.38, [1.13, 0.57, 0.28]),
      panel(desktop, 'Calendar window', maps.calendar, 3.12, 2.46, [-0.22, 0.03, 0.37]),
      panel(desktop, 'Time table window', maps.table, 2.85, 1.73, [0.93, -1.06, 0.55]),
      panel(desktop, 'Chat window', maps.chat, 1.54, 1.98, [2.72, -0.83, 0.46]),
    ];
    const overview = panel(object, 'unified Project Overview page', maps.overview, 6.78, 4.02, [0, 0, 0.71]);
    const portraits = avatarStrip(object, [2.97, 1.1, 0.96]);
    const controls = toolbar(object, [0, -2.08, 0.98]);
    parent.add(object);
    return { object, desktop, windows, overview, portraits, controls };
  }
  function phone(parent, width = 2.5, height = 5.7, map = maps.document) {
    const object = new THREE.Group();
    object.name = 'shared document phone';
    roundedBox(object, 'phone reflective edge', width + 0.12, height + 0.12, 0.18, '#6073c8');
    roundedBox(object, 'phone white face', width, height, 0.04, '#f7f7ff', [0, 0, 0.11]);
    const page = panel(object, 'editable phone document', map, width - 0.14, height - 0.14, [0, 0, 0.15]);
    roundedBox(object, 'phone speaker', 0.36, 0.035, 0.025, '#939bd1', [0, height / 2 - 0.11, 0.2]);
    parent.add(object);
    return { object, page };
  }
  function makeHand(parent, name) {
    const object = new THREE.Group();
    object.name = name;
    const shape = new THREE.Shape();
    shape.moveTo(2.65, -1.65);
    shape.bezierCurveTo(1.45, -1.64, 0.65, -1.73, 0.08, -1.46);
    shape.bezierCurveTo(-0.62, -1.13, -0.86, -0.71, -1.15, -0.3);
    shape.bezierCurveTo(-1.39, 0.04, -1.57, 0.3, -1.42, 0.46);
    shape.bezierCurveTo(-1.23, 0.61, -0.94, 0.25, -0.65, 0.16);
    shape.bezierCurveTo(-0.4, 0.08, -0.16, 0.22, -0.28, 0.52);
    shape.bezierCurveTo(-0.55, 1.07, -1.2, 1.86, -1.28, 2.16);
    shape.bezierCurveTo(-1.36, 2.46, -1.11, 2.5, -0.91, 2.22);
    shape.lineTo(-0.03, 1.18);
    shape.bezierCurveTo(0.23, 1.44, 0.47, 1.38, 0.65, 1.12);
    shape.bezierCurveTo(0.89, 1.29, 1.1, 1.2, 1.22, 0.94);
    shape.bezierCurveTo(1.47, 1.03, 1.65, 0.83, 1.78, 0.52);
    shape.bezierCurveTo(2.03, -0.02, 2.39, -0.12, 3.12, -0.12);
    shape.lineTo(2.65, -1.65);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.17, bevelEnabled: true, bevelSegments: 5, steps: 1, bevelSize: 0.055, bevelThickness: 0.065,
    });
    addMesh(object, `${name} glass volume`, geometry, glassMaterial.clone());
    const points = shape.getPoints(160).map(point => [point.x, point.y, 0.245]);
    line(object, `${name} bright contour`, [...points, points[0]], '#e1ffff', 0.84);
    line(object, `${name} knuckle one`, [[-0.03, 1.18, 0.25], [0.28, 0.79, 0.25], [0.51, 0.75, 0.25]], '#c9eeff', 0.57);
    line(object, `${name} thumb crease`, [[-0.65, 0.16, 0.25], [-0.15, -0.11, 0.25], [0.23, -0.18, 0.25]], '#d4f8ff', 0.64);
    parent.add(object);
    return object;
  }
  function handAt(hand, target, scale = 1, rotation = [0, 0, 0]) {
    hand.rotation.set(...rotation);
    hand.scale.setScalar(scale);
    const fingertip = new THREE.Vector3(-1.16, 2.23, 0.24).multiplyScalar(scale).applyEuler(hand.rotation);
    hand.position.set(...target).sub(fingertip);
  }
  function props(parent, count = 22, spread = 1) {
    const objects = [];
    for (let index = 0; index < count; index++) {
      const angle = index * 2.399963;
      const radius = (3.5 + index % 4 * 0.8) * spread;
      const position = [Math.cos(angle) * radius, Math.sin(angle) * radius * 0.69, -0.6 - index % 5 * 0.9];
      let object;
      if (index % 5 === 0) object = torus(parent, `floating orange ring ${index}`, 0.45 + index % 3 * 0.12, colors.yellow, position, 0.14);
      else if (index % 5 === 1) object = ball(parent, `glass bubble ${index}`, 0.18 + index % 3 * 0.09, position, '#adcaff', true);
      else if (index % 5 === 2) {
        object = curvedPaper(parent, `curved floating page ${index}`, 0.72, 1.2, index % 2 ? colors.purple : colors.blue, 0.9);
        object.position.set(...position);
      } else if (index % 5 === 3) object = panel(parent, `floating document card ${index}`, maps.icon, 0.7, 0.7, position);
      else object = addMesh(parent, `blue geometric cone ${index}`, new THREE.ConeGeometry(0.42, 0.85, 3), material('#5cb8f1'), position);
      object.userData.initial = object.position.clone();
      objects.push(object);
    }
    return objects;
  }
  function animateProps(objects, time, amount = 1) {
    objects.forEach((object, index) => {
      object.visible = true;
      object.position.copy(object.userData.initial);
      object.position.y += Math.sin(time * (0.35 + index % 3 * 0.08) + index) * 0.07 * amount;
      object.rotation.set(Math.sin(index * 1.7 + time * 0.13) * 0.5, index * 0.6 + time * 0.07, index + time * 0.045);
    });
  }
  function cameraAt(position, target = [0, 0, 0], fov = 40, roll = 0) {
    camera.position.set(...position);
    camera.up.set(Math.sin(roll), Math.cos(roll), 0);
    camera.lookAt(...target);
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  function sample(time, keyframes) {
    const index = Math.max(0, keyframes.findIndex((point, i) => i < keyframes.length - 1 && time < keyframes[i + 1][0]));
    const first = time >= keyframes.at(-1)[0] ? keyframes.at(-1) : keyframes[index];
    const second = time >= keyframes.at(-1)[0] ? first : keyframes[index + 1];
    const fraction = first === second ? 0 : phase(time, first[0], second[0]);
    return first[1].map((value, coordinate) => mix(value, second[1][coordinate], fraction));
  }

  const desktopGroup = group('desktop workspace and return');
  const desktop = monitor(desktopGroup);
  const pedestal = addMesh(desktopGroup, 'cyan luminous presentation pedestal', new THREE.CylinderGeometry(4.4, 3.8, 1.5, 72), material('#65e8ef', { roughness: 0.2, emissive: '#24b9cc', emissiveIntensity: 0.18 }), [0, -3.82, -0.2]);
  const desktopProps = props(desktopGroup, 19, 1.2);
  const desktopHand = makeHand(desktopGroup, 'desktop share hand');

  const deviceGroup = group('pink tablet and golden phone');
  const tablet = phone(deviceGroup, 3.35, 5.05, maps.overview);
  const phoneGolden = phone(deviceGroup, 2.35, 5.2, maps.table);
  tablet.page.visible = false;
  phoneGolden.page.visible = false;
  panel(tablet.object, 'tablet project window', maps.project, 1.28, 2.08, [-0.57, -0.36, 0.24]);
  panel(tablet.object, 'tablet calendar window', maps.calendar, 1.58, 1.22, [0.38, -0.14, 0.32]);
  panel(tablet.object, 'tablet table window', maps.table, 1.3, 0.79, [0.55, -0.87, 0.42]);
  panel(phoneGolden.object, 'phone project window', maps.project, 0.88, 1.43, [-0.42, -0.16, 0.24]);
  panel(phoneGolden.object, 'phone calendar window', maps.calendar, 1.12, 0.88, [0.26, -0.15, 0.32]);
  panel(phoneGolden.object, 'phone table window', maps.table, 0.96, 0.58, [0.32, -0.65, 0.43]);
  const tabletPortraits = avatarStrip(tablet.object, [1.21, 1.8, 0.32]);
  const goldenPortraits = avatarStrip(phoneGolden.object, [0.76, 1.74, 0.32]);
  const deviceProps = props(deviceGroup, 18, 1.15);

  const lightGroup = group('share icon light and paper reveal');
  const lightIcon = panel(lightGroup, 'purple collaboration icon', maps.icon, 1.25, 1.25, [-1.8, -0.4, 0]);
  const beam = addMesh(lightGroup, 'cyan projection beam', new THREE.ConeGeometry(1, 4.9, 48, 1, true), new THREE.MeshBasicMaterial({ color: '#82f1ff', transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }), [0.8, 0.1, -0.2]);
  beam.rotation.z = Math.PI / 2 - 0.25;
  const lightProps = props(lightGroup, 26, 1);

  const sharingGroup = group('phone share sheet and tap');
  const sharingPhone = phone(sharingGroup, 2.85, 6.1, maps.document);
  const shareCard = panel(sharingGroup, 'purple share action card', maps.share, 3.02, 3.65, [0.25, -0.75, 0.8]);
  const sharingHand = makeHand(sharingGroup, 'share button pointing hand');
  const sharingProps = props(sharingGroup, 22, 1.15);
  const sharedCurl = curvedPaper(sharingGroup, 'released purple document curl', 1.22, 3.65, colors.purple, 1.1);

  const montageGroup = group('fast collaboration montage');
  const montageSheets = [];
  [maps.share, maps.charts, maps.overview, maps.video].forEach((map, index) => {
    const object = panel(montageGroup, `montage interface ${index}`, map, 3.1 + index * 0.3, 4.1, [(index - 1.5) * 3.6, 0, -index * 1.4]);
    object.rotation.set(0.15, (index - 1.5) * 0.3, (index - 1.5) * 0.12);
    montageSheets.push(object);
  });
  const montageRibbon = curvedPaper(montageGroup, 'large purple S ribbon', 2.4, 8, colors.purple, 1.85);
  montageRibbon.position.set(0, -0.4, 0.8);
  const montageProps = props(montageGroup, 24, 1.3);
  const projectMontage = phone(montageGroup, 2.8, 6.1, maps.document);
  projectMontage.object.position.set(3.2, 0, -1.2);
  avatarStrip(projectMontage.object, [1.1, 1.9, 0.4]);

  const scrollGroup = group('continuous phone and table document');
  const scrollPhone = phone(scrollGroup, 2.54, 6.04, maps.document);
  scrollPhone.page.visible = false;
  const scrollMap = maps.document.clone();
  scrollMap.needsUpdate = true;
  const paperWidth = 2.35;
  const paperLength = 10.8;
  const paperRows = 150;
  const paperColumns = 10;
  const paperGeometry = new THREE.PlaneGeometry(paperWidth, paperLength, paperColumns, paperRows);
  const paperPositions = paperGeometry.attributes.position;
  for (let vertex = 0; vertex < paperPositions.count; vertex++) {
    const distance = (paperLength / 2 - paperPositions.getY(vertex));
    const x = paperPositions.getX(vertex);
    const radius = 0.55;
    const bendStart = 5.3;
    const bendEnd = bendStart + Math.PI * radius / 2;
    let y;
    let z;
    if (distance <= bendStart) { y = 3 - distance; z = 0.24; }
    else if (distance < bendEnd) {
      const angle = (distance - bendStart) / radius;
      y = 3 - bendStart - radius * Math.sin(angle);
      z = 0.24 + radius * (1 - Math.cos(angle));
    } else { y = 3 - bendStart - radius; z = 0.24 + radius + distance - bendEnd; }
    paperPositions.setXYZ(vertex, x, y, z);
  }
  paperGeometry.computeVertexNormals();
  const paper = addMesh(scrollGroup, 'continuous bendable shared document', paperGeometry,
    new THREE.MeshStandardMaterial({ map: scrollMap, color: '#ffffff', roughness: 0.7, metalness: 0,
      emissive: '#e0e7ff', emissiveIntensity: 0.18, side: THREE.DoubleSide }));
  const modal = panel(scrollGroup, 'View on your own dialog', maps.modal, 2.8, 1.82, [0.27, -0.37, 0.59]);
  const scrollHand = makeHand(scrollGroup, 'document tap and scrolling hand');
  const scrollPortraits = avatarStrip(scrollGroup, [1.18, 1.35, 0.58]);
  const scrollProps = props(scrollGroup, 16, 1.25);
  scrollProps[0].userData.initial.set(3.8, 2.25, -0.8);
  scrollProps[0].scale.setScalar(1.5);
  for (let index = 0; index < 3; index++) {
    const sheet = curvedPaper(scrollGroup, `large spatial backdrop ${index}`, 4.6, 12.8,
      [colors.blue, colors.purple, '#3c92db'][index], 0.8 + index * 0.2);
    sheet.position.set(-4.3 + index * 4.6, 0.6, -4.4 - index * 1.3);
    sheet.rotation.set(0.3, -0.3, -0.18 + index * 0.13);
  }
  const floor = addMesh(scrollGroup, 'reflective blue table', new THREE.PlaneGeometry(70, 70), material('#536ee6', { roughness: 0.18, metalness: 0.48 }), [0, -2.88, 0]);
  floor.rotation.x = -Math.PI / 2;
  const floorGrid = new THREE.GridHelper(55, 100, '#aebdff', '#8799eb');
  floorGrid.position.y = -2.866;
  floorGrid.material.transparent = true;
  floorGrid.material.opacity = 0.19;
  scrollGroup.add(floorGrid);

  const chartGroup = group('simultaneous chart and table collaboration');
  const chartBoard = panel(chartGroup, 'collaborative charts and table', maps.charts, 6.8, 5.92, [0, 0, 0]);
  const chartPortraits = avatarStrip(chartGroup, [3.1, 1.9, 0.48]);
  const chartToolbar = toolbar(chartGroup, [0, -2.87, 0.5]);
  const chartHandA = makeHand(chartGroup, 'chart upper collaborator hand');
  const chartHandB = makeHand(chartGroup, 'table lower collaborator hand');
  const chartProps = props(chartGroup, 17, 1.25);

  const videoGroup = group('shared video windows in space');
  const player = panel(videoGroup, 'main collaborative video player', maps.video, 5.8, 4.3);
  avatarStrip(player, [2.66, 1.02, 0.3]);
  toolbar(player, [0, -2.08, 0.3]);
  const secondaryPlayer = panel(videoGroup, 'second shared video player', maps.video, 3.5, 2.6, [4.65, 0.7, -2.6]);
  avatarStrip(secondaryPlayer, [1.55, 0.65, 0.2]);
  const videoProps = props(videoGroup, 24, 1.7);

  const flightGroup = group('paper plane from shared document');
  const heroPlane = planeMark(flightGroup, 'Lark folding paper plane', 1.35);
  const trail = line(flightGroup, 'short orange flight ribbon', [[-3.6, -0.1, 0], [-2.9, 0, 0], [-1.5, 0.05, 0]], '#ffa14d', 0.9);
  const flightProps = props(flightGroup, 15, 2.4);
  const brand = document.getElementById('brand-art');
  const brandName = document.getElementById('brand-name');
  const brandUrl = document.getElementById('brand-url');
  const exposure = document.getElementById('opening-light');
  const portal = document.getElementById('window-portal');
  const portalContext = portal.getContext('2d');
  const outgoingDevice = document.createElement('canvas');
  outgoingDevice.width = WIDTH;
  outgoingDevice.height = HEIGHT;
  const outgoingContext = outgoingDevice.getContext('2d');
  brandName.textContent = variables.brandName || 'LARK';
  brandUrl.textContent = variables.brandUrl || 'www.larksuite.com';

  function desktopScene(time, final = false) {
    desktopGroup.visible = true;
    desktop.object.rotation.set(0, final ? Math.sin((time - 27) * 0.65) * 0.035 : -0.08, 0);
    desktop.object.position.set(0, 0.15, 0);
    desktop.object.scale.setScalar(1);
    const merge = final ? phase(time, 28.35, 29.7) : 0;
    desktop.desktop.visible = merge < 0.98;
    desktop.overview.visible = final && merge > 0;
    desktop.overview.scale.setScalar(mix(0.13, 1, out(merge)));
    desktop.overview.position.z = mix(1.35, 0.71, merge);
    desktop.windows.forEach((window, index) => {
      const collapse = phase(time, 28.45 + index * 0.05, 29.25 + index * 0.05);
      window.scale.setScalar(final ? 1 - collapse * 0.86 : 1);
      window.rotation.y = final ? collapse * (index - 2) * 0.25 : 0;
    });
    desktop.portraits.visible = true;
    desktop.controls.visible = final;
    pedestal.visible = true;
    pedestal.scale.setScalar(1);
    desktopHand.visible = final && time > 27.85 && time < 29.25;
    if (desktopHand.visible) {
      const target = sample(time, [[27.85, [1, -4, 2]], [28.2, [0.1, -1.89, 1.15]], [28.4, [0.1, -1.89, 0.9]], [28.58, [0.1, -1.89, 1.2]], [29.2, [2, -5, 2]]]);
      handAt(desktopHand, target, 0.72, [0.03, -0.08, -0.12]);
    }
    animateProps(desktopProps, time);
    if (final) {
      const enter = out((time - 25.9) / 0.82);
      desktopGroup.rotation.set(0, mix(0.68, 0, enter), 0);
      desktopGroup.scale.setScalar(mix(0.65, 1, enter));
      cameraAt([mix(4.2, 0.45, enter), 0.55, mix(14.8, 12.5, enter)], [0, -0.25, 0], 40);
    } else {
      desktopGroup.rotation.set(0, 0, 0);
      desktopGroup.scale.setScalar(1);
      cameraAt([-0.5, 0.25, 12.1], [0, -0.25, 0], 40);
    }
  }
  function deviceScene(time) {
    deviceGroup.visible = true;
    const gold = time >= 4.08;
    tablet.object.visible = !gold;
    phoneGolden.object.visible = gold;
    const object = gold ? phoneGolden.object : tablet.object;
    const enter = out((time - (gold ? 4.08 : 1.76)) / 0.4);
    const exit = gold ? phase(time, 6.18, 6.64) : phase(time, 3.96, 4.24);
    object.position.set(0, gold ? exit * 0.2 : 0, 0);
    object.rotation.set(0, mix(-0.7, -0.05, enter), mix(0.07, 0, enter));
    object.scale.setScalar(gold ? 1 + exit * 3.5 : 1);
    animateProps(deviceProps, time, 0.7);
    cameraAt([0.35, 0.15, 12], [0, 0, 0], 40);
  }
  function lightScene(time) {
    lightGroup.visible = true;
    lightIcon.rotation.set(-0.18, 0.08, -0.13);
    lightIcon.position.set(-1.8, -0.4, 0);
    beam.rotation.z = mix(Math.PI / 2 - 0.25, 0.2, phase(time, 8.1, 8.74));
    beam.position.set(mix(0.8, -0.8, phase(time, 8.1, 8.74)), 0.5, -0.2);
    beam.material.opacity = mix(0.19, 0.42, phase(time, 8.2, 8.84));
    animateProps(lightProps, time);
    cameraAt([0.5, 1.1, mix(10, 8.5, phase(time, 6.64, 8.8))], [0, 0, -1], 43, 0.12);
  }
  function sharingScene(time) {
    sharingGroup.visible = true;
    const entry = out((time - 8.84) / 1.0);
    sharingPhone.object.rotation.set(0.02, -0.23, 0.13);
    sharingPhone.object.position.set(0, mix(-1.7, 0.4, entry), 0);
    shareCard.position.set(0.25, mix(-1.8, -0.7, entry), mix(0.2, 1.0, entry));
    const release = phase(time, 11.22, 12.4);
    shareCard.rotation.y = -release * 1.42;
    shareCard.rotation.z = -release * 0.05;
    shareCard.position.x += release * 0.8;
    shareCard.scale.setScalar(mix(1, 0.65, release));
    sharingHand.visible = time > 10.35 && time < 11.95;
    if (sharingHand.visible) {
      const target = sample(time, [[10.35, [4, 0.3, 2.5]], [10.78, [0.35, 0.12, 1.7]], [11.02, [0.35, 0.12, 1.16]], [11.17, [0.35, 0.12, 1.44]], [11.65, [3.4, 1.0, 2.4]]]);
      handAt(sharingHand, target, 0.88, [0, -0.08, -0.42]);
    }
    sharedCurl.position.set(2.25, -0.15, mix(-0.7, 0.9, release));
    sharedCurl.rotation.set(0.1, -0.2 + release * 0.5, -0.08);
    sharedCurl.scale.setScalar(mix(0.03, 1, release));
    animateProps(sharingProps, time);
    cameraAt([mix(2.8, 1.1, entry), 0.1, mix(12.5, 9.3, entry)], [0.3, -0.2, 0], 43, 0.09);
  }
  function montageScene(time) {
    montageGroup.visible = true;
    animateProps(montageProps, time);
    const shot = time < 13.24 ? 0 : time < 14.16 ? 1 : 2;
    montageSheets.forEach((sheet, index) => { sheet.visible = shot === 0 && index !== 1; });
    montageRibbon.visible = shot === 1;
    projectMontage.object.visible = shot === 2;
    montageRibbon.rotation.set(0.2, 0.2 + (time - 13.24) * 0.2, -0.3);
    if (shot === 0) cameraAt([-2.3 + (time - 12.4) * 1.9, 0.4, 7.0], [-2.6, 0, -1], 48, 0.24);
    if (shot === 1) cameraAt([1, -0.3, 7.6 - (time - 13.24) * 1.1], [0, 0, 0], 45, -0.24);
    if (shot === 2) cameraAt([5.4, 0.3, 7.8 - phase(time, 14.16, 15.96) * 1.3], [3.3, 0, -2], 41, 0.16);
  }
  function scrollScene(time) {
    scrollGroup.visible = true;
    const establish = out((time - 15.96) / 0.45);
    paperGeometry.setDrawRange(0, Math.max(6 * paperColumns, 6 * paperColumns * Math.floor(paperRows * mix(0.58, 1, establish))));
    const scrolling = phase(time, 17.2, 18.12) * 0.26 + phase(time, 18.55, 19.15) * 0.16;
    scrollMap.repeat.set(1, 0.74);
    scrollMap.offset.set(0, mix(0.26, -0.06, scrolling / 0.42));
    modal.visible = time < 17.24;
    modal.scale.setScalar(mix(1, 0.92, phase(time, 16.58, 16.74)));
    scrollPortraits.position.y = mix(1.5, 0.6, phase(time, 17.2, 18.1));
    scrollHand.visible = time >= 16.08 && time < 19.4;
    if (scrollHand.visible) {
      const target = sample(time, [
        [16.08, [3.7, -0.65, 2.1]], [16.5, [0.19, -0.92, 0.95]],
        [16.7, [0.19, -0.92, 0.66]], [16.88, [0.19, -0.92, 0.98]],
        [17.18, [0.22, -0.72, 0.99]], [17.85, [0.22, 1.64, 0.91]],
        [18.22, [0.22, 1.64, 0.91]], [18.78, [0.22, 0.65, 1.05]],
        [19.38, [3.7, -2.7, 2.7]],
      ]);
      handAt(scrollHand, target, 0.88, [0, -0.12, -0.12]);
    }
    animateProps(scrollProps, time, 0.7);
    const cameraMove = phase(time, 17.16, 17.76);
    cameraAt([mix(2.7, 1.0, cameraMove), mix(0.2, 0.5, cameraMove), mix(7.3, 9.5, cameraMove)], [0, -0.4, 0.6], 40, mix(0.1, 0, cameraMove));
  }
  function chartScene(time) {
    chartGroup.visible = true;
    const retreat = phase(time, 21.15, 22.4);
    chartBoard.rotation.set(0.04, -0.08, -0.025);
    animateProps(chartProps, time);
    chartHandA.visible = time < 21.2;
    chartHandB.visible = time < 21.6;
    handAt(chartHandA, [1.3, 1.15, 0.8], 0.8, [0, 0, 2.85]);
    handAt(chartHandB, [1.7, -1.3 + Math.sin((time - 20) * 2.3) * 0.22, 0.85], 0.94, [0, 0, 0.7]);
    cameraAt([mix(2.8, -1.4, retreat), 0.3, mix(10.5, 15.5, retreat)], [0, 0, 0], 43, 0.06);
  }
  function videoScene(time) {
    videoGroup.visible = true;
    const move = phase(time, 22.4, 24.9);
    const turn = phase(time, 24.36, 24.96);
    player.rotation.set(0, mix(-0.1, -Math.PI / 2, turn), 0);
    secondaryPlayer.rotation.set(0, -0.16, 0);
    secondaryPlayer.position.x = 4.65 + turn * 5;
    videoGroup.scale.setScalar(mix(1, 0.6, turn));
    animateProps(videoProps, time, 0.7);
    cameraAt([mix(mix(0, 4.4, move), 0, turn), 0.4, mix(mix(12.5, 15.7, move), 12.8, turn)], [mix(1.1, 0, turn), 0, mix(-0.5, 0, turn)], mix(44, 42, turn), 0.02 * (1 - turn));
  }
  function clusterScene(time) {
    desktopScene(time, true);
    const turn = phase(time, 24.96, 26.7);
    const angle = sample(time, [[24.96, [-Math.PI / 2]], [25.32, [-2.5]], [26.72, [0]]])[0];
    desktopGroup.rotation.set(0.12 * (1 - turn), angle, mix(0.15, 0, turn));
    desktopGroup.scale.setScalar(mix(0.48, 1, turn));
    desktopHand.visible = false;
    desktop.overview.visible = false;
    desktop.desktop.visible = true;
    pedestal.visible = time >= 26.12;
    pedestal.scale.setScalar(phase(time, 26.12, 26.72));
    cameraAt([mix(0, 0.45, turn), mix(0.4, 0.55, turn), mix(12.8, 12.5, turn)], [0, mix(0, -0.25, turn), 0], mix(42, 40, turn), 0);
  }
  function flightScene(time) {
    flightGroup.visible = true;
    const local = time - 30.4;
    const entry = out(local / 0.48);
    const whiteFlight = phase(time, 32.72, 33);
    const x = mix(mix(-4.5, 0, entry), -3.4, phase(time, 32.1, 32.72));
    heroPlane.position.set(mix(x, 1.3, whiteFlight), mix(Math.sin(local * 1.4) * 0.22, 1.55, whiteFlight), 0);
    heroPlane.rotation.set(-0.2 + local * 0.35, local * 0.4, Math.sin(local) * 0.12);
    heroPlane.scale.setScalar(mix(mix(0.3, 1.35, phase(time, 30.16, 31.1)), 0.5, whiteFlight));
    flightGroup.position.z = mix(0.8, 4.7, phase(time, 30.16, 31.1));
    trail.visible = local < 1.4;
    trail.position.x = heroPlane.position.x;
    animateProps(flightProps, time, 0.5);
    flightProps.forEach(object => { object.visible = time < 32.55; });
    cameraAt([0, 0.6, 12.5], [0, 0, 0], 40, 0.03);
  }
  function renderAt(time) {
    const t = Math.max(0, Math.min(DURATION - 1 / 25, time));
    groups.forEach(object => {
      object.visible = false;
      object.position.set(0, 0, 0);
      object.rotation.set(0, 0, 0);
      object.scale.setScalar(1);
    });
    brand.style.opacity = '0';
    portal.style.opacity = '0';
    ambient.intensity = 0.95;
    key.intensity = 2.2;
    cyanLight.intensity = 9;
    scene.fog = new THREE.Fog('#5974dd', 24, 90);
    scene.background = backgrounds.magic;
    if (t < 1.76) { scene.background = backgrounds.blue; desktopScene(t); }
    else if (t < 2.16) {
      const p = phase(t, 1.76, 2.16);
      desktopScene(t);
      deviceScene(t);
      desktopGroup.position.x = -12 * p;
      deviceGroup.position.x = 12 * (1 - p);
      cameraAt([mix(-0.5, 0.35, p), mix(0.25, 0.15, p), mix(12.1, 12, p)], [0, mix(-0.25, 0, p), 0]);
      backgroundWipe(backgrounds.blue, backgrounds.pink, p);
    } else if (t < 4.08) { scene.background = backgrounds.pink; deviceScene(t); }
    else if (t < 4.48) {
      const p = phase(t, 4.08, 4.48);
      deviceScene(t);
      tablet.object.visible = true;
      tablet.object.position.set(0, -9 * p, 0);
      tablet.object.rotation.set(0, -0.05, 0);
      phoneGolden.object.position.y = 9 * (1 - p);
      backgroundWipe(backgrounds.pink, backgrounds.yellow, p, true);
    } else if (t < 6.4) { scene.background = backgrounds.yellow; deviceScene(t); }
    else if (t < 8.96) {
      if (t < 6.76) {
        scene.background = backgrounds.yellow;
        deviceScene(6.4);
        renderer.render(scene, camera);
        outgoingContext.drawImage(canvas, 0, 0);
        deviceGroup.visible = false;
      }
      scene.background = backgrounds.dark;
      ambient.intensity = 0.17;
      key.intensity = 0.35;
      cyanLight.intensity = 1.6;
      scene.fog = new THREE.Fog('#090a37', 14, 65);
      lightScene(t);
      if (t < 6.76) {
        const p = phase(t, 6.4, 6.76);
        const width = 1740 * p;
        const height = 1120 * p;
        const x = 640 - width / 2;
        const y = 360 - height / 2;
        portal.style.opacity = '1';
        portalContext.clearRect(0, 0, WIDTH, HEIGHT);
        portalContext.save();
        portalContext.beginPath();
        portalContext.rect(0, 0, WIDTH, HEIGHT);
        portalContext.rect(x, y, width, height);
        portalContext.clip('evenodd');
        portalContext.drawImage(outgoingDevice, 0, 0);
        portalContext.restore();
      }
    } else if (t < 12.4) sharingScene(t);
    else if (t < 15.96) { scene.background = backgrounds.warm; montageScene(t); }
    else if (t < 19.28) scrollScene(t);
    else if (t < 19.92) {
      const p = phase(t, 19.28, 19.92);
      scrollScene(t);
      chartScene(t);
      scrollGroup.position.y = -10 * p;
      chartGroup.position.y = 10 * (1 - p);
      cameraAt([mix(1, 2.8, p), mix(0.5, 0.3, p), mix(9.5, 10.5, p)], [0, mix(-0.4, 0, p), mix(0.6, 0, p)], mix(40, 43, p), 0.06 * p);
      backgroundWipe(backgrounds.magic, backgrounds.warm, p, true);
    } else if (t < 21.84) { scene.background = backgrounds.warm; chartScene(t); }
    else if (t < 22.48) {
      const p = phase(t, 21.84, 22.48);
      chartScene(t);
      videoScene(t);
      chartGroup.position.x = -14 * p;
      videoGroup.position.x = 14 * (1 - p);
      cameraAt([mix(-0.4, 0, p), 0.4, mix(14, 12.5, p)], [mix(0, 1.1, p), 0, -0.5 * p], mix(43, 44, p), mix(0.06, 0.02, p));
      backgroundWipe(backgrounds.warm, backgrounds.magic, p);
    } else if (t < 24.96) videoScene(t);
    else if (t < 26.72) {
      clusterScene(t);
      backgroundWipe(backgrounds.magic, backgrounds.warm, phase(t, 24.96, 25.4));
    } else if (t < 30.16) { scene.background = backgrounds.warm; desktopScene(t, true); }
    else if (t < 31.1) {
      const p = phase(t, 30.16, 31.1);
      desktopScene(t, true);
      flightScene(t);
      desktopGroup.position.set(-p * 14, 0, -7 * p);
      desktopGroup.scale.setScalar(mix(1, 0.55, p));
      desktopProps.forEach(object => { object.visible = p < 0.65; });
      scene.background = backgrounds.warm;
    } else if (t < 33) {
      scene.background = backgrounds.warm;
      flightScene(t);
      if (t >= 32.32) backgroundWipe(backgrounds.warm, backgrounds.white, phase(t, 32.32, 32.9));
    } else {
      scene.background = backgrounds.white;
      scene.fog = null;
      cameraAt([0, 0, 9]);
      brand.style.opacity = '1';
      const pose = sample(t, [[33, [240, -190, -65, 1.2]], [33.5, [-120, 80, -195, 0.9]], [33.92, [-420, 80, -335, 7.5]], [34.12, [-100, -20, -365, 2.0]], [34.6, [0, 0, -373, 1]]]);
      const mark = document.getElementById('brand-mark');
      mark.style.transform = `translate(${pose[0]}px,${pose[1]}px) rotate(${pose[2]}deg) scale(${pose[3]})`;
      brandName.style.opacity = String(phase(t, 34.24, 34.64));
      brandUrl.style.opacity = String(phase(t, 34.45, 35.0));
    }
    const initialLight = (1 - phase(t, 0.08, 0.56)) * 0.46;
    const magicFlash = phase(t, 8.8, 8.96) * (1 - phase(t, 8.96, 9.22)) * 0.94;
    exposure.style.opacity = String(Math.max(initialLight, magicFlash));
    renderer.render(scene, camera);
  }
  const clock = { time: 0 };
  const timeline = gsap.timeline({ paused: true });
  timeline.fromTo(clock, { time: 0 }, { time: DURATION, duration: DURATION, ease: 'none', onUpdate: () => renderAt(clock.time) }, 0);
  window.__timelines = window.__timelines || {};
  window.__timelines["lark-magic-share"] = timeline;
  window.addEventListener('hf-seek', event => renderAt(event.detail.time));
  canvas.dataset.ready = 'true';
  renderAt(0);
}
