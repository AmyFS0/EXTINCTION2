import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.js';
import { PointerLockControls } from 'https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/controls/PointerLockControls.js';

const $ = s => document.querySelector(s);
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const rand = (a,b)=>Math.random()*(b-a)+a;
const pick = a=>a[Math.floor(Math.random()*a.length)];

const LEVELS = [
  {name:'DEAD CITY',objective:'ASEGURA EL REFUGIO Y SOBREVIVE',fog:0x0a1517,bg:0x061014,ground:0x11191c,sky:0x061014,quota:18,spawn:1.7,theme:'city'},
  {name:'BLACKOUT HOSPITAL',objective:'RECUPERA LOS DATOS MÉDICOS',fog:0x030608,bg:0x020405,ground:0x101214,sky:0x020405,quota:24,spawn:1.45,theme:'hospital'},
  {name:'TOXIC DISTRICT',objective:'CRUZA LA ZONA CONTAMINADA',fog:0x172313,bg:0x0b1209,ground:0x141b12,sky:0x0b1209,quota:30,spawn:1.25,theme:'toxic'},
  {name:'THE UNDERGROUND',objective:'ACTIVA EL TREN DE EMERGENCIA',fog:0x040506,bg:0x020304,ground:0x0e1012,sky:0x020304,quota:36,spawn:1.08,theme:'metro'},
  {name:'GROUND ZERO',objective:'ELIMINA A SUBJECT ZERO',fog:0x13070b,bg:0x080306,ground:0x171015,sky:0x080306,quota:28,spawn:.95,theme:'lab'}
];
const INFECTED = {
  common:{hp:70,speed:1.45,damage:9,scale:1,color:0x6d7c62,head:0x89927b,score:100},
  runner:{hp:48,speed:2.8,damage:7,scale:.9,color:0x756053,head:0x9b7663,score:150},
  brute:{hp:230,speed:.85,damage:18,scale:1.5,color:0x4d5146,head:0x6f7264,score:350},
  screamer:{hp:58,speed:1.25,damage:6,scale:.95,color:0x6a5b72,head:0x9b7fa8,score:220},
  stalker:{hp:52,speed:2.2,damage:12,scale:.82,color:0x2b3133,head:0x50585c,score:250},
  volt:{hp:95,speed:1.5,damage:10,scale:1.05,color:0x394f4f,head:0x4f7070,score:280},
  boss:{hp:1300,speed:1.2,damage:24,scale:2.1,color:0x3a1a21,head:0x5c2835,score:3000}
};

let scene,camera,renderer,controls,clock,raycaster;
let weapon,muzzleFlash,flashLight,ambientLight;
let enemies=[],pickups=[],defenses=[],decor=[];
let running=false,paused=false,levelIndex=0,spawnTimer=0,kills=0,shots=0,hits=0,headshots=0;
let extraction=false,extractTimer=0,levelStart=0,lastKill=0,combo=1,comboKills=0;
let keys={},pointerDown=false;
let state={health:100,armor:0,ammo:30,reserve:150,medkits:1,dna:0,scrap:2,coins:0,score:0,mutation:false,mutationUntil:0,fireRate:0.13,lastShot:0,reloading:false};
const ui={menu:$('#menu'),hud:$('#hud'),pause:$('#pause'),end:$('#missionEnd'),healthBar:$('#healthBar'),healthText:$('#healthText'),armorBar:$('#armorBar'),armorText:$('#armorText'),ammo:$('#ammo'),reserve:$('#reserve'),medkits:$('#medkits'),dna:$('#dna'),scrap:$('#scrap'),coins:$('#coins'),score:$('#score'),combo:$('#combo'),levelName:$('#levelName'),objective:$('#objective'),message:$('#message'),interaction:$('#interaction'),damage:$('#damageVignette'),flash:$('#flash'),boss:$('#bossBar')};

initRenderer();
setupMenu();
animate();

function initRenderer(){
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.08,180);
  camera.position.set(0,1.72,8);
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));
  renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  document.body.insertBefore(renderer.domElement,document.body.firstChild);
  controls=new PointerLockControls(camera,renderer.domElement);
  scene.add(controls.getObject());
  clock=new THREE.Clock();
  raycaster=new THREE.Raycaster();
  raycaster.far=65;
  window.addEventListener('resize',onResize);
  document.addEventListener('keydown',e=>{keys[e.code]=true;hotkey(e.code)});
  document.addEventListener('keyup',e=>keys[e.code]=false);
  document.addEventListener('mousedown',e=>{if(e.button===0){pointerDown=true;if(running&&controls.isLocked)shoot();}});
  document.addEventListener('mouseup',e=>{if(e.button===0)pointerDown=false});
  controls.addEventListener('unlock',()=>{if(running&&!ui.end.classList.contains('hidden'))return;if(running){paused=true;ui.pause.classList.remove('hidden')}});
  controls.addEventListener('lock',()=>{paused=false;ui.pause.classList.add('hidden')});
}

