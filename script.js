import * as THREE from './js/three.module.js'
import { MarchingCubes } from './js/MarchingCubes.js'

// --- 1. 核心参数 ---
const RES = 60;
const WORLD_SIZE = 60;
let BRUSH_RADIUS = 2.0;
let EDIT_STRENGTH = 5.0;
const MOVE_SPEED = 0.3;
const LOOK_SENSITIVITY = 0.002;

let scene, camera, renderer, clock, hitMarker, planetCore;
let coreShieldMesh;
let effects = [];
let globalSkybox;

// --- [测试模式变量] ---
let isTestMode = false;
let orbitRadius = 20; // 改为20，更靠近飞船
let testViewOffset = { x: 0, y: 0 };
let playerShip;
let playerHealth = 100;
let shipLight;

// --- 游戏阶段变量 ---
let isPhaseTwo = false;
let isVictory = false;
let coreActivated = false; // 核心是否已激活特效
let coreOutline; // 核心白色包边
let coreGlowTime = 0; // 核心闪烁时间
let isDead = false; // 标记玩家是否已经死亡，防止重复触发
let gameStartTime = 0; // 新增：游戏开始时间

// --- 能量系统变量 ---
let shipEnergy = 50.0;
const MAX_ENERGY = 100.0;
const ENERGY_COST = 10.0; // 破坏弹能量消耗从20降低到10

// --- 移速等级系统 ---
let speedLevel = 0; // 当前移速等级 0-3
const SPEED_MULTIPLIERS = [1.0, 1.3, 1.6, 2.0]; // 各等级速度倍率

// --- 碎片累积系统 ---
let goldAccumulator = 0; // 黄金破坏累积值
let crystalAccumulator = 0; // 水晶破坏累积值
const GOLD_THRESHOLD = 0.5; // 累积1.0才产生1个黄金奖励碎片
const CRYSTAL_THRESHOLD = 0.5; // 累积1.0才产生1个水晶奖励碎片

// --- 武器过热系统 ---
let weaponHeat = 0; // 当前热量 0-100
const MAX_HEAT = 100;
const HEAT_PER_SHOT = 15; // 每发常规弹增加的热量，从20降低到15，过热更慢
const COOLING_RATE = 0.3; // 每帧冷却速度，从0.5降低到0.3，降温更慢
const OVERHEAT_THRESHOLD = 100; // 过热阈值
let isOverheated = false; // 是否过热
let lastFireTime = 0; // 上次发射时间
const FIRE_COOLDOWN = 150; // 常规弹射击间隔（毫秒），从100增加到150  

// 物理速度
let localPitchVel = 0;
let localYawVel = 0;
const ORBIT_FRICTION = 0.92;

// 固定参数
const ORBIT_ACCEL_HIGH = 0.0001;
const ZOOM_ACCEL_HIGH = 0.008;
const ORBIT_ACCEL_LOW = 0.00004;
const ZOOM_ACCEL_LOW = 0.005;

// 第一人称参数
let fpsMoveVel = new THREE.Vector3();
let localZoomVel = 0;
const FPS_ACCEL = 0.02;
const FPS_FRICTION = 0.90;

// --- 模式定义 ---
const matNames = ["石材", "黄金", "水晶", "铁矿"];
const MAT_HARDNESS = [1.0, 0.1, 0.1, 2.0]; // 黄金和水晶硬度都是0.1（极低），石材3.0，铁矿8.0最高

const yellowTurretConfig = { name: "基础炮台(黄)", isTurret: true, type: 'basic', color: 0xffaa00 };
const redTurretConfig = { name: "标准炮台(红)", isTurret: true, type: 'standard', color: 0xaaaaaa };
const blueTurretConfig = { name: "追踪炮台(蓝)", isTurret: true, type: 'tracking', color: 0x004488 };

// --- 武器配置 ---
const weaponConfigs = [
    { name: "Standard Shot", radius: 3.0, strength: 0.05, color: 0xffaa00, isWeapon: true, pCount: 40, dCount: 12, minS: 0.05, maxS: 0.1, isHeavy: false, size: 0.1, directDamage: 5, areaDamage: 0 },
    { name: "Heavy Shot", radius: 4.5, strength: 0.5, color: 0xff0000, isWeapon: true, pCount: 200, dCount: 30, minS: 0.05, maxS: 0.1, isHeavy: true, size: 0.1, directDamage: 50, areaDamage: 20 }
];

const allModes = [...matNames, yellowTurretConfig, redTurretConfig, blueTurretConfig, ...weaponConfigs];
let currentModeIndex = 0;
const TOTAL_MODES = allModes.length;
const WEAPON_START_INDEX = matNames.length + 3;

let bullets = [];
let enemyBullets = [];
let particleGroups = [];
let rockDebris = [];
let turrets = [];      // 外部炮台
let innerTurrets = []; // 内部核心炮台

// 保存测试模式开始时的状态快照
let testModeSnapshot = {
    voxelFields: [], // 保存体素场数据
    turrets: [],     // 保存外部炮台
    innerTurrets: [], // 保存内部炮台
    cameraPosition: null, // 保存相机位置
    orbitRadius: 60  // 保存轨道半径
};

// 材质定义
const turretMatYellow = new THREE.MeshStandardMaterial({
    color: 0xffaa00, metalness: 0.7, roughness: 0.3, envMapIntensity: 1.0
});
const turretMatRed = new THREE.MeshStandardMaterial({
    color: 0xaaaaaa, metalness: 1.0, roughness: 0.1, envMapIntensity: 1.0
});
const turretMatBlue = new THREE.MeshStandardMaterial({
    color: 0x004488, metalness: 0.8, roughness: 0.2, envMapIntensity: 1.5
});

const shieldMat = new THREE.MeshBasicMaterial({
    color: 0x0088ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide
});
const coreShieldMat = new THREE.MeshBasicMaterial({ // 核心大护盾材质
    color: 0xff00ff, transparent: true, opacity: 0.15, side: THREE.DoubleSide, wireframe: false, depthWrite: false
});

const laserMat = new THREE.LineBasicMaterial({
    color: 0xff0000, transparent: true, opacity: 0.6, linewidth: 2
});

const outlineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }); // 统一白色包边
const rewardOutlineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }); // 奖励矿物白色包边
const coreOutlineMatBlue = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }); // 核心白色包边
const shipOutlineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }); // 飞船白色包边

const enemyBulletMat = new THREE.MeshStandardMaterial({
    color: 0x883322, emissive: 0x331100, metalness: 0.5, roughness: 0.1,
    envMapIntensity: 0.3, flatShading: false, transparent: true, opacity: 1.0
});
const blueBulletMat = new THREE.MeshStandardMaterial({
    color: 0x0088ff, emissive: 0x004488, emissiveIntensity: 1.0, metalness: 0.5, roughness: 0.1
});
const yellowBulletMat = new THREE.MeshStandardMaterial({
    color: 0xffaa00, emissive: 0xff8800, emissiveIntensity: 0.8, metalness: 0.5, roughness: 0.1
});

const raycaster = new THREE.Raycaster();
const debrisRaycaster = new THREE.Raycaster();
const checkRaycaster = new THREE.Raycaster();
const centerPoint = new THREE.Vector2(0, 0);

let isDigging = false;
let isFilling = false;
let isFiring = false; // 是否正在发射
const keys = { w: false, s: false, a: false, d: false, q: false, e: false, space: false, shift: false };

let yaw = 0, pitch = 0;

// --- 2. 界面与样式 ---
const applyLevelData = (data) => {
    // Clear existing turrets
    [...turrets, ...innerTurrets].forEach(t => {
        scene.remove(t.mesh);
        if (t.laser) scene.remove(t.laser);
        if (t.element) t.element.remove();
        if (t.shield) scene.remove(t.shield);
    });
    turrets = [];
    innerTurrets = [];

    // Restore voxels
    if (data.voxels && data.voxels.length === effects.length) {
        data.voxels.forEach((vData, i) => {
            effects[i].field.set(vData);
            effects[i].update();
            if (effects[i].geometry) {
                effects[i].geometry.computeBoundingSphere();
                effects[i].geometry.computeBoundingBox();
            }
        });
    }

    // Restore turrets
    const restoreTurret = (tData) => {
        const pos = new THREE.Vector3().fromArray(tData.pos);
        const norm = new THREE.Vector3().fromArray(tData.norm);
        placeTurret(pos, norm, tData.type);
    };

    if (data.turrets) data.turrets.forEach(restoreTurret);
    if (data.innerTurrets) data.innerTurrets.forEach(restoreTurret);
};

const saveLevel = () => {
    if (isTestMode) {
        alert("请先退出测试模式 (按H键) 再保存关卡");
        return;
    }
    const data = {
        voxels: effects.map(e => Array.from(e.field)),
        turrets: turrets.map(t => ({
            pos: t.mesh.position.toArray(),
            norm: t.mesh.userData.normal.toArray(),
            type: t.type
        })),
        innerTurrets: innerTurrets.map(t => ({
            pos: t.mesh.position.toArray(),
            norm: t.mesh.userData.normal.toArray(),
            type: t.type
        }))
    };

    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'planet_level.json';
    a.click();
    URL.revokeObjectURL(url);
};

const loadLevel = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (isTestMode) {
        alert("请先退出测试模式 (按H键) 再加载关卡");
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            applyLevelData(data);

            // Reset file input
            event.target.value = '';
            
            console.log("Level loaded successfully!");
        } catch (err) {
            console.error("Failed to load level:", err);
            alert("加载存档失败，文件可能损坏");
        }
    };
    reader.readAsText(file);
};

