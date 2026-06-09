// --- 全局防縮放事件攔截 (iOS / Android 萬無一失) ---
document.addEventListener('gesturestart', function(e) { e.preventDefault(); });
document.addEventListener('gesturechange', function(e) { e.preventDefault(); });
document.addEventListener('gestureend', function(e) { e.preventDefault(); });
// 阻止雙擊放大
let lastTouchEnd = 0;
document.addEventListener('touchend', function(e) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) { e.preventDefault(); }
    lastTouchEnd = now;
}, false);

// --- 1. 基礎 3D 場景初始化 ---
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1a);
scene.fog = new THREE.Fog(0x1a1a1a, 20, 50);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);

// 燈光
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(15, 30, 15);
dirLight.castShadow = true;
scene.add(dirLight);

// 地面
const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshLambertMaterial({ color: 0x333333 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
scene.add(new THREE.GridHelper(100, 100, 0x444444, 0x222222));

// --- 2. 主角（手持長劍，正面方向明確） ---
const playerGroup = new THREE.Group();
const playerMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });

// 身體
const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.5), playerMat);
body.position.y = 0.7;
body.castShadow = true;
playerGroup.add(body);

// 頭
const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), playerMat);
head.position.y = 1.65;
head.castShadow = true;
playerGroup.add(head);

// 增加眼睛/面具方便辨識正反面
const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0x333333 }));
eyes.position.set(0, 1.7, -0.25);
playerGroup.add(eyes);

// 神級長劍
const swordGroup = new THREE.Group();
const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.02), new THREE.MeshBasicMaterial({ color: 0xffffff }));
blade.position.y = 0.6;
swordGroup.add(blade);
const hiltMat = new THREE.MeshLambertMaterial({ color: 0xf1c40f });
const guard = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.05), hiltMat);
swordGroup.add(guard);
const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3), hiltMat);
hilt.position.y = -0.15;
swordGroup.add(hilt);
const swordLight = new THREE.PointLight(0xf1c40f, 1, 3);
swordLight.position.y = 0.6;
swordGroup.add(swordLight);

// 精準擺放至右手前側
swordGroup.rotation.x = -Math.PI / 2;
swordGroup.rotation.z = Math.PI / 4; 
swordGroup.position.set(0.6, 0.8, -0.4);
playerGroup.add(swordGroup);

playerGroup.position.set(-3, 0, 0);
scene.add(playerGroup);

// 木頭人
const dummy = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.5, 12), new THREE.MeshLambertMaterial({ color: 0xff4444 }));
dummy.position.set(2, 0.75, 0);
dummy.castShadow = true;
scene.add(dummy);

const playerData = { atk: 120, critRate: 0.4, talentMultiplier: 0.5, gearMultiplier: 0.3 };
const dummyData = { def: 10 };

// --- 3. 獨立多點觸控：支援同時操控搖桿與旋轉視角 ---
const keys = { w:0, a:0, s:0, d:0 };
const joystickInput = { x: 0, y: 0 };

const joystickZone = document.getElementById('joystick-zone');
const joystickKnob = document.getElementById('joystick-knob');

let joystickTouchId = null;  // 記錄控制搖桿的那個手指 ID
let cameraTouchId = null;    // 記錄控制相機旋轉的那個手指 ID
let joystickStartPos = { x: 0, y: 0 };
const maxRadius = 50;

let cameraYAngle = 0; 
let cameraXAngle = -Math.PI / 6;
const cameraDistance = 8;
let prevMouseX = 0, prevMouseY = 0;
let isMouseDown = false; // PC端滑鼠專用

// 監聽整個畫面的 TouchStart
window.addEventListener('touchstart', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        
        // 如果點擊在右側按鈕區域，由按鈕綁定的獨立觸控監聽器處理，不干擾視角與搖桿
        if (touch.target.closest('#mobile-controls')) continue;

        // 檢查是否點在搖桿區域且搖桿未被佔用
        if (touch.target.closest('#joystick-zone') && joystickTouchId === null) {
            joystickTouchId = touch.identifier;
            const rect = joystickZone.getBoundingClientRect();
            joystickStartPos = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        } 
        // 否則，這根手指用來旋轉相機視角
        else if (cameraTouchId === null) {
            cameraTouchId = touch.identifier;
            prevMouseX = touch.clientX;
            prevMouseY = touch.clientY;
        }
    }
}, { passive: false });