function setupMenu(){
  $('#playBtn').onclick=()=>startGame(0);
  $('#resumeBtn').onclick=()=>controls.lock();
  $('#menuBtn').onclick=()=>returnMenu();
  $('#resultMenuBtn').onclick=()=>returnMenu();
  $('#nextBtn').onclick=()=>{ui.end.classList.add('hidden'); if(levelIndex<LEVELS.length-1) startGame(levelIndex+1); else returnMenu();};
  $('#closePanel').onclick=()=>$('#infoPanel').classList.add('hidden');
  document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>openPanel(b.dataset.panel));
}

function openPanel(type){
  const p=$('#infoPanel'),c=$('#infoContent');
  const data={
    how:`<div class="eyebrow">FIELD MANUAL</div><h2>CÓMO JUGAR</h2><p>Explora, elimina infectados, recoge recursos, fortifica refugios y alcanza la extracción.</p><h3>CONTROLES</h3><p>WASD mover · Mouse mirar · Clic disparar · R recargar · H kit médico · L linterna · Q ADN · E interactuar · B barricada · T torreta · G trampa.</p><h3>SUPERVIVENCIA</h3><p>Los disparos atraen amenazas. Los zombis especiales tienen velocidad, resistencia y patrones distintos. Los headshots hacen daño extra.</p>`,
    levels:`<div class="eyebrow">MISSION MAP</div><h2>5 ZONAS</h2>${LEVELS.map((l,i)=>`<h3>${i+1}. ${l.name}</h3><p>${l.objective}</p>`).join('')}`,
    infected:`<div class="eyebrow">BIOHAZARD INDEX</div><h2>INFECTADOS</h2><p><b>Común:</b> equilibrado. <b>Runner:</b> veloz. <b>Brute:</b> lento y resistente. <b>Screamer:</b> puede acelerar la presión de la horda. <b>Stalker:</b> peligroso en oscuridad. <b>Volt:</b> mutación eléctrica. <b>Subject Zero:</b> jefe final.</p>`,
    loadout:`<div class="eyebrow">ARMORY</div><h2>VX-9 RIFLE</h2><p>Rifle de asalto modular con 30 balas por cargador. El arma se renderiza frente a la cámara, tiene retroceso, fogonazo y dispersión ligera.</p><h3>CONSTRUCCIÓN</h3><p>Recolecta chatarra. B crea barricadas, T torretas automáticas y G trampas eléctricas.</p>`,
    settings:`<div class="eyebrow">SYSTEM</div><h2>CONFIGURACIÓN</h2><p>El juego usa Pointer Lock y WebGL. Para una experiencia fluida usa Chrome, Edge o Firefox recientes. Presiona ESC para liberar el mouse.</p>`
  };
  c.innerHTML=data[type];p.classList.remove('hidden');
}

function startGame(index){
  levelIndex=index; running=true; paused=false; ui.menu.classList.add('hidden');ui.hud.classList.remove('hidden');ui.end.classList.add('hidden');
  resetState(); buildLevel(); controls.lock(); levelStart=performance.now(); showMessage(`NIVEL ${levelIndex+1}\n${LEVELS[levelIndex].name}`,1800); updateHUD();
}

function resetState(){
  state={health:100,armor:0,ammo:30,reserve:150,medkits:1,dna:0,scrap:2,coins:0,score:0,mutation:false,mutationUntil:0,fireRate:.13,lastShot:0,reloading:false};
  enemies=[];pickups=[];defenses=[];decor=[];spawnTimer=0;kills=0;shots=0;hits=0;headshots=0;combo=1;comboKills=0;extraction=false;extractTimer=0;
}

function clearWorld(){
  [...scene.children].forEach(o=>{if(o!==controls.getObject())scene.remove(o)});
  while(camera.children.length)camera.remove(camera.children[0]);
}

