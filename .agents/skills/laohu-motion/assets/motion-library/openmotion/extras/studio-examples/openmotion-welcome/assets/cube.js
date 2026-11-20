/* A rounded, genuinely three-dimensional brand object. Its six textures reuse
 * the editable artwork functions above, including when the timeline is sought. */
window.WelcomeCube = function (canvas) {
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,preserveDrawingBuffer:true});
  renderer.setSize(1920,1080,false);renderer.setPixelRatio(1);renderer.outputEncoding=THREE.sRGBEncoding;
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,16/9,1,5000);camera.position.z=1400;
  scene.add(new THREE.AmbientLight(0xffffff,0.9));
  const key=new THREE.DirectionalLight(0xffffff,0.85);key.position.set(-3,6,8);scene.add(key);
  const rim=new THREE.DirectionalLight(0xb7d6e6,0.35);rim.position.set(4,-2,-4);scene.add(rim);
  const geometry=new THREE.BoxGeometry(2,2,2,16,16,16),positions=geometry.attributes.position;
  const point=new THREE.Vector3(),inner=new THREE.Vector3(),normal=new THREE.Vector3();
  for(let i=0;i<positions.count;i++){
    point.fromBufferAttribute(positions,i);inner.copy(point).clampScalar(-0.79,0.79);
    normal.subVectors(point,inner).normalize();point.copy(inner).addScaledVector(normal,0.21);
    positions.setXYZ(i,point.x,point.y,point.z);
  }
  geometry.computeVertexNormals();
  const canvases=Array.from({length:6},()=>Object.assign(document.createElement('canvas'),{width:512,height:512}));
  const textures=canvases.map(c=>{const texture=new THREE.CanvasTexture(c);texture.encoding=THREE.sRGBEncoding;texture.anisotropy=4;return texture;});
  // r147's standard shader requires derivatives. Keep its original lighting when
  // available, and use Lambert shading when preview contexts lack the extension.
  const hasDerivatives=renderer.capabilities.isWebGL2||renderer.extensions.has('OES_standard_derivatives');
  const materials=textures.map(map=>hasDerivatives
    ?new THREE.MeshStandardMaterial({map,roughness:0.45,metalness:0.04})
    :new THREE.MeshLambertMaterial({map}));
  const cube=new THREE.Mesh(geometry,materials);scene.add(cube);
  function draw(time){
    const E=WelcomeArt.ease,C=WelcomeArt.clamp;
    const spin=E((time-1.35)/3.15),settle=E((time-4.15)/.5);
    cube.rotation.set((-.2+Math.sin(time*1.8)*.22)*(1-settle),(-.1+spin*Math.PI*2)*(1-settle),(.06+Math.sin(time*2.1)*.05)*(1-settle));
    const scale=(time<.8?600-350*E(time/.8):250)-60*settle;
    cube.scale.set(scale,scale,scale*(.035+.965*E((time-1.45)/.3)));
    const styles=['comic','paper','eye','tunnel','future','prism'];
    canvases.forEach((c,i)=>{
      const ctx=c.getContext('2d'),tile=Math.floor(Math.max(0,time-1.4)*2.05);
      WelcomeArt.draw(ctx,styles[(i+tile)%styles.length],time,512,512);
      if(time>=4.1){ctx.fillStyle='#151715';ctx.fillRect(0,0,512,512);}
      WelcomeArt.symbol(ctx,256,256,338,'#fffdf2');textures[i].needsUpdate=true;
    });
    renderer.render(scene,camera);
  }
  draw(0);return {draw,dispose(){geometry.dispose();textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());renderer.dispose();}};
};
