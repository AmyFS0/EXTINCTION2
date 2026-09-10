import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.js';
import { PointerLockControls } from 'https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/controls/PointerLockControls.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => Math.random() * (b - a) + a;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const LEVELS = [
  {name:'DEAD CITY', objective:'ASEGURA EL REFUGIO Y SOBREVIVE', fog:0x1b3137, bg:0x12242b, ground:0x202b2f, sky:0x314a55, quota:18, spawn:1.75, theme:'city'},
  {name:'BLACKOUT HOSPITAL', objective:'RECUPERA LOS DATOS MÉDICOS', fog:0x182329, bg:0x111a20, ground:0x202428, sky:0x293942, quota:24, spawn:1.5, theme:'hospital'},
  {name:'TOXIC DISTRICT', objective:'CRUZA LA ZONA CONTAMINADA', fog:0x273928, bg:0x182719, ground:0x273128, sky:0x38523a, quota:30, spawn:1.3, theme:'toxic'},
  {name:'THE UNDERGROUND', objective:'ACTIVA EL TREN DE EMERGENCIA', fog:0x171d22, bg:0x10161b, ground:0x20262b, sky:0x27323b, quota:36, spawn:1.12, theme:'metro'},
  {name:'GROUND ZERO', objective:'ELIMINA A SUBJECT ZERO', fog:0x321b24, bg:0x21131a, ground:0x2b2025, sky:0x4a2b38, quota:28, spawn:1.0, theme:'lab'}
];

const INFECTED = {
  common:{hp:70,speed:1.42,damage:8,scale:1,color:0x697863,head:0x929b83,score:100,range:1.08,windup:.48,cooldown:1.35},
  runner:{hp:48,speed:2.65,damage:6,scale:.9,color:0x765f54,head:0xa17b68,score:150,range:1.0,windup:.34,cooldown:1.0},
  brute:{hp:230,speed:.82,damage:16,scale:1.5,color:0x555b4e,head:0x777b6d,score:350,range:1.55,windup:.72,cooldown:1.7},
  screamer:{hp:58,speed:1.2,damage:5,scale:.95,color:0x705f78,head:0xa789b3,score:220,range:1.02,windup:.55,cooldown:1.45},
  stalker:{hp:52,speed:2.0,damage:10,scale:.82,color:0x394247,head:0x606a70,score:250,range:.96,windup:.4,cooldown:1.2},
  volt:{hp:95,speed:1.45,damage:9,scale:1.05,color:0x40595a,head:0x5f8585,score:280,range:1.12,windup:.5,cooldown:1.35},
  boss:{hp:1300,speed:1.05,damage:20,scale:2.1,color:0x542932,head:0x7c3b49,score:3000,range:2.05,windup:.85,cooldown:2.0}
};

let scene, camera, renderer, controls, clock, raycaster, losRaycaster;
let weapon, muzzleFlash, flashLight, ambientLight;
let enemies = [], pickups = [], defenses = [], decor = [], solidMeshes = [];
let running = false, paused = false, levelIndex = 0, spawnTimer = 0, kills = 0, shots = 0, hits = 0, headshots = 0;
let extraction = false, extractTimer = 0, levelStart = 0, lastKill = 0, combo = 1, comboKills = 0;
let keys = {}, pointerDown = false, bossSpawned = false;
let state = {};

const ui = {
  menu:$('#menu'), hud:$('#hud'), pause:$('#pause'), end:$('#missionEnd'),
  healthBar:$('#healthBar'), healthText:$('#healthText'), armorBar:$('#armorBar'), armorText:$('#armorText'),
  ammo:$('#ammo'), reserve:$('#reserve'), medkits:$('#medkits'), dna:$('#dna'), scrap:$('#scrap'), coins:$('#coins'),
  score:$('#score'), combo:$('#combo'), levelName:$('#levelName'), objective:$('#objective'), message:$('#message'),
  interaction:$('#interaction'), damage:$('#damageVignette'), flash:$('#flash'), boss:$('#bossBar')
};

initRenderer();
setupMenu();
animate();

function freshState(){
  return {
    health:100, armor:0, ammo:30, reserve:150, medkits:1, dna:0, scrap:2, coins:0, score:0,
    mutation:false, mutationUntil:0, fireRate:.13, lastShot:0, reloading:false,
    invulnUntil:0, spawnGraceUntil:0
  };
}

function initRenderer(){
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, .08, 190);
  camera.position.set(0, 1.72, 12);
  renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;
  document.body.insertBefore(renderer.domElement, document.body.firstChild);

  controls = new PointerLockControls(camera, renderer.domElement);
  scene.add(camera);
  clock = new THREE.Clock();
  raycaster = new THREE.Raycaster();
  raycaster.far = 70;
  losRaycaster = new THREE.Raycaster();

  window.addEventListener('resize', onResize);
  document.addEventListener('keydown', (e) => { keys[e.code] = true; hotkey(e.code); });
  document.addEventListener('keyup', (e) => { keys[e.code] = false; });
  document.addEventListener('mousedown', (e) => {
    if(e.button === 0){
      pointerDown = true;
      if(running && controls.isLocked && !paused) shoot();
    }
  });
  document.addEventListener('mouseup', (e) => { if(e.button === 0) pointerDown = false; });

  controls.addEventListener('unlock', () => {
    if(running && !ui.end.classList.contains('hidden')) return;
    if(running){ paused = true; ui.pause.classList.remove('hidden'); }
  });
  controls.addEventListener('lock', () => { paused = false; ui.pause.classList.add('hidden'); });
}

