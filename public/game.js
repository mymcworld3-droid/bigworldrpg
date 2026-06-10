// --- 全局防縮放事件攔截 ---
document.addEventListener('gesturestart', function(e) { e.preventDefault(); });
document.addEventListener('gesturechange', function(e) { e.preventDefault(); });
document.addEventListener('gestureend', function(e) { e.preventDefault(); });
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

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(15, 30, 15);
dirLight.castShadow = true;
scene.add(dirLight);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshLambertMaterial({ color: 0x333333 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
scene.add(new THREE.GridHelper(100, 100, 0x444444, 0x222222));

// --- 2. 角色與怪物群資料結構 ---
const playerGroup = new THREE.Group();
scene.add(playerGroup); 

// 備用臨時方塊人
const fallbackCube = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.6, 0.5), 
    new THREE.MeshLambertMaterial({ color: 0x555555, transparent: true, opacity: 0.8 })
);
fallbackCube.position.y = 0.8;
playerGroup.add(fallbackCube);

// 載入外部模型
const loader = new THREE.GLTFLoader();
loader.load(
    './model/paladin.glb', 
    function (gltf) {
        playerGroup.remove(fallbackCube);
        const model = gltf.scene;
        model.scale.set(1.0, 1.0, 1.0); 
        model.position.y = 0; 
        model.traverse(node => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
        playerGroup.add(model);
        console.log("🚀 [成功] 人型模型載入成功！");
    },
    undefined,
    error => { console.error('❌ 模型載入失敗，使用備用方塊人。原因：', error); }
);

// 附加神級長劍
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
swordGroup.rotation.x = -Math.PI / 2;
swordGroup.rotation.z = Math.PI / 4; 
swordGroup.position.set(0.6, 0.8, -0.4);
playerGroup.add(swordGroup);
playerGroup.position.set(-3, 0, 0);

// 技能冷卻與資料設定（100% 力量即為面板攻擊力 120）
const playerData = { atk: 120, critRate: 0.4, talentMultiplier: 0.5, gearMultiplier: 0.3 };
const skillCooldowns = { A: false, B: false };

// 建立多個小怪/木頭人陣列，以便進行群攻範圍計算
const targets = [];
function createTarget(x, z, name) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.5, 12), new THREE.MeshLambertMaterial({ color: 0xff4444 }));
    mesh.position.set(x, 0.75, z);
    mesh.castShadow = true;
    scene.add(mesh);
    targets.push({ mesh: mesh, def: 10, name: name });
}
// 放三個木頭人，方便測試「範圍割草」
createTarget(2, 0, "木頭人 A");
createTarget(3.5, 1.5, "木頭人 B");
createTarget(3.5, -1.5, "木頭人 C");

// --- 3. 虛擬搖桿與輸入監聽 (多點觸控) ---
const keys = { w:0, a:0, s:0, d:0 };
const joystickInput = { x: 0, y: 0 };
const joystickZone = document.getElementById('joystick-zone');
const joystickKnob = document.getElementById('joystick-knob');
let joystickTouchId = null, cameraTouchId = null;
let joystickStartPos = { x: 0, y: 0 };
const maxRadius = 50;

let cameraYAngle = 0, cameraXAngle = -Math.PI / 6;
const cameraDistance = 8;
let prevMouseX = 0, prevMouseY = 0, isMouseDown = false;

window.addEventListener('touchstart', (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.target.closest('#mobile-controls')) continue;
        if (touch.target.closest('#joystick-zone') && joystickTouchId === null) {
            joystickTouchId = touch.identifier;
            const rect = joystickZone.getBoundingClientRect();
            joystickStartPos = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        } else if (cameraTouchId === null) {
            cameraTouchId = touch.identifier;
            prevMouseX = touch.clientX; prevMouseY = touch.clientY;
        }
    }
}, { passive: false });

window.addEventListener('touchmove', (e) => {
    for (let i = 0; i < e.touches.length; i++) {
        const touch = e.touches[i];
        if (touch.identifier === joystickTouchId) {
            let deltaX = touch.clientX - joystickStartPos.x;
            let deltaY = touch.clientY - joystickStartPos.y;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            if (distance > maxRadius) {
                deltaX = (deltaX / distance) * maxRadius;
                deltaY = (deltaY / distance) * maxRadius;
            }
            joystickKnob.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
            joystickInput.x = deltaX / maxRadius; joystickInput.y = deltaY / maxRadius;
        }
        if (touch.identifier === cameraTouchId) {
            cameraYAngle -= (touch.clientX - prevMouseX) * 0.008;
            cameraXAngle = Math.max(-Math.PI / 2.3, Math.min(-Math.PI / 12, cameraXAngle - (touch.clientY - prevMouseY) * 0.008));
            prevMouseX = touch.clientX; prevMouseY = touch.clientY;
        }
    }
}, { passive: false });

const handleTouchEnd = (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === joystickTouchId) {
            joystickTouchId = null; joystickKnob.style.transform = `translate(0px, 0px)`;
            joystickInput.x = 0; joystickInput.y = 0;
        }
        if (touch.identifier === cameraTouchId) cameraTouchId = null;
    }
};
window.addEventListener('touchend', handleTouchEnd);
window.addEventListener('touchcancel', handleTouchEnd);