function buildLevel(){
  clearWorld(); const L=LEVELS[levelIndex];
  scene.background=new THREE.Color(L.bg); scene.fog=new THREE.FogExp2(L.fog, levelIndex===1?.045:.027);
  ambientLight=new THREE.HemisphereLight(L.sky,0x11100e,levelIndex===1?.28:.62);scene.add(ambientLight);
  const moon=new THREE.DirectionalLight(0xc9e7ff,levelIndex===1?.18:.7);moon.position.set(-8,15,6);moon.castShadow=true;moon.shadow.mapSize.set(1024,1024);scene.add(moon);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(120,120),new THREE.MeshStandardMaterial({color:L.ground,roughness:.93,metalness:.08}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
  buildWeapon();buildEnvironment(L.theme);buildShelter(); camera.position.set(0,1.72,12);
  ui.levelName.textContent=L.name;ui.objective.textContent=L.objective;
}

function buildWeapon(){
  weapon=new THREE.Group();
  const dark=new THREE.MeshStandardMaterial({color:0x161a1c,metalness:.78,roughness:.32});
  const gunmetal=new THREE.MeshStandardMaterial({color:0x30383b,metalness:.88,roughness:.28});
  const neon=new THREE.MeshStandardMaterial({color:0x1b3b34,emissive:0x28ffbf,emissiveIntensity:1.5,metalness:.4});
  const body=new THREE.Mesh(new THREE.BoxGeometry(.24,.22,.72),dark);body.position.set(.32,-.27,-.58);weapon.add(body);
  const top=new THREE.Mesh(new THREE.BoxGeometry(.13,.09,.54),gunmetal);top.position.set(.32,-.14,-.59);weapon.add(top);
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,.66,10),gunmetal);barrel.rotation.x=Math.PI/2;barrel.position.set(.32,-.22,-1.15);weapon.add(barrel);
  const mag=new THREE.Mesh(new THREE.BoxGeometry(.12,.31,.16),dark);mag.rotation.x=-.18;mag.position.set(.31,-.45,-.55);weapon.add(mag);
  const grip=new THREE.Mesh(new THREE.BoxGeometry(.12,.28,.15),dark);grip.rotation.x=-.35;grip.position.set(.32,-.43,-.28);weapon.add(grip);
  const strip=new THREE.Mesh(new THREE.BoxGeometry(.025,.045,.48),neon);strip.position.set(.445,-.18,-.58);weapon.add(strip);
  muzzleFlash=new THREE.PointLight(0xffcc74,0,4,2);muzzleFlash.position.set(.32,-.22,-1.55);weapon.add(muzzleFlash);
  const flashMesh=new THREE.Mesh(new THREE.SphereGeometry(.055,8,8),new THREE.MeshBasicMaterial({color:0xfff0a8}));flashMesh.position.copy(muzzleFlash.position);flashMesh.name='flashMesh';flashMesh.visible=false;weapon.add(flashMesh);
  camera.add(weapon); weapon.position.set(0,0,0);weapon.rotation.set(-.02,.02,0);
  flashLight=new THREE.SpotLight(0xe7fff6,0,28,Math.PI/6,.45,1.3);flashLight.position.set(.1,-.05,-.1);flashLight.target.position.set(0,0,-8);camera.add(flashLight);camera.add(flashLight.target);
}

function mat(color,emissive=0,emi=0){return new THREE.MeshStandardMaterial({color,roughness:.78,metalness:.15,emissive,emissiveIntensity:emi})}
function box(x,y,z,w,h,d,color,emi=0,ei=0){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(color,emi,ei));m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;scene.add(m);decor.push(m);return m}
function light(x,y,z,color,intensity,dist){const l=new THREE.PointLight(color,intensity,dist,2);l.position.set(x,y,z);scene.add(l);decor.push(l);return l}