function setupMenu(){
  $('#playBtn').onclick = () => startGame(0);
  $('#resumeBtn').onclick = () => controls.lock();
  $('#menuBtn').onclick = () => returnMenu();
  $('#resultMenuBtn').onclick = () => returnMenu();
  $('#nextBtn').onclick = () => {
    ui.end.classList.add('hidden');
    if(levelIndex < LEVELS.length - 1) startGame(levelIndex + 1);
    else returnMenu();
  };
  $('#closePanel').onclick = () => $('#infoPanel').classList.add('hidden');
  document.querySelectorAll('[data-panel]').forEach((b) => b.onclick = () => openPanel(b.dataset.panel));
}

function openPanel(type){
  const p = $('#infoPanel'), c = $('#infoContent');
  const data = {
    how:`<div class="eyebrow">FIELD MANUAL</div><h2>CÓMO JUGAR</h2><p>Explora, elimina infectados, recoge recursos, fortifica refugios y alcanza la extracción.</p><h3>CONTROLES</h3><p>WASD mover · Mouse mirar · Clic disparar · R recargar · H kit médico · L linterna · Q ADN · E interactuar · B barricada · T torreta · G trampa.</p><h3>ATAQUES JUSTOS</h3><p>Los infectados ahora deben acercarse, preparar su ataque y continuar dentro de alcance para poder dañarte. Tras recibir un golpe tienes un breve periodo de protección.</p>`,
    levels:`<div class="eyebrow">MISSION MAP</div><h2>5 ZONAS</h2>${LEVELS.map((l,i)=>`<h3>${i+1}. ${l.name}</h3><p>${l.objective}</p>`).join('')}`,
    infected:`<div class="eyebrow">BIOHAZARD INDEX</div><h2>INFECTADOS</h2><p><b>Común:</b> equilibrado. <b>Runner:</b> veloz. <b>Brute:</b> lento y resistente. <b>Screamer:</b> alerta hordas. <b>Stalker:</b> evita la luz. <b>Volt:</b> mutación eléctrica. <b>Subject Zero:</b> jefe final.</p>`,
    loadout:`<div class="eyebrow">ARMORY</div><h2>VX-9 RIFLE</h2><p>Rifle ficticio del juego con cargador de 30. El modelo aparece frente a la cámara, con retroceso y fogonazo visual.</p><h3>CONSTRUCCIÓN</h3><p>B crea barricadas, T torretas automáticas y G trampas eléctricas usando chatarra.</p>`,
    settings:`<div class="eyebrow">SYSTEM</div><h2>CONFIGURACIÓN</h2><p>La iluminación fue elevada para mantener el ambiente nocturno sin ocultar enemigos. La linterna comienza encendida y puedes alternarla con L.</p>`
  };
  c.innerHTML = data[type];
  p.classList.remove('hidden');
}

function startGame(index){
  levelIndex = index;
  running = true;
  paused = false;
  ui.menu.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  ui.end.classList.add('hidden');
  ui.boss.classList.add('hidden');
  resetState();
  buildLevel();
  controls.lock();
  levelStart = performance.now();
  state.spawnGraceUntil = performance.now() + 4000;
  showMessage(`NIVEL ${levelIndex + 1}\n${LEVELS[levelIndex].name}`, 1800);
  updateHUD();
}

function resetState(){
  state = freshState();
  enemies = [];
  pickups = [];
  defenses = [];
  decor = [];
  solidMeshes = [];
  spawnTimer = .5;
  kills = 0;
  shots = 0;
  hits = 0;
  headshots = 0;
  combo = 1;
  comboKills = 0;
  extraction = false;
  extractTimer = 0;
  bossSpawned = false;
}

function clearWorld(){
  while(scene.children.length) scene.remove(scene.children[0]);
  while(camera.children.length) camera.remove(camera.children[0]);
  scene.add(camera);
}

function buildLevel(){
  clearWorld();
  const L = LEVELS[levelIndex];
  scene.background = new THREE.Color(L.bg);
  const fogDensity = levelIndex === 1 ? .020 : levelIndex === 3 ? .018 : .014;
  scene.fog = new THREE.FogExp2(L.fog, fogDensity);

  ambientLight = new THREE.HemisphereLight(L.sky, 0x25221f, levelIndex === 1 ? 1.05 : 1.35);
  scene.add(ambientLight);

  const moon = new THREE.DirectionalLight(0xd9f1ff, levelIndex === 1 ? .9 : 1.35);
  moon.position.set(-8, 16, 7);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -30;
  moon.shadow.camera.right = 30;
  moon.shadow.camera.top = 30;
  moon.shadow.camera.bottom = -30;
  scene.add(moon);

  const fill = new THREE.DirectionalLight(0x7ca8ff, .42);
  fill.position.set(12, 7, -12);
  scene.add(fill);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120,120),
    new THREE.MeshStandardMaterial({color:L.ground, roughness:.9, metalness:.06})
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  buildWeapon();
  buildEnvironment(L.theme);
  buildShelter();
  camera.position.set(0, 1.72, 12);
  ui.levelName.textContent = L.name;
  ui.objective.textContent = L.objective;
}

