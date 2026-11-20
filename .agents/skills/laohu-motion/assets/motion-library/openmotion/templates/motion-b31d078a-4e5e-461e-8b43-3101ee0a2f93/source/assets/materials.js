/* Editable materials and schematic interface artwork for 219_Webflow. */
window.WebflowMaterials = function (THREE, renderer, palette) {
  const textures = new Map();
  const outline = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42 });
  const edgeMaterial = new THREE.MeshStandardMaterial({ color: 0x7778ff, metalness: 0.32, roughness: 0.28 });

  function interfaceTexture(kind = 'browser', index = 0) {
    const key = `${kind}-${index % 6}`;
    if (textures.has(key)) return textures.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 690, 500);
    const schemes = [
      [palette.blue, '#150c8b', '#512dfb'],
      ['#313dff', '#2525dd', palette.pink],
      ['#1022b5', '#2952ff', '#56d6ea'],
      ['#fe84ac', '#7038e8', '#172bd1'],
      ['#d8e1ff', '#8588ec', '#fff6f8'],
      ['#132058', '#0b1036', '#0d0c20'],
    ];
    const colors = schemes[index % schemes.length];
    colors.forEach((color, position) => gradient.addColorStop(position / 2, color));
    context.fillStyle = gradient;
    context.fillRect(0, 0, 768, 512);
    const highlight = context.createRadialGradient(110, 10, 5, 190, 70, 490);
    highlight.addColorStop(0, '#f8d9ff88');
    highlight.addColorStop(1, '#ffffff00');
    context.fillStyle = highlight;
    context.fillRect(0, 0, 768, 512);

    function line(x, y, width, height = 1, alpha = 0.36) {
      context.fillStyle = `rgba(241,244,255,${alpha})`;
      context.fillRect(x, y, width, height);
    }
    function box(x, y, width, height, alpha = 0.35) {
      context.strokeStyle = `rgba(245,247,255,${alpha})`;
      context.lineWidth = 1.3;
      context.strokeRect(x, y, width, height);
    }
    function button(x, y, width = 120) {
      const fill = context.createLinearGradient(x, y, x + width, y);
      fill.addColorStop(0, '#ff779e');
      fill.addColorStop(1, '#ffdf76');
      context.fillStyle = fill;
      context.beginPath();
      context.roundRect(x, y, width, 26, 13);
      context.fill();
    }

    context.fillStyle = '#070c30cc';
    context.fillRect(0, 0, 768, 28);
    for (let dot = 0; dot < 3; dot += 1) {
      context.fillStyle = ['#74ffed', '#8cffb9', '#70f8c9'][dot];
      context.beginPath();
      context.arc(18 + dot * 18, 14, 4, 0, Math.PI * 2);
      context.fill();
    }

    if (kind === 'abstract') {
      context.fillStyle = gradient;
      context.fillRect(0, 0, 768, 512);
      const blockColors = ['#070c55', '#1711a6', '#2927d6', '#6461ee', '#b4bbf8', '#e3daf8'];
      for (let row = 0; row < 5; row += 1) {
        for (let column = 0; column < 4; column += 1) {
          const position = row * 4 + column + index;
          context.fillStyle = blockColors[position % blockColors.length];
          context.fillRect(column * 192 + (row % 2) * 24, row * 102, 110 + position % 3 * 37, 45 + position % 2 * 28);
        }
      }
    } else if (kind === 'wire') {
      for (let row = 0; row < 6; row += 1) box(34, 60 + row * 68, 700, 44, 0.22);
    } else if (kind === 'mail') {
      context.strokeStyle = '#f7f8ffdd';
      context.lineWidth = 3;
      context.strokeRect(299, 192, 170, 110);
      context.beginPath();
      context.moveTo(299, 192);
      context.lineTo(384, 250);
      context.lineTo(469, 192);
      context.stroke();
    } else if (kind === 'security') {
      context.strokeStyle = '#e7fff9';
      context.lineWidth = 16;
      context.beginPath();
      context.arc(384, 220, 42, Math.PI, 0);
      context.stroke();
      context.fillStyle = '#b9fff0';
      context.fillRect(325, 218, 118, 102);
      context.fillStyle = '#2b38ca';
      context.fillRect(379, 256, 10, 28);
    } else if (kind === 'login') {
      context.fillStyle = '#d3f1ff99';
      context.fillRect(315, 68, 138, 122);
      context.fillStyle = '#153ee2';
      context.beginPath();
      context.arc(384, 108, 26, 0, Math.PI * 2);
      context.fill();
      context.beginPath();
      context.ellipse(384, 180, 49, 38, 0, Math.PI, Math.PI * 2);
      context.fill();
      box(210, 245, 350, 43, 0.6);
      box(210, 313, 350, 43, 0.6);
      for (let dot = 0; dot < 7; dot += 1) {
        context.fillStyle = '#ffffffaa';
        context.beginPath();
        context.arc(238 + dot * 25, 336, 3.2, 0, Math.PI * 2);
        context.fill();
      }
      button(285, 393, 200);
    } else if (kind === 'form') {
      line(66, 74, 310, 32, 0.25);
      for (let row = 0; row < 5; row += 1) {
        context.strokeStyle = '#f5faff99';
        context.beginPath();
        context.arc(72, 165 + row * 52, 6, 0, Math.PI * 2);
        context.stroke();
        line(100, 163 + row * 52, 240 + row * 20, 2);
      }
      box(460, 140, 244, 213);
      button(520, 390);
    } else if (kind === 'product') {
      line(42, 75, 220, 20, 0.2);
      for (let row = 0; row < 5; row += 1) {
        box(42, 130 + row * 48, 20, 20, 0.48);
        line(81, 140 + row * 48, 150, 2, 0.35);
      }
      for (let row = 0; row < 2; row += 1) {
        for (let column = 0; column < 2; column += 1) {
          const x = 300 + column * 228;
          const y = 69 + row * 215;
          const tile = context.createLinearGradient(x, y, x + 175, y + 144);
          tile.addColorStop(0, ['#ff658e', '#fffbcf', '#40d4de', '#e43892'][row * 2 + column]);
          tile.addColorStop(1, '#4438d3');
          context.fillStyle = tile;
          context.fillRect(x, y, 180, 147);
          button(x + 105, y + 164, 65);
        }
      }
    } else {
      line(56, 70, 315, 20, 0.28);
      line(56, 108, 195, 11, 0.2);
      box(56, 166, 330, 217, 0.28);
      context.fillStyle = '#f47ca4bb';
      context.beginPath();
      context.arc(604, 270, 119, 0, Math.PI * 2);
      context.fill();
      for (let row = 0; row < 3; row += 1) {
        line(72, 425 + row * 23, 130 + (row % 2) * 68, 2, 0.36);
        box(290 + row * 134, 424, 110, 49, 0.23);
      }
      button(56, 348);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    textures.set(key, texture);
    return texture;
  }

  function panel(kind = 'browser', index = 0, width = 5, height = 3.4, glass = false, depth = 0.035) {
    const group = new THREE.Group();
    group.name = `${kind}-panel-${index}`;
    const surface = new THREE.MeshBasicMaterial({
      map: interfaceTexture(kind, index),
      toneMapped: false,
      color: glass ? 0xdde4ff : 0xffffff,
      transparent: glass,
      opacity: glass ? 0.3 : 1,
      depthWrite: !glass,
      side: THREE.DoubleSide,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), [edgeMaterial, edgeMaterial, edgeMaterial, edgeMaterial, surface, surface]);
    group.add(body);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), outline);
    group.add(edges);
    group.userData = { width, height, kind, index, surface };
    return group;
  }

  const sphereMaterial = new THREE.ShaderMaterial({
    uniforms: { pinkAmount: { value: 0.7 }, brightness: { value: 1 }, fogAmount: { value: 0 } },
    vertexShader: `
      varying vec3 surfaceNormal;
      varying vec3 viewPosition;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        surfaceNormal = normalize(normalMatrix * normal);
        viewPosition = view.xyz;
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: `
      uniform float pinkAmount;
      uniform float brightness;
      uniform float fogAmount;
      varying vec3 surfaceNormal;
      varying vec3 viewPosition;
      void main() {
        vec3 normal = normalize(surfaceNormal);
        vec3 view = normalize(-viewPosition);
        float light = dot(normal, normalize(vec3(-0.55, 0.7, 1.0)));
        float warm = smoothstep(-0.7, 0.9, normal.x * 0.6 + normal.y * 0.8) * pinkAmount;
        vec3 blue = vec3(0.005, 0.012, 0.55);
        vec3 pink = vec3(0.83, 0.08, 0.46);
        vec3 color = mix(blue, pink, warm);
        color *= 0.42 + 0.66 * max(light, 0.0);
        float highlight = pow(max(dot(reflect(-normalize(vec3(-0.6, 0.8, 1.0)), normal), view), 0.0), 18.0);
        color += vec3(0.73, 0.83, 1.0) * highlight * 0.5;
        float rim = pow(1.0 - clamp(dot(normal, view), 0.0, 1.0), 3.0);
        color += vec3(0.24, 0.24, 0.48) * rim * 0.42;
        color = pow(color * brightness, vec3(0.4545));
        color = mix(color, vec3(0.008, 0.009, 0.035), smoothstep(8.0, 25.0, -viewPosition.z) * fogAmount);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const sphereGeometry = new THREE.SphereGeometry(1, 48, 32);
  function sphere(radius = 0.6, name = 'sphere') {
    const mesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
    mesh.name = name;
    mesh.scale.setScalar(radius);
    return mesh;
  }

  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const shadowContext = shadowCanvas.getContext('2d');
  const shadowGradient = shadowContext.createRadialGradient(64, 64, 5, 64, 64, 63);
  shadowGradient.addColorStop(0, '#0a06346a');
  shadowGradient.addColorStop(0.42, '#17123b2c');
  shadowGradient.addColorStop(1, '#17123b00');
  shadowContext.fillStyle = shadowGradient;
  shadowContext.fillRect(0, 0, 128, 128);
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false });
  function shadow(radius = 1) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 4, radius * 4), shadowMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.006;
    return mesh;
  }

  function curve(points, color = 0xffffff, opacity = 0.65) {
    const path = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(path, 64, 0.012, 5, false), material);
    mesh.userData.path = path;
    return mesh;
  }

  return { panel, sphere, shadow, sphereMaterial, interfaceTexture, outline, curve };
};