const setupUI = () => {
    const style = document.createElement('style');
    style.innerHTML = `
        body { margin: 0; overflow: hidden; background: #000; font-family: sans-serif; }
        #crosshair {
            position: absolute; top: 50%; left: 50%;
            width: 20px; height: 20px;
            transform: translate(-50%, -50%); pointer-events: none; z-index: 100;
        }
        #crosshair::before, #crosshair::after {
            content: '';
            position: absolute;
            background: rgba(0, 255, 0, 0.8);
        }
        #crosshair::before {
            width: 2px; height: 100%;
            left: 50%; top: 0;
            transform: translateX(-50%);
        }
        #crosshair::after {
            width: 100%; height: 2px;
            left: 0; top: 50%;
            transform: translateY(-50%);
        }
        #blocker {
            position: absolute; width: 100%; height: 100%;
            background: rgba(0,0,0,0.5); display: flex; flex-direction: column;
            justify-content: center; align-items: center;
            color: white; cursor: pointer; z-index: 200;
        }
        #gui-panel {
            position: absolute; top: 20px; right: 20px;
            width: 220px; background: rgba(0, 20, 0, 0.85);
            color: #0f0; padding: 15px; border-radius: 8px;
            border: 1px solid #0f0; z-index: 210;
        }
        .gui-row { margin-bottom: 12px; }
        .gui-row label { display: block; font-size: 12px; margin-bottom: 5px; }
        .gui-row input { width: 100%; accent-color: #0f0; cursor: pointer; }
        .val-display { float: right; color: white; font-weight: bold; }
        
        #status-container {
            position: absolute; bottom: 30px; left: 50%; transform: translateX(-50%);
            width: 300px; display: none; flex-direction: column; gap: 5px;
            pointer-events: none;
        }
        .bar-bg { width: 100%; height: 8px; background: rgba(0,0,0,0.6); border: 1px solid #555; border-radius: 4px; overflow: hidden; }
        #energy-bar { width: 50%; height: 100%; background: #ff9900; transition: width 0.1s; }
        #health-bar { width: 100%; height: 100%; background: #0f0; transition: width 0.2s; }
        #heat-bar { width: 0%; height: 100%; background: #ff0000; transition: width 0.05s; }
        
        #boss-hp-container {
            position: absolute; top: 30px; left: 50%; transform: translateX(-50%);
            width: 600px; height: 20px; display: none; 
            background: rgba(0,0,0,0.5); border: 2px solid #ff00ff; border-radius: 10px; overflow: hidden;
            z-index: 150;
        }
        #boss-hp-bar { width: 100%; height: 100%; background: #ff00ff; transition: width 0.1s; }
        
        #victory-screen {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.7); display: none; flex-direction: column;
            justify-content: center; align-items: center; z-index: 300;
            color: gold;
        }
        #victory-text { font-size: 80px; font-weight: bold; text-shadow: 0 0 20px #fff; margin-bottom: 30px; }

        #defeat-screen {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0, 0, 0, 0.7); display: none; flex-direction: column;
            justify-content: center; align-items: center; z-index: 300;
            color: #ff3333;
        }
        #defeat-text { font-size: 80px; font-weight: bold; text-shadow: 0 0 20px #f00; margin-bottom: 30px; }

        #close-btn, #restart-btn {
            padding: 10px 30px; background: #fff; color: #000; border: none;
            font-size: 20px; cursor: pointer; border-radius: 5px; font-weight: bold;
            pointer-events: auto;
        }
        #close-btn:hover, #restart-btn:hover { background: #ccc; }

        .turret-hp {
            position: absolute; width: 40px; height: 4px; background: red;
            display: none; pointer-events: none; z-index: 50; transform: translate(-50%, -50%);
        }
        .turret-hp-inner { width: 100%; height: 100%; background: #0f0; }
    `;
    document.head.appendChild(style);

    const gameTitle = document.createElement('div');
    gameTitle.innerText = "Interstellar Demolition Office";
    gameTitle.style.position = 'absolute';
    gameTitle.style.top = '15px';
    gameTitle.style.left = '15px';
    gameTitle.style.color = '#0f0';
    gameTitle.style.fontSize = '20px';
    gameTitle.style.fontWeight = 'bold';
    gameTitle.style.fontFamily = 'monospace';
    gameTitle.style.zIndex = '100';
    gameTitle.style.pointerEvents = 'none';
    gameTitle.style.textShadow = '1px 1px 2px black';
    document.body.appendChild(gameTitle);

    const blocker = document.createElement('div');
    blocker.id = 'blocker';
    blocker.innerHTML = `
        <div style="max-width: 600px; text-align: left; background: rgba(0,0,0,0.8); padding: 20px; border: 1px solid #fff; border-radius: 10px;">
            <h2 style="text-align: center; color: #0f0; margin-top: 0;">[Interstellar Demolition Office]</h2>
            <p style="font-size: 14px; line-height: 1.5;">Destructible Terrain Space Bullet Hell Shooter Demo, built with the Three.js game engine as a cross-platform browser-based proof of concept.</p>
            <br>
            <p style="font-size: 14px; line-height: 1.5;">Players pilot a spacecraft and fire two types of ammunition to destroy mineral voxels on the planet's surface.<br>
            Once destroyed, mineral voxels shatter into debris, exposing buried enemy facilities.</p>
            <br>
            <p style="font-size: 14px; line-height: 1.5;">Players must collect special reward minerals from the debris to replenish their health and energy bars.<br>
            <span style="color: #ffaa00">Gold shards</span> restore Energy (required for <span style="color: #ff0000">Heavy Shots</span>).<br>
            <span style="color: #00aaaa">Crystal shards</span> restore Health.<br>
            After destroying all enemy units, the core is unlocked.<br>
            The core contains dense enemy installations; defeating all of them completes the level.</p>
            <p>This game is made by sdsds222</p>
            
            <hr style="border: 0; border-top: 1px solid #555; margin: 15px 0;">
            
            <h3 style="color: #0f0; font-size: 16px; margin-bottom: 10px; text-align: center;">CONTROLS</h3>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px 20px; font-size: 13px; color: #ccc; margin-bottom: 20px;">
                <div style="text-align: right; color: #fff;">W / A / S / D</div><div>Rotate Orbit</div>
                <div style="text-align: right; color: #fff;">Q / E</div><div>Zoom In / Out</div>
                <div style="text-align: right; color: #fff;">SHIFT</div><div>Precision Mode</div>
                <div style="text-align: right; color: #fff;">MOUSE</div><div>Aim / Look</div>
                <div style="text-align: right; color: #fff;">L. CLICK</div><div>Fire Weapon</div>
                <div style="text-align: right; color: #fff;">SCROLL</div><div>Switch Weapon</div>
                <div style="text-align: right; color: #fff;">L</div><div>Toggle Edit Mode</div>
            </div>

            <div style="text-align: center; margin-top: 20px;">
                <button id="continue-btn" style="padding: 10px 30px; font-size: 18px; cursor: pointer; background: #0f0; color: #000; border: none; font-weight: bold; border-radius: 5px;">CONTINUE</button>
            </div>
        </div>
    `;
    document.body.appendChild(blocker);

    const gui = document.createElement('div');
    gui.id = 'gui-panel';
    gui.style.display = 'none'; // 隐藏右上角UI
    gui.innerHTML = `
        <div class="gui-row"><label>工具: <span id="current-name" class="val-display">石材</span></label></div>
        <div class="gui-row">
            <label>笔刷大小: <span id="radius-val" class="val-display">2.0</span></label>
            <input type="range" id="radius-slider" min="0.5" max="12" step="0.1" value="2.0">
        </div>
        <div class="gui-row">
            <label>速度: <span id="strength-val" class="val-display">5.0</span></label>
            <input type="range" id="strength-slider" min="0.5" max="20" step="0.1" value="5.0">
        </div>
        <div class="gui-row" style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #0f0;">
            <button id="save-btn" style="width: 48%; background: #003300; color: #0f0; border: 1px solid #0f0; cursor: pointer;">保存</button>
            <button id="load-btn" style="width: 48%; background: #003300; color: #0f0; border: 1px solid #0f0; cursor: pointer;">加载</button>
            <input type="file" id="level-input" style="display:none" accept=".json">
        </div>
    `;
    document.body.appendChild(gui);

    const statusContainer = document.createElement('div');
    statusContainer.id = 'status-container';
    statusContainer.innerHTML = `
        <div id="weapon-display" style="text-align:center; color:#fff; font-weight:bold; text-shadow:1px 1px 2px black; margin-bottom:5px;"></div>
        <div class="bar-bg"><div id="energy-bar"></div></div>
        <div class="bar-bg" style="border-color:#0f0;"><div id="health-bar"></div></div>
        <div class="bar-bg" style="border-color:#ff0000;"><div id="heat-bar"></div></div>
    `;
    document.body.appendChild(statusContainer);

    const bossHpContainer = document.createElement('div');
    bossHpContainer.id = 'boss-hp-container';
    bossHpContainer.innerHTML = `<div id="boss-hp-bar"></div>`;
    document.body.appendChild(bossHpContainer);

    const vic = document.createElement('div');
    vic.id = 'victory-screen';
    vic.innerHTML = `<div id="victory-text">MISSION COMPLETE</div><button id="close-btn">Close</button>`;
    document.body.appendChild(vic);

    const defeat = document.createElement('div');
    defeat.id = 'defeat-screen';
    defeat.innerHTML = `<div id="defeat-text">MISSION FAILED</div><button id="restart-btn">Restart</button>`;
    document.body.appendChild(defeat);

    document.getElementById('close-btn').addEventListener('click', () => {
        resetScene(); // 重置场景
        vic.style.display = 'none';
        document.getElementById('blocker').style.display = 'flex';
    });

    document.getElementById('restart-btn').addEventListener('click', () => {
        resetScene(); // 重置场景
        defeat.style.display = 'none';
        renderer.domElement.requestPointerLock();
    });

    document.getElementById('continue-btn').addEventListener('click', () => renderer.domElement.requestPointerLock());
    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === renderer.domElement) {
            blocker.style.display = 'none';
        } else {
            if (!isVictory && !isDead) {
                blocker.style.display = 'flex';
            } else {
                blocker.style.display = 'none';
            }
        }
    });
    const ch = document.createElement('div');
    ch.id = 'crosshair';
    document.body.appendChild(ch);

    document.getElementById('radius-slider').addEventListener('input', (e) => { BRUSH_RADIUS = parseFloat(e.target.value); updateUIFeedback(); });
    document.getElementById('strength-slider').addEventListener('input', (e) => { EDIT_STRENGTH = parseFloat(e.target.value); updateUIFeedback(); });

    document.getElementById('save-btn').addEventListener('click', saveLevel);
    document.getElementById('load-btn').addEventListener('click', () => document.getElementById('level-input').click());
    document.getElementById('level-input').addEventListener('change', loadLevel);
};