function buildEnvironment(theme){
  if(theme==='city'){
    for(let i=0;i<26;i++){let side=i%2?1:-1;let z=rand(-48,44);let w=rand(7,12),h=rand(8,25);box(side*rand(13,20),h/2,z,w,h,rand(7,12),pick([0x151a1d,0x1a2024,0x111619]));if(Math.random()<.4) light(side*9,rand(3,8),z,0x62ffd1,.8,10)}
    for(let i=0;i<14;i++){const z=rand(-45,42);box(rand(-5,5),.65,z,rand(1.7,2.3),1.3,rand(3.2,4.5),pick([0x22282a,0x2f2527,0x1c2830]));}
  }else if(theme==='hospital'){
    box(0,4,-18,34,8,1,0x25292d);box(-17,4,0,1,8,38,0x22262a);box(17,4,0,1,8,38,0x22262a);
    for(let z=-14;z<18;z+=8){box(-9,1.1,z,5,2.2,.7,0x343b40);box(9,1.1,z,5,2.2,.7,0x343b40)}
    for(let z=-16;z<18;z+=10)light(rand(-10,10),3.1,z,Math.random()<.3?0xff3150:0x8fe8ff,.7,7);
  }else if(theme==='toxic'){
    for(let i=0;i<18;i++){const x=rand(-20,20),z=rand(-45,35);box(x,rand(2,5),z,rand(3,8),rand(4,10),rand(3,8),pick([0x1b2419,0x202920,0x172017]));if(Math.random()<.5)light(x,1.2,z,0x77ff55,.5,7)}
    for(let i=0;i<12;i++){const c=new THREE.Mesh(new THREE.CylinderGeometry(.7,.8,1.5,12),mat(0x26342a,0x55ff66,.3));c.position.set(rand(-13,13),.75,rand(-38,32));scene.add(c);decor.push(c)}
  }else if(theme==='metro'){
    box(0,3,-6,40,6,1,0x16191b);box(-20,3,-5,1,6,80,0x131517);box(20,3,-5,1,6,80,0x131517);
    for(let z=-45;z<38;z+=8){box(-7,.12,z,1,.08,7,0x393b3d);box(7,.12,z,1,.08,7,0x393b3d);light(0,2.8,z,0xff3d58,.35,6)}
    box(0,.25,-8,3,.45,72,0x0b0c0d);
  }else{
    box(0,4,-22,42,8,1,0x29171c);box(-21,4,-3,1,8,50,0x24151a);box(21,4,-3,1,8,50,0x24151a);
    for(let i=0;i<10;i++){const x=rand(-13,13),z=rand(-36,24);const pod=new THREE.Mesh(new THREE.CylinderGeometry(1.05,1.05,3,16,1,true),new THREE.MeshStandardMaterial({color:0x244340,transparent:true,opacity:.42,emissive:0x35ffca,emissiveIntensity:.15,side:THREE.DoubleSide}));pod.position.set(x,1.5,z);scene.add(pod);decor.push(pod);light(x,1.5,z,0x38ffc7,.5,7)}
  }
  for(let i=0;i<24;i++){const p=new THREE.Mesh(new THREE.PlaneGeometry(rand(.2,.7),rand(.2,.7)),new THREE.MeshBasicMaterial({color:levelIndex===2?0x79ff63:0x75ffdc,transparent:true,opacity:.13,side:THREE.DoubleSide}));p.position.set(rand(-24,24),rand(.2,4),rand(-45,38));p.rotation.set(rand(0,3),rand(0,3),rand(0,3));scene.add(p);decor.push(p)}
}

function buildShelter(){
  const s=new THREE.Group();s.name='shelter';
  const metal=mat(0x263135);const neon=mat(0x1c3a32,0x48ffcf,1);
  [[-4,1,-31],[4,1,-31],[-4,1,-24],[4,1,-24]].forEach(p=>{const post=new THREE.Mesh(new THREE.BoxGeometry(.35,2,.35),metal);post.position.set(...p);s.add(post)});
  const roof=new THREE.Mesh(new THREE.BoxGeometry(8.5,.3,7.5),metal);roof.position.set(0,2.15,-27.5);s.add(roof);
  const sign=new THREE.Mesh(new THREE.BoxGeometry(3,.45,.15),neon);sign.position.set(0,2.6,-23.75);s.add(sign);
  scene.add(s);decor.push(s);light(0,2.2,-27.5,0x5effd0,.9,9);
}

function createZombie(type='common',x=rand(-16,16),z=rand(-38,-8)){
  const d=INFECTED[type],g=new THREE.Group();g.userData={type,hp:d.hp,maxHp:d.hp,speed:d.speed,damage:d.damage,score:d.score,attackCD:0,phase:rand(0,6),dead:false};
  const skin=mat(d.head),cloth=mat(d.color),dark=mat(0x151719),glow=mat(0x233b36,0x47ffca,type==='volt'?2.3:.2);
  const torso=new THREE.Mesh(new THREE.BoxGeometry(.65*d.scale,.85*d.scale,.34*d.scale),cloth);torso.position.y=1.45*d.scale;torso.castShadow=true;g.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.27*d.scale,12,10),skin);head.position.y=2.05*d.scale;head.castShadow=true;head.name='head';g.add(head);
  const jaw=new THREE.Mesh(new THREE.BoxGeometry(.24*d.scale,.1*d.scale,.22*d.scale),skin);jaw.position.set(0,1.9*d.scale,.15*d.scale);g.add(jaw);
  const eyeMat=new THREE.MeshBasicMaterial({color:type==='volt'?0x5dffff:type==='boss'?0xff3152:0xff5c45});
  [-.09,.09].forEach(ex=>{const e=new THREE.Mesh(new THREE.SphereGeometry(.022*d.scale,6,6),eyeMat);e.position.set(ex*d.scale,2.08*d.scale,-.245*d.scale);g.add(e)});
  if(type==='volt'||type==='boss'){const core=new THREE.Mesh(new THREE.SphereGeometry(.09*d.scale,8,8),glow);core.position.set(0,1.48*d.scale,-.2*d.scale);g.add(core)}
  const limbs=[];
  for(const side of [-1,1]){const arm=new THREE.Group();const a=new THREE.Mesh(new THREE.BoxGeometry(.18*d.scale,.75*d.scale,.18*d.scale),skin);a.position.y=-.33*d.scale;arm.position.set(side*.43*d.scale,1.72*d.scale,0);arm.add(a);g.add(arm);limbs.push(arm);const leg=new THREE.Group();const l=new THREE.Mesh(new THREE.BoxGeometry(.22*d.scale,.85*d.scale,.25*d.scale),dark);l.position.y=-.38*d.scale;leg.position.set(side*.2*d.scale,.95*d.scale,0);leg.add(l);g.add(leg);limbs.push(leg)}
  g.userData.limbs=limbs;g.position.set(x,0,z);g.rotation.y=rand(0,Math.PI*2);g.traverse(o=>{if(o.isMesh){o.userData.owner=g;o.castShadow=true}});scene.add(g);enemies.push(g);
  if(type==='boss'){ui.boss.classList.remove('hidden');ui.boss.querySelector('i').style.width='100%'}
  return g;
}

