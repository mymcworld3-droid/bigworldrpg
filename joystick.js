var Joystick = pc.createScript('joystick');

Joystick.attributes.add('html', { type: 'asset', title: 'HTML' });
Joystick.attributes.add('css', { type: 'asset', title: 'CSS' });

Joystick.prototype.initialize = function() {
    // 注入 CSS
    var style = document.createElement('style');
    style.innerHTML = this.css.resource || '';
    document.head.appendChild(style);

    // 注入 HTML
    this.div = document.createElement('div');
    this.div.innerHTML = this.html.resource || '';
    document.body.appendChild(this.div);

    // 取得 DOM 元素
    this.base = document.getElementById('joystick-base');
    this.knob = document.getElementById('joystick-knob');
    this.zone = document.getElementById('joystick-zone');

    this.active = false;
    this.maxRadius = this.base.clientWidth / 2;
    
    this.bindEvents();
};

Joystick.prototype.bindEvents = function() {
    // 觸控事件綁定
    this.zone.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
    this.zone.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
    this.zone.addEventListener('touchend', this.onTouchEnd.bind(this), { passive: false });

    // 滑鼠事件綁定 (供電腦端測試用)
    this.zone.addEventListener('mousedown', this.onMouseDown.bind(this));
    window.addEventListener('mousemove', this.onMouseMove.bind(this));
    window.addEventListener('mouseup', this.onMouseUp.bind(this));
};

Joystick.prototype.startDrag = function(clientX, clientY) {
    this.active = true;
    this.baseRect = this.base.getBoundingClientRect();
    this.updateDrag(clientX, clientY);
};

Joystick.prototype.updateDrag = function(clientX, clientY) {
    if (!this.active) return;

    var centerX = this.baseRect.left + this.baseRect.width / 2;
    var centerY = this.baseRect.top + this.baseRect.height / 2;

    var dx = clientX - centerX;
    var dy = clientY - centerY;
    var distance = Math.sqrt(dx * dx + dy * dy);

    // 限制旋鈕不超出底座範圍
    if (distance > this.maxRadius) {
        dx = (dx / distance) * this.maxRadius;
        dy = (dy / distance) * this.maxRadius;
    }

    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

    // 發送事件，提供 -1 到 1 的正規化數值
    var normalX = dx / this.maxRadius;
    var normalY = dy / this.maxRadius;
    this.app.fire('joystick:move', normalX, normalY);
};

Joystick.prototype.endDrag = function() {
    this.active = false;
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.app.fire('joystick:end');
};

Joystick.prototype.onTouchStart = function(e) {
    e.preventDefault();
    this.startDrag(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
};

Joystick.prototype.onTouchMove = function(e) {
    e.preventDefault();
    this.updateDrag(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
};

Joystick.prototype.onTouchEnd = function(e) {
    e.preventDefault();
    this.endDrag();
};

Joystick.prototype.onMouseDown = function(e) {
    this.startDrag(e.clientX, e.clientY);
};

Joystick.prototype.onMouseMove = function(e) {
    this.updateDrag(e.clientX, e.clientY);
};

Joystick.prototype.onMouseUp = function(e) {
    if (this.active) this.endDrag();
};