const updateUIFeedback = () => {
    const modeObj = allModes[currentModeIndex];
    const name = typeof modeObj === 'string' ? modeObj : modeObj.name;
    const isWep = modeObj.isWeapon;

    const nameEl = document.getElementById('current-name');
    const radSlider = document.getElementById('radius-slider');
    const radVal = document.getElementById('radius-val');
    const strSlider = document.getElementById('strength-slider');
    const strVal = document.getElementById('strength-val');

    const statusCont = document.getElementById('status-container');
    const hBar = document.getElementById('health-bar');
    const eBar = document.getElementById('energy-bar');
    const heatBar = document.getElementById('heat-bar');
    const bossCont = document.getElementById('boss-hp-container');
    const bossBar = document.getElementById('boss-hp-bar');
    const weaponDisplay = document.getElementById('weapon-display');

    if (nameEl) {
        let displayName = name;
        nameEl.innerText = displayName;
        if (isWep) {
            nameEl.style.color = "#ff0000";
        } else if (modeObj.isTurret) {
            if (modeObj.type === 'tracking') nameEl.style.color = "#0088ff";
            else if (modeObj.type === 'basic') nameEl.style.color = "#ffaa00";
            else nameEl.style.color = "#ffff00";
        } else {
            nameEl.style.color = "#ffffff";
        }
        
        if (weaponDisplay) {
            weaponDisplay.innerText = displayName;
            weaponDisplay.style.color = nameEl.style.color;
        }
    }
    if (radSlider) radSlider.value = BRUSH_RADIUS;
    if (radVal) radVal.innerText = BRUSH_RADIUS.toFixed(1);
    if (strSlider) strSlider.value = EDIT_STRENGTH;
    if (strVal) strVal.innerText = EDIT_STRENGTH.toFixed(1);

    if (statusCont) statusCont.style.display = isTestMode ? 'flex' : 'none';
    if (hBar) {
        hBar.style.width = playerHealth + '%';
        hBar.style.backgroundColor = playerHealth > 50 ? '#0f0' : '#f00';
    }
    if (eBar) {
        eBar.style.width = shipEnergy + '%';
    }
    if (heatBar) {
        heatBar.style.width = weaponHeat + '%';
        heatBar.style.backgroundColor = isOverheated ? '#ff0000' : '#ffaa00';
    }

    if (bossCont) {
        if (isTestMode && isPhaseTwo && !isVictory && innerTurrets.length > 0) {
            bossCont.style.display = 'block';
            let totalHp = 0;
            innerTurrets.forEach(t => totalHp += t.health);
            const maxTotal = innerTurrets.length * 300;
            if (maxTotal > 0) bossBar.style.width = (totalHp / maxTotal * 100) + '%';
        } else {
            bossCont.style.display = 'none';
        }
    }
};

const createExplosion = (pos, color, count) => {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];
    for (let i = 0; i < count; i++) {
        positions[i * 3] = pos.x; positions[i * 3 + 1] = pos.y; positions[i * 3 + 2] = pos.z;
        velocities.push(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6));
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: color, size: 0.15, transparent: true, opacity: 1 }));
    scene.add(points);
    particleGroups.push({ mesh: points, velocities: velocities, life: 1.0 });
};

const createRockDebris = (pos, bulletDir, destroyedMatIdx, destroyedAmount, hitObject, minS, maxS) => {
    if (hitObject === planetCore) return;

    const baseDir = bulletDir.clone().multiplyScalar(-1);

    // 计算碎片数量：与破坏量成正比
    let normalDebrisCount = Math.floor(destroyedAmount * 50);

    // 黄金和水晶产生更少的碎片（减半）
    if (destroyedMatIdx === 1 || destroyedMatIdx === 2) {
        normalDebrisCount = Math.floor(normalDebrisCount * 0.5);
    }

    normalDebrisCount = Math.max(0, Math.min(normalDebrisCount, 100)); // 限制最大碎片数量

    // 炮台爆炸产生奖励碎片（黄金、水晶、绿色）- 100%掉落
    let goldRewardCount = 0, crystalRewardCount = 0, speedRewardCount = 0;
    if (hitObject.userData && hitObject.userData.isTurret) {
        // 炮台爆炸时100%掉落黄金、水晶、绿色碎片各1个
        goldRewardCount = 1;
        crystalRewardCount = 1;
        //speedRewardCount = 1;
        normalDebrisCount = Math.max(2, normalDebrisCount); // 炮台至少5个碎片
    }

    // 如果破坏的是黄金或水晶，使用累积机制产生奖励碎片
    if (destroyedMatIdx === 1) { // 黄金
        goldAccumulator += destroyedAmount;
        while (goldAccumulator >= GOLD_THRESHOLD) {
            goldRewardCount++;
            goldAccumulator -= GOLD_THRESHOLD;
        }
    } else if (destroyedMatIdx === 2) { // 水晶
        crystalAccumulator += destroyedAmount;
        while (crystalAccumulator >= CRYSTAL_THRESHOLD) {
            crystalRewardCount++;
            crystalAccumulator -= CRYSTAL_THRESHOLD;
        }
    }

    // 生成普通碎片（使用被破坏材质的外观）
    for (let i = 0; i < normalDebrisCount; i++) {
        let selectedMat;
        let massSpeedMulti = 1.0;
        let damageMultiplier = 1.0;

        // 根据被破坏的材质选择碎片材质
        if (destroyedMatIdx !== null && destroyedMatIdx >= 0 && destroyedMatIdx < effects.length) {
            selectedMat = effects[destroyedMatIdx].material;

            // 根据材质设置物理属性
            if (destroyedMatIdx === 3) { // 铁矿
                massSpeedMulti = 0.3; // 更重
                damageMultiplier = 3.0; // 伤害更大
            } else if (destroyedMatIdx === 1) { // 黄金
                massSpeedMulti = 0.8;
                damageMultiplier = 0.5;
            } else if (destroyedMatIdx === 2) { // 水晶
                massSpeedMulti = 1.0;
                damageMultiplier = 0.5;
            } else { // 石材
                massSpeedMulti = 1.0;
                damageMultiplier = 1.0;
            }
        } else {
            selectedMat = hitObject.material || effects[0].material;
            massSpeedMulti = 1.0;
        }

        const debrisMaterial = selectedMat.clone();
        debrisMaterial.flatShading = false;
        debrisMaterial.side = THREE.FrontSide;
        debrisMaterial.envMap = globalSkybox;
        // 水晶碎片不透明，其他材质保持透明
        debrisMaterial.transparent = (destroyedMatIdx !== 2);
        if (destroyedMatIdx === 2) {
            debrisMaterial.opacity = 1.0; // 水晶碎片完全不透明
        }

        const velocity = baseDir.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15)).normalize().multiplyScalar((0.04 + Math.random() * 0.08) * massSpeedMulti);

        const baseSize = (minS + Math.random() * (maxS - minS));
        const geometry = new THREE.IcosahedronGeometry(baseSize, 1);
        const positions = geometry.attributes.position;
        const vertexMap = new Map();
        for (let j = 0; j < positions.count; j++) {
            const v = new THREE.Vector3().fromBufferAttribute(positions, j);
            const key = `${v.x.toFixed(4)}_${v.y.toFixed(4)}_${v.z.toFixed(4)}`;
            if (!vertexMap.has(key)) vertexMap.set(key, 0.8 + Math.random() * 0.4);
            v.normalize().multiplyScalar(baseSize * vertexMap.get(key));
            positions.setXYZ(j, v.x, v.y, v.z);
        }
        positions.needsUpdate = true;
        geometry.computeVertexNormals();

        const mesh = new THREE.Mesh(geometry, debrisMaterial);
        mesh.position.copy(pos);
        mesh.scale.set(0.5 + Math.random() * 1.5, 0.5 + Math.random() * 1.5, 0.5 + Math.random() * 1.5);
        mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);

        mesh.layers.enable(0);
        mesh.layers.enable(1);

        const rotVel = { x: (Math.random() - 0.5) * 0.04, y: (Math.random() - 0.5) * 0.04, z: (Math.random() - 0.5) * 0.04 };

        rockDebris.push({
            mesh: mesh, velocity: velocity, rotVel: rotVel, life: 3.0, age: 0, bSize: baseSize, canFade: false,
            isHeal: false,
            isAmmo: false,
            damageMultiplier: damageMultiplier
        });
        scene.add(mesh);
    }

    // 单独生成黄金奖励碎片（能量）- 使用黄金材质，适中尺寸
    for (let i = 0; i < goldRewardCount; i++) {
        const baseSize = (minS + Math.random() * (maxS - minS)) * 2.0; // 2倍大小
        const geometry = new THREE.IcosahedronGeometry(baseSize, 1);
        const positions = geometry.attributes.position;
        const vertexMap = new Map();
        for (let j = 0; j < positions.count; j++) {
            const v = new THREE.Vector3().fromBufferAttribute(positions, j);
            const key = `${v.x.toFixed(4)}_${v.y.toFixed(4)}_${v.z.toFixed(4)}`;
            if (!vertexMap.has(key)) vertexMap.set(key, 0.8 + Math.random() * 0.4);
            v.normalize().multiplyScalar(baseSize * vertexMap.get(key)); positions.setXYZ(j, v.x, v.y, v.z);
        }
        positions.needsUpdate = true; geometry.computeVertexNormals();

        // 使用黄金材质（带环境映射和金属感）
        const goldMat = new THREE.MeshStandardMaterial({
            color: 0xffaa00,
            metalness: 0.6,
            roughness: 0.2,
            envMap: globalSkybox,
            emissive: 0xaa7700,
            emissiveIntensity: 0.3
        });
        const mesh = new THREE.Mesh(geometry, goldMat);
        mesh.position.copy(pos);
        mesh.scale.set(0.5 + Math.random() * 1.5, 0.5 + Math.random() * 1.5, 0.5 + Math.random() * 1.5);
        mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);

        const outlineMesh = new THREE.Mesh(geometry, rewardOutlineMat);
        outlineMesh.scale.setScalar(1.2);
        mesh.add(outlineMesh);

        mesh.layers.enable(0);
        mesh.layers.enable(1);

        // 速度与普通碎片一致
        const velocity = baseDir.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15)).normalize().multiplyScalar(0.04 + Math.random() * 0.08);
        const rotVel = { x: (Math.random() - 0.5) * 0.04, y: (Math.random() - 0.5) * 0.04, z: (Math.random() - 0.5) * 0.04 };

        rockDebris.push({
            mesh: mesh, velocity: velocity, rotVel: rotVel, life: 3.0, age: 0, bSize: baseSize, canFade: false,
            isHeal: false,
            isAmmo: true,
            damageMultiplier: 1.0
        });
        scene.add(mesh);
    }

    // 单独生成水晶奖励碎片（治疗）- 使用水晶材质，适中尺寸
    for (let i = 0; i < crystalRewardCount; i++) {
        const baseSize = (minS + Math.random() * (maxS - minS)) * 2.0; // 2倍大小
        const geometry = new THREE.IcosahedronGeometry(baseSize, 1);
        const positions = geometry.attributes.position;
        const vertexMap = new Map();
        for (let j = 0; j < positions.count; j++) {
            const v = new THREE.Vector3().fromBufferAttribute(positions, j);
            const key = `${v.x.toFixed(4)}_${v.y.toFixed(4)}_${v.z.toFixed(4)}`;
            if (!vertexMap.has(key)) vertexMap.set(key, 0.8 + Math.random() * 0.4);
            v.normalize().multiplyScalar(baseSize * vertexMap.get(key)); positions.setXYZ(j, v.x, v.y, v.z);
        }
        positions.needsUpdate = true; geometry.computeVertexNormals();

        // 使用水晶材质（降低透明度，更暗，更粗糙）
        const crystalMat = new THREE.MeshStandardMaterial({
            color: 0x00aaaa,
            transparent: true,
            opacity: 0.4,
            roughness: 0.4,
            metalness: 0.2,
            emissive: 0x005555,
            emissiveIntensity: 0.2
        });
        const mesh = new THREE.Mesh(geometry, crystalMat);
        mesh.position.copy(pos);
        mesh.scale.set(0.5 + Math.random() * 1.5, 0.5 + Math.random() * 1.5, 0.5 + Math.random() * 1.5);
        mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);

        const outlineMesh = new THREE.Mesh(geometry, rewardOutlineMat);
        outlineMesh.scale.setScalar(1.2);
        mesh.add(outlineMesh);

        mesh.layers.enable(0);
        mesh.layers.enable(1);

        // 速度与普通碎片一致
        const velocity = baseDir.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15)).normalize().multiplyScalar(0.04 + Math.random() * 0.08);
        const rotVel = { x: (Math.random() - 0.5) * 0.04, y: (Math.random() - 0.5) * 0.04, z: (Math.random() - 0.5) * 0.04 };

        rockDebris.push({
            mesh: mesh, velocity: velocity, rotVel: rotVel, life: 3.0, age: 0, bSize: baseSize, canFade: false,
            isHeal: true,
            isAmmo: false,
            isSpeed: false,
            damageMultiplier: 1.0
        });
        scene.add(mesh);
    }

    // 单独生成绿色碎片（移速提升）- 使用绿色材质，适中尺寸
    for (let i = 0; i < speedRewardCount; i++) {
        const baseSize = (minS + Math.random() * (maxS - minS)) * 2.0; // 2倍大小
        const geometry = new THREE.IcosahedronGeometry(baseSize, 1);
        const positions = geometry.attributes.position;
        const vertexMap = new Map();
        for (let j = 0; j < positions.count; j++) {
            const v = new THREE.Vector3().fromBufferAttribute(positions, j);
            const key = `${v.x.toFixed(4)}_${v.y.toFixed(4)}_${v.z.toFixed(4)}`;
            if (!vertexMap.has(key)) vertexMap.set(key, 0.8 + Math.random() * 0.4);
            v.normalize().multiplyScalar(baseSize * vertexMap.get(key)); positions.setXYZ(j, v.x, v.y, v.z);
        }
        positions.needsUpdate = true; geometry.computeVertexNormals();

        // 使用绿色材质
        const speedMat = new THREE.MeshStandardMaterial({
            color: 0x00ff00,
            metalness: 0.5,
            roughness: 0.3,
            emissive: 0x00aa00,
            emissiveIntensity: 0.4
        });
        const mesh = new THREE.Mesh(geometry, speedMat);
        mesh.position.copy(pos);
        mesh.scale.set(0.5 + Math.random() * 1.5, 0.5 + Math.random() * 1.5, 0.5 + Math.random() * 1.5);
        mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);

        const outlineMesh = new THREE.Mesh(geometry, rewardOutlineMat);
        outlineMesh.scale.setScalar(1.2);
        mesh.add(outlineMesh);

        mesh.layers.enable(0);
        mesh.layers.enable(1);

        // 速度与普通碎片一致
        const velocity = baseDir.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.15)).normalize().multiplyScalar(0.04 + Math.random() * 0.08);
        const rotVel = { x: (Math.random() - 0.5) * 0.04, y: (Math.random() - 0.5) * 0.04, z: (Math.random() - 0.5) * 0.04 };

        rockDebris.push({
            mesh: mesh, velocity: velocity, rotVel: rotVel, life: 3.0, age: 0, bSize: baseSize, canFade: false,
            isHeal: false,
            isAmmo: false,
            isSpeed: true,
            damageMultiplier: 1.0
        });
        scene.add(mesh);
    }
};