function spawnEnemy(){
  if(!running||paused||extraction)return; const L=LEVELS[levelIndex];
  if(kills>=L.quota){if(levelIndex===4&&!enemies.some(e=>e.userData.type==='boss'))createZombie('boss',0,-34);return}
  const pool=levelIndex===0?['common','common','runner']:levelIndex===1?['common','runner','stalker','screamer']:levelIndex===2?['common','runner','brute','volt']:levelIndex===3?['common','runner','stalker','brute','screamer']:['common','runner','brute','volt','stalker','screamer'];
  const ang=rand(0,Math.PI*2),r=rand(18,34),px=camera.position.x+Math.cos(ang)*r,pz=camera.position.z+Math.sin(ang)*r;createZombie(pick(pool),clamp(px,-22,22),clamp(pz,-48,35));
}

function shoot(){
  const t=performance.now()/1000;if(state.reloading||state.ammo<=0){if(state.ammo<=0)reload();return}if(t-state.lastShot<state.fireRate*(state.mutation?.62:1))return;
  state.lastShot=t;state.ammo--;shots++;weapon.position.z=.08;weapon.rotation.x=-.08;const fm=weapon.getObjectByName('flashMesh');fm.visible=true;muzzleFlash.intensity=2.8;setTimeout(()=>{if(fm)fm.visible=false;muzzleFlash.intensity=0},45);beep(170,.025,.055);
  raycaster.setFromCamera(new THREE.Vector2(rand(-.007,.007),rand(-.007,.007)),camera);
  const targets=[];enemies.forEach(e=>e.traverse(o=>{if(o.isMesh)targets.push(o)}));const hit=raycaster.intersectObjects(targets,false)[0];
  if(hit){hits++;const owner=hit.object.userData.owner;const isHead=hit.object.name==='head';damageEnemy(owner,isHead?(state.mutation?120:92):(state.mutation?64:44),isHead);impactEffect(hit.point,isHead)}
  updateHUD();
}

function damageEnemy(e,dmg,isHead=false){if(!e||e.userData.dead)return;e.userData.hp-=dmg;if(isHead)headshots++; if(e.userData.type==='boss')ui.boss.querySelector('i').style.width=`${clamp(e.userData.hp/e.userData.maxHp*100,0,100)}%`;
  e.rotation.z+=rand(-.04,.04); if(e.userData.hp<=0)killEnemy(e,isHead);
}

function killEnemy(e,isHead){e.userData.dead=true;kills++;const now=performance.now();if(now-lastKill<2600){comboKills++;combo=Math.min(16,1+Math.floor(comboKills/2))}else{comboKills=0;combo=1}lastKill=now;
  state.score+=Math.round(e.userData.score*combo*(isHead?1.35:1));state.coins+=Math.ceil(e.userData.score/100);showMessage(isHead?'HEADSHOT':'INFECTADO ELIMINADO',500);
  if(Math.random()<.48)dropPickup(e.position.clone());
  if(e.userData.type==='boss'){ui.boss.classList.add('hidden');setTimeout(()=>startExtraction(),650)}
  scene.remove(e);enemies=enemies.filter(x=>x!==e);updateHUD();
  if(levelIndex<4&&kills>=LEVELS[levelIndex].quota&&enemies.length===0)startExtraction();
}