container.addEventListener('mousedown', (e) => {
    if (e.target.closest('#mobile-controls') || e.target.closest('#joystick-zone')) return;
    isMouseDown = true; prevMouseX = e.clientX; prevMouseY = e.clientY;
});
window.addEventListener('mousemove', (e) => {
    if (!isMouseDown) return;
    cameraYAngle -= (e.clientX - prevMouseX) * 0.005;
    cameraXAngle = Math.max(-Math.PI / 2.3, Math.min(-Math.PI / 12, cameraXAngle - (e.clientY - prevMouseY) * 0.005));
    prevMouseX = e.clientX; prevMouseY = e.clientY;
});
window.addEventListener('mouseup', () => isMouseDown = false);
window.addEventListener('keydown', (e) => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = 1; });
window.addEventListener('keyup', (e) => { if(keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = 0; });

function updateCamera() {
    const pPos = playerGroup.position;
    camera.position.set(pPos.x + cameraDistance * Math.sin(cameraYAngle) * Math.cos(cameraXAngle), pPos.y - cameraDistance * Math.sin(cameraXAngle), pPos.z + cameraDistance * Math.cos(cameraYAngle) * Math.cos(cameraXAngle));
    camera.lookAt(pPos.x, pPos.y + 1.2, pPos.z);
}

// --- 4. 核心功能：3D 傷害範圍函式 (AOE 計算) ---
/**
 * @param {string} shape 幾何形狀 - "sector" (扇形) 或 "line" (直線)
 * @param {number} range 判定距離或長度
 * @param {number} skillMultiplier 技能倍率 (1.0 代表 100% 力量)
 * @param {object} params 額外參數，如扇形角度 angle, 直線起終點
 */
function calculateAreaDamage(shape, range, skillMultiplier, params = {}) {
    // 獲取玩家目前的水平面向世界向量 (預設正面為正 Z 軸 (0,0,1)) [cite: 34]
    const playerForward = new THREE.Vector3(0, 0, 1).applyQuaternion(playerGroup.quaternion);
    playerForward.y = 0;
    playerForward.normalize();

    targets.forEach(target => {
        const enemyPos = target.mesh.position;
        // 計算玩家到怪物的相對向量
        const toEnemy = new THREE.Vector3().subVectors(enemyPos, playerGroup.position);
        toEnemy.y = 0;
        const distance = toEnemy.length();

        let isHit = false;

        // A. 扇形範圍判定 (普攻、技能 A) 
        if (shape === "sector") {
            const maxAngle = params.angle || Math.PI / 3; // 預設 60 度扇形
            if (distance <= range) {
                toEnemy.normalize();
                // 透過向量內積 (Dot Product) 計算玩家面朝方向與怪物的夾角
                const dotProduct = playerForward.dot(toEnemy);
                const angle = Math.acos(Math.min(1, Math.max(-1, dotProduct))); // 夾角弧度
                if (angle <= maxAngle / 2) {
                    isHit = true;
                }
            }
        }
        // B. 直線路徑判定 (突進斬) 
        else if (shape === "line" && params.startPos && params.endPos) {
            // 計算點到線段的最短距離 (膠囊體碰撞體模擬)
            const lineVec = new THREE.Vector3().subVectors(params.endPos, params.startPos);
            lineVec.y = 0;
            const lineLen = lineVec.length();
            lineVec.normalize();

            const targetVec = new THREE.Vector3().subVectors(enemyPos, params.startPos);
            targetVec.y = 0;

            // 投影長度
            let projection = targetVec.dot(lineVec);
            // 限制在線段內
            projection = Math.max(0, Math.min(lineLen, projection));

            // 找到線段上距離怪物最近的點
            const closestPoint = params.startPos.clone().addScaledVector(lineVec, projection);
            const distToLine = enemyPos.distanceTo(closestPoint);

            if (distToLine <= 1.2) { // 1.2 為突進的左右橫向判定寬度
                isHit = true;
            }
        }

        // 如果在範圍內，打包發送至後端做「乘區計算」並彈出「深紅色」傷害飄字 [cite: 17, 18]
        if (isHit) {
            fetch('/api/calculate-damage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attacker: playerData, defender: { def: target.def }, skillMultiplier: skillMultiplier })
            })
            .then(res => res.json())
            .then(data => {
                createDamageText(target.mesh, data.damage, data.isCrit, params.color || "#8b0000"); // 傳入深紅色
                createHitEffect(target.mesh.position, 0xff0000);
            });
        }
    });
}