function buildWeapon(){
  weapon = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({color:0x22272a, metalness:.72, roughness:.3});
  const gunmetal = new THREE.MeshStandardMaterial({color:0x465157, metalness:.82, roughness:.26});
  const neon = new THREE.MeshStandardMaterial({color:0x24473f, emissive:0x28ffbf, emissiveIntensity:1.8, metalness:.35});

  const body = new THREE.Mesh(new THREE.BoxGeometry(.24,.22,.72), dark);
  body.position.set(.32,-.27,-.58); weapon.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(.13,.09,.54), gunmetal);
  top.position.set(.32,-.14,-.59); weapon.add(top);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,.66,10), gunmetal);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(.32,-.22,-1.15); weapon.add(barrel);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(.12,.31,.16), dark);
  mag.rotation.x = -.18; mag.position.set(.31,-.45,-.55); weapon.add(mag);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(.12,.28,.15), dark);
  grip.rotation.x = -.35; grip.position.set(.32,-.43,-.28); weapon.add(grip);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(.025,.045,.48), neon);
  strip.position.set(.445,-.18,-.58); weapon.add(strip);

  muzzleFlash = new THREE.PointLight(0xffd27a, 0, 4, 2);
  muzzleFlash.position.set(.32,-.22,-1.55); weapon.add(muzzleFlash);
  const flashMesh = new THREE.Mesh(new THREE.SphereGeometry(.055,8,8), new THREE.MeshBasicMaterial({color:0xfff0a8}));
  flashMesh.position.copy(muzzleFlash.position); flashMesh.name = 'flashMesh'; flashMesh.visible = false; weapon.add(flashMesh);

  camera.add(weapon);
  weapon.position.set(0,0,0);

  flashLight = new THREE.SpotLight(0xf2fff9, 4.2, 36, Math.PI/5.2, .42, 1.15);
  flashLight.position.set(.08,-.04,-.1);
  flashLight.target.position.set(0,-.15,-10);
  flashLight.castShadow = false;
  camera.add(flashLight);
  camera.add(flashLight.target);
}

function mat(color, emissive=0, emi=0){
  return new THREE.MeshStandardMaterial({color, roughness:.72, metalness:.14, emissive, emissiveIntensity:emi});
}

function box(x,y,z,w,h,d,color,emi=0,ei=0,solid=true){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat(color,emi,ei));
  m.position.set(x,y,z);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  decor.push(m);
  if(solid) solidMeshes.push(m);
  return m;
}

function light(x,y,z,color,intensity,dist){
  const l = new THREE.PointLight(color,intensity,dist,2);
  l.position.set(x,y,z);
  scene.add(l);
  decor.push(l);
  return l;
}

function addLamp(x,z,color=0xa6e8ff){
  box(x,1.5,z,.12,3,.12,0x30383d,0,0,false);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.13,8,8), new THREE.MeshBasicMaterial({color}));
  lamp.position.set(x,3,z); scene.add(lamp); decor.push(lamp);
  light(x,2.8,z,color,1.5,13);
}

function buildEnvironment(theme){
  if(theme === 'city'){
    for(let i=0;i<24;i++){
      const side = i%2 ? 1 : -1, z = rand(-48,42), w = rand(7,11), h = rand(8,22);
      box(side*rand(14,20), h/2, z, w,h,rand(7,11),pick([0x242c30,0x2a3236,0x20272b]));
    }
    for(let z=-42;z<36;z+=12) addLamp((Math.floor(z/12)%2?6:-6),z,0xa6e8ff);
    for(let i=0;i<10;i++) box(rand(-5,5),.65,rand(-42,35),rand(1.7,2.3),1.3,rand(3.1,4.2),pick([0x384145,0x493438,0x32414a]));
  } else if(theme === 'hospital'){
    box(0,4,-18,34,8,1,0x394045);
    box(-17,4,0,1,8,38,0x363d42);
    box(17,4,0,1,8,38,0x363d42);
    for(let z=-14;z<18;z+=8){
      box(-9,1.1,z,5,2.2,.7,0x475157);
      box(9,1.1,z,5,2.2,.7,0x475157);
      light(0,3.1,z,z%16===0?0xff6a7d:0xb6ecff,1.25,10);
    }
    for(let z=-18;z<20;z+=6){
      const ceiling = new THREE.Mesh(new THREE.BoxGeometry(2.2,.06,.15),new THREE.MeshBasicMaterial({color:0xc9f2ff}));
      ceiling.position.set(0,3.55,z);scene.add(ceiling);decor.push(ceiling);
    }
  } else if(theme === 'toxic'){
    for(let i=0;i<17;i++){
      const x=rand(-20,20),z=rand(-45,35);
      box(x,rand(2.5,5),z,rand(3,7),rand(5,10),rand(3,7),pick([0x2b392b,0x334234,0x263527]));
      if(Math.random()<.65) light(x,1.4,z,0x9cff73,1.05,9);
    }
    for(let z=-40;z<34;z+=14) addLamp(z%28===0?-7:7,z,0xafff8e);
  } else if(theme === 'metro'){
    box(-12,3,-8,1,6,80,0x343a40);
    box(12,3,-8,1,6,80,0x343a40);
    for(let z=-44;z<36;z+=8){
      box(-5,.12,z,1,.24,7,0x545b5e,0,0,false);
      box(5,.12,z,1,.24,7,0x545b5e,0,0,false);
      light(0,3.3,z,0xd2edff,1.15,10);
    }
    box(-5,.18,-8,.14,.16,86,0x9b8b6b,0,0,false);
    box(5,.18,-8,.14,.16,86,0x9b8b6b,0,0,false);
  } else {
    box(0,4,-26,38,8,1,0x49353d);
    box(-19,4,-5,1,8,42,0x44333a);
    box(19,4,-5,1,8,42,0x44333a);
    for(let z=-22;z<18;z+=8){
      box(-8,1,z,3.2,2,.7,0x4b5157,0x174a46,.35);
      box(8,1,z,3.2,2,.7,0x4b5157,0x4a1725,.25);
      light(0,3,z,z%16===0?0xff647d:0x62ffd1,1.2,10);
    }
  }
}