const fireBullet = () => {
    const modeObj = allModes[currentModeIndex];
    if (!modeObj || !modeObj.isWeapon) return;

    // 常规弹检查过热
    if (!modeObj.isHeavy && isOverheated) {
        return;
    }

    // 常规弹检查射速限制
    if (!modeObj.isHeavy) {
        const now = Date.now();
        if (now - lastFireTime < FIRE_COOLDOWN) {
            return;
        }
        lastFireTime = now;
    }

    if (isTestMode && modeObj.isHeavy) {
        if (shipEnergy < ENERGY_COST) {
            console.log("能量不足！请采集橙色碎片");
            return;
        }
        shipEnergy -= ENERGY_COST;
    }

    // 常规弹增加热量
    if (!modeObj.isHeavy) {
        weaponHeat = Math.min(MAX_HEAT, weaponHeat + HEAT_PER_SHOT);
        if (weaponHeat >= OVERHEAT_THRESHOLD) {
            isOverheated = true;
        }
    }

    updateUIFeedback();

    const bullet = new THREE.Mesh(new THREE.SphereGeometry(modeObj.size, 8, 8), new THREE.MeshBasicMaterial({ color: modeObj.color }));

    let spawnPos;
    if (isTestMode && playerShip) {
        spawnPos = playerShip.position.clone().add(
            new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
        );
    } else {
        spawnPos = camera.position.clone();
    }
    bullet.position.copy(spawnPos);

    raycaster.setFromCamera(centerPoint, camera);
    const intersects = raycaster.intersectObjects([...effects, planetCore]);

    let targetPoint;
    if (intersects.length > 0) {
        targetPoint = intersects[0].point;
    } else {
        targetPoint = raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(1000));
    }

    const dir = targetPoint.clone().sub(spawnPos).normalize();
    const speed = modeObj.isHeavy ? 1.2 : 1.8;

    bullets.push({ mesh: bullet, direction: dir, speed: speed, life: 100, config: modeObj });
    scene.add(bullet);
};

const createCoreLaser = (startPos) => {
    const geometry = new THREE.BufferGeometry().setFromPoints([startPos, new THREE.Vector3(0, 0, 0)]);
    const line = new THREE.Line(geometry, laserMat);
    scene.add(line);
    return line;
};

const placeTurret = (pos, normal, modeType) => {
    const distToCenter = pos.length();
    const isInner = (distToCenter < 1.5);

    const size = isInner ? 0.25 : 0.5;
    const geometry = new THREE.BoxGeometry(size, size, size);

    const isTracking = (modeType === 'tracking');
    const isBasic = (modeType === 'basic');
    let mat;
    if (isTracking) mat = turretMatBlue;
    else if (isBasic) mat = turretMatYellow;
    else mat = turretMatRed;
    const mesh = new THREE.Mesh(geometry, mat);

    mesh.material.envMap = globalSkybox;
    mesh.position.copy(pos).add(normal.multiplyScalar(size * 0.5));
    mesh.userData.isTurret = true;
    mesh.userData.normal = normal.clone().normalize();
    mesh.userData.firePoint = mesh.position.clone().add(normal.multiplyScalar(0.4));
    mesh.lookAt(pos.clone().add(normal));

    mesh.layers.enable(0);
    mesh.layers.enable(1);

    // 添加红色边框（炮台专用）
    const turretOutlineMat = new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.BackSide }); // 红色
    const outlineGeo = new THREE.BoxGeometry(size * 1.15, size * 1.15, size * 1.15);
    const outlineMesh = new THREE.Mesh(outlineGeo, turretOutlineMat);
    mesh.add(outlineMesh);

    let shield;
    // 只有标准炮台（红色）有护盾，基础炮台（黄色）和追踪炮台（蓝色）无护盾
    if (!isTracking && !isBasic) {
        const shieldGeo = new THREE.SphereGeometry(size * 1.2, 16, 16);
        shield = new THREE.Mesh(shieldGeo, shieldMat);
        shield.visible = false;
        mesh.add(shield);
    }

    scene.add(mesh);

    let laser;
    if (!isInner) {
        laser = createCoreLaser(mesh.position);
    }

    const hpDiv = document.createElement('div');
    hpDiv.className = 'turret-hp';
    hpDiv.innerHTML = '<div class="turret-hp-inner"></div>';
    document.body.appendChild(hpDiv);

    const turretObj = {
        mesh: mesh,
        shield: shield,
        laser: laser,
        health: isInner ? 300 : 100,
        active: false,
        cooldown: 0,
        element: hpDiv,
        hpInner: hpDiv.children[0],
        type: modeType
    };

    if (isInner) {
        mesh.userData.isInnerTurret = true;
        innerTurrets.push(turretObj);
    } else {
        turrets.push(turretObj);
    }
};

const spawnEnemyBullet = (startPos, velocity, type = 'red', isFromInner = false) => {
    let mat;
    if (type === 'blue') mat = blueBulletMat.clone();
    else if (type === 'yellow') mat = yellowBulletMat.clone();
    else mat = enemyBulletMat.clone();

    const size = (type === 'core') ? 0.15 : 0.08;

    const bullet = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 8), mat);
    bullet.position.copy(startPos);
    bullet.layers.enable(0);
    bullet.layers.enable(1);

    enemyBullets.push({
        mesh: bullet,
        velocity: velocity,
        canFade: false,
        fadeLife: 1.0,
        type: type, // 'red', 'blue', 'yellow', 'core'
        speed: velocity.length(),
        isCore: (type === 'core'),
        isFromInner: isFromInner // 标记是否来自内部炮台
    });
    scene.add(bullet);
}

const fireTurretBullet = (t) => {
    let baseDir = playerShip.position.clone().sub(t.mesh.userData.firePoint).normalize();
    const isInner = t.mesh.userData.isInnerTurret || false;

    if (t.type === 'tracking') {
        // 蓝色追踪炮台
        let spread = new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3);
        let finalDir = baseDir.add(spread).normalize();
        spawnEnemyBullet(t.mesh.userData.firePoint, finalDir.multiplyScalar(0.04), 'blue', isInner);
        t.cooldown = 30 + Math.random() * 120;
    } else if (t.type === 'basic') {
        // 黄色基础炮台 - 更快更准
        let spread = new THREE.Vector3((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1); // 从0.2改为0.1，更准
        let finalDir = baseDir.add(spread).normalize();
        spawnEnemyBullet(t.mesh.userData.firePoint, finalDir.multiplyScalar(0.05), 'yellow', isInner);
        t.cooldown = 20 + Math.random() * 30; // 频率更快，从60-150改为20-50
    } else {
        // 红色标准炮台 - 更快更准，高频率，散射发射多发子弹
        // 发射3发子弹，每发都有不同的随机偏移
        for (let i = 0; i < 3; i++) {
            let spread = new THREE.Vector3((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.25);
            let finalDir = baseDir.clone().add(spread).normalize();
            spawnEnemyBullet(t.mesh.userData.firePoint, finalDir.multiplyScalar(0.08), 'red', isInner);
        }
        t.cooldown = 15 + Math.random() * 20; // 更高频率（降低冷却时间）
    }
};

// 激活核心特效
const activateCore = () => {
    if (coreActivated) return;
    coreActivated = true;

    // 创建白色包边
    const outlineGeo = new THREE.SphereGeometry(0.5, 64, 64);
    const outlineMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.8
    });
    coreOutline = new THREE.Mesh(outlineGeo, outlineMat);
    scene.add(coreOutline);

    // 修改核心材质，使其能够发光
    planetCore.material = new THREE.MeshStandardMaterial({
        color: 0xffaa00,
        metalness: 0.8,
        roughness: 0.2,
        emissive: 0xffaa00,
        emissiveIntensity: 0.5
    });
};