// 監聽 TouchMove
window.addEventListener('touchmove', (e) => {
    for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];

        // A. 處理搖桿手指移動
        if (touch.identifier === joystickTouchId) {
            let deltaX = touch.clientX - joystickStartPos.x;
            let deltaY = touch.clientY - joystickStartPos.y;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            if (distance > maxRadius) {
                deltaX = (deltaX / distance) * maxRadius;
                deltaY = (deltaY / distance) * maxRadius;
            }
            joystickKnob.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
            joystickInput.x = deltaX / maxRadius;
            joystickInput.y = deltaY / maxRadius;
        }

        // B. 處理相機旋轉手指移動
        if (touch.identifier === cameraTouchId) {
            const deltaX = touch.clientX - prevMouseX;
            const deltaY = touch.clientY - prevMouseY;

            cameraYAngle -= deltaX * 0.008;
            cameraXAngle -= deltaY * 0.008;
            cameraXAngle = Math.max(-Math.PI / 2.3, Math.min(-Math.PI / 12, cameraXAngle));

            prevMouseX = touch.clientX;
            prevMouseY = touch.clientY;
        }
    }
}, { passive: false });

// 監聽 TouchEnd / TouchCancel
const handleTouchEnd = (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === joystickTouchId) {
            joystickTouchId = null;
            joystickKnob.style.transform = `translate(0px, 0px)`;
            joystickInput.x = 0;
            joystickInput.y = 0;
        }
        if (touch.identifier === cameraTouchId) {
            cameraTouchId = null;
        }
    }
};
window.addEventListener('touchend', handleTouchEnd);
window.addEventListener('touchcancel', handleTouchEnd);

// PC端滑鼠事件相容
container.addEventListener('mousedown', (e) => {
    if (e.target.closest('#mobile-controls') || e.target.closest('#joystick-zone')) return;
    isMouseDown = true;
    prevMouseX = e.clientX; prevMouseY = e.clientY;
});
window.addEventListener('mousemove', (e) => {
    if (!isMouseDown) return;
    const deltaX = e.clientX - prevMouseX;
    const deltaY = e.clientY - prevMouseY;
    cameraYAngle -= deltaX * 0.005;
    cameraXAngle -= deltaY * 0.005;
    cameraXAngle = Math.max(-Math.PI / 2.3, Math.min(-Math.PI / 12, cameraXAngle));
    prevMouseX = e.clientX; prevMouseY = e.clientY;
});
window.addEventListener('mouseup', () => isMouseDown = false);

// 鍵盤事件
window.addEventListener('keydown', (e) => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = 1; });
window.addEventListener('keyup', (e) => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = 0; });

function updateCamera() {
    const playerPos = playerGroup.position;
    const offsetX = cameraDistance * Math.sin(cameraYAngle) * Math.cos(cameraXAngle);
    const offsetY = -cameraDistance * Math.sin(cameraXAngle);
    const offsetZ = cameraDistance * Math.cos(cameraYAngle) * Math.cos(cameraXAngle);

    camera.position.set(playerPos.x + offsetX, playerPos.y + offsetY, playerPos.z + offsetZ);
    camera.lookAt(playerPos.x, playerPos.y + 1.2, playerPos.z);
}