// --- 5. 技能釋放機制重構 ---
function executeCombatSkill(type) {
    if (type === 'A') {
        // 【普攻】前面短距離扇形，10% 力量的傷害 
        // 參數：形狀"sector", 距離3.25, 倍率0.1 (10%力量), 扇形角度90度
        calculateAreaDamage("sector", 3.25, 0.1, { angle: Math.PI / 2, color: "#8b0000" }); 
        createWeaponSwingEffect(0xf1c40f);
    } 
    else if (type === 'SKILL_A') {
        if (skillCooldowns.A) return;
        skillCooldowns.A = true;
        
        // 進入冷卻UI視覺反饋
        const btn = document.getElementById('btn-skill-a');
        btn.style.background = "#333";
        setTimeout(() => { skillCooldowns.A = false; btn.style.background = "rgba(80, 80, 80, 0.65)"; }, 5000); // cd5秒

        // 【技能A】普攻三次，每下 10% 力量，間隔 0.1 秒 
        let count = 0;
        const interval = setInterval(() => {
            calculateAreaDamage("sector", 3.5, 0.1, { angle: Math.PI / 1.8, color: "#8b0000" });
            createWeaponSwingEffect(0xffaa00);
            count++;
            if (count >= 3) clearInterval(interval);
        }, 100); // 間隔0.1秒
    } 
    else if (type === 'SKILL_B') {
        if (skillCooldowns.B) return;
        skillCooldowns.B = true;

        const btn = document.getElementById('btn-skill-b');
        btn.style.background = "#333";
        setTimeout(() => { skillCooldowns.B = false; btn.style.background = "rgba(80, 80, 80, 0.65)"; }, 6000); // cd6秒

        // 記錄突進前起點位置
        const startPos = playerGroup.position.clone();

        // 獲取當前朝向並計算終點位置
        const forwardVector = new THREE.Vector3(0, 0, 1).applyQuaternion(playerGroup.quaternion);
        forwardVector.y = 0; forwardVector.normalize();
        
        // 瞬間物理位移 4.5 個單位 [cite: 34]
        playerGroup.position.addScaledVector(forwardVector, 4.5);
        const endPos = playerGroup.position.clone();

        // 【技能B：突進】對移動路徑上的所有敵人造成 50% 力量的傷害 
        calculateAreaDamage("line", 0, 0.5, { startPos: startPos, endPos: endPos, color: "#8b0000" });
        
        // 突進殘影特效
        createWeaponSwingEffect(0xe67e22);
    }
}

// 綁定傳說對決式觸控原生事件（確保移動時暢快施法）
document.getElementById('btn-atk').addEventListener('touchstart', (e) => { e.preventDefault(); executeCombatSkill('A'); }, { passive: false });
document.getElementById('btn-skill-a').addEventListener('touchstart', (e) => { e.preventDefault(); executeCombatSkill('SKILL_A'); }, { passive: false });
document.getElementById('btn-skill-b').addEventListener('touchstart', (e) => { e.preventDefault(); executeCombatSkill('SKILL_B'); }, { passive: false });

// PC 滑鼠端相容
document.getElementById('btn-atk').addEventListener('mousedown', (e) => { e.stopPropagation(); executeCombatSkill('A'); });
document.getElementById('btn-skill-a').addEventListener('mousedown', (e) => { e.stopPropagation(); executeCombatSkill('SKILL_A'); });
document.getElementById('btn-skill-b').addEventListener('mousedown', (e) => { e.stopPropagation(); executeCombatSkill('SKILL_B'); });

window.addEventListener('keydown', (e) => {
    if(e.key.toLowerCase() === 'j') executeCombatSkill('A');
    if(e.key.toLowerCase() === 'k') executeCombatSkill('SKILL_A');
});

// --- 6. 視覺增強特效與深紅色傷害飄字 ---
function createDamageText(targetMesh, amount, isCrit, colorHex) {
    const div = document.createElement('div');
    div.className = 'damage-text';
    div.style.color = colorHex; // 死死套用要求的深紅色 (#8b0000)
    
    if (isCrit) {
        div.className = 'damage-text crit';
        div.innerText = '💥 ' + amount;
    } else {
        div.innerText = amount;
    }
    
    const wp = new THREE.Vector3();
    targetMesh.getWorldPosition(wp);
    wp.y += 1.8;
    wp.project(camera);

    div.style.left = `${(wp.x * .5 + .5) * window.innerWidth}px`;
    div.style.top = `${(-(wp.y * .5) + .5) * window.innerHeight}px`;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 800);
}

function createHitEffect(pos, color) {
    const p = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 8, 16), new THREE.MeshBasicMaterial({ color: color }));
    p.position.copy(pos); p.position.y += 0.75; scene.add(p);
    setTimeout(() => scene.remove(p), 100);
}

function createWeaponSwingEffect(color) {
    const swingGeo = new THREE.RingGeometry(0.1, 1.5, 16, 1, 0, Math.PI);
    const swingMat = new THREE.MeshBasicMaterial({ color: color, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
    const swing = new THREE.Mesh(swingGeo, swingMat);
    swing.position.copy(playerGroup.position);
    swing.position.y += 0.8;
    swing.rotation.x = -Math.PI / 2;
    swing.rotation.z = playerGroup.rotation.y + Math.PI/2;
    scene.add(swing);
    setTimeout(() => scene.remove(swing), 150);
}

// --- 7. 遊戲主迴圈與精準轉向 ---
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
        playerGroup.rotation.y = targetRotation + Math.PI; // 100% 正向轉向對齊 [cite: 38]
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