// 保存测试模式快照
const saveTestModeSnapshot = () => {
    // 保存体素场数据
    testModeSnapshot.voxelFields = effects.map(eff => new Float32Array(eff.field));

    // 保存外部炮台（深拷贝完整信息）
    testModeSnapshot.turrets = turrets.map(t => ({
        position: t.mesh.position.clone(),
        normal: t.mesh.userData.normal.clone(),
        firePoint: t.mesh.userData.firePoint.clone(),
        health: t.health,
        maxHealth: t.health,
        type: t.type
    }));

    // 保存内部炮台
    testModeSnapshot.innerTurrets = innerTurrets.map(t => ({
        position: t.mesh.position.clone(),
        normal: t.mesh.userData.normal.clone(),
        firePoint: t.mesh.userData.firePoint.clone(),
        health: t.health,
        maxHealth: t.health,
        type: t.type
    }));

    // 保存相机位置和轨道半径
    testModeSnapshot.cameraPosition = camera.position.clone();
    testModeSnapshot.orbitRadius = orbitRadius;
};

// 恢复测试模式快照
const restoreTestModeSnapshot = () => {
    // 恢复体素场
    if (testModeSnapshot.voxelFields.length > 0) {
        effects.forEach((eff, i) => {
            if (testModeSnapshot.voxelFields[i]) {
                eff.field.set(testModeSnapshot.voxelFields[i]);
                eff.update();
                if (eff.geometry) {
                    eff.geometry.computeBoundingSphere();
                    eff.geometry.computeBoundingBox();
                }
            }
        });
    }

    // 重建外部炮台到快照状态
    turrets.forEach(t => {
        scene.remove(t.mesh);
        if (t.laser) scene.remove(t.laser);
        if (t.element) t.element.remove();
    });
    turrets = [];

    testModeSnapshot.turrets.forEach(snapshot => {
        placeTurret(snapshot.position, snapshot.normal, snapshot.type);
        const newTurret = turrets[turrets.length - 1];
        newTurret.health = snapshot.maxHealth;
    });

    // 重建内部炮台到快照状态
    innerTurrets.forEach(t => {
        if (t.mesh.parent) scene.remove(t.mesh);
        if (t.element && t.element.parentNode) t.element.remove();
    });
    innerTurrets = [];

    testModeSnapshot.innerTurrets.forEach(snapshot => {
        placeTurret(snapshot.position, snapshot.normal, snapshot.type);
        const newTurret = innerTurrets[innerTurrets.length - 1];
        newTurret.health = snapshot.maxHealth;
        newTurret.mesh.visible = false; // 内部炮台默认隐藏
    });
};

// 重置场景到测试模式开始时的状态
const resetScene = () => {
    // 清理所有游戏对象
    bullets.forEach(b => scene.remove(b.mesh));
    bullets = [];

    enemyBullets.forEach(eb => scene.remove(eb.mesh));
    enemyBullets = [];

    particleGroups.forEach(p => scene.remove(p.mesh));
    particleGroups = [];

    rockDebris.forEach(d => scene.remove(d.mesh));
    rockDebris = [];

    // 清除核心特效
    if (coreOutline) {
        scene.remove(coreOutline);
        coreOutline = null;
    }

    // 重置核心
    if (!planetCore.parent) {
        scene.add(planetCore);
    }
    planetCore.material = new THREE.MeshStandardMaterial({
        color: 0x444444,
        metalness: 0.8,
        roughness: 0.4
    });

    // 恢复护盾
    if (!coreShieldMesh.parent) {
        scene.add(coreShieldMesh);
    }

    // 恢复到测试模式开始时的状态
    restoreTestModeSnapshot();

    // 重置游戏状态
    isPhaseTwo = false;
    isVictory = false;
    coreActivated = false;
    coreGlowTime = 0;
    isDead = false;
    playerHealth = 100;
    shipEnergy = 50;
    weaponHeat = 0;
    isOverheated = false;
    goldAccumulator = 0; // 重置黄金累积器
    crystalAccumulator = 0; // 重置水晶累积器

    gameStartTime = Date.now(); // 重置时间

    // 恢复相机位置和轨道
    if (testModeSnapshot.cameraPosition) {
        camera.position.copy(testModeSnapshot.cameraPosition);
        orbitRadius = testModeSnapshot.orbitRadius;
        camera.lookAt(0, 0, 0);
    }

    // 重置控制速度
    localPitchVel = 0;
    localYawVel = 0;
    localZoomVel = 0;
    testViewOffset = { x: 0, y: 0 };

    // 显示飞船
    playerShip.visible = true;
    shipLight.visible = true;

    // 隐藏所有结束画面
    document.getElementById('victory-screen').style.display = 'none';
    document.getElementById('defeat-screen').style.display = 'none';
    document.getElementById('boss-hp-container').style.display = 'none';

    updateUIFeedback();
};

const init = () => {
    clock = new THREE.Clock();
    scene = new THREE.Scene();
    const loader = new THREE.CubeTextureLoader().setPath('./imgs/');
    globalSkybox = loader.load(['4.png', '3.png', '5.png', '6.png', '1.png', '2.png']);
    scene.background = globalSkybox;
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 60);

    camera.layers.enable(0);
    camera.layers.enable(1);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(20, 40, 20);
    scene.add(sun);

    // --- 核心半径缩小 0.4 ---
    planetCore = new THREE.Mesh(new THREE.SphereGeometry(0.4, 64, 64), new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.4 }));
    planetCore.layers.set(0);
    scene.add(planetCore);

    // 添加核心白色包边
    const coreOutlineGeo = new THREE.SphereGeometry(0.46, 64, 64);
    const coreOutlineMesh = new THREE.Mesh(coreOutlineGeo, coreOutlineMatBlue);
    planetCore.add(coreOutlineMesh);

    // --- 护盾半径 1.3, 禁用射线 ---
    coreShieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.3, 32, 32), coreShieldMat);
    coreShieldMesh.raycast = () => { };
    scene.add(coreShieldMesh);

    // 飞船改为灰色金属八边形
    playerShip = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), new THREE.MeshStandardMaterial({
        color: 0xcccccc, // 更亮的灰色
        metalness: 1.0,  // 金属度最大
        roughness: 0.05, // 粗糙度降低，更光滑
        envMap: globalSkybox, // 添加环境贴图
        envMapIntensity: 3.0  // 环境反射强度提高
    }));
    playerShip.visible = false;
    scene.add(playerShip);

    // 添加飞船白色包边
    const shipOutlineGeo = new THREE.OctahedronGeometry(0.12, 0);
    const shipOutlineMesh = new THREE.Mesh(shipOutlineGeo, shipOutlineMat);
    playerShip.add(shipOutlineMesh);

    shipLight = new THREE.SpotLight(0xffffff, 4.0, 10, Math.PI / 6, 0.5, 1);
    shipLight.layers.set(1);
    shipLight.visible = false;
    scene.add(shipLight);
    scene.add(shipLight.target);

    const voxelMats = [
        new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.8, side: THREE.DoubleSide }), // 石材
        new THREE.MeshStandardMaterial({ color: 0xffaa00, metalness: 0.6, roughness: 0.2, envMap: globalSkybox, side: THREE.DoubleSide }), // 黄金
        new THREE.MeshStandardMaterial({ color: 0x00ffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide }), // 水晶（保持透明）
        new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.9, roughness: 0.3, envMap: globalSkybox, side: THREE.DoubleSide }) // 铁矿
    ];
    for (let i = 0; i < 4; i++) {
        let effect = new MarchingCubes(RES, voxelMats[i], true, true, 100000);
        effect.scale.set(WORLD_SIZE / 2, WORLD_SIZE / 2, WORLD_SIZE / 2); effect.field.fill(-1.1); effect.isolation = 0.2;
        effect.layers.set(0);
        effect.traverse((child) => { child.layers.set(0); });
        scene.add(effect); effects.push(effect);
    }
    hitMarker = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    scene.add(hitMarker);

    window.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        // if (k === 'h') {
        //     isTestMode = !isTestMode;
        //     // 只在测试模式显示飞船
        //     playerShip.visible = isTestMode;
        //     shipLight.visible = isTestMode;
        //     if (isTestMode) {
        //         camera.lookAt(0, 0, 0);
        //         localPitchVel = 0; localYawVel = 0; localZoomVel = 0;
        //         if (currentModeIndex < WEAPON_START_INDEX) currentModeIndex = WEAPON_START_INDEX;

        //         playerHealth = 100;
        //         shipEnergy = 50;
        //         weaponHeat = 0;
        //         isOverheated = false;
        //         goldAccumulator = 0; // 重置黄金累积器
        //         crystalAccumulator = 0; // 重置水晶累积器
        //         innerTurrets.forEach(t => t.mesh.visible = false);

        //         // 保存测试模式开始时的快照
        //         saveTestModeSnapshot();
        //     } else {
        //         // 退出测试模式，恢复原状
        //         resetScene();
        //     }
        //     fpsMoveVel.set(0, 0, 0);
        //     updateUIFeedback();
        // }

        if (k === 'l') {
            isTestMode = !isTestMode;
            
            const gui = document.getElementById('gui-panel');
            if (gui) gui.style.display = isTestMode ? 'none' : 'block';

            if (isTestMode) {
                saveTestModeSnapshot();
                
                playerHealth = 100;
                shipEnergy = 50;
                weaponHeat = 0;
                isOverheated = false;
                goldAccumulator = 0;
                crystalAccumulator = 0;
                gameStartTime = Date.now();
                
                localPitchVel = 0; localYawVel = 0; localZoomVel = 0;
                innerTurrets.forEach(t => t.mesh.visible = false);
            } else {
                resetScene();
                fpsMoveVel.set(0, 0, 0);
                innerTurrets.forEach(t => t.mesh.visible = true);
            }
            
            playerShip.visible = isTestMode;
            shipLight.visible = isTestMode;
            
            updateUIFeedback();
        }

        if (k === 't') { BRUSH_RADIUS = Math.min(12, BRUSH_RADIUS + 0.1); updateUIFeedback(); }
        if (k === 'r') { BRUSH_RADIUS = Math.max(0.5, BRUSH_RADIUS - 0.1); updateUIFeedback(); }

        if (k === 'g') { EDIT_STRENGTH = Math.min(20, EDIT_STRENGTH + 0.5); updateUIFeedback(); }
        if (k === 'f') { EDIT_STRENGTH = Math.max(0.5, EDIT_STRENGTH - 0.5); updateUIFeedback(); }
        if (keys.hasOwnProperty(k) || k === ' ' || k === 'shift') keys[k === ' ' ? 'space' : k] = true;
    });
    window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase() === ' ' ? 'space' : e.key.toLowerCase()] = false; });
    window.addEventListener('wheel', (e) => {
        if (document.pointerLockElement === renderer.domElement) {
            cycleMode(e.deltaY > 0 ? 1 : -1);
        }
    });
    document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement === renderer.domElement) {
            const movementX = Math.max(-100, Math.min(100, e.movementX));
            const movementY = Math.max(-100, Math.min(100, e.movementY));

            if (!isTestMode) {
                yaw -= movementX * LOOK_SENSITIVITY;
                pitch = Math.max(-1.5, Math.min(1.5, pitch - movementY * LOOK_SENSITIVITY));
            } else {
                testViewOffset.x = Math.max(-0.5, Math.min(0.5, testViewOffset.x - movementX * 0.001));
                testViewOffset.y = Math.max(-0.5, Math.min(0.5, testViewOffset.y - movementY * 0.001));
            }
        }
    });
    window.addEventListener('mousedown', (e) => {
        if (document.pointerLockElement === renderer.domElement) {
            if (e.button === 0) {
                const mode = allModes[currentModeIndex];
                if (mode.isWeapon) {
                    isFiring = true; // 标记为正在发射
                    fireBullet(); // 立即发射一发
                } else if (mode.isTurret) {
                    if (hitMarker.visible && !isTestMode) {
                        raycaster.setFromCamera(centerPoint, camera);
                        const intersects = raycaster.intersectObjects([...effects, planetCore]);
                        if (intersects.length > 0) {
                            placeTurret(intersects[0].point, intersects[0].face.normal, mode.type);
                        }
                    }
                } else {
                    isDigging = true;
                }
            }
            if (e.button === 2) isFilling = true;
        }
    });
    window.addEventListener('mouseup', () => { isDigging = false; isFilling = false; isFiring = false; });
};