function buildShelter(){
  const s = new THREE.Group();
  const wallMat = mat(0x415057);
  const neon = new THREE.MeshStandardMaterial({color:0x264b43, emissive:0x5effd0, emissiveIntensity:1.9});
  const back = new THREE.Mesh(new THREE.BoxGeometry(9,3.8,.35),wallMat); back.position.set(0,1.9,-24); s.add(back);
  const left = new THREE.Mesh(new THREE.BoxGeometry(.35,3.8,7),wallMat); left.position.set(-4.35,1.9,-20.5); s.add(left);
  const right = left.clone(); right.position.x = 4.35; s.add(right);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(3,.45,.15),neon); sign.position.set(0,2.6,-23.75); s.add(sign);
  s.position.x = 0;
  scene.add(s); decor.push(s);
  s.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;solidMeshes.push(o)}});
  light(0,2.3,-27.2,0x5effd0,1.8,12);
}

function createZombie(type='common', x=rand(-16,16), z=rand(-38,-10)){
  const d = INFECTED[type];
  const g = new THREE.Group();
  g.userData = {
    type, hp:d.hp, maxHp:d.hp, speed:d.speed, damage:d.damage, score:d.score,
    scale:d.scale, range:d.range, windup:d.windup, cooldown:d.cooldown,
    attackCD:rand(.35,.9), attackWindup:0, attacking:false, attackDidHit:false,
    phase:rand(0,6), dead:false
  };

  const skin=mat(d.head), cloth=mat(d.color), dark=mat(0x23282b), glow=mat(0x294b43,0x47ffca,type==='volt'?2.5:.25);
  const torso=new THREE.Mesh(new THREE.BoxGeometry(.65*d.scale,.85*d.scale,.34*d.scale),cloth);torso.position.y=1.45*d.scale;torso.castShadow=true;g.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.27*d.scale,14,12),skin);head.position.y=2.05*d.scale;head.castShadow=true;head.name='head';g.add(head);
  const jaw=new THREE.Mesh(new THREE.BoxGeometry(.24*d.scale,.1*d.scale,.22*d.scale),skin);jaw.position.set(0,1.9*d.scale,.15*d.scale);g.add(jaw);
  const eyeMat=new THREE.MeshBasicMaterial({color:type==='volt'?0x76ffff:type==='boss'?0xff5a72:0xff806d});
  for(const sx of [-1,1]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.032*d.scale,6,6),eyeMat);eye.position.set(.085*sx*d.scale,2.09*d.scale,.245*d.scale);g.add(eye)}

  function limb(px,py,sx,sy,name){
    const pivot=new THREE.Group();pivot.position.set(px*d.scale,py*d.scale,0);g.add(pivot);
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx*d.scale,sy*d.scale,.2*d.scale),name==='arm'?cloth:dark);mesh.position.y=-sy*d.scale/2;mesh.castShadow=true;pivot.add(mesh);return pivot;
  }
  const la=limb(-.43,1.75,.18,.78,'arm'), ra=limb(.43,1.75,.18,.78,'arm');
  const ll=limb(-.2,1.04,.22,.9,'leg'), rl=limb(.2,1.04,.22,.9,'leg');
  const mutation=new THREE.Mesh(new THREE.SphereGeometry(.09*d.scale,8,8),glow);mutation.position.set(.32*d.scale,1.55*d.scale,.2*d.scale);g.add(mutation);

  if(type==='brute'||type==='boss'){
    const shoulder=new THREE.Mesh(new THREE.BoxGeometry(1.05*d.scale,.24*d.scale,.42*d.scale),cloth);shoulder.position.y=1.72*d.scale;g.add(shoulder);
  }
  if(type==='volt'){
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.34*d.scale,.025*d.scale,6,18),new THREE.MeshBasicMaterial({color:0x64f5ff}));ring.position.y=1.48*d.scale;ring.rotation.x=Math.PI/2;g.add(ring);
  }

  g.userData.limbs=[la,ll,ra,rl];
  g.traverse(o=>{if(o.isMesh)o.userData.owner=g});
  g.position.set(x,0,z);
  scene.add(g);
  enemies.push(g);
  return g;
}