// --- 4. 戰鬥邏輯核心 ---
function castSkill(type) {
    let multiplier = 1.0;
    let effectColor = 0xf1c40f;

    if (type === 'A') { 
        multiplier = 1.0; 
    } 
    else if (type === 'B') { 
        multiplier = 2.2; 
        effectColor = 0xe67e22; 
        
        // 【精準面向向量】
        // Three.js 預設模型正面朝向是 負Z 軸 (0, 0, -1)。
        const forwardVector = new THREE.Vector3(0, 0, -1);
        // 將角色當前的四元數旋轉矩陣套用到該向量，得到精準的「世界朝向向量」
        forwardVector.applyQuaternion(playerGroup.quaternion);
        forwardVector.y = 0; // 鎖定水平面
        forwardVector.normalize();

        // 沿著角色正面方向向前噴射位移 3.5 個單位
        playerGroup.position.addScaledVector(forwardVector, 3.5);
    }

    // 傷害判定連動後端
    const dist = playerGroup.position.distanceTo(dummy.position);
    if (dist < 3.8) {
        fetch('/api/calculate-damage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attacker: playerData, defender: dummyData, skillMultiplier: multiplier })
        })
        .then(res => res.json())
        .then(data => {
            createDamageText(data.damage, data.isCrit);
            createHitEffect(effectColor);
        });
    }
}

// 【重要修正】：為 MOBA 按鈕綁定 touchstart 原生事件
// 使用 touchstart 代替 onclick 避免被左手滑動中的搖桿事件阻斷，實現移動時同步流暢施法
document.getElementById('btn-atk').addEventListener('touchstart', (e) => { e.preventDefault(); castSkill('A'); }, { passive: false });
document.getElementById('btn-skill-a').addEventListener('touchstart', (e) => { e.preventDefault(); castSkill('A'); }, { passive: false }); // 技能A目前也是綁定A普攻測試
document.getElementById('btn-skill-b').addEventListener('touchstart', (e) => { e.preventDefault(); castSkill('B'); }, { passive: false });

// PC 滑鼠相容點擊按鈕
document.getElementById('btn-atk').addEventListener('mousedown', (e) => { e.stopPropagation(); castSkill('A'); });
document.getElementById('btn-skill-a').addEventListener('mousedown', (e) => { e.stopPropagation(); castSkill('A'); });
document.getElementById('btn-skill-b').addEventListener('mousedown', (e) => { e.stopPropagation(); castSkill('B'); });

window.addEventListener('keydown', (e) => {
    if(e.key.toLowerCase() === 'j') castSkill('A');
    if(e.key.toLowerCase() === 'k') castSkill('B');
});

// 傷害飄字與特效
function createDamageText(amount, isCrit) {
    const div = document.createElement('div');
    div.className = `damage-text ${isCrit ? 'crit' : 'normal'}`;
    div.innerText = (isCrit ? '🔥 CRIT! ' : '') + amount;
    
    const wp = new THREE.Vector3();
    dummy.getWorldPosition(wp);
    wp.y += 1.8;
    wp.project(camera);

    const x = (wp.x * .5 + .5) * window.innerWidth;
    const y = (-(wp.y * .5) + .5) * window.innerHeight;

    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 800);
}

// 簡易打擊視覺特效
function createHitEffect(color) {
    const p = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 8, 16), new THREE.MeshBasicMaterial({ color: color }));
    p.position.copy(dummy.position);
    p.position.y += 0.75;
    scene.add(p);
    setTimeout(() => scene.remove(p), 120);
}

// --- 5. 遊戲主迴圈與精準運動學轉向 ---
function animate() {
    requestAnimationFrame(animate);

    const speed = 0.15;
    const camForward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraYAngle);
    const camRight = camForward.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();

    const finalMove = new THREE.Vector3(0, 0, 0);

    if (keys.w) finalMove.add(camForward);
    if (keys.s) finalMove.sub(camForward);
    if (keys.a) finalMove.sub(camRight);
    if (keys.d) finalMove.add(camRight);

    if (joystickInput.x !== 0 || joystickInput.y !== 0) {
        finalMove.addScaledVector(camRight, joystickInput.x);
        finalMove.addScaledVector(camForward, -joystickInput.y);
    }

    if (finalMove.length() > 0) {
        finalMove.normalize();
        playerGroup.position.addScaledVector(finalMove, speed);
        
        const targetRotation = Math.atan2(finalMove.x, finalMove.z);
        playerGroup.rotation.y = targetRotation; 
    }

    updateCamera();
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