const cycleMode = (dir) => {
    let nextIndex = currentModeIndex + dir;
    if (nextIndex < 0) nextIndex = TOTAL_MODES - 1;
    if (nextIndex >= TOTAL_MODES) nextIndex = 0;

    if (isTestMode) {
        if (nextIndex < WEAPON_START_INDEX) {
            nextIndex = dir > 0 ? WEAPON_START_INDEX : TOTAL_MODES - 1;
        }
    }
    currentModeIndex = nextIndex;
    updateUIFeedback();
};

const applyVoxelEdit = (center, adding, dt, targetMatIdx = null, ignoreHardness = false) => {
    let matIdx = 0;
    if (currentModeIndex < matNames.length) matIdx = currentModeIndex;

    const localPos = effects[0].worldToLocal(center.clone());
    const gX = ((localPos.x + 1) / 2) * RES, gY = ((localPos.y + 1) / 2) * RES, gZ = ((localPos.z + 1) / 2) * RES;
    const gRadius = (BRUSH_RADIUS / WORLD_SIZE) * RES;

    let delta = (adding ? EDIT_STRENGTH : -EDIT_STRENGTH) * dt * 5;

    let changed = false;
    let destroyedAmount = 0; // 记录实际破坏的量
    const r = Math.ceil(gRadius);

    for (let x = Math.floor(gX - r); x <= Math.ceil(gX + r); x++) {
        for (let y = Math.floor(gY - r); y <= Math.ceil(gY + r); y++) {
            for (let z = Math.floor(gZ - r); z <= Math.ceil(gZ + r); z++) {
                if (x < 0 || x >= RES || y < 0 || y >= RES || z < 0 || z >= RES) continue;
                if (Math.pow(x - gX, 2) + Math.pow(y - gY, 2) + Math.pow(z - gZ, 2) <= gRadius * gRadius) {
                    const idx = x + y * RES + z * RES * RES;

                    if (adding) {
                        // 添加模式：只操作指定材质，编辑模式不考虑硬度
                        const eff = effects[matIdx];
                        const hardness = ignoreHardness ? 1.0 : (MAT_HARDNESS[matIdx] || 1.0);
                        const effectiveDelta = delta / hardness;
                        eff.field[idx] = Math.max(-1.1, Math.min(1.1, eff.field[idx] + effectiveDelta));
                        changed = true;
                    } else {
                        // 破坏模式：只破坏指定的材质
                        if (targetMatIdx !== null) {
                            const eff = effects[targetMatIdx];
                            const hardness = ignoreHardness ? 1.0 : (MAT_HARDNESS[targetMatIdx] || 1.0);
                            const effectiveDelta = delta / hardness;
                            const oldVal = eff.field[idx];
                            eff.field[idx] = Math.max(-1.1, Math.min(1.1, oldVal + effectiveDelta));
                            if (oldVal > 0.2) {
                                destroyedAmount += Math.abs(oldVal - Math.max(0.2, eff.field[idx]));
                            }
                            changed = true;
                        }
                    }
                }
            }
        }
    }

    if (changed) {
        if (adding) {
            effects[matIdx].update();
            if (effects[matIdx].geometry) effects[matIdx].geometry.computeBoundingSphere();
            effects[matIdx].traverse((child) => child.layers.set(0));
        } else if (targetMatIdx !== null) {
            effects[targetMatIdx].update();
            if (effects[targetMatIdx].geometry) effects[targetMatIdx].geometry.computeBoundingSphere();
            effects[targetMatIdx].traverse((child) => child.layers.set(0));
        }
    }

    return { matIdx: targetMatIdx, amount: destroyedAmount };
};

const enterGameMode = () => {
    isTestMode = true;
    playerShip.visible = true;
    shipLight.visible = true;
    camera.lookAt(0, 0, 0);
    localPitchVel = 0; localYawVel = 0; localZoomVel = 0;
    if (currentModeIndex < WEAPON_START_INDEX) currentModeIndex = WEAPON_START_INDEX;

    playerHealth = 100;
    shipEnergy = 50;
    weaponHeat = 0;
    isOverheated = false;
    goldAccumulator = 0;
    crystalAccumulator = 0;
    innerTurrets.forEach(t => t.mesh.visible = false);
    
    gameStartTime = Date.now();

    fetch('planet_level.json')
        .then(res => {
            if (!res.ok) throw new Error("No level");
            return res.json();
        })
        .then(data => {
            applyLevelData(data);
            console.log("Level loaded");
            saveTestModeSnapshot();
        })
        .catch(err => {
            console.log("Using procedural generation");
            saveTestModeSnapshot();
        });
        
    updateUIFeedback();
};