function impactEffect(pos,head){const s=new THREE.Mesh(new THREE.SphereGeometry(head?.045:.03,6,6),new THREE.MeshBasicMaterial({color:head?0xff5b68:0xffd18b}));s.position.copy(pos);scene.add(s);setTimeout(()=>scene.remove(s),90)}

function dropPickup(pos){
  const type=pick(['ammo','ammo','medkit','coin','dna','scrap','armor']),colors={ammo:0xffd36b,medkit:0xff5068,coin:0xffe46e,dna:0x63ffd4,scrap:0xa9b2b0,armor:0x72a8ff};
  const g=new THREE.Group(),core=new THREE.Mesh(new THREE.OctahedronGeometry(.23),new THREE.MeshStandardMaterial({color:colors[type],emissive:colors[type],emissiveIntensity:1.25,metalness:.3}));g.add(core);const ring=new THREE.Mesh(new THREE.TorusGeometry(.34,.025,8,20),new THREE.MeshBasicMaterial({color:colors[type]}));ring.rotation.x=Math.PI/2;g.add(ring);g.position.copy(pos);g.position.y=.65;g.userData={type,baseY:.65,phase:rand(0,6)};scene.add(g);pickups.push(g);
}

function collectPickup(p){switch(p.userData.type){case'ammo':state.reserve+=45;break;case'medkit':state.medkits++;break;case'coin':state.coins+=8;break;case'dna':state.dna++;break;case'scrap':state.scrap+=2;break;case'armor':state.armor=Math.min(100,state.armor+45);break}beep(520,.06,.03);scene.remove(p);pickups=pickups.filter(x=>x!==p);updateHUD()}

function updateEnemies(dt,time){
  for(const e of [...enemies]){if(e.userData.dead)continue;const dx=camera.position.x-e.position.x,dz=camera.position.z-e.position.z,dist=Math.hypot(dx,dz);e.rotation.y=Math.atan2(dx,dz);let speed=e.userData.speed;
    if(e.userData.type==='stalker'&&flashLight.intensity>0&&dist<12)speed*=.4;
    if(e.userData.type==='runner')speed*=1+Math.sin(time*5+e.userData.phase)*.08;
    if(dist>1.45*e.userData.scale){e.position.x+=dx/dist*speed*dt;e.position.z+=dz/dist*speed*dt}else{e.userData.attackCD-=dt;if(e.userData.attackCD<=0){hurtPlayer(e.userData.damage);e.userData.attackCD=e.userData.type==='runner'?.7:1.05}}
    const walk=Math.sin(time*(e.userData.type==='runner'?11:6)+e.userData.phase);const [la,ll,ra,rl]=e.userData.limbs;la.rotation.x=walk*.7;ra.rotation.x=-walk*.7;ll.rotation.x=-walk*.6;rl.rotation.x=walk*.6;e.position.y=Math.abs(Math.sin(time*5+e.userData.phase))*.025;
    if(e.userData.type==='screamer'&&dist<14&&Math.sin(time*.9+e.userData.phase)>.995){spawnTimer=Math.max(spawnTimer-.6,0);showMessage('SCREAMER — HORDA ALERTADA',700)}
  }
}

function hurtPlayer(amount){let dmg=amount;if(state.armor>0){const block=Math.min(state.armor,dmg*.65);state.armor-=block;dmg-=block}state.health-=dmg;ui.damage.style.opacity='.8';setTimeout(()=>ui.damage.style.opacity='0',150);beep(78,.08,.08);updateHUD();if(state.health<=0)endMission(false)}

function updateMovement(dt,time){if(!controls.isLocked)return;let f=(keys.KeyW?1:0)-(keys.KeyS?1:0),s=(keys.KeyD?1:0)-(keys.KeyA?1:0);if(f||s){const len=Math.hypot(f,s);f/=len;s/=len;const speed=state.mutation?7.2:5.2;controls.moveForward(f*speed*dt);controls.moveRight(s*speed*dt);camera.position.x=clamp(camera.position.x,-24,24);camera.position.z=clamp(camera.position.z,-50,40);camera.position.y=1.72+Math.sin(time*10)*.025;weapon.position.y=-Math.abs(Math.sin(time*10))*.014}else weapon.position.y+=(0-weapon.position.y)*.16;
  weapon.position.z+=(0-weapon.position.z)*.18;weapon.rotation.x+=(0-weapon.rotation.x)*.18;
}

function updatePickups(dt,time){for(const p of [...pickups]){p.rotation.y+=dt*1.7;p.position.y=p.userData.baseY+Math.sin(time*2.5+p.userData.phase)*.12;if(p.position.distanceTo(camera.position)<1.35)collectPickup(p)}}

