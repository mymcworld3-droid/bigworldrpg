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

// 數據設定
const playerData = { atk: 120, critRate: 0.4, talentMultiplier: 0.5, gearMultiplier: 0.3 };
const skillCooldowns = { A: false, B: false };

// --- 突進狀態機 (避免瞬移) ---
let dashState = {
    isDashing: false,
    direction: new THREE.Vector3(),
    speed: 0.6,          // 每幀移動距離
    currentFrame: 0,
    maxFrames: 8,        // 持續 8 幀的高速滑行
    startPos: new THREE.Vector3(),
    endPos: new THREE.Vector3(),
    skillMultiplier: 0.5
};

// 建立木頭人
const targets = [];
function createTarget(x, z, name) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.5, 12), new THREE.MeshLambertMaterial({ color: 0xff4444 }));
    mesh.position.set(x, 0.75, z);
    mesh.castShadow = true;
    scene.add(mesh);
    targets.push({ mesh: mesh, def: 10, name: name });
}
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

// --- 4. 修正後：3D 傷害範圍函式 (AOE 計算) ---
function calculateAreaDamage(shape, range, skillMultiplier, params = {}) {
    // 【核心轉向校正 1】：模型在外觀主迴圈旋轉時補償了 Math.PI。
    // 因此，為了拿到正確的「角色前方世界向量」，我們必須將基礎前進向量設定為正 Z 軸 (0, 0, 1)。
    // 這樣普攻與位移判定就會 100% 準確發生在眼睛面具所看的前方！ 
    const playerForward = new THREE.Vector3(0, 0, 1).applyQuaternion(playerGroup.quaternion);
    playerForward.y = 0;
    playerForward.normalize();

    targets.forEach(target => {
        const enemyPos = target.mesh.position;
        const toEnemy = new THREE.Vector3().subVectors(enemyPos, playerGroup.position);
        toEnemy.y = 0;
        const distance = toEnemy.length();

        let isHit = false;

        // A. 扇形範圍判定 (普攻前方判定修正) 
        if (shape === "sector") {
            const maxAngle = params.angle || Math.PI / 3; 
            if (distance <= range) {
                const checkToEnemy = toEnemy.clone().normalize();
                const dotProduct = playerForward.dot(checkToEnemy);
                const angle = Math.acos(Math.min(1, Math.max(-1, dotProduct))); 
                if (angle <= maxAngle / 2) {
                    isHit = true;
                }
            }
        }
        // B. 直線路徑判定 (突進斬修正) 
        else if (shape === "line" && params.startPos && params.endPos) {
            const lineVec = new THREE.Vector3().subVectors(params.endPos, params.startPos);
            lineVec.y = 0;
            const lineLen = lineVec.length();
            lineVec.normalize();

            const targetVec = new THREE.Vector3().subVectors(enemyPos, params.startPos);
            targetVec.y = 0;

            let projection = targetVec.dot(lineVec);
            projection = Math.max(0, Math.min(lineLen, projection));

            const closestPoint = params.startPos.clone().addScaledVector(lineVec, projection);
            const distToLine = enemyPos.distanceTo(closestPoint);

            if (distToLine <= 1.5) { // 寬度判定
                isHit = true;
            }
        }

        // 打中時呼叫後端乘區 API 並顯示深紅色
        if (isHit) {
            fetch('/api/calculate-damage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attacker: playerData, defender: { def: target.def }, skillMultiplier: skillMultiplier })
            })
            .then(res => res.json())
            .then(data => {
                createDamageText(target.mesh, data.damage, data.isCrit, params.color || "#8b0000"); 
                createHitEffect(target.mesh.position, 0xff0000);
            });
        }
    });
}

