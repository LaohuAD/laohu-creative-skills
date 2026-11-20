/* Editable UI drawing system. All copy and interface geometry remain native source. */
window.HyperUI = function (content) {
  const clamp = value => Math.max(0, Math.min(1, value));
  const palette = ['#37d963','#ffb51b','#ffcd20','#7d72fa','#09a7ed','#ff7045','#24282e','#009bff','#f48cd1','#00cf54','#4168e4','#f7f7f7'];
  function round(context,x,y,width,height,radius,fill,stroke) {
    context.beginPath();context.roundRect(x,y,width,height,radius);
    if(fill){context.fillStyle=fill;context.fill();}
    if(stroke){context.strokeStyle=stroke;context.lineWidth=1;context.stroke();}
  }
  function text(context,value,x,y,size=20,color='#fff',weight=400,align='left') {
    context.fillStyle=color;context.font=`${weight} ${size}px HyperInter`;context.textAlign=align;context.textBaseline='alphabetic';context.fillText(String(value),x,y);
  }
  function glass(context,x,y,width,height,radius=24,tint='rgba(255,255,255,.24)') {
    context.save();context.shadowColor='rgba(0,0,0,.12)';context.shadowBlur=12;context.shadowOffsetY=3;
    round(context,x,y,width,height,radius,tint);context.shadowBlur=0;
    const edge=context.createLinearGradient(x,y,x+width,y+height);edge.addColorStop(0,'rgba(255,255,255,.75)');edge.addColorStop(.5,'rgba(255,255,255,.12)');edge.addColorStop(1,'rgba(255,255,255,.38)');
    round(context,x,y,width,height,radius,null,edge);context.restore();
  }
  function wallpaper(context,width,height,variant='green',phase=0) {
    const sets={green:['#c3dfcb','#0b5d51','#eff0a2'],pink:['#b6b7ca','#c60057','#f58bc8'],blue:['#bad5dc','#0061a2','#0cd1ee'],yellow:['#b6c0d6','#f7b234','#ffd978'],red:['#a3543d','#67181c','#d88967'],violet:['#9898b5','#262b58','#6a74b4']};
    const colors=sets[variant]||sets.green;
    const backdrop=context.createLinearGradient(0,0,width,height);backdrop.addColorStop(0,colors[0]);backdrop.addColorStop(1,colors[2]);context.fillStyle=backdrop;context.fillRect(0,0,width,height);
    context.save();context.translate(width*.5,height*.5);context.rotate(-.35+Math.sin(phase*.22)*.06);
    for(let index=0;index<3;index+=1){
      context.save();context.translate((index-1)*width*.52,(index-1)*height*.22);context.rotate(index*.42);
      const fill=context.createLinearGradient(-width*.6,-height*.4,width*.6,height*.4);fill.addColorStop(0,colors[1]);fill.addColorStop(.32,colors[0]);fill.addColorStop(.48,colors[2]);fill.addColorStop(.53,colors[1]);fill.addColorStop(1,colors[0]);
      context.shadowColor='rgba(0,0,0,.3)';context.shadowBlur=12;context.shadowOffsetX=4;
      round(context,-width*.61,-height*.47,width*1.22,height*.94,width*.48,fill);
      context.shadowBlur=0;
      const rim=context.createLinearGradient(-width*.5,-height*.4,width*.4,height*.3);rim.addColorStop(0,'rgba(255,255,255,.85)');rim.addColorStop(.4,'rgba(245,255,180,.75)');rim.addColorStop(.55,'rgba(0,0,0,.85)');rim.addColorStop(1,'rgba(255,255,255,.55)');
      context.lineWidth=2.8;context.strokeStyle=rim;context.stroke();context.restore();
    }
    context.restore();
  }
  function icon(context,type,x,y,size,phase=0) {
    const types=['phone','camera','calendar','notes','weather','messages','settings','folder','clock','calculator','browser','themes'];
    const index=typeof type==='number'?type%types.length:types.indexOf(type);const name=types[Math.max(0,index)];
    const color=palette[(index+12)%12];
    const fill=context.createLinearGradient(x,y,x+size,y+size);fill.addColorStop(0,color);fill.addColorStop(1,name==='calendar'?'#e5e5df':color);
    context.save();context.shadowColor='rgba(0,0,0,.1)';context.shadowBlur=2;round(context,x,y,size,size,size*.22,fill);context.shadowBlur=0;
    context.translate(x,y);context.lineCap='round';context.lineJoin='round';context.strokeStyle='#fff';context.fillStyle='#fff';context.lineWidth=size*.065;
    if(name==='phone'){
      context.beginPath();context.moveTo(size*.29,size*.23);context.bezierCurveTo(size*.18,size*.4,size*.43,size*.73,size*.65,size*.77);context.lineTo(size*.78,size*.62);context.lineTo(size*.59,size*.49);context.lineTo(size*.49,size*.59);context.quadraticCurveTo(size*.35,size*.47,size*.36,size*.37);context.lineTo(size*.44,size*.31);context.closePath();context.fill();
    }else if(name==='calendar'){
      text(context,'SUN',size*.5,size*.25,size*.18,'#2998df',600,'center');text(context,'24',size*.5,size*.83,size*.6,'#111',400,'center');
    }else if(name==='notes'){
      for(let i=0;i<3;i+=1){context.strokeStyle='rgba(170,100,0,.25)';context.lineWidth=1;context.beginPath();context.moveTo(size*.2,size*(.35+i*.2));context.lineTo(size*.8,size*(.35+i*.2));context.stroke();}
      context.save();context.translate(size*.55,size*.48);context.rotate(.7);round(context,-size*.06,-size*.4,size*.12,size*.77,size*.025,'#fff');context.beginPath();context.moveTo(-size*.06,size*.37);context.lineTo(0,size*.5);context.lineTo(size*.06,size*.37);context.fillStyle='#ceb47a';context.fill();context.restore();
    }else if(name==='clock'){
      context.beginPath();context.arc(size*.5,size*.5,size*.41,0,Math.PI*2);context.fillStyle='#20252b';context.fill();
      context.strokeStyle='#fff';context.lineWidth=1;
      for(let i=0;i<12;i+=1){const a=i/12*Math.PI*2;context.beginPath();context.moveTo(size*(.5+Math.sin(a)*.34),size*(.5-Math.cos(a)*.34));context.lineTo(size*(.5+Math.sin(a)*.38),size*(.5-Math.cos(a)*.38));context.stroke();}
      context.lineWidth=size*.025;context.beginPath();context.moveTo(size*.5,size*.5);context.lineTo(size*.29,size*.34);context.moveTo(size*.5,size*.5);context.lineTo(size*.7,size*.26);context.stroke();
    }else if(name==='folder'){
      round(context,size*.14,size*.25,size*.72,size*.6,size*.055,'#ffcf35');round(context,size*.14,size*.19,size*.35,size*.18,size*.035,'#ffe98e');
    }else if(name==='camera'){
      round(context,size*.13,size*.22,size*.74,size*.58,size*.12,'#d7dce7');context.fillStyle='#283448';context.beginPath();context.arc(size*.5,size*.51,size*.22,0,Math.PI*2);context.fill();context.strokeStyle='#738ab0';context.lineWidth=size*.04;context.stroke();context.beginPath();context.arc(size*.5,size*.51,size*.105,0,Math.PI*2);context.fillStyle='#111725';context.fill();
    }else if(name==='calculator'){
      round(context,size*.1,size*.1,size*.8,size*.8,size*.13,'#fff');text(context,'+ −',size*.5,size*.39,size*.29,'#222',650,'center');text(context,'× =',size*.5,size*.78,size*.29,'#222',650,'center');
    }else if(name==='messages'){
      context.beginPath();context.ellipse(size*.5,size*.43,size*.34,size*.27,0,0,Math.PI*2);context.fill();context.beginPath();context.moveTo(size*.25,size*.56);context.lineTo(size*.23,size*.79);context.lineTo(size*.48,size*.63);context.fill();
    }else if(name==='weather'){
      text(context,'26°',size*.5,size*.54,size*.37,'#fff',500,'center');context.fillStyle='#fff';context.beginPath();context.ellipse(size*.5,size*.73,size*.25,size*.1,0,0,Math.PI*2);context.fill();
    }else if(name==='settings'){
      context.strokeStyle='#e5e5e5';context.lineWidth=size*.12;context.beginPath();context.arc(size*.5,size*.5,size*.27,0,Math.PI*2);context.stroke();context.lineWidth=size*.03;context.beginPath();context.arc(size*.5,size*.5,size*.13,0,Math.PI*2);context.stroke();
      for(let i=0;i<12;i+=1){const a=i/12*Math.PI*2;context.beginPath();context.moveTo(size*(.5+Math.sin(a)*.27),size*(.5+Math.cos(a)*.27));context.lineTo(size*(.5+Math.sin(a)*.39),size*(.5+Math.cos(a)*.39));context.stroke();}
    }else if(name==='browser'){
      context.fillStyle='#fff';context.beginPath();context.arc(size*.5,size*.5,size*.33,0,Math.PI*2);context.fill();context.fillStyle='#36a6ef';context.beginPath();context.moveTo(size*.25,size*.68);context.lineTo(size*.66,size*.28);context.lineTo(size*.72,size*.57);context.closePath();context.fill();
    }else{
      round(context,size*.27,size*.21,size*.46,size*.3,size*.05,'#fff');context.lineWidth=size*.09;context.beginPath();context.moveTo(size*.5,size*.5);context.lineTo(size*.5,size*.78);context.stroke();
    }
    context.restore();
  }
  function status(context,width=360) {
    text(context,'8:56',19,28,15,'rgba(255,255,255,.95)',600);
    text(context,'▴  ≋  100',width-18,28,12,'rgba(255,255,255,.95)',600,'right');
  }
  function tallTime(context,width,y=230,stacked=false,opacity=.55) {
    context.save();context.globalAlpha=opacity;context.fillStyle='#faffff';context.font='250 200px HyperInter';context.textAlign='center';context.textBaseline='alphabetic';
    const time=content.lockTime.split(':');
    if(stacked){context.translate(width*.5,y);context.scale(.68,1.04);context.fillText(time[0]||'08',0,0);context.fillText(time[1]||'56',0,174);}
    else{context.translate(width*.5,y);context.scale(.48,1.6);context.fillText(content.lockTime,0,0);}
    context.restore();
  }
  function music(context,x,y,width,opacity=1) {
    context.save();context.globalAlpha=opacity;glass(context,x,y,width,145,24,'rgba(241,190,221,.5)');round(context,x+15,y+16,43,43,8,'#322440');
    text(context,content.song,x+68,y+35,15,'#fff',550);text(context,content.artist,x+68,y+53,12,'rgba(255,255,255,.55)');
    text(context,'⇄',x+22,y+95,21);text(context,'◀',x+84,y+95,18);text(context,'Ⅱ',x+width*.5,y+96,26);text(context,'▶',x+width-92,y+95,18);text(context,'♡',x+width-35,y+96,23);
    round(context,x+18,y+118,width-36,3,2,'rgba(255,255,255,.25)');round(context,x+18,y+118,width*.48,3,2,'rgba(255,255,255,.85)');context.restore();
  }
  function notifications(context,x,y,width,progress=1) {
    const items=[['themes','Themes','Experience the new theme'],['weather','Weather','Today in Munich, mostly clear 24/16°C'],['messages','Messages','You have new messages'],['browser','Mi Browser','Experience the new AI browser']];
    items.forEach(([name,title,body],index)=>{
      const appear=clamp((progress-index*.12)/.5);
      context.save();context.globalAlpha=appear;
      const top=y+index*68+(1-appear)*18;
      glass(context,x,top,width,62,18,'rgba(221,155,192,.5)');icon(context,name,x+11,top+13,35);
      text(context,title,x+58,top+25,15,'#fff',550);text(context,body,x+58,top+45,12,'rgba(255,255,255,.8)');
      context.restore();
    });
  }
  function folder(context,x,y,width,height=175,scale=1,expansion=0) {
    context.save();context.translate(x,y);context.scale(scale,scale);glass(context,0,0,width,height,24,'rgba(255,255,255,.27)');
    const gap=9,size=(width-32)/3;
    ['folder','calendar','notes','clock','browser','weather','phone','camera','messages'].forEach((name,i)=>{
      if(i>=6){context.save();context.globalAlpha=clamp(expansion-(i-6)*.14);}
      icon(context,name,8+(i%3)*(size+gap*.5),14+Math.floor(i/3)*(size+gap),size);
      if(i>=6)context.restore();
    });context.restore();
  }
  function widget(context,type,x,y,width=164,height=190,time=0) {
    context.save();
    if(type==='weather'||type==='sunset'){
      const bg=context.createLinearGradient(x,y,x+width,y+height);bg.addColorStop(0,type==='sunset'?'#36397b':'#3872ff');bg.addColorStop(1,type==='sunset'?'#bc94c0':'#b5d1ff');round(context,x,y,width,height,23,bg);
      text(context,type==='sunset'?'Sunset':content.city,x+13,y+27,14,'#fff',550);
      text(context,type==='sunset'?'In 8 hours':content.temperature,x+13,y+63,type==='sunset'?22:39,'#fff',400);
      if(type==='sunset'){context.beginPath();context.arc(x+width*.5,y+height*.81,width*.33,Math.PI,Math.PI*2);context.strokeStyle='rgba(255,255,255,.8)';context.lineWidth=2;context.stroke();text(context,'06:58           17:51',x+width*.5,y+height-10,9,'#fff',400,'center');}
      else{text(context,'Mostly clear',x+13,y+height-39,13,'#fff');text(context,'24° / 16°',x+13,y+height-20,12,'rgba(255,255,255,.8)');context.fillStyle='#ffe58b';context.beginPath();context.arc(x+width-28,y+34,11,0,Math.PI*2);context.fill();}
    }else if(type==='birthday'){
      const bg=context.createLinearGradient(x,y,x,y+height);bg.addColorStop(0,'#5e3fe4');bg.addColorStop(1,'#c3bfff');round(context,x,y,width,height,24,bg);text(context,content.birthday,x+14,y+28,15);text(context,content.birthdayDays,x+12,y+height*.68,height*.45,'#fff',300);text(context,'days',x+width-16,y+height*.68,15,'#fff',400,'right');text(context,'11/30/2024',x+14,y+height-19,11);
    }else if(type==='meeting'){
      glass(context,x,y,width,height,Math.min(height/2,24),'rgba(255,255,255,.68)');text(context,content.meeting,x+13,y+height*.42,Math.min(20,height*.3),'#25292c',500);text(context,'17:00 – 18:00',x+13,y+height*.78,Math.min(16,height*.24),'#4b5157');
    }else if(type==='clock'){
      round(context,x,y,width,height,Math.min(width,height)/2,'rgba(85,178,110,.9)');clock(context,x+width/2,y+height/2,Math.min(width,height)*.44,time,'#fff');
    }else{glass(context,x,y,width,height,24,'rgba(250,250,242,.8)');text(context,'London',x+13,y+27,13,'#555');text(context,'7:56',x+13,y+height-20,35,'#333');}
    context.restore();
  }
  function clock(context,x,y,radius,time=0,color='#fff') {
    context.save();context.translate(x,y);
    for(let n=1;n<=12;n+=1){const angle=n/12*Math.PI*2;text(context,n,Math.sin(angle)*radius*.83,-Math.cos(angle)*radius*.83+5,radius*.19,color,400,'center');}
    for(const [angle,length,width,tint] of [[-.95,radius*.5,radius*.035,color],[1.2,radius*.8,radius*.025,color],[time*.8,radius*.9,radius*.018,'#198bff']]){
      context.save();context.rotate(angle);context.strokeStyle=tint;context.lineWidth=width;context.lineCap='round';context.beginPath();context.moveTo(0,radius*.12);context.lineTo(0,-length);context.stroke();context.restore();
    }
    context.beginPath();context.arc(0,0,radius*.045,0,Math.PI*2);context.fillStyle='#168ff8';context.fill();context.restore();
  }
  function controlCenter(context,time) {
    wallpaper(context,360,780,'red',time);status(context);
    text(context,'8:56',24,72,38,'#fff',250);text(context,'Sun, May 26',24,99,14,'rgba(255,255,255,.8)');
    glass(context,22,128,150,86,25,'rgba(170,71,66,.55)');glass(context,185,128,150,86,25,'rgba(170,71,66,.55)');
    text(context,'◉  Wi-Fi',39,163,18,'#fff',500);text(context,'On',39,191,13,'rgba(255,255,255,.65)');text(context,'ᛒ Bluetooth',198,163,16,'#fff',500);text(context,'On',198,191,13,'rgba(255,255,255,.65)');
    glass(context,22,230,194,151,25,'rgba(205,111,91,.35)');text(context,content.song,39,263,15);text(context,'◀    Ⅱ    ▶',52,330,24);
    glass(context,231,230,46,151,24,'rgba(255,255,255,.22)');glass(context,290,230,46,151,24,'rgba(255,255,255,.22)');round(context,231,295,46,86,24,'rgba(255,255,255,.8)');round(context,290,322,46,59,24,'rgba(255,255,255,.8)');
    glass(context,22,397,314,76,22,'rgba(195,105,86,.28)');text(context,'Xiaomi Smart Hub',39,441,17,'#fff',500);
    for(let i=0;i<16;i+=1){const x=52+i%4*78,y=518+Math.floor(i/4)*73;context.beginPath();context.arc(x,y,27,0,Math.PI*2);context.fillStyle=i===0||i===2?'#fff':'rgba(210,133,108,.5)';context.fill();text(context,['◔','♧','✈','▰','◷','▣','⌁','◎','▤','▯','◈','◉'][i%12],x,y+8,24,i===0||i===2?'#2a91ee':'#fff',450,'center');}
  }
  function dialer(context,time) {
    wallpaper(context,360,780,'red',time);status(context);text(context,'26',180,104,47,'#fff',300,'center');text(context,'Add to contacts',180,138,14,'rgba(255,255,255,.7)',400,'center');
    const labels=['1','2','3','4','5','6','7','8','9','*','0','#'];
    labels.forEach((label,i)=>{const x=73+i%3*108,y=238+Math.floor(i/3)*111;glass(context,x-43,y-43,86,86,43,'rgba(238,171,146,.24)');text(context,label,x,y+6,32,'#fff',300,'center');text(context,['','ABC','DEF','GHI','JKL','MNO','PQRS','TUV','WXYZ','','+',''][i],x,y+26,11,'#fff',450,'center');});
    round(context,141,690,78,56,28,'#50d65b');text(context,'⌕',180,728,32,'#fff',600,'center');
  }
  function home(context,variant='yellow',time=0,mode='icons') {
    wallpaper(context,360,780,variant,time);status(context);
    if(mode==='folders'){
      folder(context,19,77,151,180);folder(context,189,82,151,180);
      widget(context,'meeting',21,297,204,66,time);widget(context,'clock',224,287,111,111,time);
      widget(context,'weather',20,418,150,186,time);widget(context,'birthday',190,420,150,186,time);
    }else if(mode==='focus'){
      widget(context,'meeting',21,557,204,66,time);widget(context,'clock',224,547,111,111,time);
    }else if(mode==='widgets'){
      tallTime(context,360,190,false,.75);widget(context,time>33?'sunset':'weather',21,249,154,194,time);folder(context,190,256,150,180);
      ['themes','phone','calculator','messages','settings','folder','camera','browser'].forEach((name,i)=>icon(context,name,22+i%4*85,480+Math.floor(i/4)*88,62));
    }else{
      text(context,'Sunday, May 26',180,99,17,'#fff',400,'center');
      ['themes','calculator','notes','camera','messages','settings','clock','folder','calendar','browser','weather','phone'].forEach((name,i)=>{const x=25+i%4*85,y=161+Math.floor(i/4)*113;icon(context,name,x,y,58);text(context,name[0].toUpperCase()+name.slice(1),x+29,y+79,11,'#fff',450,'center');});
      widget(context,'meeting',22,525,316,65,time);
    }
    ['phone','camera','browser','messages'].forEach((name,i)=>icon(context,name,23+i*85,676,61));round(context,124,759,112,4,2,'rgba(255,255,255,.8)');
  }
  function lockscreen(context,variant,time,notifications=false) {
    wallpaper(context,360,780,variant,time);status(context);text(context,'May 24, Sun',180,93,17,'rgba(255,255,255,.7)',400,'center');tallTime(context,360,249,variant==='pink',.55);
    if(notifications){const progress=clamp((time-11.4)/.6);music(context,21,470+(1-progress)*80,318,progress);glass(context,24,630+(1-progress)*80,312,77,22,'rgba(213,176,205,.45)');icon(context,'themes',37,644,35);text(context,'Themes',82,659,13);text(context,'Experience the new theme',82,680,12,'rgba(255,255,255,.8)');}
    context.strokeStyle='rgba(255,255,255,.75)';context.lineWidth=2;context.beginPath();context.arc(49,732,9,0,Math.PI*2);context.stroke();icon(context,'camera',295,719,28);
  }
  const screen=document.createElement('canvas');screen.width=360;screen.height=780;const context=screen.getContext('2d');
  function renderScreen(mode,variant,time) {
    context.clearRect(0,0,360,780);context.save();context.beginPath();context.roundRect(0,0,360,780,32);context.clip();
    if(mode==='control')controlCenter(context,time);else if(mode==='dialer')dialer(context,time);else if(mode==='home'||mode==='folders'||mode==='widgets'||mode==='focus')home(context,variant,time,mode==='home'?'icons':mode);else lockscreen(context,variant,time,mode==='music');
    context.restore();return screen;
  }
  return {round,text,glass,wallpaper,icon,status,tallTime,music,notifications,folder,widget,clock,controlCenter,dialer,home,lockscreen,renderScreen};
};
