/* Source-timed HyperOS sequence. The same phone and UI systems persist through camera moves. */
window.mountHyperWorld = function () {
  const variables = window.__hyperframes?.getVariables?.() || {};
  const content = {
    manufacturer: variables.manufacturer || 'Xiaomi', systemName: variables.systemName || 'HyperOS',
    lockTime: variables.lockTime || '08:56', city: variables.city || 'Paris', temperature: variables.temperature || '18°',
    meeting: variables.meeting || 'Weekly Meeting', birthday: variables.birthday || 'Till Birthday', birthdayDays: variables.birthdayDays || '86',
    song: variables.song || 'Far closer', artist: variables.artist || 'David E Smith', blue: variables.blue || '#176cbe',
  };
  const canvas = document.getElementById('hyper-canvas');
  const context = canvas.getContext('2d');
  const sceneCanvas = document.createElement('canvas');sceneCanvas.width=1280;sceneCanvas.height=720;
  const scene = sceneCanvas.getContext('2d');
  const ui = window.HyperUI(content);
  const clamp=value=>Math.max(0,Math.min(1,value));
  const out=value=>1-Math.pow(1-clamp(value),3);
  const smooth=value=>{const p=clamp(value);return p*p*(3-2*p);};
  const mix=(a,b,p)=>a+(b-a)*p;
  const clock={time:0};
  const phoneCanvas=document.createElement('canvas');phoneCanvas.width=390;phoneCanvas.height=810;
  const phoneContext=phoneCanvas.getContext('2d');
  const tabletCanvas=document.createElement('canvas');tabletCanvas.width=1000;tabletCanvas.height=660;
  const tabletContext=tabletCanvas.getContext('2d');

  function whiteBackground(tint='#ffffff') {
    const gradient=scene.createLinearGradient(0,0,0,720);gradient.addColorStop(0,'#fff');gradient.addColorStop(1,tint);scene.fillStyle=gradient;scene.fillRect(0,0,1280,720);
  }
  function preparePhone(mode,variant,time) {
    phoneContext.clearRect(0,0,390,810);
    const rim=phoneContext.createLinearGradient(0,0,390,40);rim.addColorStop(0,'#d4d4d4');rim.addColorStop(.02,'#1b1b1b');rim.addColorStop(.05,'#e4e5e6');rim.addColorStop(.48,'#8b8d90');rim.addColorStop(.95,'#1f2021');rim.addColorStop(1,'#c8c8c8');
    ui.round(phoneContext,0,0,390,810,46,rim);ui.round(phoneContext,7,7,376,796,41,'#050608');
    phoneContext.drawImage(ui.renderScreen(mode,variant,time),15,15,360,780);
    phoneContext.beginPath();phoneContext.arc(195,34,6,0,Math.PI*2);phoneContext.fillStyle='#12171e';phoneContext.fill();
    phoneContext.beginPath();phoneContext.arc(196,32,2,0,Math.PI*2);phoneContext.fillStyle='#26334b';phoneContext.fill();
    return phoneCanvas;
  }
  function project(x,y,pose) {
    const yaw=pose.yaw||0,pitch=pose.pitch||0,roll=pose.roll||0;
    const a=x*Math.cos(yaw),depth=-x*Math.sin(yaw);
    const b=y*Math.cos(pitch)-depth*Math.sin(pitch);
    const z=y*Math.sin(pitch)+depth*Math.cos(pitch);
    const turnedX=a*Math.cos(roll)-b*Math.sin(roll),turnedY=a*Math.sin(roll)+b*Math.cos(roll);
    const perspective=1200/(1200+z);
    return [pose.x+turnedX*perspective,pose.y+turnedY*perspective];
  }
  function triangle(image,s0,s1,s2,d0,d1,d2) {
    const determinant=s0[0]*(s1[1]-s2[1])+s1[0]*(s2[1]-s0[1])+s2[0]*(s0[1]-s1[1]);
    if(Math.abs(determinant)<.001)return;
    const a=(d0[0]*(s1[1]-s2[1])+d1[0]*(s2[1]-s0[1])+d2[0]*(s0[1]-s1[1]))/determinant;
    const b=(d0[1]*(s1[1]-s2[1])+d1[1]*(s2[1]-s0[1])+d2[1]*(s0[1]-s1[1]))/determinant;
    const c=(d0[0]*(s2[0]-s1[0])+d1[0]*(s0[0]-s2[0])+d2[0]*(s1[0]-s0[0]))/determinant;
    const d=(d0[1]*(s2[0]-s1[0])+d1[1]*(s0[0]-s2[0])+d2[1]*(s1[0]-s0[0]))/determinant;
    const e=(d0[0]*(s1[0]*s2[1]-s2[0]*s1[1])+d1[0]*(s2[0]*s0[1]-s0[0]*s2[1])+d2[0]*(s0[0]*s1[1]-s1[0]*s0[1]))/determinant;
    const f=(d0[1]*(s1[0]*s2[1]-s2[0]*s1[1])+d1[1]*(s2[0]*s0[1]-s0[0]*s2[1])+d2[1]*(s0[0]*s1[1]-s1[0]*s0[1]))/determinant;
    scene.save();scene.beginPath();scene.moveTo(...d0);scene.lineTo(...d1);scene.lineTo(...d2);scene.closePath();scene.clip();scene.transform(a,b,c,d,e,f);scene.drawImage(image,0,0);scene.restore();
  }
  function texturePlane(image,width,height,pose,columns=6,rows=12) {
    const source=(x,y)=>[x/columns*image.width,y/rows*image.height];
    const point=(x,y)=>project((x/columns-.5)*width,(y/rows-.5)*height,pose);
    for(let row=0;row<rows;row+=1){for(let column=0;column<columns;column+=1){
      const a=source(column,row),b=source(column+1,row),c=source(column+1,row+1),d=source(column,row+1);
      const p=point(column,row),q=point(column+1,row),r=point(column+1,row+1),s=point(column,row+1);
      triangle(image,a,b,c,p,q,r);triangle(image,a,c,d,p,r,s);
    }}
  }
  function phone(mode,variant,time,pose) {
    const height=pose.height||680,width=height*390/810;
    scene.save();scene.globalAlpha=pose.opacity??1;
    if(!pose.yaw&&!pose.pitch){
      scene.translate(pose.x,pose.y);scene.rotate(pose.roll||0);scene.drawImage(preparePhone(mode,variant,time),-width/2,-height/2,width,height);
    }else texturePlane(preparePhone(mode,variant,time),width,height,pose);
    scene.restore();
  }
  function blueIntro(time) {
    const gradient=scene.createLinearGradient(0,0,0,720);gradient.addColorStop(0,content.blue);gradient.addColorStop(.42,'#001d4b');gradient.addColorStop(.58,'#000510');gradient.addColorStop(1,'#0750a5');scene.fillStyle=gradient;scene.fillRect(0,0,1280,720);
    scene.save();const close=time>=.5;const diagonal=time>=2.2;
    scene.translate(close?640+Math.sin(time)*120:640,close?360:280);scene.rotate(diagonal?-.72:close?-.24:0);scene.scale(close?2.8:1.2,close?2.8:1.2);
    for(let index=0;index<(close?3:1);index+=1){
      scene.save();scene.translate((index-1)*(close?175:0),index*80);
      const path=new Path2D();path.moveTo(-110,-290);path.lineTo(-110,130);path.bezierCurveTo(-110,300,110,300,110,130);path.lineTo(110,-300);
      scene.lineCap='round';scene.lineJoin='round';scene.shadowColor='#00030b';scene.shadowBlur=22;scene.shadowOffsetX=11;scene.shadowOffsetY=10;
      scene.strokeStyle='#00132b';scene.lineWidth=67;scene.stroke(path);scene.shadowBlur=0;
      const metal=scene.createLinearGradient(-160,0,160,0);metal.addColorStop(0,'#020e23');metal.addColorStop(.1,'#7ad8ff');metal.addColorStop(.16,'#052445');metal.addColorStop(.5,'#1268ac');metal.addColorStop(.86,'#00030a');metal.addColorStop(.94,'#4dcaff');metal.addColorStop(1,'#baf2ff');scene.strokeStyle=metal;scene.lineWidth=60;scene.stroke(path);
      scene.strokeStyle='rgba(167,233,255,.7)';scene.lineWidth=1.8;scene.stroke(path);
      const capsule=new Path2D();capsule.roundRect(-102,-235,96,150,46);scene.strokeStyle='#00132a';scene.lineWidth=8;scene.stroke(capsule);scene.strokeStyle='rgba(143,223,255,.8)';scene.lineWidth=1.3;scene.stroke(capsule);scene.restore();
    }
    scene.restore();
  }
  function fullscreenWallpaper(variant,time) { ui.wallpaper(scene,1280,720,variant,time); }
  function redDiscs(time) {
    const gradient=scene.createLinearGradient(0,0,1280,720);gradient.addColorStop(0,'#dc967d');gradient.addColorStop(.35,'#9d483e');gradient.addColorStop(1,'#49131e');scene.fillStyle=gradient;scene.fillRect(0,0,1280,720);
    scene.save();scene.translate(640,360);scene.rotate(-.15);const expansion=out((time-14.6)/1.4);
    for(let index=0;index<15;index+=1){const x=(index%4-1.5)*300,y=(Math.floor(index/4)-1.5)*240;const radius=110+(index%3)*12;
      scene.save();scene.translate(x,y);scene.scale(1,.52+expansion*.15);scene.shadowColor='rgba(44,4,12,.4)';scene.shadowBlur=22;scene.shadowOffsetY=14;
      const material=scene.createRadialGradient(-35,-30,3,5,10,radius);material.addColorStop(0,'rgba(255,241,227,.85)');material.addColorStop(.35,'rgba(221,151,140,.44)');material.addColorStop(1,'rgba(146,35,48,.22)');scene.beginPath();scene.arc(0,0,radius,0,Math.PI*2);scene.fillStyle=material;scene.fill();scene.shadowBlur=0;scene.strokeStyle='rgba(255,205,181,.55)';scene.lineWidth=2;scene.stroke();scene.restore();
    }scene.restore();
  }
  function tabletScreen(mode,time) {
    const c=tabletContext;c.clearRect(0,0,1000,660);
    if(mode==='files'){
      c.fillStyle='#fff';c.fillRect(0,0,1000,660);ui.text(c,'Files',28,38,24,'#222',650);
      const labels=['Recent','Downloads','Mi Drive','Favorites'];ui.glass(c,280,30,510,41,21,'rgba(240,240,242,.9)');labels.forEach((label,i)=>ui.text(c,label,342+i*125,56,15,i===0?'#111':'#999',i===0?550:400,'center'));
      ui.round(c,0,80,165,580,0,'#f8f8f8');['Recent','Documents','Images','Videos','Audio','Archives','Downloads','Favorites'].forEach((label,i)=>ui.text(c,label,22,117+i*44,15,'#5a5a60'));
      for(let index=0;index<24;index+=1){const x=210+index%6*129,y=123+Math.floor(index/6)*135;ui.icon(c,index,x,y,73);ui.text(c,['The Blue.png','Flower.jpg','IMG_2026.jpg','PITCH DECK.pdf','Portfolio.pdf','Image.png'][index%6],x+36,y+99,11,'#222',400,'center');ui.text(c,'10.08MB',x+36,y+116,9,'#999',400,'center');}
    }else{
      ui.wallpaper(c,1000,660,'green',time);ui.widget(c,'birthday',33,32,148,167,time);ui.widget(c,'clock',198,32,154,154,time);ui.widget(c,'weather',373,32,292,167,time);
      ui.glass(c,691,32,273,167,22,'rgba(255,255,255,.7)');ui.text(c,'2026/5',711,60,19,'#111');for(let n=1;n<=31;n+=1)ui.text(c,n,715+(n-1)%7*34,88+Math.floor((n-1)/7)*20,12,'#333');
      ui.widget(c,'meeting',33,218,319,114,time);
      for(let i=0;i<20;i+=1)ui.icon(c,i,60+i%7*135,372+Math.floor(i/7)*93,58);
      ui.glass(c,165,585,670,65,22,'rgba(255,255,255,.25)');for(let i=0;i<10;i+=1)ui.icon(c,i,182+i*65,596,44);
    }
    return tabletCanvas;
  }
  function tablet(mode,time,pose) {
    const width=pose.width||750,height=width*.68;
    const buffer=document.createElement('canvas');buffer.width=1040;buffer.height=700;const c=buffer.getContext('2d');ui.round(c,0,0,1040,700,33,'#101113');c.drawImage(tabletScreen(mode,time),20,20,1000,660);
    c.beginPath();c.arc(520,10,2,0,Math.PI*2);c.fillStyle='#2c3540';c.fill();
    scene.save();scene.globalAlpha=pose.opacity??1;
    if(pose.pitch||pose.yaw)texturePlane(buffer,width,height,pose,8,6);else{scene.translate(pose.x,pose.y);scene.rotate(pose.roll||0);scene.drawImage(buffer,-width/2,-height/2,width,height);}scene.restore();
  }
  function abstractWidgets(time) {
    fullscreenWallpaper('green',time);const progress=out((time-27.9)/.9);
    scene.save();scene.translate(640,360);scene.scale(.8+progress*.2,.8+progress*.2);scene.rotate(-.04);
    const gradient=scene.createLinearGradient(-320,-140,-80,160);gradient.addColorStop(0,'#d8fff1');gradient.addColorStop(.35,'#66d7a3');gradient.addColorStop(1,'#189550');scene.fillStyle=gradient;scene.beginPath();scene.ellipse(-250,20,125,154,.18,0,Math.PI*2);scene.fill();scene.strokeStyle='rgba(245,255,255,.65)';scene.lineWidth=2;scene.stroke();
    for(let i=0;i<3;i+=1)ui.glass(scene,-90,-128+i*92,244,73,36,'rgba(255,255,235,.68)');
    const purple=scene.createLinearGradient(200,-120,380,140);purple.addColorStop(0,'#6512ef');purple.addColorStop(1,'#b5b2e6');ui.glass(scene,196,-127,220,260,42,purple);scene.restore();
  }
  const widgetObjects=Array.from({length:17},(_,index)=>({
    type:['weather','birthday','meeting','clock','world'][index%5],x:(index%5-2)*310,y:(Math.floor(index/5)-1.4)*235,z:(index*71)%230-115,width:index%5===2?250:160,height:index%5===2?70:185,roll:Math.sin(index*3.7)*.16,
  }));
  function widgetCloud(time,strip=false) {
    fullscreenWallpaper('green',time);
    const local=time-28.9,progress=out(local/.8);
    const objects=strip?widgetObjects.slice(0,7):widgetObjects;
    objects.forEach((item,index)=>{
      const x=strip?640+(index-3)*73:640+item.x+Math.sin(local*.3+index)*12;
      const y=strip?360+(index-3)*170:360+item.y+Math.cos(local*.22+index)*8;
      scene.save();scene.translate(x,y);scene.rotate(strip?-.28:item.roll);const scale=(strip?.85:1+item.z/900)*progress;scene.scale(scale,scale);
      scene.shadowColor='rgba(11,62,42,.2)';scene.shadowBlur=16;scene.shadowOffsetY=8;ui.widget(scene,item.type,-item.width/2,-item.height/2,item.width,item.height,time);scene.restore();
    });
  }
  function mosaic(time) {
    whiteBackground('#f4f4f4');const local=time-39.4;const shift=mix(80,-80,smooth(local/1.6));
    for(let row=-1;row<3;row+=1){for(let column=-1;column<7;column+=1){const index=(row+1)*8+column+1;phone(index%4===0?'widgets':index%3===0?'control':'lock',['green','pink','yellow','blue'][index%4],time,{x:140+column*215+shift,y:180+row*390,height:365,roll:.015*Math.sin(index)});}}
  }
  function clockClose(time) {
    const gradient=scene.createLinearGradient(0,0,1280,720);gradient.addColorStop(0,'#d6deef');gradient.addColorStop(.65,'#a3bbc5');gradient.addColorStop(1,'#72aa88');scene.fillStyle=gradient;scene.fillRect(0,0,1280,720);
    scene.save();scene.translate(640,360);scene.rotate(.6);scene.scale(1.15,.72);const zoom=mix(1.8,1,out((time-41)/1.4));scene.scale(zoom,zoom);
    ui.glass(scene,-215,-215,430,430,215,'rgba(240,248,255,.35)');ui.clock(scene,0,0,287,time*.32,'#3e4950');scene.restore();
  }
  function family(time) {
    whiteBackground('#efeff4');const enter=out((time-43.1)/1.1);
    tablet('home',time,{x:640,y:mix(520,335,enter),width:mix(860,585,out((time-42.7)/1.7))});
    const laptopEnter=out((time-43.6)/.8);tablet('home',time,{x:986,y:mix(900,486,laptopEnter),width:426});
    ui.round(scene,776,637,439,10,5,'#999b9e');
    const first=out((time-43.3)/.75),second=out((time-43.55)/.7);
    phone('lock','yellow',time,{x:279,y:mix(840,440,first),height:485});phone('folders','pink',time,{x:437,y:mix(850,449,second),height:466});
    const watch=out((time-44)/.7);scene.save();scene.translate(893,mix(850,622,watch));ui.round(scene,-17,-82,34,168,14,'#25282b');scene.fillStyle='#181b1d';scene.beginPath();scene.arc(0,0,46,0,Math.PI*2);scene.fill();const dial=scene.createLinearGradient(-40,-30,40,40);dial.addColorStop(0,'#ffe986');dial.addColorStop(1,'#ce8019');scene.fillStyle=dial;scene.beginPath();scene.arc(0,0,39,0,Math.PI*2);scene.fill();ui.clock(scene,0,0,33,time,'#454039');scene.restore();
  }
  function renderAt(time) {
    const frame=Math.round(time*30);scene.setTransform(1,0,0,1,0,0);scene.clearRect(0,0,1280,720);scene.filter='none';
    if(frame<66)blueIntro(time);
    else if(frame<82){whiteBackground('#dff2ff');const p=out((time-2.2)/(16/30));phone('lock','blue',time,{x:640,y:mix(560,360,p),height:mix(1780,830,p),roll:mix(.18,0,p)});}
    else if(frame<126){whiteBackground('#dff2ff');const p=out((time-82/30)/.7);phone('lock','blue',time,{x:640,y:360,height:mix(830,680,p)});}
    else if(frame<241){fullscreenWallpaper('green',time);const scale=mix(1.2,.72,out((time-4.2)/3.6));scene.save();scene.translate(640,360);scene.scale(scale,scale);ui.tallTime(scene,0,120,false,.45);scene.restore();}
    else if(frame<314){whiteBackground('#f5f5f7');const p=out((time-241/30)/(23/30));['blue','green','pink','yellow','pink'].forEach((variant,i)=>phone('lock',variant,time,{x:640+(i-2)*mix(620,340,p),y:mix(820,360,p)+Math.abs(i-2)*12,height:mix(1750,660,p),roll:(i-2)*-.055,pitch:mix(-.85,0,p)}));}
    else if(frame<355){
      fullscreenWallpaper('pink',time);
      const notificationProgress=out((time-11.32)/.35);
      scene.save();scene.translate(264,285);scene.scale(1.6,1.6);
      ui.music(scene,0,0,470,1-notificationProgress);
      ui.notifications(scene,0,-40,470,notificationProgress);
      scene.restore();
    }
    else if(frame<393){whiteBackground('#ededf1');phone('music','pink',time,{x:640,y:360,height:680});}
    else if(frame<411){whiteBackground('#f1eef0');scene.save();scene.filter=`blur(${out((time-393/30)/.6)*24}px)`;phone('music','pink',time,{x:640,y:360,height:680});scene.restore();}
    else if(frame<456){scene.save();scene.filter=`blur(${mix(45,8,out((time-411/30)/1.2))}px)`;redDiscs(time);scene.restore();}
    else if(frame<501)redDiscs(time);
    else if(frame<570){whiteBackground('#fff');phone('control','red',time,{x:640,y:410,height:mix(1390,1160,smooth((time-16.7)/2.3))});}
    else if(frame<659){whiteBackground('#fff');phone('dialer','red',time,{x:640,y:mix(650,450,out((time-19)/1.7)),height:1270,pitch:-.9,yaw:-.1,roll:0});}
    else if(frame<700){whiteBackground('#fff');phone('home','yellow',time,{x:640,y:mix(300,480,smooth((time-659/30)/1.3)),height:1450,pitch:-.3,roll:.08});}
    else if(frame<747){whiteBackground('#fff');phone('folders','yellow',time,{x:640,y:620,height:1220});const p=out((time-23.4)/.5);scene.save();scene.translate(640,295);scene.scale(p,p);ui.icon(scene,'notes',-68,-68,136);scene.restore();}
    else if(frame<837){
      whiteBackground('#fff');
      phone('focus','blue',time,{x:670,y:975,height:2050});
      const p=out((time-24.9)/.8),expansion=out((time-26.3)/.7);
      scene.save();scene.translate(500,320);scene.scale(.86+p*.14,.86+p*.14);
      ui.folder(scene,-215,-235,430,mix(370,520,expansion),1,expansion*1.3);
      scene.restore();ui.widget(scene,'birthday',900,450,245,290,time);
    }
    else if(frame<865)abstractWidgets(time);
    else if(frame<931)widgetCloud(time);
    else if(frame<1025){fullscreenWallpaper('green',time);phone('widgets','green',time,{x:640,y:610,height:1320});}
    else if(frame<1064)widgetCloud(time,true);
    else if(frame<1122){whiteBackground('#fff');phone('widgets','violet',time,{x:640,y:555,height:1290,roll:-.57,yaw:.12});const p=out((time-35.47)/1.5);ui.glass(scene,mix(580,1020,p),337,61,260,24,'rgba(174,183,210,.52)');for(let i=0;i<5;i+=1)ui.icon(scene,i,mix(589,1029,p),349+i*48,42);}
    else if(frame<1182){whiteBackground('#fff');const p=out((time-37.4)/1.7);tablet('files',time,{x:640,y:360,width:mix(1490,925,p)});}
    else if(frame<1230)mosaic(time);
    else if(frame<1280)clockClose(time);
    else if(frame<1398)family(time);
    else {
      whiteBackground('#fff');
      const label = `${content.manufacturer} ${content.systemName}`;
      scene.font = '600 68px HyperInter';
      const width = scene.measureText(label).width;
      ui.text(scene, label, 640 - width / 2, 384, 68, '#111', 600);
      if (content.systemName.endsWith('OS')) {
        const ending = scene.measureText('OS').width;
        ui.text(scene, 'OS', 640 + width / 2 - ending, 384, 68, '#3153d6', 600);
      }
    }
    context.setTransform(1546/1280,0,0,870/720,0,0);context.clearRect(0,0,1280,720);context.drawImage(sceneCanvas,0,0);
  }
  const timeline=gsap.timeline({paused:true}).to(clock,{time:47.2,duration:47.2,ease:'none',onUpdate:()=>renderAt(clock.time)});
  window.__timelines=window.__timelines||{};window.__timelines['hyper-world']=timeline;
  window.HyperWorld={renderAt,canvas,sceneCanvas,scene,ui,content,phone,tablet,widgetObjects,preparePhone,project};
  renderAt(0);document.fonts.load('400 36px HyperInter').then(()=>renderAt(clock.time));
};
