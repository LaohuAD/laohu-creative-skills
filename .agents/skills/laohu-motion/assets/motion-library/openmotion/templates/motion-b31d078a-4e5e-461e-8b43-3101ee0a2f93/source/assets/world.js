/* A seekable 3D world. Object construction and phase poses remain separately editable. */
window.mountWebflowWorld = function () {
  const THREE = window.THREE;
  const canvas = document.getElementById('webflow-world-canvas');
  const output = canvas.getContext('2d');
  const surface = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas: surface, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(1280, 720, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;

  const variables = window.__hyperframes?.getVariables?.() || {};
  const palette = { blue: variables.blue || '#2638ee', pink: variables.pink || '#ef75b1' };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1280 / 720, 0.1, 180);
  const ambient = new THREE.AmbientLight(0xb8c5ff, 1.15);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xfff5f2, 2.2);
  key.position.set(-5, 8, 7);
  scene.add(key);
  const blueFill = new THREE.DirectionalLight(0x2636ff, 1.9);
  blueFill.position.set(6, 2, -4);
  scene.add(blueFill);
  const pinkFill = new THREE.PointLight(0xff8bba, 9, 50);
  pinkFill.position.set(-4, 3, 4);
  scene.add(pinkFill);

  const environmentCanvas = document.createElement('canvas');
  environmentCanvas.width = 1024;
  environmentCanvas.height = 512;
  const environmentContext = environmentCanvas.getContext('2d');
  const environmentGradient = environmentContext.createLinearGradient(0, 0, 1024, 512);
  environmentGradient.addColorStop(0, '#fff9f5');
  environmentGradient.addColorStop(0.3, '#969dff');
  environmentGradient.addColorStop(0.7, '#0e14a7');
  environmentGradient.addColorStop(1, '#f8accb');
  environmentContext.fillStyle = environmentGradient;
  environmentContext.fillRect(0, 0, 1024, 512);
  environmentContext.fillStyle = '#ffffff';
  environmentContext.fillRect(80, 50, 340, 50);
  environmentContext.fillRect(730, 110, 180, 200);
  const environment = new THREE.CanvasTexture(environmentCanvas);
  environment.mapping = THREE.EquirectangularReflectionMapping;
  environment.colorSpace = THREE.SRGBColorSpace;
  const environmentGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = environmentGenerator.fromEquirectangular(environment).texture;
  environmentGenerator.dispose();
  environment.dispose();

  const materials = window.WebflowMaterials(THREE, renderer, palette);
  const groups = {};
  const background = document.getElementById('webflow-world-background');
  const clamp = value => Math.max(0, Math.min(1, value));
  const easeOut = value => 1 - Math.pow(1 - clamp(value), 3);
  const smooth = value => {
    const progress = clamp(value);
    return progress * progress * (3 - 2 * progress);
  };
  const mix = (start, end, progress) => start + (end - start) * progress;
  const hash = index => {
    const number = Math.sin(index * 127.1 + 31.7) * 43758.5453;
    return number - Math.floor(number);
  };

  function createGroup(name) {
    const group = new THREE.Group();
    group.name = name;
    scene.add(group);
    groups[name] = group;
    return group;
  }

  function poseCamera(position, target = [0, 0, 0], fieldOfView = 40) {
    camera.position.set(...position);
    camera.lookAt(...target);
    camera.fov = fieldOfView;
    camera.updateProjectionMatrix();
  }

  const floorMaterial = new THREE.MeshBasicMaterial({ color: 0xc7c8f3 });
  const darkFog = new THREE.Fog(0x020313, 5, 28);
  const lightFog = new THREE.Fog(0xeeeeef, 24, 85);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const grid = new THREE.GridHelper(160, 80, 0xc6c7f0, 0xb5b5dc);
  grid.position.y = 0.004;
  grid.material.transparent = true;
  grid.material.opacity = 0.2;
  scene.add(grid);

  const sphereField = createGroup('sphere-field');
  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      const index = row * 5 + column;
      const radius = 0.62 + hash(index) * 0.25;
      const ball = materials.sphere(radius, `floor-sphere-${index}`);
      ball.position.set((column - 2) * 3.2 + hash(index + 90) * 0.4, radius, -row * 3.2);
      sphereField.add(ball);
      const contact = materials.shadow(radius);
      contact.position.x = ball.position.x + 0.2;
      contact.position.z = ball.position.z - 0.1;
      sphereField.add(contact);
    }
  }

  const openingStack = createGroup('opening-interface-stack');
  for (let index = 0; index < 7; index += 1) {
    const panel = materials.panel('abstract', index % 3, 6.5, 4.4, index % 3 === 0);
    panel.position.set(-2, 2.7, -index * 0.68);
    openingStack.add(panel);
  }
  const openingTraveler = materials.sphere(0.28, 'opening-traveler');
  openingTraveler.position.set(4.5, 0.3, 0);
  openingStack.add(openingTraveler);
  const openingShadow = materials.shadow(0.3);
  openingShadow.position.set(4.5, 0.006, 0);
  openingStack.add(openingShadow);

  const corridor = createGroup('glass-corridor');
  const corridorPanels = [];
  for (let index = 0; index < 12; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const panel = materials.panel('abstract', index % 3, 5.4, 4.1, index % 3 === 0);
    panel.position.set(side * 3.9, 2.3, -Math.floor(index / 2) * 3.2);
    panel.rotation.y = side * 0.26;
    corridor.add(panel);
    corridorPanels.push(panel);
  }
  const corridorBalls = [];
  for (let index = 0; index < 7; index += 1) {
    const ball = materials.sphere(0.25 + (index % 3) * 0.13, `corridor-sphere-${index}`);
    corridor.add(ball);
    corridorBalls.push(ball);
  }

  const glassCube = createGroup('glass-cube');
  const cubeBody = new THREE.Group();
  cubeBody.name = 'folding-glass-cube';
  glassCube.add(cubeBody);
  const opticalGlass = new THREE.MeshPhysicalMaterial({
    color: 0xd9dcff,
    transmission: 0,
    thickness: 0.32,
    roughness: 0.16,
    metalness: 0.35,
    transparent: true,
    opacity: 0.19,
    depthWrite: false,
    ior: 1.28,
    clearcoat: 0.8,
    envMapIntensity: 0.65,
    side: THREE.DoubleSide,
  });
  const cubeFaces = [];
  const facePoses = [
    [[0, 0, 1.5], [0, 0, 0]],
    [[0, 0, -1.5], [0, Math.PI, 0]],
    [[1.5, 0, 0], [0, Math.PI / 2, 0]],
    [[-1.5, 0, 0], [0, -Math.PI / 2, 0]],
    [[0, 1.5, 0], [-Math.PI / 2, 0, 0]],
    [[0, -1.5, 0], [Math.PI / 2, 0, 0]],
  ];
  for (const [index, [position, rotation]] of facePoses.entries()) {
    const pivot = new THREE.Group();
    pivot.name = `cube-face-${index}`;
    pivot.position.set(...position);
    pivot.rotation.set(...rotation);
    const face = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 0.045), opticalGlass);
    pivot.add(face);
    pivot.add(new THREE.LineSegments(new THREE.EdgesGeometry(face.geometry), materials.outline));
    cubeBody.add(pivot);
    cubeFaces.push(pivot);
  }
  const innerSphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.05, 48, 32),
    new THREE.MeshStandardMaterial({ color: 0xe5e6ff, metalness: 0.12, roughness: 0.3 }),
  );
  innerSphere.name = 'inner-pearlescent-sphere';
  cubeBody.add(innerSphere);
  const traveler = materials.sphere(0.18, 'cube-traveler');
  glassCube.add(traveler);
  const cubeAnnotations = new THREE.Group();
  cubeAnnotations.name = 'cube-wireframe-annotations';
  for (let index = 0; index < 7; index += 1) {
    const tile = materials.panel('wire', 4, 0.7, 0.5, true);
    tile.position.set((hash(index + 40) - 0.5) * 6, (hash(index + 80) - 0.5) * 4, 2.2 + hash(index) * 2);
    cubeAnnotations.add(tile);
  }
  const cubeWire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(3.1, 3.1, 3.1)), materials.outline);
  cubeAnnotations.add(cubeWire);
  glassCube.add(cubeAnnotations);

  const ribbons = createGroup('curved-interface-spiral');
  const ribbonPages = [];
  for (let index = 0; index < 28; index += 1) {
    const layer = Math.floor(index / 4);
    const quadrant = index % 4;
    const radius = 3.7 + (index % 3) * 0.2;
    const angle = quadrant * Math.PI / 2 + layer * 0.24;
    const width = 2.9 + (index % 3) * 0.2;
    const height = 1.25;
    const geometry = new THREE.PlaneGeometry(width, height, 28, 6);
    const target = geometry.attributes.position.array.slice();
    const uv = geometry.attributes.uv;
    for (let vertex = 0; vertex < uv.count; vertex += 1) {
      const phase = (uv.getX(vertex) - 0.5) * 0.82;
      const distance = radius + (uv.getY(vertex) - 0.5) * height;
      target[vertex * 3] = Math.sin(phase) * distance;
      target[vertex * 3 + 1] = Math.cos(phase) * distance - radius;
      target[vertex * 3 + 2] = 0;
    }
    geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(target, 3)];
    const material = new THREE.MeshBasicMaterial({ map: materials.interfaceTexture(index % 3 === 0 ? 'login' : 'browser', index), side: THREE.DoubleSide });
    const page = new THREE.Mesh(geometry, material);
    page.name = `curved-page-${index}`;
    ribbons.add(page);
    ribbonPages.push({ page, layer, angle, radius });
  }
  const ribbonHero = materials.sphere(0.67, 'spiral-traveler');
  ribbons.add(ribbonHero);

  function prepareFrame(light = true, ground = false) {
    Object.values(groups).forEach(group => { group.visible = false; });
    floor.visible = ground;
    grid.visible = ground;
    scene.fog = ground ? (light ? lightFog : darkFog) : null;
    floorMaterial.color.set(light ? 0xe5e5ef : 0x101bb1);
    grid.material.opacity = light ? 0.24 : 0.06;
    materials.sphereMaterial.uniforms.pinkAmount.value = light ? 0.85 : 0.08;
    materials.sphereMaterial.uniforms.brightness.value = light ? 1.05 : 0.88;
    materials.sphereMaterial.uniforms.fogAmount.value = 0;
    ambient.intensity = light ? 1.15 : 0.38;
    key.intensity = light ? 2.2 : 1.2;
    background.style.background = light
      ? 'radial-gradient(ellipse at 84% 28%,#efb7d7 0,transparent 45%),radial-gradient(ellipse at 12% 65%,#b7b7ff 0,transparent 43%),#eeeeef'
      : 'radial-gradient(ellipse at 48% 50%,#192bea 0,#060b67 35%,#020313 74%)';
  }

  function renderFloor(time) {
    prepareFrame(false, true);
    sphereField.visible = true;
    const progress = smooth(time / 2);
    materials.sphereMaterial.uniforms.fogAmount.value = 1;
    poseCamera([mix(0, 1.2, progress), mix(1.1, 4.7, progress), mix(2.1, 7.1, progress)], [0, 0.3, -5]);
  }

  function renderOpeningStack(time) {
    prepareFrame(false, true);
    openingStack.visible = true;
    openingStack.scale.setScalar(1.65);
    const progress = easeOut(time / (73 / 30));
    poseCamera([mix(9.5, 8.1, progress), mix(5.2, 4.3, progress), mix(15, 12.5, progress)], [-2.5, 3.5, -0.7], 42);
    openingTraveler.position.z = -0.3 - time * 0.08;
  }

  function renderCorridor(time) {
    const bright = time > 3.9;
    prepareFrame(bright, true);
    corridor.visible = true;
    const progress = clamp(time / (182 / 30));
    const flight = smooth(progress);
    const cameraX = mix(5, 0, easeOut(time / 1.4)) + Math.sin(progress * Math.PI * 2) * 0.55;
    poseCamera([cameraX, mix(3.6, 2.2, flight), mix(9, -15, flight)], [0, 2.1, mix(-2, -22, flight)], 43);
    corridorPanels.forEach((panel, index) => {
      panel.rotation.y = (index % 2 === 0 ? -1 : 1) * (0.26 + 0.1 * Math.sin(time * 0.7 + index));
    });
    corridorBalls.forEach((ball, index) => {
      ball.position.set(Math.sin(index * 1.8 + time * 0.8) * 2.3, 1 + hash(index + 10) * 2.7, 4 - index * 3.4 - flight * 6);
    });
  }

  function renderCube(time) {
    prepareFrame(false, false);
    glassCube.visible = true;
    const unfold = easeOut((time - 4.35) / 1.2);
    const closeup = smooth((time - 6.1) / 1.8);
    const cubeFrame = Math.round(time * 30 + 1e-6);
    background.style.background = cubeFrame < 132
      ? 'radial-gradient(ellipse at 53% 50%,#1421bd 0,#01020d 43%)'
      : cubeFrame < 181
        ? 'radial-gradient(ellipse at 15% 92%,#b2a0d0 0,transparent 60%),radial-gradient(ellipse at 85% 30%,#2222d9 0,transparent 65%),#0b0967'
        : 'radial-gradient(ellipse at 12% 90%,#e4c8e8 0,transparent 58%),radial-gradient(ellipse at 85% 35%,#2d24e5 0,transparent 65%),#0c0866';
    cubeBody.scale.setScalar(time < 4.35 ? 0.64 : mix(0.64, 1.12, unfold));
    cubeBody.rotation.set(mix(0, 0.42, unfold), mix(Math.PI / 2, 0.62, easeOut((time - 2.2) / 2.3)) + Math.max(0, time - 4.4) * 0.24, mix(Math.PI / 4, -0.28, unfold));
    cubeBody.position.set(mix(0.5, 1.2, closeup), 0, 0);
    cubeFaces.forEach((face, index) => {
      const [position, rotation] = facePoses[index];
      face.position.set(...position);
      face.rotation.set(...rotation);
      face.visible = time > 4.4 || index === 0;
      if (index > 1) {
        const opening = Math.sin(clamp((time - 5.2) / 3.6) * Math.PI) * 0.22;
        face.rotation.z += opening * (index % 2 ? 1 : -1);
        face.position.multiplyScalar(1 + opening * 0.35);
      }
    });
    innerSphere.visible = time > 2.5;
    innerSphere.position.set(-0.1, 0, mix(-0.8, 0.15, unfold));
    traveler.position.set(mix(-4.6, -2.8, easeOut(time / 3.6)), -0.05 + Math.sin(time * 0.8) * 0.12, 0.1);
    cubeAnnotations.visible = time > 6.05;
    cubeAnnotations.rotation.copy(cubeBody.rotation);
    cubeAnnotations.position.set(-1.1, -0.3, 1.1);
    const pullback = easeOut((time - 8.5) / 0.8);
    poseCamera([mix(0, -0.7, closeup), 0.3, mix(14.5, 10.8, closeup) + pullback * 10], [0, 0, 0], 38);
  }

  function renderRibbons(time) {
    prepareFrame(true, false);
    ribbons.visible = true;
    const bend = smooth((time - 5.75) / 1.2);
    const push = smooth((time - 6.4) / 3.5);
    const approach = smooth(time / 5.75);
    ribbonPages.forEach(({ page, layer, angle, radius }, index) => {
      page.morphTargetInfluences[0] = bend;
      const orbitAngle = angle + (time - 5.3333333333) * 0.42 + layer * 0.09;
      page.position.set(
        mix(((index % 4) - 1.5) * 1.2, Math.cos(orbitAngle) * radius, bend),
        mix(((index % 4) - 1.5) * 0.35, Math.sin(orbitAngle) * radius, bend),
        mix(2 - layer * 3.4, -layer * 3.4, bend),
      );
      page.rotation.set(0, (1 - bend) * -0.08, bend * (orbitAngle - Math.PI / 2));
      page.scale.setScalar(mix(2.6 - (index % 4) * 0.45, 1, bend) * (1 + Math.sin(time + index) * 0.015));
    });
    ribbonHero.position.set(Math.sin(time * 1.4) * 1.8, Math.cos(time * 1.1) * 1.3, mix(4.5, -12, push));
    ribbons.rotation.set(mix(0.1, 0, bend), mix(0.3, 0, bend), 0);
    poseCamera([mix(8, 0, approach), mix(5, 0, approach), mix(mix(18, 11, approach), 5.2, push)], [0, 0, -12], 46);
  }

  const story = window.WebflowStoryScenes({ THREE, materials, createGroup, prepareFrame, poseCamera, easeOut, smooth, mix, hash, background, floorMaterial, grid });

  function renderAt(time) {
    const frame = Math.round(time * 30 + 1e-6);
    if (frame < 60) renderFloor(time);
    else if (frame < 133) renderOpeningStack(time - 2);
    else if (frame < 315) renderCorridor(time - 133 / 30);
    else if (frame >= 600 && frame < 885) renderCube(time - 20);
    else if (frame >= 2690) renderRibbons(time - 2690 / 30);
    else story.renderAt(time);
    renderer.render(scene, camera);
    output.clearRect(0, 0, 1280, 720);
    output.drawImage(surface, 0, 0);
  }

  renderAt(0);
  const clock = { time: 0 };
  const timeline = gsap.timeline({ paused: true });
  timeline.to(clock, { time: 2998 / 30, duration: 2998 / 30, ease: 'none', onUpdate: () => renderAt(clock.time) });
  window.__timelines = window.__timelines || {};
  window.__timelines['webflow-world'] = timeline;
  window.WebflowWorld = { renderAt, scene, groups, camera, renderer };
};