function chooseEnemy(){
  if(levelIndex===0) return Math.random()<.25?'runner':'common';
  if(levelIndex===1) return pick(['common','runner','stalker','common']);
  if(levelIndex===2) return pick(['common','runner','volt','brute','common']);
  if(levelIndex===3) return pick(['stalker','runner','common','screamer','brute']);
  return pick(['common','runner','stalker','volt','brute','screamer']);
}

function spawnEnemy(){
  const angle=rand(0,Math.PI*2), radius=rand(24,38);
  const pp=getPlayerPosition();
  let x=clamp(pp.x+Math.cos(angle)*radius,-22,22);
  let z=clamp(pp.z+Math.sin(angle)*radius,-47,34);
  if(Math.hypot(x-pp.x,z-pp.z)<18) z=pp.z-24;
  return createZombie(chooseEnemy(),x,z);
}

function spawnBoss(){
  if(bossSpawned) return;
  bossSpawned=true;
  const b=createZombie('boss',0,-30);
  ui.boss.classList.remove('hidden');
  ui.boss.querySelector('i').style.width='100%';
  showMessage('SUBJECT ZERO',1300);
  return b;
}

function getPlayerPosition(){
  const v=new THREE.Vector3();
  camera.getWorldPosition(v);
  return v;
}

function shoot(){
  const t=performance.now()/1000;
  if(state.reloading||state.ammo<=0){if(state.ammo<=0)reload();return;}
  if(t-state.lastShot<state.fireRate*(state.mutation?.62:1))return;
  state.lastShot=t;state.ammo--;shots++;
  weapon.position.z=.08;weapon.rotation.x=-.08;
  const fm=weapon.getObjectByName('flashMesh');
  if(fm)fm.visible=true;
  muzzleFlash.intensity=3.5;
  setTimeout(()=>{if(fm)fm.visible=false;if(muzzleFlash)muzzleFlash.intensity=0},45);
  beep(170,.025,.045);

  raycaster.setFromCamera(new THREE.Vector2(rand(-.006,.006),rand(-.006,.006)),camera);
  const targets=[];
  enemies.forEach(e=>e.traverse(o=>{if(o.isMesh)targets.push(o)}));
  const hit=raycaster.intersectObjects(targets,false)[0];
  if(hit){
    hits++;
    const owner=hit.object.userData.owner;
    const isHead=hit.object.name==='head';
    damageEnemy(owner,isHead?(state.mutation?120:92):(state.mutation?64:44),isHead);
    impactEffect(hit.point,isHead);
  }
  updateHUD();
}

function damageEnemy(e,dmg,isHead=false){
  if(!e||e.userData.dead)return;
  e.userData.hp-=dmg;
  if(isHead)headshots++;
  if(e.userData.type==='boss') ui.boss.querySelector('i').style.width=`${clamp(e.userData.hp/e.userData.maxHp*100,0,100)}%`;
  e.rotation.z+=rand(-.04,.04);
  if(e.userData.hp<=0)killEnemy(e,isHead);
}

function killEnemy(e,isHead){
  if(e.userData.dead)return;
  e.userData.dead=true;
  e.userData.attacking=false;
  kills++;
  const now=performance.now();
  if(now-lastKill<2600){comboKills++;combo=Math.min(16,1+Math.floor(comboKills/2));}else{comboKills=0;combo=1;}
  lastKill=now;
  state.score+=Math.round(e.userData.score*combo*(isHead?1.35:1));
  state.coins+=Math.max(1,Math.ceil(e.userData.score/100));
  showMessage(isHead?'HEADSHOT':'INFECTADO ELIMINADO',500);

  if(e.userData.type==='boss'){
    ui.boss.classList.add('hidden');
    setTimeout(()=>endMission(true),900);
  }else if(Math.random()<.48){
    spawnPickup(pick(['ammo','medkit','coin','dna','scrap','armor']),e.position.x,e.position.z);
  }

  const start=performance.now();
  const fall=setInterval(()=>{
    const k=(performance.now()-start)/420;
    e.rotation.z=Math.min(Math.PI/2,k*Math.PI/2);
    e.position.y=-Math.min(.8,k*.5);
    if(k>=1){clearInterval(fall);scene.remove(e);enemies=enemies.filter(x=>x!==e);}
  },16);

  if(levelIndex===4 && kills>=LEVELS[levelIndex].quota && !bossSpawned) spawnBoss();
  if(levelIndex<4 && kills>=LEVELS[levelIndex].quota && !extraction){
    ui.objective.textContent='LLEGA VIVO A LA EXTRACCIÓN · PRESIONA E';
    showMessage('EXTRACCIÓN DISPONIBLE · E',900);
  }
  updateHUD();
}

function hasLineOfSight(enemy, playerPos){
  const origin=enemy.position.clone();
  origin.y=Math.max(1.2,1.55*enemy.userData.scale);
  const target=playerPos.clone(); target.y=1.55;
  const dir=target.clone().sub(origin);
  const dist=dir.length();
  if(dist<=.01)return true;
  dir.normalize();
  losRaycaster.set(origin,dir);
  losRaycaster.far=dist-.2;
  const blocks=losRaycaster.intersectObjects(solidMeshes,false);
  return blocks.length===0;
}

