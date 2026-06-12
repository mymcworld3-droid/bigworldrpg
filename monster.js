var Monster = pc.createScript('monster');

Monster.attributes.add('monsterId', { type: 'string', default: 'goblin', title: '怪物 ID' });
Monster.attributes.add('configData', { type: 'asset', title: '數值設定檔' });
Monster.attributes.add('cameraEntity', { type: 'entity', title: '主要相機' });
Monster.attributes.add('hpBarHeight', { type: 'number', default: 2.2, title: '血條高度偏移' });

Monster.prototype.initialize = function() {
    if (this.configData) {
        if (typeof this.configData.resource === 'string') {
            this.db = JSON.parse(this.configData.resource);
        } else {
            this.db = this.configData.resource;
        }

        var stats = this.db.monsters[this.monsterId];
        if (stats) {
            this.hp = stats.hp;
            this.maxHp = stats.hp;
        } else {
            this.hp = 100;
            this.maxHp = 100;
        }
    }

    this.createHpBar();
};

Monster.prototype.createHpBar = function() {
    // 動態注入血條與傷害數字的 CSS 樣式
    if (!document.getElementById('monster-ui-style')) {
        var style = document.createElement('style');
        style.id = 'monster-ui-style';
        style.innerHTML = `
            .hp-bar-bg {
                position: absolute;
                width: 60px;
                height: 6px;
                background-color: rgba(0, 0, 0, 0.5);
                border: 1px solid rgba(255, 255, 255, 0.8);
                border-radius: 3px;
                pointer-events: none;
                transform: translate(-50%, -50%);
                z-index: 5;
                display: none;
            }
            .hp-bar-fill {
                width: 100%;
                height: 100%;
                background-color: #ff3333;
                border-radius: 2px;
                transition: width 0.1s ease-out;
            }
            /* 新增：傷害數字跳字動畫與樣式 */
            @keyframes damageFloat {
                0% { opacity: 1; transform: translate(-50%, -50%) scale(1.5); }
                100% { opacity: 0; transform: translate(-50%, -150%) scale(1); }
            }
            .damage-text {
                position: absolute;
                color: #ff3333;
                font-size: 24px;
                font-weight: bold;
                font-family: sans-serif;
                text-shadow: -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
                pointer-events: none;
                z-index: 10;
                animation: damageFloat 0.8s ease-out forwards;
            }
        `;
        document.head.appendChild(style);
    }

    // 建立血條的 DOM 結構
    this.hpBg = document.createElement('div');
    this.hpBg.className = 'hp-bar-bg';
    
    this.hpFill = document.createElement('div');
    this.hpFill.className = 'hp-bar-fill';
    
    this.hpBg.appendChild(this.hpFill);
    document.body.appendChild(this.hpBg);

    this.screenPos = new pc.Vec3();
    this.monsterPos = new pc.Vec3();

    this.on('destroy', function() {
        if (this.hpBg && this.hpBg.parentNode) {
            this.hpBg.parentNode.removeChild(this.hpBg);
        }
    }, this);
};

Monster.prototype.update = function(dt) {
    if (!this.cameraEntity || !this.hpBg) return;

    this.monsterPos.copy(this.entity.getPosition());
    this.monsterPos.y += this.hpBarHeight;

    var cameraComponent = this.cameraEntity.camera;
    cameraComponent.worldToScreen(this.monsterPos, this.screenPos);

    if (this.screenPos.z > 0) {
        this.hpBg.style.display = 'block';
        this.hpBg.style.left = this.screenPos.x + 'px';
        this.hpBg.style.top = this.screenPos.y + 'px';
    } else {
        this.hpBg.style.display = 'none';
    }
};

Monster.prototype.takeDamage = function(damage) {
    this.hp -= damage;
    console.log(`[${this.entity.name}] 受到 ${damage} 點傷害！剩餘血量: ${this.hp}`);

    var hpPercent = Math.max(0, this.hp / this.maxHp) * 100;
    if (this.hpFill) {
        this.hpFill.style.width = hpPercent + '%';
    }

    // 呼叫顯示跳字的方法
    this.showDamageText(damage);

    if (this.hp <= 0) {
        this.die();
    }
};

Monster.prototype.showDamageText = function(damage) {
    // 確保怪物在鏡頭前才顯示數字
    if (this.screenPos.z > 0) {
        var dmgElem = document.createElement('div');
        dmgElem.className = 'damage-text';
        dmgElem.innerText = damage; // 只顯示純數字
        
        // 加上一點隨機 X 軸偏移，避免連續攻擊時數字全部重疊在一起
        var offsetX = (Math.random() - 0.5) * 30;
        
        dmgElem.style.left = (this.screenPos.x + offsetX) + 'px';
        // 數字初始高度稍微比血條低一點，然後往上飄
        dmgElem.style.top = (this.screenPos.y - 10) + 'px';
        
        document.body.appendChild(dmgElem);

        // 配合 CSS 動畫時間 (0.8s)，動畫結束後自動把 DOM 元素清理掉
        setTimeout(function() {
            if (dmgElem.parentNode) {
                dmgElem.parentNode.removeChild(dmgElem);
            }
        }, 800);
    }
};

Monster.prototype.applyKnockback = function(direction, force) {
    if (!this.entity.rigidbody) return;

    // 將 Y 軸抽離，確保只有水平方向的推力
    direction.y = 0;
    direction.normalize();

    // 稍微給一點向上的推力，讓擊退看起來更自然
    var impulse = new pc.Vec3(
        direction.x * force,
        force * 0.5,
        direction.z * force
    );

    this.entity.rigidbody.applyImpulse(impulse);
};

Monster.prototype.die = function() {
    console.log(`[${this.entity.name}] 死亡！`);
    
    if (this.hpBg && this.hpBg.parentNode) {
        this.hpBg.parentNode.removeChild(this.hpBg);
        this.hpBg = null;
    }
    
    setTimeout(function() {
        this.entity.destroy();
    }.bind(this), 100);
};