// --- 5. 技能釋放機制 (導入平滑衝刺狀態) ---
function executeCombatSkill(type) {
    if (dashState.isDashing) return; // 衝刺中禁止穿插其他技能

    if (type === 'A') {
        calculateAreaDamage("sector", 3.25, 0.1, { angle: Math.PI / 2, color: "#8b0000" }); 
        createWeaponSwingEffect(0xf1c40f);
    } 
    else if (type === 'SKILL_A') {
        if (skillCooldowns.A) return;
        skillCooldowns.A = true;
        
        const btn = document.getElementById('btn-skill-a');
        btn.style.background = "#333";
        setTimeout(() => { skillCooldowns.A = false; btn.style.background = "rgba(80, 80, 80, 0.65)"; }, 5000); 

        let count = 0;
        const interval = setInterval(() => {
            calculateAreaDamage("sector", 3.5, 0.1, { angle: Math.PI / 1.8, color: "#8b0000" });
            createWeaponSwingEffect(0xffaa00);
            count++;
            if (count >= 3) clearInterval(interval);
        }, 100); 
    } 
    else if (type === 'SKILL_B') {
        if (skillCooldowns.B) return;
        skillCooldowns.B = true;

        const btn = document.getElementById('btn-skill-b');
        btn.style.background = "#333";
        setTimeout(() => { skillCooldowns.B = false; btn.style.background = "rgba(80, 80, 80, 0.65)"; }, 6000); 

        // 【核心修正 2：突進方向導正與非瞬移滑行初始化】
        // 取模型眼睛面對的基準方向 (0, 0, 1)
        const forwardVector = new THREE.Vector3(0, 0, 1).applyQuaternion(playerGroup.quaternion);
        forwardVector.y = 0; forwardVector.normalize();

        // 配置衝刺狀態機，交由 animate 主迴圈逐幀執行平滑滑行
        dashState.isDashing = true;
        dashState.direction.copy(forwardVector);
        dashState.currentFrame = 0;
        dashState.startPos.copy(playerGroup.position);
        
        createWeaponSwingEffect(0xe67e22);
    }
}

// 事件綁定
document.getElementById('btn-atk').addEventListener('touchstart', (e) => { e.preventDefault(); executeCombatSkill('A'); }, { passive: false });
document.getElementById('btn-skill-a').addEventListener('touchstart', (e) => { e.preventDefault(); executeCombatSkill('SKILL_A'); }, { passive: false });
document.getElementById('btn-skill-b').addEventListener('touchstart', (e) => { e.preventDefault(); executeCombatSkill('SKILL_B'); }, { passive: false });

document.getElementById('btn-atk').addEventListener('mousedown', (e) => { e.stopPropagation(); executeCombatSkill('A'); });
document.getElementById('btn-skill-a').addEventListener('mousedown', (e) => { e.stopPropagation(); executeCombatSkill('SKILL_A'); });
document.getElementById('btn-skill-b').addEventListener('mousedown', (e) => { e.stopPropagation(); executeCombatSkill('SKILL_B'); });

window.addEventListener('keydown', (e) => {
    if(e.key.toLowerCase() === 'j') executeCombatSkill('A');
    if(e.key.toLowerCase() === 'k') executeCombatSkill('SKILL_A');
    if(e.key.toLowerCase() === 'l') executeCombatSkill('SKILL_B');
});

// --- 6. 核心修復：傷害飄字 3D 轉 2D 矩陣投影 ---
function createDamageText(targetMesh, amount, isCrit, colorHex) {
    const div = document.createElement('div');
    div.className = 'damage-text';
    div.style.color = colorHex; // 死死套用深紅色
    
    if (isCrit) {
        div.className = 'damage-text crit';
        div.innerText = '💥 ' + amount;
    } else {
        div.innerText = amount;
    }
    
    // 【核心修正 3】：必須傳入一個實體化 Vector3 容器來接收 3D 世界坐標，否則 project 公式會完全失效、導致字體出不來
    const wp = new THREE.Vector3();
    targetMesh.getWorldPosition(wp);
    wp.y += 2.0; // 飄在木頭人頭頂
    wp.project(camera);

    // 轉換成螢幕畫面的 absolute 絕對像素位置
    const x = (wp.x * .5 + .5) * window.innerWidth;
    const y = (-(wp.y * .5) + .5) * window.innerHeight;

    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
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
    // 配合角色的 180 度補償調整視覺特效偏角
    swing.rotation.z = playerGroup.rotation.y - Math.PI/2;
    scene.add(swing);
    setTimeout(() => scene.remove(swing), 150);
}

// --- 7. 遊戲主迴圈與運動學處理 ---
function animate() {
    requestAnimationFrame(animate);
    
    // A. 如果處於突進狀態中，執行平滑的高速每幀位移滑行
    if (dashState.isDashing) {
        playerGroup.position.addScaledVector(dashState.direction, dashState.speed);
        dashState.currentFrame++;
        
        // 當滑行結束時，計算整條路徑的直線 AOE 傷害判定
        if (dashState.currentFrame >= dashState.maxFrames) {
            dashState.isDashing = false;
            dashState.endPos.copy(playerGroup.position);
            
            // 觸發直線割草碰撞
            calculateAreaDamage("line", 0, dashState.skillMultiplier, { 
                startPos: dashState.startPos, 
                endPos: dashState.endPos, 
                color: "#8b0000" 
            });
        }
    } 
    // B. 一般移動模式 (WASD / 虛擬搖桿)
    else {
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
            playerGroup.rotation.y = targetRotation + Math.PI; // 100% 正向轉向對齊 
        }
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