function updateDefenses(dt){
  for(const d of defenses){if(d.userData.type==='turret'){d.userData.cd-=dt;let target=enemies.filter(e=>!e.userData.dead).sort((a,b)=>a.position.distanceTo(d.position)-b.position.distanceTo(d.position))[0];if(target&&target.position.distanceTo(d.position)<15){d.lookAt(target.position.x,d.position.y,target.position.z);if(d.userData.cd<=0){damageEnemy(target,18,false);d.userData.cd=.28}}}else if(d.userData.type==='trap'){for(const e of enemies){if(e.position.distanceTo(d.position)<2.2){damageEnemy(e,25*dt,false);e.userData.speed=Math.max(.5,INFECTED[e.userData.type].speed*.55)}}}}
}

function buildDefense(type){if(!running||!controls.isLocked)return;const costs={barricade:1,turret:3,trap:2};if(state.scrap<costs[type]){showMessage('CHATARRA INSUFICIENTE',650);return}state.scrap-=costs[type];const dir=new THREE.Vector3();camera.getWorldDirection(dir);const pos=camera.position.clone().add(dir.multiplyScalar(3));pos.y=0;
  let obj;if(type==='barricade'){obj=new THREE.Group();for(let i=0;i<4;i++){const plank=new THREE.Mesh(new THREE.BoxGeometry(3,.22,.18),mat(0x584132));plank.position.y=.45+i*.38;plank.rotation.z=rand(-.08,.08);obj.add(plank)}}else if(type==='turret'){obj=new THREE.Group();const base=new THREE.Mesh(new THREE.CylinderGeometry(.35,.5,.25,10),mat(0x323b3e));base.position.y=.2;obj.add(base);const gun=new THREE.Mesh(new THREE.BoxGeometry(.22,.22,.9),mat(0x1c2325,0x44ffd0,.35));gun.position.set(0,.65,-.2);obj.add(gun);obj.userData.cd=0}else{obj=new THREE.Group();const ring=new THREE.Mesh(new THREE.TorusGeometry(1.2,.055,8,30),new THREE.MeshBasicMaterial({color:0x67d9ff}));ring.rotation.x=Math.PI/2;ring.position.y=.05;obj.add(ring);const node=new THREE.Mesh(new THREE.CylinderGeometry(.18,.22,.3,8),mat(0x293b43,0x4fd6ff,1.5));node.position.y=.15;obj.add(node)}
  obj.position.copy(pos);obj.userData.type=type;scene.add(obj);defenses.push(obj);updateHUD();showMessage(type==='barricade'?'BARRICADA CONSTRUIDA':type==='turret'?'TORRETA ACTIVA':'TRAMPA ELÉCTRICA ACTIVA',700)
}

function hotkey(code){if(!running)return;if(code==='KeyR')reload();if(code==='KeyH')useMedkit();if(code==='KeyL'){flashLight.intensity=flashLight.intensity>0?0:3.4;showMessage(flashLight.intensity?'LINTERNA ACTIVADA':'LINTERNA APAGADA',450)}if(code==='KeyQ')useDNA();if(code==='KeyB')buildDefense('barricade');if(code==='KeyT')buildDefense('turret');if(code==='KeyG')buildDefense('trap');if(code==='KeyE'&&kills>=LEVELS[levelIndex].quota&&!extraction&&levelIndex<4)startExtraction()}

function reload(){if(state.reloading||state.ammo>=30||state.reserve<=0)return;state.reloading=true;showMessage('RECARGANDO...',650);setTimeout(()=>{const need=30-state.ammo,take=Math.min(need,state.reserve);state.ammo+=take;state.reserve-=take;state.reloading=false;updateHUD()},850)}
function useMedkit(){if(state.medkits<=0||state.health>=100)return;state.medkits--;state.health=Math.min(100,state.health+45);showMessage('KIT MÉDICO UTILIZADO',600);updateHUD()}
function useDNA(){if(state.dna<=0||state.mutation)return;state.dna--;state.mutation=true;state.mutationUntil=performance.now()+9000;showMessage('MUTACIÓN E-X ACTIVA\nVELOCIDAD + DAÑO',900);updateHUD()}

