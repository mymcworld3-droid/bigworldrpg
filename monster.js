var Monster = pc.createScript('monster');

Monster.attributes.add('monsterId', { type: 'string', default: 'goblin', title: '怪物 ID' });
Monster.attributes.add('configData', { type: 'asset', title: '數值設定檔' });
Monster.attributes.add('cameraEntity', { type: 'entity', title: '主要相機' });
Monster.attributes.add('playerEntity', { type: 'entity', title: '追蹤玩家(AI用)' }); // 新增：怪物必須知道玩家在哪
Monster.attributes.add('hpBarHeight', { type: 'number', default: 2.2, title: '血條高度偏移' });

Monster.prototype.initialize = function() {
    this.skillCooldowns = {};
    this.equippedSkills = [];
    this.isCasting = false;
    this.moveSpeed = 2.0; // 怪物移動速度

    this.screenPos = new pc.Vec3(); 
    this.monsterPos = new pc.Vec3();

    if (this.configData) {
        var data = (typeof this.configData.resource === 'string') ? JSON.parse(this.configData.resource) : this.configData.resource;
        this.db = data;

        var stats = data.monsters[this.monsterId];
        if (stats) {
            this.hp = stats.hp;
            this.maxHp = stats.hp;
            // 讀取怪物裝備的技能並初始化冷卻時間
            if (stats.equipped_skills) {
                this.equippedSkills = stats.equipped_skills;
                for (var i = 0; i < this.equippedSkills.length; i++) {
                    this.skillCooldowns[this.equippedSkills[i]] = 0;
                }
            }
        }
    }
    if (!this.hp) { this.hp = 100; this.maxHp = 100; }
    
    this.createHpBar();
};

Monster.prototype.createHpBar = function() {
    // ... 保留原本 createHpBar 裡所有的動態建立 UI 邏輯，不作修改 ...
    // 為了節省版面，此處省略你原本寫好的 UI CSS 與 DOM 建立代碼
    // 請複製你原本 monster.js 中 createHpBar 的內容貼上即可
};

Monster.prototype.update = function(dt) {
    // 1. 更新血條 UI 位置 (保留原本邏輯)
    if (this.cameraEntity && this.hpBg) {
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
    }

    // 2. 怪物 AI 行為邏輯
    if (this.hp <= 0 || !this.playerEntity || !this.entity.rigidbody) return;

    // 倒數所有技能的冷卻時間
    for (var skillId in this.skillCooldowns) {
        if (this.skillCooldowns[skillId] > 0) {
            this.skillCooldowns[skillId] -= dt;
        }
    }

    // 如果正在施法，停止移動
    if (this.isCasting) {
        this.entity.rigidbody.linearVelocity = new pc.Vec3(0, this.entity.rigidbody.linearVelocity.y, 0);
        return;
    }

    var myPos = this.entity.getPosition();
    var playerPos = this.playerEntity.getPosition();
    var dist = myPos.distance(playerPos);

    // 進入攻擊範圍 (預設 2.5)
    if (dist <= 2.5) {
        this.entity.rigidbody.linearVelocity = new pc.Vec3(0, this.entity.rigidbody.linearVelocity.y, 0);
        this.entity.lookAt(playerPos.x, myPos.y, playerPos.z);
        
        // 嘗試釋放第一個冷卻完畢的技能
        for (var i = 0; i < this.equippedSkills.length; i++) {
            var sId = this.equippedSkills[i];
            if (this.skillCooldowns[sId] <= 0) {
                this.castMonsterSkill(sId);
                break; // 一次只放一招
            }
        }
    } else if (dist < 15) { 
        // 在仇恨範圍內但摸不到，走向玩家
        this.entity.lookAt(playerPos.x, myPos.y, playerPos.z);
        var forward = this.entity.forward.clone();
        this.entity.rigidbody.linearVelocity = new pc.Vec3(forward.x * this.moveSpeed, this.entity.rigidbody.linearVelocity.y, forward.z * this.moveSpeed);
    } else {
        // 閒置停下
        this.entity.rigidbody.linearVelocity = new pc.Vec3(0, this.entity.rigidbody.linearVelocity.y, 0);
    }
};

Monster.prototype.castMonsterSkill = function(skillId) {
    this.isCasting = true;
    var skillData = this.db.monster_skills[skillId];
    this.skillCooldowns[skillId] = skillData.cooldown; // 進入 CD
    
    // 廣播給 SkillSystem 去處理實際的範圍判定與傷害
    this.app.fire('monster:cast', this.entity, skillId);

    // 經過前搖時間後，恢復自由狀態
    setTimeout(function() {
        if (this.entity) this.isCasting = false;
    }.bind(this), skillData.cast_time * 1000);
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