function updateEnemies(dt,time){
  const pp=getPlayerPosition();
  for(const e of [...enemies]){
    if(e.userData.dead)continue;
    const dx=pp.x-e.position.x,dz=pp.z-e.position.z,dist=Math.hypot(dx,dz);
    e.rotation.y=Math.atan2(dx,dz);
    let speed=e.userData.speed;
    if(e.userData.type==='stalker'&&flashLight.intensity>0&&dist<14)speed*=.42;
    if(e.userData.type==='runner')speed*=1+Math.sin(time*5+e.userData.phase)*.07;

    e.userData.attackCD=Math.max(0,e.userData.attackCD-dt);
    const attackRange=e.userData.range;

    if(e.userData.attacking){
      e.userData.attackWindup-=dt;
      const progress=1-clamp(e.userData.attackWindup/e.userData.windup,0,1);
      const [la,,ra]=e.userData.limbs;
      la.rotation.x=-1.15-progress*.55;
      ra.rotation.x=-1.15-progress*.55;
      e.position.x+=dx/Math.max(dist,.01)*Math.min(.28,dt*.7);
      e.position.z+=dz/Math.max(dist,.01)*Math.min(.28,dt*.7);

      if(e.userData.attackWindup<=0&&!e.userData.attackDidHit){
        e.userData.attackDidHit=true;
        const nowDist=Math.hypot(pp.x-e.position.x,pp.z-e.position.z);
        const canHit=nowDist<=attackRange*1.08 && hasLineOfSight(e,pp);
        if(canHit) hurtPlayer(e.userData.damage);
      }
      if(e.userData.attackWindup<=-.22){
        e.userData.attacking=false;
        e.userData.attackDidHit=false;
        e.userData.attackCD=e.userData.cooldown;
      }
    }else if(dist>attackRange){
      if(dist>0.01){e.position.x+=dx/dist*speed*dt;e.position.z+=dz/dist*speed*dt;}
      const walk=Math.sin(time*(e.userData.type==='runner'?11:6)+e.userData.phase);
      const [la,ll,ra,rl]=e.userData.limbs;
      la.rotation.x=walk*.7;ra.rotation.x=-walk*.7;ll.rotation.x=-walk*.6;rl.rotation.x=walk*.6;
    }else if(e.userData.attackCD<=0 && hasLineOfSight(e,pp)){
      e.userData.attacking=true;
      e.userData.attackWindup=e.userData.windup;
      e.userData.attackDidHit=false;
    }

    if(!e.userData.attacking)e.position.y=Math.abs(Math.sin(time*5+e.userData.phase))*.025;
    if(e.userData.type==='screamer'&&dist<14&&Math.sin(time*.9+e.userData.phase)>.997){
      spawnTimer=Math.max(spawnTimer-.45,0);
      showMessage('SCREAMER — HORDA ALERTADA',650);
    }
  }
}

function hurtPlayer(amount){
  const now=performance.now();
  if(!running||paused||!controls.isLocked)return;
  if(now<state.spawnGraceUntil||now<state.invulnUntil)return;
  state.invulnUntil=now+720;

  let dmg=amount;
  if(state.armor>0){
    const block=Math.min(state.armor,dmg*.65);
    state.armor-=block;
    dmg-=block;
  }
  if(dmg<=0)return;
  state.health=clamp(state.health-dmg,0,100);
  ui.damage.style.opacity='.72';
  setTimeout(()=>{if(ui.damage)ui.damage.style.opacity='0'},170);
  beep(78,.08,.07);
  updateHUD();
  if(state.health<=0)endMission(false);
}

function updateMovement(dt,time){
  if(!controls.isLocked)return;
  let f=(keys.KeyW?1:0)-(keys.KeyS?1:0),s=(keys.KeyD?1:0)-(keys.KeyA?1:0);
  if(f||s){
    const len=Math.hypot(f,s);f/=len;s/=len;
    const speed=state.mutation?7.2:5.25;
    controls.moveForward(f*speed*dt);
    controls.moveRight(s*speed*dt);
    camera.position.x=clamp(camera.position.x,-23,23);
    camera.position.z=clamp(camera.position.z,-49,38);
    camera.position.y=1.72+Math.sin(time*10)*.025;
    weapon.position.y=-Math.abs(Math.sin(time*10))*.014;
  }else weapon.position.y+=(0-weapon.position.y)*.16;
  weapon.position.z+=(0-weapon.position.z)*.18;
  weapon.rotation.x+=(0-weapon.rotation.x)*.18;
}

function spawnPickup(type,x,z){
  const colors={ammo:0xffd56a,medkit:0xff6578,coin:0xffd95c,dna:0x72ffd5,scrap:0xaeb9bf,armor:0x73a9ff};
  const g=new THREE.Group();
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.28,.045,8,18),new THREE.MeshBasicMaterial({color:colors[type]}));
  ring.rotation.x=Math.PI/2;g.add(ring);
  const core=new THREE.Mesh(new THREE.OctahedronGeometry(.18),new THREE.MeshStandardMaterial({color:colors[type],emissive:colors[type],emissiveIntensity:1.2}));g.add(core);
  g.position.set(x,.65,z);g.userData={type,baseY:.65,phase:rand(0,6)};scene.add(g);pickups.push(g);
}