function startExtraction(){if(extraction)return;extraction=true;extractTimer=18;ui.objective.textContent='RESISTE HASTA LA EXTRACCIÓN';showMessage('EXTRACCIÓN INICIADA\n18 SEGUNDOS',1000);for(let i=0;i<8;i++)setTimeout(()=>spawnEnemyForced(),i*650)}
function spawnEnemyForced(){if(!running)return;const a=rand(0,Math.PI*2),r=rand(16,24);createZombie(pick(levelIndex>2?['common','runner','brute','volt']:['common','runner']),clamp(camera.position.x+Math.cos(a)*r,-22,22),clamp(camera.position.z+Math.sin(a)*r,-48,34))}

function updateObjective(dt){if(state.mutation&&performance.now()>state.mutationUntil){state.mutation=false;showMessage('MUTACIÓN FINALIZADA',500)}if(extraction){extractTimer-=dt;ui.objective.textContent=`EXTRACCIÓN EN ${Math.max(0,extractTimer).toFixed(1)}s`;if(extractTimer<=0)endMission(true)}else if(levelIndex===4&&kills>=LEVELS[levelIndex].quota&&!enemies.some(e=>e.userData.type==='boss')){createZombie('boss',0,-34);ui.objective.textContent='ELIMINA A SUBJECT ZERO'} }

function updateInteraction(){if(!running)return;const nearShelter=camera.position.distanceTo(new THREE.Vector3(0,1.7,-27))<5;ui.interaction.textContent=nearShelter&&!extraction?'REFUGIO ASEGURADO · B Barricada · T Torreta · G Trampa':''}

function endMission(success){running=false;controls.unlock();ui.hud.classList.add('hidden');ui.pause.classList.add('hidden');ui.end.classList.remove('hidden');const elapsed=(performance.now()-levelStart)/1000;const accuracy=shots?Math.round(hits/shots*100):0;$('#resultTitle').textContent=success?'EXTRACTION SUCCESSFUL':'MISSION FAILED';$('#resultStats').innerHTML=`<div class="rstat"><span>PUNTUACIÓN</span><b>${state.score.toLocaleString()}</b></div><div class="rstat"><span>ELIMINADOS</span><b>${kills}</b></div><div class="rstat"><span>PRECISIÓN</span><b>${accuracy}%</b></div><div class="rstat"><span>HEADSHOTS</span><b>${headshots}</b></div><div class="rstat"><span>MEJOR COMBO</span><b>x${combo}</b></div><div class="rstat"><span>TIEMPO</span><b>${elapsed.toFixed(1)}s</b></div>`;$('#nextBtn').textContent=levelIndex<4?'SIGUIENTE NIVEL':'FINALIZAR CAMPAÑA';}

function returnMenu(){running=false;paused=false;ui.end.classList.add('hidden');ui.pause.classList.add('hidden');ui.hud.classList.add('hidden');ui.menu.classList.remove('hidden');if(controls.isLocked)controls.unlock();clearWorld();}

function updateHUD(){ui.healthBar.style.width=`${clamp(state.health,0,100)}%`;ui.healthText.textContent=Math.ceil(state.health);ui.armorBar.style.width=`${clamp(state.armor,0,100)}%`;ui.armorText.textContent=Math.ceil(state.armor);ui.ammo.textContent=state.ammo;ui.reserve.textContent=state.reserve;ui.medkits.textContent=state.medkits;ui.dna.textContent=state.dna;ui.scrap.textContent=state.scrap;ui.coins.textContent=state.coins;ui.score.textContent=String(state.score).padStart(6,'0');ui.combo.textContent=`x${combo}`}

let msgTimer;function showMessage(text,ms=700){clearTimeout(msgTimer);ui.message.textContent=text;ui.message.style.opacity='1';msgTimer=setTimeout(()=>ui.message.style.opacity='0',ms)}
function beep(freq,dur=.04,vol=.03){try{const A=beep.ctx||(beep.ctx=new (window.AudioContext||window.webkitAudioContext)());const o=A.createOscillator(),g=A.createGain();o.type='sawtooth';o.frequency.value=freq;g.gain.value=vol;o.connect(g);g.connect(A.destination);o.start();g.gain.exponentialRampToValueAtTime(.0001,A.currentTime+dur);o.stop(A.currentTime+dur)}catch{}}

function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.05),time=performance.now()/1000;if(running&&!paused){updateMovement(dt,time);updateEnemies(dt,time);updatePickups(dt,time);updateDefenses(dt);updateObjective(dt);updateInteraction();spawnTimer-=dt;if(spawnTimer<=0&&!extraction&&enemies.length<14){spawnEnemy();spawnTimer=LEVELS[levelIndex].spawn}if(pointerDown&&controls.isLocked)shoot();}
  for(const d of decor){if(d.isMesh&&d.geometry?.type==='PlaneGeometry')d.rotation.y+=dt*.03}
  renderer.render(scene,camera);
}

function onResize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)}
