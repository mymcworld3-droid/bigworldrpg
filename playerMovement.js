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