// --- Animate 函数 ---
const animate = () => {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();

    // --- 武器冷却系统 ---
    if (weaponHeat > 0) {
        weaponHeat = Math.max(0, weaponHeat - COOLING_RATE);
        if (weaponHeat === 0 && isOverheated) {
            isOverheated = false; // 必须完全冷却到0才能继续发射
        }
        updateUIFeedback();
    }

    // 连射逻辑 - 只对常规弹生效，且只在测试模式下
    if (isTestMode && isFiring && document.pointerLockElement === renderer.domElement) {
        const mode = allModes[currentModeIndex];
        if (mode && mode.isWeapon && !mode.isHeavy) {
            fireBullet(); // 连续调用，由内部的射速限制控制
        }
    }

    if (document.pointerLockElement === renderer.domElement) {
        if (!isTestMode) {
            camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            const side = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            if (keys.w || keys.q) fpsMoveVel.addScaledVector(dir, FPS_ACCEL);
            if (keys.s || keys.e) fpsMoveVel.addScaledVector(dir, -FPS_ACCEL);
            if (keys.a) fpsMoveVel.addScaledVector(side, -FPS_ACCEL);
            if (keys.d) fpsMoveVel.addScaledVector(side, FPS_ACCEL);
            if (keys.space) fpsMoveVel.y += FPS_ACCEL;
            if (keys.shift) fpsMoveVel.y -= FPS_ACCEL;
            fpsMoveVel.multiplyScalar(FPS_FRICTION);
            camera.position.add(fpsMoveVel);
        } else {
            const speedMultiplier = SPEED_MULTIPLIERS[speedLevel];
            const currentOrbitAccel = (keys.shift ? ORBIT_ACCEL_LOW : ORBIT_ACCEL_HIGH) * speedMultiplier;
            const currentZoomAccel = (keys.shift ? ZOOM_ACCEL_LOW : ZOOM_ACCEL_HIGH) * speedMultiplier;
            if (keys.q) localZoomVel -= currentZoomAccel;
            if (keys.e) localZoomVel += currentZoomAccel;
            if (keys.w) localPitchVel -= currentOrbitAccel;
            if (keys.s) localPitchVel += currentOrbitAccel;
            if (keys.a) localYawVel -= currentOrbitAccel;
            if (keys.d) localYawVel += currentOrbitAccel;
            localPitchVel *= ORBIT_FRICTION;
            localYawVel *= ORBIT_FRICTION;
            localZoomVel *= 0.90;
            orbitRadius = Math.max(2, Math.min(200, orbitRadius + localZoomVel)); // 最小距离改为2

            // 相机围绕世界中心旋转
            let right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            let up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
            camera.position.applyAxisAngle(right, localPitchVel);
            camera.up.applyAxisAngle(right, localPitchVel);
            camera.position.applyAxisAngle(up, localYawVel);
            camera.up.applyAxisAngle(up, localYawVel);
            camera.position.normalize().multiplyScalar(orbitRadius);

            // 相机先看向世界中心
            camera.lookAt(0, 0, 0);

            // 飞船位置固定在相机前方（相对于相机朝向）
            const shipOffset = new THREE.Vector3(0, -0.3, -3);
            const rotatedOffset = shipOffset.clone().applyQuaternion(camera.quaternion);
            playerShip.position.copy(camera.position).add(rotatedOffset);



            // 鼠标微调视角（围绕飞船）
            camera.rotateX(testViewOffset.y);
            camera.rotateY(testViewOffset.x);

            // 让飞船朝向与相机一致（跟随准星）
            playerShip.quaternion.copy(camera.quaternion);

            shipLight.position.copy(playerShip.position);
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            shipLight.target.position.copy(playerShip.position).add(forward);
        }

        // --- 阶段控制 ---
        if (isTestMode && !isVictory) {
            // 外部炮台清空 -> 进入第二阶段
            if (turrets.length === 0 && !isPhaseTwo) {
                isPhaseTwo = true;
                updateUIFeedback();
                scene.remove(coreShieldMesh);
                innerTurrets.forEach(t => t.mesh.visible = true);
            }

            // Phase 2: 内部炮台逻辑
            if (isPhaseTwo) {
                innerTurrets.forEach(t => {
                    if (t.health > 0) {
                        // 计算到玩家的距离
                        const distToPlayer = t.mesh.position.distanceTo(playerShip.position);

                        // 1. 护盾逻辑（仅标准炮台有护盾）
                        if (t.shield) {
                            t.shield.visible = (distToPlayer > 25.0); // 改为25.0，护盾显示距离更远
                            t.invulnerable = t.shield.visible;
                        }

                        // 2. 发射逻辑
                        if (t.cooldown > 0) t.cooldown--;
                        else {
                            fireTurretBullet(t);
                        }

                        // 3. [修复 1: 核心炮台小血条显示]
                        t.element.style.display = 'block';
                        const tempV = t.mesh.position.clone();
                        tempV.project(camera);
                        const x = (tempV.x * .5 + .5) * window.innerWidth;
                        const y = (-(tempV.y * .5) + .5) * window.innerHeight;
                        t.element.style.left = x + 'px';
                        t.element.style.top = (y - 20) + 'px';
                        t.hpInner.style.width = (t.health / 300 * 100) + '%';
                    } else {
                        t.element.style.display = 'none';
                        if (t.shield) t.shield.visible = false;
                    }
                });

                // 胜利判定
                if (innerTurrets.length > 0) {
                    let allDead = true;
                    innerTurrets.forEach(t => { if (t.health > 0) allDead = false; });
                    if (allDead && !coreActivated) {
                        // 激活核心特效
                        activateCore();
                        createExplosion(planetCore.position, 0xffaa00, 200);
                        innerTurrets.forEach(t => {
                            scene.remove(t.mesh);
                            t.element.remove(); // 移除血条元素
                        });
                    }
                }
            }
        }

        // --- 核心特效更新和碰撞检测 ---
        if (isTestMode && coreActivated && !isVictory) {
            // 更新闪烁时间
            coreGlowTime += dt * 3;

            // 颜色渐变闪烁 (金色到红色到白色)
            const t = (Math.sin(coreGlowTime) + 1) / 2; // 0到1之间
            let r, g, b;
            if (t < 0.5) {
                // 金色 (1, 0.67, 0) 到 红色 (1, 0, 0)
                const blend = t * 2;
                r = 1;
                g = 0.67 * (1 - blend);
                b = 0;
            } else {
                // 红色 (1, 0, 0) 到 白色 (1, 1, 1)
                const blend = (t - 0.5) * 2;
                r = 1;
                g = blend;
                b = blend;
            }

            planetCore.material.color.setRGB(r, g, b);
            planetCore.material.emissive.setRGB(r * 0.8, g * 0.8, b * 0.8);
            planetCore.material.emissiveIntensity = 0.5 + Math.sin(coreGlowTime * 2) * 0.3;

            // 白色包边也闪烁
            if (coreOutline) {
                coreOutline.material.opacity = 0.6 + Math.sin(coreGlowTime * 1.5) * 0.2;
            }

            // 检测玩家飞船与核心的碰撞
            const distToCore = playerShip.position.distanceTo(planetCore.position);
            if (distToCore < 0.5) { // 核心半径 + 飞船半径
                // 触发通关
                isVictory = true;
                const timeUsed = ((Date.now() - gameStartTime) / 1000).toFixed(2);
                document.getElementById('victory-text').innerHTML = `MISSION COMPLETE<br><span style="font-size: 0.5em">Time: ${timeUsed}s</span>`;
                document.getElementById('victory-screen').style.display = 'flex';
                document.exitPointerLock();
                createExplosion(planetCore.position, 0xffffff, 300);
                scene.remove(planetCore);
                if (coreOutline) scene.remove(coreOutline);
            }
        }

        // --- 检测玩家死亡 ---
        if (isTestMode && playerHealth <= 0 && !isVictory && !isDead) {
            isDead = true;
            // 玩家死亡，显示失败画面
            createExplosion(playerShip.position, 0xff0000, 100);
            playerShip.visible = false;
            shipLight.visible = false;
            document.getElementById('defeat-screen').style.display = 'flex';
            document.exitPointerLock();
        }

        // --- 处理外部炮台 ---
        for (let i = turrets.length - 1; i >= 0; i--) {
            let t = turrets[i];
            if (isTestMode) {
                const startPos = t.mesh.userData.firePoint;
                const toPlayer = playerShip.position.clone().sub(startPos);
                const distToPlayer = toPlayer.length();
                toPlayer.normalize();

                // 检查炮台是否被体素阻挡（判断是否暴露）
                checkRaycaster.set(startPos, toPlayer);
                const intersects = checkRaycaster.intersectObjects([...effects, planetCore]);

                let isBlocked = false;
                if (intersects.length > 0 && intersects[0].distance < distToPlayer) {
                    // 被任何物体阻挡（体素或核心）都算被阻挡
                    isBlocked = true;
                }

                // 额外检查：从相机到炮台是否被体素阻挡（判断是否暴露可见）
                const toCam = camera.position.clone().sub(t.mesh.position);
                const distToCam = toCam.length();
                toCam.normalize();
                checkRaycaster.set(t.mesh.position, toCam);
                const camIntersects = checkRaycaster.intersectObjects(effects);

                let isExposed = true;
                if (camIntersects.length > 0 && camIntersects[0].distance < distToCam) {
                    // 炮台被体素埋住，未暴露
                    isExposed = false;
                }

                if (!isBlocked && isExposed) {
                    t.active = true;
                    t.element.style.display = 'block';
                    const tempV = t.mesh.position.clone();
                    tempV.project(camera);
                    const x = (tempV.x * .5 + .5) * window.innerWidth;
                    const y = (-(tempV.y * .5) + .5) * window.innerHeight;
                    t.element.style.left = x + 'px';
                    t.element.style.top = (y - 20) + 'px';
                    t.hpInner.style.width = t.health + '%';

                    if (t.shield) {
                        t.shield.visible = (distToPlayer > 25.0);
                        t.invulnerable = t.shield.visible;
                    }

                    if (t.cooldown > 0) t.cooldown--;
                    else {
                        fireTurretBullet(t);
                    }
                } else {
                    t.active = false;
                    t.element.style.display = 'none';
                    if (t.shield) t.shield.visible = false;
                }
            } else {
                t.element.style.display = 'none';
                if (t.shield) t.shield.visible = false;
            }

            if (t.health <= 0) {
                const fakeBulletDir = t.mesh.position.clone().sub(playerShip.position).normalize();
                // 炮台爆炸产生石材碎片（材质索引0，少量）
                createRockDebris(t.mesh.position, fakeBulletDir, 0, 0.2, t.mesh, 0.03, 0.06);

                createExplosion(t.mesh.position, 0xaaaaaa, 30);
                scene.remove(t.mesh);
                if (t.laser) scene.remove(t.laser);
                t.element.remove();
                turrets.splice(i, 1);
            }
        }

        // --- 玩家子弹逻辑 ---
        for (let i = bullets.length - 1; i >= 0; i--) {
            let b = bullets[i];
            const travelDistance = b.speed;
            b.mesh.position.addScaledVector(b.direction, travelDistance);
            b.life--;
            raycaster.set(b.mesh.position.clone().addScaledVector(b.direction, -travelDistance), b.direction);

            // 先检测内部炮台碰撞（距离检测）
            if (isPhaseTwo && innerTurrets.length > 0) {
                let hitInnerTurret = false;
                for (let t of innerTurrets) {
                    if (t.health <= 0) continue;
                    const dist = b.mesh.position.distanceTo(t.mesh.position);
                    if (dist < 0.6) { // 内部炮台碰撞半径
                        if (t.shield && t.invulnerable) {
                            createExplosion(b.mesh.position, 0x0088ff, 5);
                        } else {
                            t.health -= b.config.directDamage;
                            createExplosion(b.mesh.position, 0xff0000, 10);
                            if (t.health <= 0) {
                                // 内部炮台爆炸产生奖励碎片
                                const fakeBulletDir = t.mesh.position.clone().sub(playerShip.position).normalize();
                                // 炮台爆炸产生石材碎片（材质索引0，少量）
                                createRockDebris(t.mesh.position, fakeBulletDir, 0, 0.2, t.mesh, 0.03, 0.06);

                                scene.remove(t.mesh);
                                t.element.remove();
                                createExplosion(t.mesh.position, 0xffaa00, 50);
                            }
                            updateUIFeedback();
                        }
                        scene.remove(b.mesh); bullets.splice(i, 1);
                        hitInnerTurret = true;
                        break;
                    }
                }
                if (hitInnerTurret) continue;
            }

            // 再检测地形和核心
            const detectionObjects = isPhaseTwo
                ? effects
                : [...effects, planetCore];
            const ints = raycaster.intersectObjects(detectionObjects);

            if (ints.length > 0 && ints[0].distance <= travelDistance + 0.1) {
                const hitObj = ints[0].object;

                if (hitObj === planetCore) {
                    createExplosion(ints[0].point, 0x0088ff, 5);
                    scene.remove(b.mesh); bullets.splice(i, 1); continue;
                }

                // 检测击中点的主要材质
                const localPos = effects[0].worldToLocal(ints[0].point.clone());
                const gX = ((localPos.x + 1) / 2) * RES;
                const gY = ((localPos.y + 1) / 2) * RES;
                const gZ = ((localPos.z + 1) / 2) * RES;
                const idx = Math.floor(gX) + Math.floor(gY) * RES + Math.floor(gZ) * RES * RES;

                // 检查该位置各材质的值，确定主导材质
                let dominantMatIdx = 0;
                let maxValue = effects[0].field[idx] || 0;
                for (let mi = 1; mi < effects.length; mi++) {
                    const val = effects[mi].field[idx] || 0;
                    if (val > maxValue) {
                        maxValue = val;
                        dominantMatIdx = mi;
                    }
                }

                // 只破坏主导材质
                const sR = BRUSH_RADIUS, sS = EDIT_STRENGTH;
                BRUSH_RADIUS = b.config.radius; EDIT_STRENGTH = b.config.strength;
                const result = applyVoxelEdit(ints[0].point, false, 0.1, dominantMatIdx);
                BRUSH_RADIUS = sR; EDIT_STRENGTH = sS;

                createExplosion(ints[0].point, b.config.color, b.config.pCount);
                createRockDebris(ints[0].point, b.direction, result.matIdx, result.amount, ints[0].object, b.config.minS, b.config.maxS);

                scene.remove(b.mesh); bullets.splice(i, 1); continue;
            }

            // 检测外部炮台碰撞 - 破坏弹使用范围伤害，常规弹只有直接碰撞
            let hitTurret = false;
            for (let t of turrets) {
                const dist = b.mesh.position.distanceTo(t.mesh.position);

                // 破坏弹：范围伤害判定
                if (b.config.isHeavy && dist < 5.0) {
                    if (!(t.shield && t.invulnerable)) {
                        // 范围伤害，距离越近伤害越高
                        const damageRatio = 1 - (dist / 5.0);
                        const damage = b.config.areaDamage * damageRatio;
                        t.health -= damage;
                        createExplosion(t.mesh.position, 0xff6600, 5);
                    }
                }

                // 直接击中判定
                if (dist < 0.8) {
                    if (t.shield && t.invulnerable) {
                        createExplosion(b.mesh.position, 0x0088ff, 5);
                    } else {
                        // 直接击中造成额外伤害
                        t.health -= b.config.directDamage;
                        createExplosion(b.mesh.position, 0xff0000, 10);
                    }
                    scene.remove(b.mesh); bullets.splice(i, 1);
                    hitTurret = true;
                    break;
                }
            }

            if (hitTurret) continue;

            if (b.life <= 0) { scene.remove(b.mesh); bullets.splice(i, 1); }
        }

        // --- 敌方子弹逻辑 ---
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            let eb = enemyBullets[i];

            if (eb.type === 'blue') {
                const distToPlayer = eb.mesh.position.distanceTo(playerShip.position);
                const toPlayer = playerShip.position.clone().sub(eb.mesh.position).normalize();

                // 进入5.0范围内改为直线射击，不再追踪
                if (distToPlayer > 5.0) {
                    // 远距离：追踪模式
                    if (eb.velocity.clone().normalize().dot(toPlayer) > -0.2) {
                        eb.velocity.lerp(toPlayer.multiplyScalar(eb.speed), 0.02);
                    }
                } else {
                    // 近距离：锁定方向，不再追踪（保持当前速度方向）
                    // 子弹继续沿着当前方向直线飞行
                }
            }

            const bulletDir = eb.velocity.clone().normalize();
            raycaster.set(eb.mesh.position, bulletDir);

            const moveDist = eb.velocity.length() + 0.3;

            const hits = raycaster.intersectObjects([...effects, planetCore]);

            if (hits.length > 0 && hits[0].distance < moveDist) {
                const hitObj = hits[0].object;

                if (hitObj === planetCore) {
                    createExplosion(hits[0].point, 0x0088ff, 5);
                    scene.remove(eb.mesh);
                    enemyBullets.splice(i, 1);
                    continue;
                }

                // 只有内部炮台的子弹能破坏体素，且力度更小
                if (eb.isFromInner) {
                    const sR = BRUSH_RADIUS, sS = EDIT_STRENGTH;

                    // 内部炮台子弹破坏力度更小
                    BRUSH_RADIUS = 1.5;
                    EDIT_STRENGTH = 5.0;

                    // 检测击中点的主要材质
                    const localPos = effects[0].worldToLocal(hits[0].point.clone());
                    const gX = ((localPos.x + 1) / 2) * RES;
                    const gY = ((localPos.y + 1) / 2) * RES;
                    const gZ = ((localPos.z + 1) / 2) * RES;
                    const idx = Math.floor(gX) + Math.floor(gY) * RES + Math.floor(gZ) * RES * RES;

                    // 检查该位置各材质的值，确定主导材质
                    let dominantMatIdx = 0;
                    let maxValue = effects[0].field[idx] || 0;
                    for (let mi = 1; mi < effects.length; mi++) {
                        const val = effects[mi].field[idx] || 0;
                        if (val > maxValue) {
                            maxValue = val;
                            dominantMatIdx = mi;
                        }
                    }

                    // 只破坏主导材质
                    const result = applyVoxelEdit(hits[0].point, false, 0.1, dominantMatIdx);

                    BRUSH_RADIUS = sR; EDIT_STRENGTH = sS;

                    createExplosion(hits[0].point, 0x883322, 5);
                    const debrisDir = hits[0].point.clone().sub(playerShip.position).normalize();
                    createRockDebris(hits[0].point, debrisDir, result.matIdx, result.amount, hitObj, 0.02, 0.05);
                } else {
                    // 外部炮台子弹：只产生爆炸效果，不破坏体素
                    createExplosion(hits[0].point, 0x883322, 3);
                }

                scene.remove(eb.mesh);
                enemyBullets.splice(i, 1);
                continue;
            }

            eb.mesh.position.add(eb.velocity);

            const bulletDist = eb.mesh.position.length();
            const playerDist = playerShip.position.length();

            if (bulletDist > playerDist + 20) {
                eb.canFade = true;
            }

            if (eb.canFade) {
                eb.fadeLife -= dt;
                eb.mesh.material.opacity = Math.max(0, eb.fadeLife);
                if (eb.fadeLife <= 0) {
                    scene.remove(eb.mesh);
                    enemyBullets.splice(i, 1);
                    continue;
                }
            }

            if (isTestMode && eb.mesh.position.distanceTo(playerShip.position) < 0.2) {
                const dmg = (eb.type === 'blue') ? 15 : 20;
                playerHealth = Math.max(0, playerHealth - dmg);
                // 根据子弹类型显示不同颜色的粒子效果
                let hitColor = 0xff6600;
                if (eb.type === 'blue') hitColor = 0x0088ff;
                else if (eb.type === 'yellow') hitColor = 0xffaa00;
                createExplosion(playerShip.position, hitColor, 15);
                updateUIFeedback();
                scene.remove(eb.mesh); enemyBullets.splice(i, 1); continue;
            }
        }

        // --- 碎片逻辑 ---
        for (let i = rockDebris.length - 1; i >= 0; i--) {
            let d = rockDebris[i];

            if (isTestMode && playerHealth > 0 && (d.isHeal || d.isAmmo || d.isSpeed)) {
                const distance = d.mesh.position.distanceTo(playerShip.position);
                const MAGNET_RADIUS = 1.0;
                const COLLECT_RADIUS = 0.3;

                if (distance < MAGNET_RADIUS) {
                    const dirToShip = playerShip.position.clone().sub(d.mesh.position).normalize();
                    d.velocity.add(dirToShip.multiplyScalar(0.015));
                    d.velocity.multiplyScalar(0.95);
                    d.life = 3.0;
                    d.mesh.material.opacity = 1.0;
                }

                if (distance < COLLECT_RADIUS) {
                    if (d.isHeal) {
                        playerHealth = Math.min(100, playerHealth + d.bSize * 30);
                    } else if (d.isAmmo) {
                        shipEnergy = Math.min(MAX_ENERGY, shipEnergy + d.bSize * 50);
                    } else if (d.isSpeed) {
                        // 提升移速等级，最高3级
                        if (speedLevel < 3) {
                            speedLevel++;
                            console.log(`移速提升至等级${speedLevel}! 旋转和前后移速倍率: ${SPEED_MULTIPLIERS[speedLevel]}x`);
                        }
                    }
                    updateUIFeedback();
                    scene.remove(d.mesh);
                    rockDebris.splice(i, 1);
                    continue;
                }
            } else if (isTestMode && playerHealth > 0) {
                const distance = d.mesh.position.distanceTo(playerShip.position);
                if (distance < 0.1 + d.bSize) {
                    const baseDamage = d.bSize * 150;
                    const finalDamage = baseDamage * (d.damageMultiplier || 1.0);
                    playerHealth = Math.max(0, playerHealth - finalDamage);
                    // 碎片撞击产生粒子效果
                    createExplosion(d.mesh.position, 0xff4444, 8);
                    updateUIFeedback();
                    scene.remove(d.mesh);
                    rockDebris.splice(i, 1);
                    continue;
                }
            }

            d.mesh.position.add(d.velocity);
            d.mesh.rotation.x += d.rotVel.x; d.mesh.rotation.y += d.rotVel.y; d.mesh.rotation.z += d.rotVel.z;
            const dist = d.mesh.position.length();
            if (dist > orbitRadius) d.canFade = true;
            if (d.canFade) {
                d.life -= dt;
                d.mesh.material.opacity = Math.max(0, d.life / 3.0);
                if (d.life <= 0) { scene.remove(d.mesh); rockDebris.splice(i, 1); continue; }
            }

            if (d.age < 10) d.age += dt;
            if (d.age > 0.5 && dist < orbitRadius) {
                debrisRaycaster.set(d.mesh.position.clone().sub(d.velocity), d.velocity.clone().normalize());
                const di = debrisRaycaster.intersectObjects([...effects, planetCore]);
                if (di.length > 0 && di[0].distance < d.velocity.length() * 1.5) { scene.remove(d.mesh); rockDebris.splice(i, 1); continue; }
            }
        }

        for (let i = particleGroups.length - 1; i >= 0; i--) {
            let p = particleGroups[i]; p.life -= dt * 2; const pos = p.mesh.geometry.attributes.position;
            for (let j = 0; j < pos.count; j++) { pos.array[j * 3] += p.velocities[j].x; pos.array[j * 3 + 1] += p.velocities[j].y; pos.array[j * 3 + 2] += p.velocities[j].z; }
            pos.needsUpdate = true; p.mesh.material.opacity = p.life;
            if (p.life <= 0) { scene.remove(p.mesh); particleGroups.splice(i, 1); }
        }

        raycaster.setFromCamera(centerPoint, camera);
        const intersects = raycaster.intersectObjects([...effects, planetCore]);

        if (!isTestMode && intersects.length > 0) {
            const pt = intersects[0].point; hitMarker.position.copy(pt); hitMarker.visible = true;
            if (isDigging) {
                const mode = allModes[currentModeIndex];
                if (!mode.isWeapon && !mode.isTurret) {
                    // 编辑模式：检测主导材质并只破坏该材质，忽略硬度
                    const localPos = effects[0].worldToLocal(pt.clone());
                    const gX = ((localPos.x + 1) / 2) * RES;
                    const gY = ((localPos.y + 1) / 2) * RES;
                    const gZ = ((localPos.z + 1) / 2) * RES;
                    const idx = Math.floor(gX) + Math.floor(gY) * RES + Math.floor(gZ) * RES * RES;

                    let dominantMatIdx = 0;
                    let maxValue = effects[0].field[idx] || 0;
                    for (let mi = 1; mi < effects.length; mi++) {
                        const val = effects[mi].field[idx] || 0;
                        if (val > maxValue) {
                            maxValue = val;
                            dominantMatIdx = mi;
                        }
                    }

                    applyVoxelEdit(pt, false, dt, dominantMatIdx, true); // 编辑模式忽略硬度
                }
            }
            if (isFilling) applyVoxelEdit(pt.clone().add(raycaster.ray.direction.clone().multiplyScalar(-0.2)), true, dt, null, true); // 编辑模式忽略硬度
        } else {
            hitMarker.visible = false;
        }
    }
    renderer.render(scene, camera);
};

setupUI();
init();
enterGameMode(); // 自动进入游戏模式
animate();