function updatePickups(dt,time){
  const pp=getPlayerPosition();
  for(const p of [...pickups]){
    p.rotation.y+=dt*1.7;
    p.position.y=p.userData.baseY+Math.sin(time*2.5+p.userData.phase)*.12;
    if(p.position.distanceTo(pp)<1.35)collectPickup(p);
  }
}

function collectPickup(p){
  switch(p.userData.type){
    case'ammo':state.reserve+=45;break;
    case'medkit':state.medkits++;break;
    case'coin':state.coins+=8;break;
    case'dna':state.dna++;break;
    case'scrap':state.scrap+=2;break;
    case'armor':state.armor=Math.min(100,state.armor+45);break;
  }
  beep(520,.06,.03);scene.remove(p);pickups=pickups.filter(x=>x!==p);updateHUD();
}

function updateDefenses(dt){
  for(const d of defenses){
    if(d.userData.type==='turret'){
      d.userData.cd-=dt;
      const target=enemies.filter(e=>!e.userData.dead).sort((a,b)=>a.position.distanceTo(d.position)-b.position.distanceTo(d.position))[0];
      if(target&&target.position.distanceTo(d.position)<15){
        d.lookAt(target.position.x,d.position.y,target.position.z);
        if(d.userData.cd<=0){damageEnemy(target,18,false);d.userData.cd=.28;}
      }
    }else if(d.userData.type==='trap'){
      for(const e of enemies){
        if(!e.userData.dead&&e.position.distanceTo(d.position)<2.2){
          damageEnemy(e,22*dt,false);
          e.userData.speed=Math.max(.55,INFECTED[e.userData.type].speed*.6);
        }
      }
    }
  }
}

function buildDefense(type){
  if(!running||!controls.isLocked)return;
  const costs={barricade:1,turret:3,trap:2};
  if(state.scrap<costs[type]){showMessage('CHATARRA INSUFICIENTE',650);return;}
  state.scrap-=costs[type];
  const dir=new THREE.Vector3();camera.getWorldDirection(dir);
  const pos=getPlayerPosition().add(dir.multiplyScalar(3));pos.y=0;
  let obj;
  if(type==='barricade'){
    obj=new THREE.Group();
    for(let i=0;i<4;i++){const plank=new THREE.Mesh(new THREE.BoxGeometry(3,.22,.18),mat(0x67503f));plank.position.y=.45+i*.38;plank.rotation.z=rand(-.08,.08);obj.add(plank);solidMeshes.push(plank)}
  }else if(type==='turret'){
    obj=new THREE.Group();
    const base=new THREE.Mesh(new THREE.CylinderGeometry(.35,.5,.25,10),mat(0x3d474b));base.position.y=.2;obj.add(base);
    const gun=new THREE.Mesh(new THREE.BoxGeometry(.22,.22,.9),mat(0x283236,0x44ffd0,.5));gun.position.set(0,.65,-.2);obj.add(gun);obj.userData.cd=0;
  }else{
    obj=new THREE.Group();
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1.2,.055,8,30),new THREE.MeshBasicMaterial({color:0x67d9ff}));ring.rotation.x=Math.PI/2;ring.position.y=.05;obj.add(ring);
    const node=new THREE.Mesh(new THREE.CylinderGeometry(.18,.22,.3,8),mat(0x35505b,0x4fd6ff,1.8));node.position.y=.15;obj.add(node);
  }
  obj.position.copy(pos);obj.userData.type=type;scene.add(obj);defenses.push(obj);updateHUD();
  showMessage(type==='barricade'?'BARRICADA CONSTRUIDA':type==='turret'?'TORRETA ACTIVA':'TRAMPA ELÉCTRICA ACTIVA',700);
}

function hotkey(code){
  if(!running)return;
  if(code==='KeyR')reload();
  if(code==='KeyH')useMedkit();
  if(code==='KeyL'){
    flashLight.intensity=flashLight.intensity>0?0:4.2;
    showMessage(flashLight.intensity?'LINTERNA ACTIVADA':'LINTERNA APAGADA',450);
  }
  if(code==='KeyQ')useDNA();
  if(code==='KeyB')buildDefense('barricade');
  if(code==='KeyT')buildDefense('turret');
  if(code==='KeyG')buildDefense('trap');
  if(code==='KeyE'&&kills>=LEVELS[levelIndex].quota&&!extraction&&levelIndex<4)startExtraction();
}

function reload(){
  if(state.reloading||state.ammo>=30||state.reserve<=0)return;
  state.reloading=true;showMessage('RECARGANDO...',650);
  setTimeout(()=>{if(!running)return;const need=30-state.ammo,take=Math.min(need,state.reserve);state.ammo+=take;state.reserve-=take;state.reloading=false;updateHUD();},850);
}

