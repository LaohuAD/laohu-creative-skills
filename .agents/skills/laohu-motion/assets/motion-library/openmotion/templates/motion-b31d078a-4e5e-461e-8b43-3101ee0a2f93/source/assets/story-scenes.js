/* Shared interface objects carry their states through assembly, layouts and connections. */
window.WebflowStoryScenes = function (context) {
  const { THREE, materials, createGroup, prepareFrame, poseCamera, easeOut, smooth, mix, hash, background, floorMaterial, grid } = context;
  const clamp = value => Math.max(0, Math.min(1, value));

  const lenses = createGroup('sphere-and-glass-lenses');
  const lensSpheres = [];
  const lensPlates = [];
  for (let index = 0; index < 9; index += 1) {
    const ball = materials.sphere(0.96, `lens-sphere-${index}`);
    lenses.add(ball);
    lensSpheres.push(ball);
    const plate = materials.panel('wire', 4, 3.4, 3.4, true);
    lenses.add(plate);
    lensPlates.push(plate);
  }

  const floorTiles = createGroup('floor-interface-layouts');
  const tilePanels = [];
  const tileSpheres = [];
  for (let index = 0; index < 20; index += 1) {
    const panel = materials.panel(index % 4 === 0 ? 'form' : 'browser', index, 5.6, 3.8, index % 5 === 0);
    panel.rotation.x = -Math.PI / 2;
    floorTiles.add(panel);
    tilePanels.push(panel);
    const ball = materials.sphere(0.32, `tile-sphere-${index}`);
    floorTiles.add(ball);
    tileSpheres.push(ball);
    const contact = materials.shadow(0.33);
    floorTiles.add(contact);
    panel.userData.contact = contact;
  }

  const cloud = createGroup('interface-cloud-and-workflows');
  const cloudPanels = [];
  const cloudBases = [];
  const cloudVolumes = [];
  const workflowVolumeMaterial = new THREE.MeshStandardMaterial({ color: 0xc6caff, roughness: 0.18, metalness: 0.45 });
  const cloudSpheres = [];
  for (let index = 0; index < 18; index += 1) {
    const width = index === 0 ? 8.4 : 1.6 + hash(index + 12) * 2.8;
    const height = index === 0 ? 5.6 : width * (0.6 + hash(index + 5) * 0.2);
    const kind = index % 5 === 0 ? 'product' : index % 4 === 0 ? 'login' : index % 3 === 0 ? 'form' : 'browser';
    const panel = materials.panel(kind, index % 6, width, height, index % 7 === 0 && index !== 0);
    cloud.add(panel);
    const volume = new THREE.Mesh(new THREE.BoxGeometry(width, height, 1.25), workflowVolumeMaterial);
    volume.name = `workflow-volume-${index}`;
    cloud.add(volume);
    cloudVolumes.push(volume);
    cloudPanels.push(panel);
    cloudBases.push(new THREE.Vector3((hash(index + 20) - 0.5) * 24, (hash(index + 80) - 0.5) * 14, -hash(index + 110) * 12));
  }
  for (let index = 0; index < 8; index += 1) {
    const ball = materials.sphere(index === 0 ? 0.65 : 0.18 + hash(index) * 0.35, `cloud-sphere-${index}`);
    cloud.add(ball);
    cloudSpheres.push(ball);
  }
  const workflowWires = new THREE.Group();
  workflowWires.name = 'workflow-connections';
  const workflowDots = [];
  for (let index = 0; index < 6; index += 1) {
    const start = [-4.6 + (index % 3) * 3, -2.8 + Math.floor(index / 3) * 5, 1.4];
    const end = [1.7 + index * 0.35, 1.1 - index * 0.34, 1.4];
    const wire = materials.curve([start, [start[0] + 1.2, start[1] + 0.5, 2.6], [end[0] - 1, end[1] + 0.3, 2], end]);
    workflowWires.add(wire);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    workflowWires.add(dot);
    workflowDots.push({ dot, path: wire.userData.path });
  }
  const checkMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
  const checkPoints = [[-0.22, 0, 0], [-0.04, -0.17, 0], [0.28, 0.2, 0]].map(point => new THREE.Vector3(...point));
  const checkmark = new THREE.Line(new THREE.BufferGeometry().setFromPoints(checkPoints), checkMaterial);
  checkmark.position.set(2.1, 0.2, 2);
  workflowWires.add(checkmark);
  cloud.add(workflowWires);

  const assembly = createGroup('page-orbit-and-assembly');
  const assemblyPages = [];
  for (let index = 0; index < 9; index += 1) {
    const page = materials.panel(index === 0 ? 'browser' : index % 3 === 0 ? 'wire' : 'form', index, index === 0 ? 8.4 : 5.4, index === 0 ? 5.6 : 3.6, index === 4);
    assembly.add(page);
    assemblyPages.push(page);
  }
  const assemblyBall = materials.sphere(0.52, 'assembly-traveler');
  assembly.add(assemblyBall);
  const assemblyMenu = materials.panel('form', 3, 1.7, 1.8, false);
  assemblyMenu.name = 'assembled-page-menu';
  assembly.add(assemblyMenu);
  const assemblyDialog = materials.panel('wire', 4, 2.8, 2.1, true);
  assemblyDialog.name = 'assembled-page-dialog';
  assembly.add(assemblyDialog);

  const macroForm = createGroup('macro-form');
  const macroFormPanel = materials.panel('login', 0, 8.2, 5.5, false);
  macroForm.add(macroFormPanel);
  const whiteInputMaterial = new THREE.MeshBasicMaterial({ color: 0xf5f5f6 });
  const inputFields = [];
  for (let index = 0; index < 2; index += 1) {
    const input = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.65, 0.025), whiteInputMaterial);
    input.position.set(0, 0.15 - index * 1.04, 0.08);
    macroForm.add(input);
    inputFields.push(input);
    for (let block = 0; block < 5; block += 1) {
      const mark = new THREE.Mesh(new THREE.PlaneGeometry(index === 0 ? 0.5 : 0.075, index === 0 ? 0.2 : 0.075), new THREE.MeshBasicMaterial({ color: 0xccccd2 }));
      mark.position.set(-1.9 + block * 0.6, input.position.y, 0.11);
      macroForm.add(mark);
      mark.userData.revealIndex = block;
      mark.userData.inputIndex = index;
    }
  }
  const formCursor = new THREE.Mesh(new THREE.PlaneGeometry(0.017, 0.33), new THREE.MeshBasicMaterial({ color: 0x3030b5 }));
  formCursor.position.z = 0.12;
  macroForm.add(formCursor);
  const formBall = materials.sphere(0.45, 'form-traveler');
  macroForm.add(formBall);

  const store = createGroup('storefront-and-product');
  const storePanel = materials.panel('product', 0, 8.4, 5.6, false);
  store.add(storePanel);
  const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.25, 8, 20), new THREE.MeshStandardMaterial({ color: 0xffe483, roughness: 0.27, metalness: 0.08 }));
  capsule.name = 'editable-product-capsule';
  capsule.rotation.z = -0.65;
  store.add(capsule);
  const storeBall = materials.sphere(0.54, 'storefront-traveler');
  store.add(storeBall);

  const exploded = createGroup('exploded-interface-stack');
  const explodedLayers = [];
  const explodedOrbits = [];
  for (let index = 0; index < 6; index += 1) {
    const panel = materials.panel(index % 2 === 0 ? 'wire' : 'browser', index, 6.4, 4.4, index % 3 === 0);
    panel.rotation.x = -Math.PI / 2;
    exploded.add(panel);
    explodedLayers.push(panel);
    const points = Array.from({ length: 9 }, (_, vertex) => {
      const angle = vertex / 8 * Math.PI * 2 + index * 0.7;
      return [Math.cos(angle) * 3.8, -1.8 + vertex / 8 * 3.6, Math.sin(angle) * 2.8];
    });
    const wire = materials.curve(points, 0xffffff, 0.5);
    exploded.add(wire);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    exploded.add(bead);
    explodedOrbits.push({ bead, path: wire.userData.path });
  }

  const streakTunnel = createGroup('colored-strip-tunnel');
  const streaks = [];
  for (let index = 0; index < 88; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const material = new THREE.MeshBasicMaterial({ color: [0xf6efff, 0x354bff, 0x4fd9ed, 0xf7a9d0, 0x1a1073][index % 5] });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.17 + hash(index) * 0.42, 5 + hash(index + 40) * 14), material);
    streakTunnel.add(strip);
    streaks.push({ strip, side, row: Math.floor(index / 2) });
  }
  const streakBalls = [materials.sphere(0.55, 'streak-sphere-near'), materials.sphere(0.2, 'streak-sphere-far')];
  streakBalls.forEach(ball => streakTunnel.add(ball));

  const mirrorRoom = createGroup('reflective-platforms');
  const mirrorMaterial = new THREE.MeshStandardMaterial({ color: 0x3942df, metalness: 0.7, roughness: 0.2, envMapIntensity: 1.7 });
  const mirrorBlocks = [];
  for (let index = 0; index < 7; index += 1) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(index === 0 ? 6.6 : 3.2, 1.5, 1.9), mirrorMaterial);
    mirrorRoom.add(block);
    mirrorBlocks.push(block);
  }
  const mirrorBall = materials.sphere(0.62, 'mirror-traveler');
  mirrorRoom.add(mirrorBall);

  const responsive = createGroup('responsive-interface-queue');
  const responsivePanels = [];
  const responsiveWidths = [8.4, 6.4, 5.2, 3.8, 2.8, 1.9, 1.15];
  responsiveWidths.forEach((width, index) => {
    const panel = materials.panel(index > 3 ? 'login' : 'product', index % 4, width, index > 3 ? width * 1.3 : width * 0.65, index === 4);
    responsive.add(panel);
    responsivePanels.push(panel);
  });
  const responsiveBall = materials.sphere(0.35, 'responsive-traveler');
  responsive.add(responsiveBall);
  const responsiveShadow = materials.shadow(0.37);
  responsive.add(responsiveShadow);

  const portalTunnel = createGroup('blue-security-tunnel');
  const insideRoom = new THREE.Mesh(new THREE.BoxGeometry(12, 9, 58), new THREE.MeshBasicMaterial({ color: 0x0c0999, side: THREE.BackSide }));
  insideRoom.position.z = -18;
  portalTunnel.add(insideRoom);
  for (let index = 0; index < 15; index += 1) {
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(11.6, 8.7, 0.08)), new THREE.LineBasicMaterial({ color: index % 2 ? 0x6f66ff : 0x2820d9, transparent: true, opacity: 0.7 }));
    frame.position.z = 7 - index * 3.7;
    portalTunnel.add(frame);
  }
  const portal = materials.panel('security', 0, 8.5, 5.7, false);
  portal.position.z = -45;
  portalTunnel.add(portal);
  const portalBall = materials.sphere(0.7, 'security-traveler');
  portalTunnel.add(portalBall);

  const network = createGroup('connected-platform-network');
  const networkNodes = [];
  const networkFlights = [];
  for (let index = 0; index < 15; index += 1) {
    const column = index % 5;
    const row = Math.floor(index / 5);
    const node = materials.panel('mail', index % 5, index === 7 ? 4.8 : 3.2, index === 7 ? 2.6 : 1.8, index % 2 === 0, 0.65);
    node.position.set((column - 2) * 5.4, 0.5 + hash(index) * 0.5, (row - 1) * 6);
    node.rotation.x = -Math.PI / 2;
    network.add(node);
    networkNodes.push(node);
    const envelope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      [-0.5, 0, -0.27], [0.5, 0, -0.27], [0.5, 0, 0.27], [-0.5, 0, 0.27], [-0.5, 0, -0.27], [0, 0, 0.08], [0.5, 0, -0.27],
    ].map(point => new THREE.Vector3(...point))), new THREE.LineBasicMaterial({ color: 0xffffff }));
    envelope.position.copy(node.position);
    envelope.position.y += 0.035;
    network.add(envelope);
  }
  for (let index = 0; index < 14; index += 1) {
    const start = networkNodes[index].position;
    const end = networkNodes[(index + 6) % 15].position;
    const path = materials.curve([
      [start.x, start.y + 0.1, start.z],
      [start.x + 1, 1.5 + (index % 3) * 0.3, start.z + 1.4],
      [end.x - 0.6, 1.1, end.z - 1],
      [end.x, end.y + 0.1, end.z],
    ], 0xffffff, 0.65);
    network.add(path);
    const bead = materials.sphere(0.09, `network-bead-${index}`);
    network.add(bead);
    networkFlights.push({ bead, path: path.userData.path });
  }

  function renderLenses(time) {
    prepareFrame(true, true);
    lenses.visible = true;
    const row = smooth((time - 1.75) / 0.55);
    lensSpheres.forEach((ball, index) => {
      ball.visible = time < 1 ? index === 0 : index < 2 || row > 0;
      const pairedX = index === 0 ? -1.75 : 1.75;
      ball.position.set(mix(pairedX, index * 3.7, row), time < 1 ? 3.1 : 2, 0);
      lensPlates[index].visible = time < 1 ? index === 0 : index === 0 || row > 0;
      lensPlates[index].position.set(time < 1 ? -1.75 : mix(0, index * 3.7, row), time < 1 ? 0.3 : 2, -0.1);
      lensPlates[index].rotation.y = mix(0, Math.PI / 2, row);
      lensPlates[index].scale.setScalar(time < 1 ? 1.5 : mix(0.8, 1, row));
    });
    if (time < 1) {
      lensSpheres[0].position.y += smooth(time) * 1.3;
      poseCamera([-1.75, 2.4, 6.7], [-1.75, 2.4, 0], 39);
    } else if (time < 1.75) {
      poseCamera([0, 2.1, 10.5], [0, 2, 0], 39);
    } else {
      const travel = smooth((time - 1.75) / 2.75);
      const cameraX = mix(-2.2, 10.5, travel);
      poseCamera([cameraX, 2.1, mix(6.3, 3.1, row)], [cameraX + 11, 2, 0], 39);
    }
  }

  function renderFloorTiles(time, traveling = false) {
    prepareFrame(true, true);
    floorTiles.visible = true;
    tilePanels.forEach((panel, index) => {
      const column = index % 4;
      const row = Math.floor(index / 4);
      panel.position.set((column - 1.5) * 6.4, 0.14 + (index % 3 === 0 ? 0.7 : 0), -row * 4.8);
      panel.rotation.set(-Math.PI / 2, 0, 0);
      tileSpheres[index].position.set(panel.position.x + 0.6 * Math.sin(time * 0.8 + index), panel.position.y + 0.4, panel.position.z);
      tileSpheres[index].visible = index % 3 === 0;
      panel.userData.contact.position.set(tileSpheres[index].position.x + 0.12, 0.007, tileSpheres[index].position.z);
    });
    if (traveling) {
      const rush = smooth(time / 2);
      poseCamera([0.2, 7, mix(7, -16, rush)], [0.2, 0, mix(-3, -23, rush)], 49);
    } else {
      const reveal = easeOut(time / 5);
      poseCamera([mix(6, 13, reveal), mix(9, 15, reveal), mix(10, 14, reveal)], [0, 0, -6 - reveal * 2], 43);
    }
  }

  function poseCloud(time, mode) {
    prepareFrame(true, false);
    cloud.visible = true;
    const focus = mode === 'opening' ? smooth((time - 1.6) / 1.8) : mode === 'workflow' ? easeOut(time / 3) : 0.35;
    cloudPanels.forEach((panel, index) => {
      const base = cloudBases[index];
      panel.scale.setScalar(1);
      const target = index === 0 ? [0, 0, 0] : [((index % 5) - 2) * 3.6, (Math.floor(index / 5) - 1) * 2.8, -3.8 + (index % 3) * 0.5];
      panel.position.set(mix(base.x, target[0], focus), mix(base.y, target[1], focus), mix(base.z, target[2], focus));
      panel.rotation.set(0.015 * Math.sin(time * 0.4 + index), mode === 'workflow' ? Math.sin(time * 0.2) * 0.1 : 0, 0);
      panel.visible = index === 0 || index > 2 || focus < 0.9;
      cloudVolumes[index].visible = mode === 'workflow';
      if (mode === 'workflow') {
        panel.position.set(index === 0 ? 1.8 : ((index % 5) - 2) * 4.1, index === 0 ? 0 : (Math.floor(index / 5) - 1) * 3.2, -2 + (index % 3) * 1.7);
        if (index === 4) panel.position.set(-4, 1, 2.3);
        panel.rotation.y = -0.16;
        panel.scale.setScalar(index === 0 ? 0.6 : 1);
        cloudVolumes[index].position.copy(panel.position);
        cloudVolumes[index].position.z -= 0.64;
        cloudVolumes[index].rotation.copy(panel.rotation);
        cloudVolumes[index].scale.copy(panel.scale);
      }
    });
    if (mode !== 'workflow') {
      cloudPanels[0].position.set(0, 0, 0);
      cloudPanels[0].scale.setScalar(mode === 'opening' ? mix(0.45, 1, focus) : 1);
    }
    cloudSpheres.forEach((ball, index) => {
      ball.position.set(Math.sin(time * 0.6 + index * 2.1) * (index === 0 ? 3.6 : 8), Math.cos(time * 0.5 + index) * 2.5, 2 + Math.sin(index) * 2.5);
    });
    workflowWires.visible = mode === 'workflow';
    workflowDots.forEach(({ dot, path }, index) => dot.position.copy(path.getPoint((time * (0.2 + index * 0.016) + index * 0.13) % 1)));
    checkmark.scale.setScalar(0.8 + easeOut((time - 1) / 1.3) * 0.6);
    if (mode === 'workflow') {
      const settle = easeOut(time / 4.5);
      poseCamera([mix(-3.6, 4.8, settle), mix(0.5, 3.6, settle), mix(8.2, 18.5, settle)], [0, 0, -1], 43);
    } else if (mode === 'login') {
      cloudPanels[4].position.set(0, 0, 3.5);
      cloudPanels[4].scale.setScalar(1.7);
      poseCamera([0.5, 0.3, mix(10, 15, easeOut(time / 2))], [0, 0, 0], 42);
    } else {
      poseCamera([0.35 * Math.sin(time * 0.5), 0.2, mix(19, 12.8, focus)], [0, 0, -1], 43);
    }
  }

  function renderAssembly(time) {
    prepareFrame(true, false);
    assembly.visible = true;
    const fan = easeOut(time / 1.5);
    const stack = smooth((time - 1.7) / 1.6);
    const flatten = smooth((time - 3.65) / 1.3);
    const pullback = smooth((time - 9.2) / 2.8);
    assemblyPages.forEach((page, index) => {
      const angle = index / 8 * Math.PI * 1.75 - time * 1.8;
      const orbitPosition = new THREE.Vector3(Math.cos(angle) * 3.7 * fan, Math.sin(angle) * 3.7 * fan, -index * 0.15);
      const stackPosition = new THREE.Vector3(0, (index - 4) * 0.52, -index * 0.08);
      const position = orbitPosition.lerp(stackPosition, stack);
      page.position.set(position.x * (1 - flatten), mix(position.y, 0, flatten), mix(position.z, -index * 0.07, flatten));
      page.rotation.set(mix(0.2, -Math.PI / 2, stack) * (1 - flatten), 0, angle * (1 - stack));
      page.scale.setScalar(index === 0 ? mix(0.33, 1, stack) : mix(0.42, 1, stack));
      page.visible = index === 0 || flatten < 0.98;
    });
    assembly.scale.setScalar(mix(1.25, 1.3, flatten) * mix(1, 0.36, pullback));
    assembly.rotation.set(0, 0.02 * Math.sin(time), 0);
    assemblyBall.position.set(Math.sin(time * 1.3) * mix(3.4, 5.2, pullback), Math.cos(time * 0.95) * 2.6, 1.3);
    assemblyMenu.visible = flatten > 0.75;
    assemblyMenu.position.set(3.25, 2.3, 0.35);
    assemblyDialog.visible = flatten > 0.65;
    assemblyDialog.position.set(-3.3, 0.6, 0.6);
    assemblyDialog.rotation.y = Math.sin(time * 0.7) * 0.08;
    poseCamera([0, 0.1, mix(15.2, 11.6, flatten)], [0, 0, 0], 42);
    if (pullback > 0) {
      background.style.background = 'radial-gradient(ellipse at 54% 35%,#fff 0,#eee7ef 42%,#8482fb 90%)';
    }
  }

  function renderMacroForm(time) {
    prepareFrame(true, false);
    macroForm.visible = true;
    macroForm.rotation.set(0, -0.06 + time * 0.04, -0.015);
    macroForm.children.forEach(child => {
      if (child.userData.revealIndex !== undefined) child.visible = time > child.userData.revealIndex * 0.13 + child.userData.inputIndex * 0.3;
    });
    formCursor.position.set(mix(-1.8, 1.55, easeOut(time / 1.6)), -0.89, 0.12);
    formBall.position.set(0.4, mix(-1.8, 1.8, smooth(time / 2)), 0.8);
    poseCamera([0, mix(0.5, -0.15, easeOut(time / 2)), 6.2], [0, -0.1, 0], 39);
  }

  function renderStore(time) {
    prepareFrame(true, false);
    store.visible = true;
    const focus = easeOut(time / 1.2);
    store.rotation.set(0.05, mix(-0.1, 0.1, focus), mix(0.02, -0.04, focus));
    capsule.position.set(2.1, 1.05, 0.28);
    capsule.rotation.z = -0.7 + Math.sin(time * 1.3) * 0.12;
    storeBall.position.set(-1.4 + Math.sin(time) * 0.3, 1, 0.22);
    poseCamera([mix(0, 1.3, focus), 0.2, mix(13.2, 8.5, focus)], [mix(0, 1.3, focus), 0, 0], 42);
  }

  function renderExploded(time) {
    prepareFrame(true, true);
    exploded.visible = true;
    exploded.scale.setScalar(1.35);
    background.style.background = 'radial-gradient(ellipse at 10% 0%,#fff0b5 0,transparent 45%),radial-gradient(ellipse at 90% 90%,#1417ed 0,transparent 65%),#ae8ac7';
    materials.sphereMaterial.uniforms.pinkAmount.value = 0.5;
    floorMaterial.color.set(0x4d4ad5);
    grid.material.opacity = 0.18;
    exploded.position.y = 3.5;
    exploded.rotation.y = 0.1 + time * 0.14;
    const open = easeOut(time / 0.8);
    explodedLayers.forEach((panel, index) => {
      panel.position.set(0, (index - 2.5) * mix(0.06, 0.72, open), 0);
    });
    explodedOrbits.forEach(({ bead, path }, index) => bead.position.copy(path.getPoint((time * 0.27 + index * 0.12) % 1)));
    poseCamera([mix(8.5, 6, easeOut(time / 2.7)), 8.5, 12], [0, 3.5, 0], 44);
  }

  function renderStreaks(time) {
    prepareFrame(false, false);
    streakTunnel.visible = true;
    const turn = smooth(time / 1.7);
    const run = smooth((time - 1.25) / 3.05);
    streaks.forEach(({ strip, side, row }, index) => {
      strip.position.set(side * (4.5 + hash(index + 5) * 2.3), (hash(index + 70) - 0.5) * 7.2, -row * 1.45);
      strip.rotation.y = side * 0.11;
    });
    streakBalls.forEach((ball, index) => ball.position.set(index === 0 ? Math.sin(time) * 2.4 : -1.5, index === 0 ? -1.5 + Math.cos(time * 0.7) : 1.2, 3 - run * 28 - index * 12));
    poseCamera([mix(-3.6, 0, turn) + 0.1 * Math.sin(time * 2), 0, mix(10, -26, run)], [mix(-4.5, 0, turn), 0, mix(-8, -64, turn)], 59);
    background.style.background = `radial-gradient(ellipse at 50% 50%,#fff ${mix(0, 10, smooth((time - 3.7) / 0.6))}%,#d5c8ed 15%,#3428a0 38%,#030425 78%)`;
  }

  function renderMirror(time) {
    prepareFrame(true, true);
    mirrorRoom.visible = true;
    mirrorBlocks.forEach((block, index) => {
      block.position.set(index === 0 ? 0 : (index % 2 ? -1 : 1) * (6 + index * 0.7), 1.65, index === 0 ? 0 : -index * 1.5);
    });
    mirrorBall.position.set(0.7 + Math.sin(time * 1.6) * 1.4, 2.9, mix(2.2, -0.8, smooth(time / 2)));
    poseCamera([0, mix(4.1, 2.9, easeOut(time / 2)), mix(13.5, 9.7, easeOut(time / 2))], [0, 1.8, 0], 42);
  }

  function renderResponsive(time, flyThrough = false) {
    prepareFrame(true, true);
    responsive.visible = true;
    responsivePanels.forEach((panel, index) => {
      panel.position.set((index - 3) * 0.78, 3 - index * 0.27, index * 2.25 - 9);
      panel.rotation.set(0, -0.08, 0);
    });
    const travel = easeOut(time / 4);
    responsiveBall.position.set(3.8, 0.4, 5.1 - travel * 0.8);
    responsiveShadow.position.set(4.05, 0.006, responsiveBall.position.z - 0.2);
    if (flyThrough) {
      const rush = smooth(time / (160 / 30));
      poseCamera([mix(4.5, 2.4, rush), 3.5, mix(19, -10, rush)], [0, 2.6, mix(-4, -18, rush)], 46);
    } else {
      poseCamera([mix(12, 9.3, travel), mix(7.5, 6, travel), mix(17, 14, travel)], [0, 2.3, -3], 42);
    }
  }

  function renderPortal(time) {
    prepareFrame(false, false);
    portalTunnel.visible = true;
    const dive = smooth(time / 4.2);
    const z = mix(12, -38, dive);
    background.style.background = '#030420';
    portalBall.position.set(Math.sin(time * 1.25) * 1.7, Math.cos(time * 0.8) * 0.7, z - 4.8);
    poseCamera([0.3 * Math.sin(time * 0.8), 0.1, z], [0, 0, z - 15], 49);
  }

  function renderNetwork(time) {
    prepareFrame(true, true);
    network.visible = true;
    networkFlights.forEach(({ bead, path }, index) => {
      const phase = (time * 0.18 + index * 0.07) % 1;
      bead.position.copy(path.getPoint(easeOut(phase)));
    });
    const spread = easeOut(time / 3.67);
    poseCamera([mix(0, 14, spread), mix(4.5, 15, spread), mix(7.5, 19, spread)], [0, 0.8, -1], 45);
  }

  function renderAt(time) {
    const frame = Math.round(time * 30 + 1e-6);
    if (frame < 450) renderLenses(time - 10.5);
    else if (frame < 600) renderFloorTiles(time - 15);
    else if (frame < 1080) poseCloud(time - 29.5, 'opening');
    else if (frame < 1442) renderAssembly(time - 36);
    else if (frame < 1502) renderMacroForm(time - 1442 / 30);
    else if (frame < 1562) renderFloorTiles(time - 1502 / 30, true);
    else if (frame < 1650) renderStore(time - 1562 / 30);
    else if (frame < 1731) renderExploded(time - 55);
    else if (frame < 1860) renderStreaks(time - 57.7);
    else if (frame < 1920) renderMirror(time - 62);
    else if (frame < 1980) poseCloud(time - 64, 'login');
    else if (frame < 2101) renderResponsive(time - 66);
    else if (frame < 2227) renderPortal(time - 2101 / 30);
    else if (frame < 2281) poseCloud(time - 2227 / 30, 'login');
    else if (frame < 2391) renderNetwork(time - 2281 / 30);
    else if (frame < 2690) poseCloud(time - 2391 / 30, 'workflow');
    else renderResponsive(time - 2690 / 30, true);
  }

  return { renderAt };
};
