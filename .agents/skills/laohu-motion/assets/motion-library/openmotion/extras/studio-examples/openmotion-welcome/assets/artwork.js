/* Editable artwork shared by the gallery, reel, editor and cube.
 * Coordinates are in a 1000 x 562.5 artwork space, independent of Studio chrome.
 * Every drawing is derived from the supplied time; there is no playback clock.
 */
window.WelcomeArt = (() => {
  const W=1000,H=562.5,TAU=Math.PI*2;
  const ink='#151917',paper='#f4f1e8',lime='#98ff63',blue='#2927ee';
  const mark=new Image();mark.src='assets/brand-mark.svg';
  const ready=Promise.all([mark.decode(),document.fonts.load('800 80px "Welcome Sans"'),document.fonts.load('40px "Welcome Serif"')]);
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const ease=v=>1-Math.pow(1-clamp(v),3);
  function rect(c,x,y,w,h,fill,r=0){c.fillStyle=fill;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
  function text(c,s,x,y,size,color=ink,weight=800,align='center',family='Welcome Sans'){
    c.fillStyle=color;c.font=`${weight} ${size}px "${family}",sans-serif`;c.textAlign=align;c.textBaseline='middle';c.fillText(s,x,y);
  }
  function line(c,points,color,width=1){c.strokeStyle=color;c.lineWidth=width;c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.stroke();}
  function disk(c,x,y,r,color){c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();}
  function logo(c,x,y,size,color=ink,rotation=0){
    c.save();c.translate(x,y);c.rotate(rotation);
    // The package-owned mark is recolored on an isolated canvas, never redrawn.
    const tile=document.createElement('canvas');tile.width=tile.height=300;
    const p=tile.getContext('2d');p.drawImage(mark,0,0,300,300);p.globalCompositeOperation='source-in';p.fillStyle=color;p.fillRect(0,0,300,300);
    c.drawImage(tile,-size/2,-size/2,size,size);c.restore();
  }
  // Cache the few colors used by the film; resizing/copying the mark is otherwise
  // disproportionately expensive in 30 simultaneous gallery cards.
  const logos=new Map();
  function symbol(c,x,y,size,color=ink,rotation=0){
    if(!logos.has(color)){const tile=document.createElement('canvas');tile.width=tile.height=512;const p=tile.getContext('2d');p.drawImage(mark,0,0,512,512);p.globalCompositeOperation='source-in';p.fillStyle=color;p.fillRect(0,0,512,512);logos.set(color,tile);}
    c.save();c.translate(x,y);c.rotate(rotation);c.drawImage(logos.get(color),-size/2,-size/2,size,size);c.restore();
  }
  function footer(c,label,color='#89918c'){
    text(c,'OPENMOTION / '+label,24,542,8,color,500,'left');
    text(c,'EDITABLE BY DESIGN',976,542,8,color,500,'right');
  }
  function comic(c,t){
    rect(c,0,0,W,H,'#f5eed9');
    for(let x=8;x<W;x+=14)for(let y=8;y<H;y+=14)disk(c,x,y,1.1,'#b9b2a0');
    rect(c,193,14,614,534,ink);rect(c,200,21,600,520,'#8cbad2');
    c.save();c.beginPath();c.rect(200,21,600,520);c.clip();
    for(let i=0;i<52;i++){c.fillStyle=i%2?'#f9edcc':'#75a5c4';const a=i/52*TAU+t*.05;c.beginPath();c.moveTo(500,281);c.arc(500,281,640,a,a+TAU/52);c.closePath();c.fill();}c.restore();
    for(const x of [18,817]){rect(c,x,20,165,245,ink);rect(c,x+4,24,157,237,'#f6dc36');rect(c,x,280,165,263,ink);rect(c,x+4,284,157,255,paper);}
    disk(c,500,280,177,'#f8dc48');disk(c,500,280,153,'#d54337');disk(c,500,280,134,paper);symbol(c,500,280,198,ink,Math.sin(t*3)*.08);
    text(c,'MAKE IT MOVE.',28,51,17,ink,850,'left');text(c,'1962',759,57,38,ink,900,'right');
    c.save();c.translate(713,455);c.rotate(-.15);rect(c,-80,-36,160,72,ink,5);rect(c,-75,-31,150,62,'#f6dc36');text(c,'CLICK!',0,0,36,'#d13929',900);c.restore();footer(c,'COMIC');
  }
  function dots(c,t){
    rect(c,0,0,W,H,'#cb2e29');for(let y=-20;y<H+30;y+=34)for(let x=-20;x<W+30;x+=34)disk(c,x+(Math.floor(y/34)%2?17:0),y,11.8,paper);
    disk(c,500,285,176,'#f4d730');
    c.save();c.beginPath();c.arc(500,285,168,0,TAU);c.clip();for(let y=110;y<470;y+=18)for(let x=320;x<690;x+=18)disk(c,x,y,5,ink);c.restore();
    disk(c,500,285,122,'#cb2e29');symbol(c,500,285,180,ink,t*.6);rect(c,388,15,224,82,paper,14);text(c,'1965',500,46,44);text(c,'Infinite possibilities',500,79,15,ink,650);footer(c,'DOT STUDY',paper);
  }
  function prism(c,t){
    rect(c,0,0,W,H,'#080d10');text(c,'1973',70,450,135,'#202727',400,'left');
    const gradient=c.createLinearGradient(0,185,0,365);['#d94356','#f7c957','#77eea2','#48a7ed','#7770ff'].forEach((v,i)=>gradient.addColorStop(i/4,v));
    c.fillStyle=gradient;c.beginPath();c.moveTo(520,280);c.lineTo(1000,190);c.lineTo(1000,370);c.closePath();c.fill();line(c,[[0,365],[460,274]],'#f9f6df',3);
    const glow=c.createRadialGradient(500,280,15,500,280,160);glow.addColorStop(0,'#91dfb958');glow.addColorStop(1,'#91dfb900');rect(c,330,110,340,340,glow);
    c.save();c.translate(500,280);c.rotate(Math.sin(t)*.08);c.strokeStyle='#f3eec0';c.lineWidth=5;c.beginPath();c.arc(0,0,112,0,TAU);c.stroke();symbol(c,0,0,180,paper);c.restore();footer(c,'LIGHT / REFRACTION');
  }
  function pixel(c,t){
    rect(c,0,0,W,H,'#37b9ef');
    [[120,170],[720,92],[450,132]].forEach(([x,y])=>{rect(c,x,y,74,14,'#fffdf0');rect(c,x+17,y-10,35,14,'#fffdf0');});
    for(const [x,y,r] of [[80,460,155],[360,480,120],[780,470,165]]){c.fillStyle='#22bf4d';c.beginPath();c.arc(x,y,r,Math.PI,TAU);c.fill();}
    c.fillStyle='#8f77e7';c.beginPath();c.moveTo(360,500);c.lineTo(540,300);c.lineTo(740,500);c.fill();
    rect(c,0,475,W,88,'#d5a723');rect(c,0,475,W,14,'#8ada36');for(let x=0;x<W;x+=25)for(let y=497;y<H;y+=22)rect(c,x,y,5,4,'#8c711d');
    const y=265-50*Math.sin(t*4);disk(c,500,y,130,'#2d4b62');disk(c,500,y,118,'#f0cb54');disk(c,500,y,98,'#3db5e9');symbol(c,500,y,145,paper,t*.4);
    for(let i=0;i<7;i++)disk(c,650+i*37,270-Math.sin(i*.42)*100,8,'#ffdf61');
    text(c,'SCORE',28,27,20,paper,800,'left');text(c,'000250',28,53,20,paper,700,'left');text(c,'LEVEL 01',500,27,20,paper,800);text(c,'♥ ♥ ♥',965,40,22,'#f24934',800,'right');footer(c,'PLAY',ink);
  }
  function tunnel(c,t){
    rect(c,0,0,W,H,ink);c.save();c.translate(500,281);
    for(let i=10;i>=0;i--){const r=21*Math.pow(1.37,i)*(.94+(t%0.7)*.16);disk(c,0,0,r,i%2?paper:ink);c.save();c.rotate((i%2?1:-1)*t*.22);const word='THE FUTURE IS ALREADY HERE · ';const count=word.length;for(let j=0;j<count;j++){c.save();c.rotate(j/count*TAU);text(c,word[j],0,-r*.84,r*.2,i%2?ink:paper,850);c.restore();}c.restore();}c.restore();footer(c,'KINETIC TYPE',paper);
  }
  function swiss(c,t){
    rect(c,0,0,W,H,'#0b1112');const cells=[['///',paper],['THE',paper],['◎',paper],['FUTURE',ink],['✦',ink],['〜',paper],['IS',paper],['░',paper],['›››',ink],['ALREADY',paper],['NOW',paper],['HERE',ink]];
    cells.forEach(([s,b],i)=>{const p=ease((t-i*.045)*6);if(!p)return;c.save();c.translate((i%4)*250+125,Math.floor(i/4)*176+88);c.scale(p,p);rect(c,-124,-87,248,174,b);text(c,s,0,0,s.length>6?28:s.length>4?44:75,b===paper?ink:paper,850);c.restore();});footer(c,'THE FUTURE',paper);
  }
  function torus(c,t){
    rect(c,0,0,W,H,'#202120');c.strokeStyle='#cfd3c7';c.lineWidth=1;
    for(let j=0;j<30;j++){c.beginPath();for(let i=0;i<=100;i++){const a=i/100*TAU,b=j/30*TAU+t*.6;const r=155+52*Math.cos(b+a*3);const x=500+r*Math.cos(a),y=281+(r*Math.sin(a)*.48+65*Math.sin(b+a*3));i?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();}footer(c,'FORM / STUDY');
  }
  function kinetic(c,t,word,bg,fg,kind='slide'){
    rect(c,0,0,W,H,bg);const p=ease(t/.16);c.save();c.translate(500,281);if(kind==='drop')c.translate(0,-220*(1-p));else c.translate(-450*(1-p),0);c.scale(1+(1-p)*.9,kind==='tall'?1.7:1);
    for(let i=7;i>=1;i--){c.globalAlpha=(1-p)*.09;text(c,word,-i*16,0,word.length>6?95:170,fg,900);}
    c.globalAlpha=1;text(c,word,0,0,word.length>6?95:170,fg,900);c.restore();footer(c,'MOTION / TYPE',fg===paper?'#a4aaa3':'#47623c');
  }
  function never(c,t){
    rect(c,0,0,W,H,'#d4ffae');const p=ease((t-.1)/.25);for(let row=-3;row<=3;row++){c.save();c.translate(500+(row%2?1:-1)*t*65,281+row*85);c.font='900 77px "Welcome Sans"';c.textAlign='center';c.textBaseline='middle';c.strokeStyle='#94b579';c.lineWidth=1;c.globalAlpha=Math.abs(row)?p:1;if(row){c.strokeText('NEVER NEVER NEVER NEVER NEVER',0,0);}else{text(c,p>.5?'NEVER NEVER NEVER NEVER NEVER':'NEVER',0,-160*(1-ease(t/.15)),p>.5?77:125,ink,900);}c.restore();}footer(c,'EXPRESS YOURSELF');
  }
  function orbit(c,t){
    rect(c,0,0,W,H,lime);c.strokeStyle='#e9ffc9';c.lineWidth=2;c.beginPath();c.arc(500,281,80+250*(1-ease(t*3)),0,TAU);c.stroke();c.save();c.translate(500,281);c.rotate(t*2);rect(c,-62,-62,124,124,ink,28);symbol(c,0,0,83,lime);c.restore();footer(c,'MAKE / CREATE');
  }
  function growth(c,t){
    const g=c.createLinearGradient(0,0,W,H);g.addColorStop(0,'#bceae0');g.addColorStop(1,'#e7f0c6');rect(c,0,0,W,H,g);rect(c,370,46,600,475,'#fff',20);text(c,'Your story',200,218,64);text(c,'takes shape.',200,295,40,ink,600);text(c,'Every frame is yours.',200,355,22,ink,500);text(c,'Creative possibilities',670,93,23);line(c,[[430,140],[430,460],[918,460]],ink,2);
    const pts=Array.from({length:70},(_,i)=>[430+i*6.8,455-320*(1-Math.exp(-i/20))]);line(c,pts.slice(0,Math.max(2,Math.ceil(ease(t*3)*70))),'#be7061',4);disk(c,...pts[Math.min(69,Math.ceil(ease(t*3)*69))],10,lime);footer(c,'DATA / STORY');
  }
  function plane(c,t){
    rect(c,0,0,W,H,'#343e87');for(let i=0;i<50;i++)line(c,[[i*29-170,0],[i*29+130,H]],'#5260a2',7);c.strokeStyle=paper;c.lineWidth=6;c.strokeRect(245,70,510,355);
    for(let i=0;i<12;i++)disk(c,290+(i*137)%440,115+(i*59)%240,3,'#e6d68a');c.save();c.translate(420+t*70,290-t*30);c.rotate(-.3);c.fillStyle=paper;c.beginPath();c.moveTo(70,-50);c.lineTo(-60,0);c.lineTo(-5,17);c.lineTo(15,68);c.closePath();c.fill();c.restore();text(c,'motion films',500,489,54,paper,700);footer(c,'TELL YOUR STORY',paper);
  }
  function eye(c,t){
    rect(c,0,0,W,H,'#050607');c.save();c.beginPath();c.moveTo(90,281);c.quadraticCurveTo(500,-47,910,281);c.quadraticCurveTo(500,610,90,281);c.clip();const g=c.createRadialGradient(500,281,10,500,281,430);g.addColorStop(0,'#090510');g.addColorStop(.5,'#5141ff');g.addColorStop(1,'#2116df');rect(c,0,0,W,H,g);
    for(let j=0;j<160;j++){const a=j/160*TAU+t*.28,r=205+(Math.sin(j*8.21)*.5+.5)*24;line(c,[[500+68*Math.cos(a),281+68*Math.sin(a)],[500+r*Math.cos(a+.08*Math.sin(j)),281+r*Math.sin(a+.08*Math.sin(j))]],j%2?'#10082f':'#9795ff',j%3?1:2);}disk(c,500,281,60,'#030305');disk(c,463,236,12,paper);c.restore();text(c,'SEE WHAT’S POSSIBLE',500,58,15,'#a4a4aa',500);footer(c,'VISION');
  }
  function paperArt(c,t){
    rect(c,0,0,W,H,'#e9d39d');for(let x=25;x<W;x+=38)for(let y=36;y<H;y+=21)line(c,[[x,y],[x+25,y]],'#a28c6244',1);rect(c,255,45,490,472,'#24408f');rect(c,280,70,440,422,'#c89b42');rect(c,295,85,410,392,'#253d84');symbol(c,500,281,260,'#ddc36b',t*.15);footer(c,'ART / DIRECTION');
  }
  function future(c,t){
    rect(c,0,0,W,H,blue);for(let j=0;j<20;j++)line(c,[[0,j*30],[W,j*30]],'#ffffff09',1);c.save();c.translate(500,260);c.rotate(Math.sin(t)*.025);for(let i=22;i>0;i--)text(c,'FUTURE',-i*.55,i*.9,164,i%2?'#a7a7ad':'#deded4',900);text(c,'FUTURE',0,0,164,paper,900);c.restore();text(c,'IS ALREADY HERE.',500,369,34,paper,800);footer(c,'THE NEXT FRAME',paper);
  }
  const kinds=['comic','eye','growth','torus','swiss','future','paper','tunnel','dots','pixel','never','plane','prism','orbit','ease','in','easegreen','out','linear','future'];
  function draw(c,kind,t=0,w=W,h=H){
    c.save();c.scale(w/W,h/H);
    switch(kind){
      case 'comic':comic(c,t);break;case 'dots':dots(c,t);break;case 'prism':prism(c,t);break;case 'pixel':pixel(c,t);break;case 'tunnel':tunnel(c,t);break;case 'swiss':swiss(c,t);break;case 'torus':torus(c,t);break;
      case 'ease':kinetic(c,t,'EASE',lime,ink);break;case 'in':kinetic(c,t,'IN.',ink,paper,'drop');break;case 'easegreen':kinetic(c,t,'EASE',paper,'#078a19','tall');break;case 'out':kinetic(c,t,'OUT.','#078a19',paper);break;
      case 'never':never(c,t);break;case 'linear':kinetic(c,t,'LINEAR.',ink,paper);break;case 'orbit':orbit(c,t);break;case 'growth':growth(c,t);break;case 'plane':plane(c,t);break;case 'eye':eye(c,t);break;case 'paper':paperArt(c,t);break;case 'future':future(c,t);break;
      default:kinetic(c,t,'CREATE',paper,ink);
    }c.restore();
  }
  // The measured absolute frame boundaries preserve the short original cuts.
  const reel=[ [322,'comic'],[338,'dots'],[353,'prism'],[367,'pixel'],[380,'tunnel'],[430,'swiss'],[445,'torus'],[454,'ease'],[461,'in'],[468,'easegreen'],[476,'out'],[483,'never'],[495,'linear'],[510,'orbit'],[515,'paper'],[523,'growth'],[531,'orbit'],[539,'plane'],[547,'eye'],[555,'swiss'],[562,'comic'],[570,'future'] ];
  function reelAt(t){const frame=Math.round(t*30)+322;let item=reel[0];for(const entry of reel)if(frame>=entry[0])item=entry;return {kind:item[1],time:(frame-item[0])/30};}
  function letters(selector,depth=false){
    const all=[];document.querySelectorAll(selector).forEach(node=>{const value=node.textContent;node.textContent='';[...value].forEach(char=>{const span=document.createElement('span');span.className='film-letter';span.textContent=char;node.append(span);all.push(span);if(depth&&char.trim()){for(let i=1;i<=16;i++){const layer=document.createElement('span');layer.className='intro-depth';layer.textContent=char;layer.setAttribute('aria-hidden','true');layer.style.transform=`translateZ(${-i*1.4}px)`;span.append(layer);}}});});return all;
  }
  function animateCanvas(key,canvas,duration,render){ready.then(()=>{const state={time:0},tl=gsap.timeline({paused:true});render(canvas.getContext('2d'),0);tl.to(state,{time:duration,duration,ease:'none',onUpdate:()=>render(canvas.getContext('2d'),state.time)},0);window.__timelines[key]=tl;});}
  return {ready,draw,kinds,reelAt,letters,animateCanvas,symbol,rect,text,line,disk,ease,clamp,paper,ink};
})();