function useMedkit(){
  if(state.medkits<=0||state.health>=100)return;
  state.medkits--;state.health=Math.min(100,state.health+45);showMessage('KIT MÉDICO UTILIZADO',600);updateHUD();
}

function useDNA(){
  if(state.dna<=0||state.mutation)return;
  state.dna--;state.mutation=true;state.mutationUntil=performance.now()+9000;showMessage('MUTACIÓN E-X ACTIVA\nVELOCIDAD + DAÑO',900);updateHUD();
}

function startExtraction(){
  extraction=true;extractTimer=15;ui.objective.textContent='RESISTE HASTA LA EXTRACCIÓN';showMessage('EXTRACCIÓN INICIADA',900);
}

function updateExtraction(dt){
  if(!extraction)return;
  extractTimer-=dt;
  ui.interaction.textContent=`EXTRACCIÓN EN ${Math.max(0,extractTimer).toFixed(1)}s`;
  if(extractTimer<=0){ui.interaction.textContent='';endMission(true);}
}

function updateSpawning(dt){
  if(!running||paused)return;
  const L=LEVELS[levelIndex];
  if(levelIndex===4&&bossSpawned)return;
  const alive=enemies.filter(e=>!e.userData.dead).length;
  const maxAlive=10+levelIndex*3+(extraction?5:0);
  if(kills>=L.quota&&!extraction&&levelIndex<4)return;
  spawnTimer-=dt;
  if(spawnTimer<=0&&alive<maxAlive){spawnEnemy();spawnTimer=L.spawn*(extraction?.58:1);}
}

function impactEffect(point,isHead){
  const m=new THREE.Mesh(new THREE.SphereGeometry(isHead?.06:.04,6,6),new THREE.MeshBasicMaterial({color:isHead?0xffd6a2:0x7dffce}));
  m.position.copy(point);scene.add(m);setTimeout(()=>scene.remove(m),90);
}

function updateHUD(){
  ui.healthBar.style.width=`${clamp(state.health,0,100)}%`;ui.healthText.textContent=Math.ceil(state.health);
  ui.armorBar.style.width=`${clamp(state.armor,0,100)}%`;ui.armorText.textContent=Math.ceil(state.armor);
  ui.ammo.textContent=state.ammo;ui.reserve.textContent=state.reserve;ui.medkits.textContent=state.medkits;ui.dna.textContent=state.dna;ui.scrap.textContent=state.scrap;ui.coins.textContent=state.coins;
  ui.score.textContent=String(Math.floor(state.score)).padStart(6,'0');ui.combo.textContent=`x${combo}`;
}

function showMessage(text,ms=700){
  ui.message.textContent=text;ui.message.classList.add('show');clearTimeout(showMessage.timer);showMessage.timer=setTimeout(()=>ui.message.classList.remove('show'),ms);
}

function endMission(success){
  if(!running)return;
  running=false;paused=false;pointerDown=false;if(controls.isLocked)controls.unlock();
  ui.pause.classList.add('hidden');ui.end.classList.remove('hidden');ui.hud.classList.add('hidden');
  $('#resultTitle').textContent=success?'EXTRACTION SUCCESSFUL':'MISSION FAILED';
  const seconds=Math.max(1,Math.floor((performance.now()-levelStart)/1000));
  $('#resultStats').innerHTML=`<div><span>INFECTADOS</span><b>${kills}</b></div><div><span>PUNTOS</span><b>${Math.floor(state.score)}</b></div><div><span>PRECISIÓN</span><b>${shots?Math.round(hits/shots*100):0}%</b></div><div><span>HEADSHOTS</span><b>${headshots}</b></div><div><span>TIEMPO</span><b>${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}</b></div>`;
  $('#nextBtn').style.display=success?'':'none';
}

function returnMenu(){
  running=false;paused=false;pointerDown=false;if(controls.isLocked)controls.unlock();
  ui.menu.classList.remove('hidden');ui.hud.classList.add('hidden');ui.pause.classList.add('hidden');ui.end.classList.add('hidden');ui.boss.classList.add('hidden');ui.interaction.textContent='';
}

function beep(freq=220,duration=.04,volume=.03){
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    beep.ctx=beep.ctx||new AC();
    const o=beep.ctx.createOscillator(),g=beep.ctx.createGain();o.frequency.value=freq;o.type='sawtooth';g.gain.setValueAtTime(volume,beep.ctx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,beep.ctx.currentTime+duration);o.connect(g);g.connect(beep.ctx.destination);o.start();o.stop(beep.ctx.currentTime+duration);
  }catch{}
}

function onResize(){
  camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);
}

function animate(){
  requestAnimationFrame(animate);
  const dt=Math.min(clock.getDelta(),.04),time=performance.now()/1000;
  if(running&&!paused){
    if(pointerDown&&controls.isLocked)shoot();
    if(state.mutation&&performance.now()>state.mutationUntil){state.mutation=false;showMessage('MUTACIÓN FINALIZADA',500);updateHUD();}
    updateMovement(dt,time);updateEnemies(dt,time);updatePickups(dt,time);updateDefenses(dt);updateSpawning(dt);updateExtraction(dt);
    if(performance.now()-lastKill>3000&&combo!==1){combo=1;comboKills=0;updateHUD();}
  }
  renderer.render(scene,camera);
}
