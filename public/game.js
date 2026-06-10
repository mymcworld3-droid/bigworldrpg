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

// --- 2. 主角（改為異步載入外部人型 GLB 模型） ---
const playerGroup = new THREE.Group();
scene.add(playerGroup); // 先把空容器加進場景，確保主迴圈運動學不會報錯

// 建立 GLTF 載入器
const loader = new THREE.GLTFLoader();

// 載入你放在 public/models/ 裡面的模型
loader.load(
    'models/paladin.glb', 
    function (gltf) {
        const model = gltf.scene;
        
        // 1. 調整模型大小 (外部下載的模型通常很大或很小，用這行縮放)
        // 如果載入後看不到人，請試著調整 0.5 或者是 2.0
        model.scale.set(0.6, 0.6, 0.6); 
        
        // 2. 調整模型的初始面朝方向
        // 如果發現載入人型後，「搖桿往前走，人卻橫著移動」，可以在這裡微調它的初始轉向
        // model.rotation.y = Math.PI; 

        // 3. 讓模型開啟陰影接收與投射
        model.traverse(function (node) {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
            }
        });

        // 4. 將載入完的人型模型放入我們原本的控制容器中
        playerGroup.add(model);
        
        console.log("神級職業人型模型載入成功！");
    },
    // 載入進度追蹤 (非必要，可留空)
    function (xhr) {
        console.log((xhr.loaded / xhr.total * 100) + '% loaded');
    },
    // 載入錯誤抓取
    function (error) {
        console.error('模型載入失敗，請檢查路徑與格式：', error);
    }
);

// 【保留原本附加在右手邊的神級長劍】
// 提示：如果外部模型本身就自帶武器，你可以把這段移除
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

// 精準擺放至控制容器的右手前側
swordGroup.rotation.x = -Math.PI / 2;
swordGroup.rotation.z = Math.PI / 4; 
swordGroup.position.set(0.6, 0.8, -0.4);
playerGroup.add(swordGroup);

playerGroup.position.set(-3, 0, 0);

// 木頭人保持不變
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
        
        // 【核心修正 1：突進位移朝向徹底對齊】
        // 由於我們將模型轉向修正了 180 度，模型現在真正的正面在世界坐標系中變成了 正 Z 軸方向 (0, 0, 1)。
        const forwardVector = new THREE.Vector3(0, 0, 1);
        
        // 套用角色當前的四元數旋轉，即可得到 100% 與面部黑面具直視方向一致的向前突進向量
        forwardVector.applyQuaternion(playerGroup.quaternion);
        forwardVector.y = 0; 
        forwardVector.normalize();

        // 沿著角色眼睛看去的方向，精準向前噴射突進
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

// 為 MOBA 按鈕綁定 touchstart 原生事件
document.getElementById('btn-atk').addEventListener('touchstart', (e) => { e.preventDefault(); castSkill('A'); }, { passive: false });
document.getElementById('btn-skill-a').addEventListener('touchstart', (e) => { e.preventDefault(); castSkill('A'); }, { passive: false });
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
        
        // 【核心修正 2：角色模型轉向補償，消除倒車走路】
        // 由於你手動用三個方塊組裝模型時，眼睛面具和長劍的拼裝朝向，相對於 Math.atan2 的世界弧度產生了 180 度的鏡像偏轉。
        // 這裡我們在 targetRotation 計算完後直接加上 Math.PI (即 180 度)，強行將角色的外觀反轉回來。
        // 這樣可以保證：搖桿往哪裡推，移動物理方向就往哪裡，且黑色的「面具眼睛」就 100% 直視該前進方向！
        const targetRotation = Math.atan2(finalMove.x, finalMove.z);
        playerGroup.rotation.y = targetRotation + Math.PI; 
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
