var CameraFollow = pc.createScript('cameraFollow');

CameraFollow.attributes.add('target', { type: 'entity', title: '跟隨目標' });
CameraFollow.attributes.add('distance', { type: 'number', default: 5, title: '跟隨距離' });
CameraFollow.attributes.add('heightOffset', { type: 'number', default: 1.5, title: '目標高度偏移' });
CameraFollow.attributes.add('sensitivity', { type: 'number', default: 0.3, title: '旋轉靈敏度' });
CameraFollow.attributes.add('pitchMin', { type: 'number', default: -10, title: '最小俯仰角' });
CameraFollow.attributes.add('pitchMax', { type: 'number', default: 60, title: '最大俯仰角' });

CameraFollow.prototype.initialize = function() {
    this.yaw = 0;
    this.pitch = 20;
    this.isDragging = false;
    this.lastTouchPoint = new pc.Vec2();
    
    // 新增：用來記住控制相機的特定手指 ID
    this.touchId = null; 

    // 綁定滑鼠事件
    if (this.app.mouse) {
        this.app.mouse.on(pc.EVENT_MOUSEDOWN, this.onMouseDown, this);
        this.app.mouse.on(pc.EVENT_MOUSEMOVE, this.onMouseMove, this);
        this.app.mouse.on(pc.EVENT_MOUSEUP, this.onMouseUp, this);
    }

    // 綁定觸控事件
    if (this.app.touch) {
        this.app.touch.on(pc.EVENT_TOUCHSTART, this.onTouchStart, this);
        this.app.touch.on(pc.EVENT_TOUCHMOVE, this.onTouchMove, this);
        this.app.touch.on(pc.EVENT_TOUCHEND, this.onTouchEnd, this);
        this.app.touch.on(pc.EVENT_TOUCHCANCEL, this.onTouchEnd, this); // 增加 cancel 事件確保安全
    }

    // 確保事件在腳本銷毀時解除綁定
    this.on('destroy', function() {
        if (this.app.mouse) {
            this.app.mouse.off(pc.EVENT_MOUSEDOWN, this.onMouseDown, this);
            this.app.mouse.off(pc.EVENT_MOUSEMOVE, this.onMouseMove, this);
            this.app.mouse.off(pc.EVENT_MOUSEUP, this.onMouseUp, this);
        }
        if (this.app.touch) {
            this.app.touch.off(pc.EVENT_TOUCHSTART, this.onTouchStart, this);
            this.app.touch.off(pc.EVENT_TOUCHMOVE, this.onTouchMove, this);
            this.app.touch.off(pc.EVENT_TOUCHEND, this.onTouchEnd, this);
            this.app.touch.off(pc.EVENT_TOUCHCANCEL, this.onTouchEnd, this);
        }
    }, this);
};

CameraFollow.prototype.onMouseDown = function(e) {
    if (e.button === pc.MOUSEBUTTON_LEFT) {
        this.isDragging = true;
    }
};

CameraFollow.prototype.onMouseMove = function(e) {
    if (this.isDragging) {
        this.yaw -= e.dx * this.sensitivity;
        this.pitch -= e.dy * this.sensitivity;
        this.clampPitch();
    }
};

CameraFollow.prototype.onMouseUp = function(e) {
    if (e.button === pc.MOUSEBUTTON_LEFT) {
        this.isDragging = false;
    }
};

CameraFollow.prototype.onTouchStart = function(e) {
    // 如果已經有手指在控制相機，就不理會新的手指 (避免被搖桿的手指干擾)
    if (this.touchId !== null) return;

    if (e.changedTouches.length > 0) {
        var touch = e.changedTouches[0];
        this.touchId = touch.id;
        this.isDragging = true;
        this.lastTouchPoint.set(touch.x, touch.y);
    }
};

CameraFollow.prototype.onTouchMove = function(e) {
    if (!this.isDragging || this.touchId === null) return;

    // 在所有變動的觸控點中，尋找我們正在追蹤的那根手指
    for (var i = 0; i < e.changedTouches.length; i++) {
        var touch = e.changedTouches[i];
        
        if (touch.id === this.touchId) {
            var dx = touch.x - this.lastTouchPoint.x;
            var dy = touch.y - this.lastTouchPoint.y;

            this.yaw -= dx * this.sensitivity;
            this.pitch -= dy * this.sensitivity;
            this.clampPitch();

            this.lastTouchPoint.set(touch.x, touch.y);
            
            // 找到了就跳出迴圈
            break; 
        }
    }
};

CameraFollow.prototype.onTouchEnd = function(e) {
    if (!this.isDragging || this.touchId === null) return;

    // 檢查離開螢幕的手指是不是我們追蹤的那根
    for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].id === this.touchId) {
            this.isDragging = false;
            this.touchId = null;
            break;
        }
    }
};

CameraFollow.prototype.clampPitch = function() {
    if (this.pitch < this.pitchMin) this.pitch = this.pitchMin;
    if (this.pitch > this.pitchMax) this.pitch = this.pitchMax;
};

CameraFollow.prototype.postUpdate = function(dt) {
    if (!this.target) return;

    var targetPos = this.target.getPosition().clone();
    targetPos.y += this.heightOffset;

    var quat = new pc.Quat();
    quat.setFromEulerAngles(this.pitch, this.yaw, 0);

    var offset = new pc.Vec3(0, 0, this.distance);
    quat.transformVector(offset, offset);

    var cameraPos = new pc.Vec3().add2(targetPos, offset);
    
    this.entity.setPosition(cameraPos);
    this.entity.lookAt(targetPos);
};