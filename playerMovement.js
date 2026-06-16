var PlayerMovement = pc.createScript('playerMovement');

PlayerMovement.attributes.add('speed', { type: 'number', default: 5, title: '最大移動速度' });
PlayerMovement.attributes.add('cameraEntity', { type: 'entity', title: '主要相機' });
PlayerMovement.attributes.add('visualEntity', { type: 'entity', title: '角色視覺模型' });

PlayerMovement.prototype.initialize = function() {
    this.moveDir = new pc.Vec3();
    this.joystickInput = new pc.Vec2();

    this.dashTimer = 0;
    this.dashVelocity = new pc.Vec3();

    if (this.entity.rigidbody) {
        // 徹底鎖定物理旋轉，避免撞牆或被怪物推擠時產生異常擺動
        this.entity.rigidbody.angularFactor = pc.Vec3.ZERO;
        this.entity.rigidbody.friction = 0;
    }

    this.app.on('joystick:move', this.onJoystickMove, this);
    this.app.on('joystick:end', this.onJoystickEnd, this);
    this.app.on('player:dash', this.onDash, this);
    this.app.on('action:jump', this.onActionJump, this);
    this.app.on('action:dash', this.onActionDash, this);
};

PlayerMovement.prototype.onDash = function(forward, speed, duration) {
    this.dashTimer = duration;
    this.dashVelocity.copy(forward).mulScalar(speed);
};

PlayerMovement.prototype.onJoystickMove = function(x, y) {
    this.joystickInput.set(x, y);
};

PlayerMovement.prototype.onJoystickEnd = function() {
    this.joystickInput.set(0, 0);
};

PlayerMovement.prototype.update = function(dt) {
    if (!this.entity.rigidbody) return;

    var currentVelocity = this.entity.rigidbody.linearVelocity;
    var safeYVelocity = Math.max(currentVelocity.y, -10);

    if (this.dashTimer > 0) {
        this.dashTimer -= dt;
        this.entity.rigidbody.linearVelocity = new pc.Vec3(
            this.dashVelocity.x,
            safeYVelocity,
            this.dashVelocity.z
        );
        return;
    }

    if (this.joystickInput.lengthSq() > 0 && this.cameraEntity) {
        
        var pushStrength = Math.min(this.joystickInput.length(), 1.0);

        var camForward = this.cameraEntity.forward.clone();
        var camRight = this.cameraEntity.right.clone();

        camForward.y = 0;
        camRight.y = 0;
        camForward.normalize();
        camRight.normalize();

        var moveForward = camForward.mulScalar(-this.joystickInput.y);
        var moveRight = camRight.mulScalar(this.joystickInput.x);

        this.moveDir.set(0, 0, 0);
        this.moveDir.add2(moveForward, moveRight);
        
        if (this.moveDir.lengthSq() > 0.001) {
            this.moveDir.normalize();
            
            var currentSpeed = this.speed * pushStrength;
            
            // 【關鍵改變】只對視覺模型進行旋轉，物理剛體(Entity)保持不轉動
            if (this.visualEntity) {
                var targetPos = new pc.Vec3().add2(this.visualEntity.getPosition(), this.moveDir);
                this.visualEntity.lookAt(targetPos);
            }
            
            var targetVelocity = new pc.Vec3(
                this.moveDir.x * currentSpeed,
                safeYVelocity,
                this.moveDir.z * currentSpeed
            );
            this.entity.rigidbody.linearVelocity = targetVelocity;
        }
    } else {
        this.entity.rigidbody.linearVelocity = new pc.Vec3(0, safeYVelocity, 0);
    }
};

PlayerMovement.prototype.onActionJump = function() {
    if (!this.entity.rigidbody) return;
    
    var currentVelocity = this.entity.rigidbody.linearVelocity;
    
    // 簡單防呆判定：只在接近地面（Y軸速度很小）時才允許起跳，防止無限二段跳
    if (Math.abs(currentVelocity.y) < 0.5) {
        // 直接賦予向上的速度 (這裡 6 為起跳力度，可根據手感自行微調)
        this.entity.rigidbody.linearVelocity = new pc.Vec3(
            currentVelocity.x, 
            6, 
            currentVelocity.z
        );
    }
};

PlayerMovement.prototype.onActionDash = function() {
    // 若正在衝刺中則不可重複觸發
    if (!this.entity.rigidbody || this.dashTimer > 0) return;
    
    // 獲取玩家模型當前的面朝方向
    var forward = this.visualEntity ? this.visualEntity.forward.clone() : this.entity.forward.clone();
    forward.y = 0;
    forward.normalize();
    
    // 呼叫原本寫好的 onDash 方法 (方向, 衝刺速度, 持續時間)
    this.onDash(forward, 15, 0.2);
};
