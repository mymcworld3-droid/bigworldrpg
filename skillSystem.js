var SkillSystem = pc.createScript('skillSystem');

SkillSystem.attributes.add('configData', { type: 'asset', title: '數值設定檔' });
SkillSystem.attributes.add('playerEntity', { type: 'entity', title: '玩家角色' });
SkillSystem.attributes.add('debugDraw', { type: 'boolean', default: true, title: '顯示攻擊範圍 (Debug)' });

SkillSystem.prototype.initialize = function() {
    if (this.configData) {
        var data = (typeof this.configData.resource === 'string') ? JSON.parse(this.configData.resource) : this.configData.resource;
        this.db = data;
    }
    
    this.isCasting = false;
    this.currentClass = 'warrior';
    
    // 初始化玩家血量
    if (this.db) {
        this.playerHp = this.db.classes[this.currentClass].hp;
    } else {
        this.playerHp = 100;
    }
    
    this.debugDrawings = [];
    this.activeProjectiles = [];
    this.debugColor = new pc.Color(1, 0, 0, 1);
    
    this.app.on('skill:cast', this.useSkill, this);
    this.app.on('monster:cast', this.useMonsterSkill, this); // 新增：監聽怪物的攻擊
};

SkillSystem.prototype.useSkill = function(skillId) {
    if (!this.db || this.isCasting) return;

    var skill = this.db.skills[skillId];
    if (!skill) return;

    if (skill.eligible_classes.indexOf(this.currentClass) === -1) {
        console.log("職業不符，無法使用此技能！");
        return;
    }

    this.isCasting = true;
    console.log(`開始釋放技能：${skill.name}`);

    // 計算 JSON 內定義的總時長 (施法時間 + 恢復時間 = 冷卻時間)
    var totalDuration = skill.cooldown;
    // 廣播給 AttackButton 介面去跑冷卻
    this.app.fire('skill:started', skillId, totalDuration);

    if (skill.vfx_effect) {
        this.triggerVfx(skill.vfx_effect);
    }

    // 處理近戰範圍判定排程
    if (skill.range_shapes) {
        for (var i = 0; i < skill.range_shapes.length; i++) {
            var shape = skill.range_shapes[i];
            this.scheduleDamageCheck(skillId, shape);
        }
    }

    // 處理玩家位移 (例如突進斬)
    if (skill.player_movement) {
        setTimeout(function() {
            var forward = this.playerEntity.forward.clone();
            forward.y = 0;
            forward.normalize();
            this.app.fire('player:dash', forward, skill.player_movement.speed, skill.player_movement.duration);
        }.bind(this), skill.player_movement.start_time * 1000);
    }

    // 處理獨立飛行物 (例如旋風斬)
    if (skill.projectiles) {
        for (var p = 0; p < skill.projectiles.length; p++) {
            var projDef = skill.projectiles[p];
            setTimeout(function(def) {
                var spawnPos = this.playerEntity.getPosition().clone();
                var spawnForward = this.playerEntity.forward.clone();
                spawnForward.y = 0;
                spawnForward.normalize();
                
                this.activeProjectiles.push({
                    skillId: skillId,
                    position: spawnPos,
                    forward: spawnForward,
                    radius: def.radius,
                    speed: def.speed,
                    tickRate: def.tick_rate,
                    tickTimer: 0, // 產生時立刻觸發第一次傷害
                    lifeTimer: def.duration
                });
            }.bind(this, projDef), projDef.spawn_time * 1000);
        }
    }

    var totalDuration = skill.cast_time + skill.recovery_time;
    setTimeout(function() {
        this.isCasting = false;
    }.bind(this), totalDuration * 1000);
};

SkillSystem.prototype.scheduleDamageCheck = function(skillId, shape) {
    setTimeout(function() {
        if (shape.shape_type === 'fan') {
            this.checkFanCollision(skillId, shape);
        } else if (shape.shape_type === 'box') {
            this.checkBoxCollision(skillId, shape);
        }
    }.bind(this), shape.damage_time * 1000);
};

SkillSystem.prototype.checkFanCollision = function(skillId, shape) {
    if (!this.playerEntity) return;

    var playerPos = this.playerEntity.getPosition().clone();
    var playerForward = this.playerEntity.forward.clone();
    
    playerForward.y = 0;
    playerForward.normalize();

    if (this.debugDraw) {
        this.addDebugFan(playerPos.clone(), playerForward.clone(), shape.radius, shape.angle, 0.5);
    }

    var monsters = this.app.root.findByTag('monster');

    for (var i = 0; i < monsters.length; i++) {
        var monster = monsters[i];
        var monsterPos = monster.getPosition();
        
        var dist = playerPos.distance(monsterPos);
        if (dist > shape.radius) continue;

        var dirToMonster = new pc.Vec3().sub2(monsterPos, playerPos);
        dirToMonster.y = 0;
        dirToMonster.normalize();

        var dotProduct = playerForward.dot(dirToMonster);
        var angleRequirement = Math.cos((shape.angle / 2) * pc.math.DEG_TO_RAD);

        if (dotProduct >= angleRequirement) {
            this.applyDamageAndEffects(skillId, monster, playerPos, shape);
        }
    }
};

SkillSystem.prototype.checkBoxCollision = function(skillId, shape) {
    if (!this.playerEntity) return;

    var playerPos = this.playerEntity.getPosition().clone();
    var playerTransform = this.playerEntity.getWorldTransform();
    var invPlayerTransform = playerTransform.clone().invert();

    if (this.debugDraw) {
        this.addDebugBox(playerTransform, shape.offset, shape.dimensions, 0.5);
    }

    var monsters = this.app.root.findByTag('monster');

    for (var i = 0; i < monsters.length; i++) {
        var monster = monsters[i];
        var localPos = new pc.Vec3();
        
        // 將怪物的世界座標轉換為玩家的局部座標，方便進行完美的矩形邊界判定
        invPlayerTransform.transformPoint(monster.getPosition(), localPos);

        var halfW = shape.dimensions.width / 2;
        var halfL = shape.dimensions.length / 2;

        if (Math.abs(localPos.x - shape.offset.x) <= halfW &&
            Math.abs(localPos.z - shape.offset.z) <= halfL) {
            this.applyDamageAndEffects(skillId, monster, playerPos, shape);
        }
    }
};

SkillSystem.prototype.checkProjectileCollision = function(proj) {
    var monsters = this.app.root.findByTag('monster');

    for (var i = 0; i < monsters.length; i++) {
        var monster = monsters[i];
        var dist = proj.position.distance(monster.getPosition());
        
        if (dist <= proj.radius) {
            // 獨立飛行物不吃擊退設定，僅觸發傷害
            this.applyDamageAndEffects(proj.skillId, monster, proj.position, {});
        }
    }
};

SkillSystem.prototype.applyDamageAndEffects = function(skillId, monster, originPos, shape) {
    if (monster.script && monster.script.monster) {
        var targetId = monster.script.monster.monsterId;
        var finalDamage = this.applySkillDamageToTarget(skillId, targetId);
        
        monster.script.monster.takeDamage(finalDamage);
        
        // 若該段判定帶有擊退效果
        if (shape.knockback) {
            var pushDir = new pc.Vec3().sub2(monster.getPosition(), originPos);
            monster.script.monster.applyKnockback(pushDir, shape.knockback);
        }
    }
};

SkillSystem.prototype.applySkillDamageToTarget = function(skillId, monsterId) {
    var playerStats = this.db.classes[this.currentClass];
    var skill = this.db.skills[skillId];
    var monsterStats = this.db.monsters[monsterId];

    var rawDamage = 0;
    var scaling = skill.stat_scaling;

    for (var statName in scaling) {
        if (scaling.hasOwnProperty(statName) && playerStats[statName]) {
            rawDamage += playerStats[statName] * scaling[statName];
        }
    }

    var finalDamage = Math.max(1, rawDamage - monsterStats.defense);
    return Math.floor(finalDamage);
};

SkillSystem.prototype.triggerVfx = function(vfxName) {
    console.log(`[特效播放] 呼叫粒子系統產生: ${vfxName}`);
};

SkillSystem.prototype.addDebugFan = function(center, forward, radius, angle, duration) {
    this.debugDrawings.push({
        type: 'fan', center: center, forward: forward, radius: radius, angle: angle, timer: duration
    });
};

SkillSystem.prototype.addDebugBox = function(transform, offset, dims, duration) {
    this.debugDrawings.push({
        type: 'box', transform: transform.clone(), offset: {x: offset.x, z: offset.z}, dims: {w: dims.width, l: dims.length}, timer: duration
    });
};

SkillSystem.prototype.update = function(dt) {
    // 處理獨立飛行物 (旋風斬)
    for (var p = this.activeProjectiles.length - 1; p >= 0; p--) {
        var proj = this.activeProjectiles[p];
        proj.lifeTimer -= dt;

        if (proj.lifeTimer <= 0) {
            this.activeProjectiles.splice(p, 1);
            continue;
        }

        proj.position.add(proj.forward.clone().mulScalar(proj.speed * dt));

        proj.tickTimer -= dt;
        if (proj.tickTimer <= 0) {
            proj.tickTimer = proj.tickRate;
            this.checkProjectileCollision(proj);
        }

        // 即時繪製旋風斬判定範圍
        if (this.debugDraw) {
            var drawCenter = new pc.Vec3(proj.position.x, proj.position.y + 0.1, proj.position.z);
            var segments = 20;
            var step = (Math.PI * 2) / segments;
            var prevPoint = null;
            
            for (var j = 0; j <= segments; j++) {
                var angle = step * j;
                var arcPoint = new pc.Vec3(
                    drawCenter.x + Math.cos(angle) * proj.radius,
                    drawCenter.y,
                    drawCenter.z + Math.sin(angle) * proj.radius
                );
                if (prevPoint) {
                    if (this.app.renderLine) this.app.renderLine(prevPoint, arcPoint, this.debugColor);
                    else if (this.app.drawLine) this.app.drawLine(prevPoint, arcPoint, this.debugColor);
                }
                prevPoint = arcPoint;
            }
        }
    }

    if (!this.debugDraw || this.debugDrawings.length === 0) return;

    // 處理靜態範圍除錯線條 (三連擊、突進斬)
    for (var i = this.debugDrawings.length - 1; i >= 0; i--) {
        var dbg = this.debugDrawings[i];
        dbg.timer -= dt;

        if (dbg.timer <= 0) {
            this.debugDrawings.splice(i, 1);
            continue;
        }

        if (dbg.type === 'fan') {
            var center = dbg.center;
            var forward = dbg.forward;
            var radius = dbg.radius;
            var angle = dbg.angle;

            var segmentsF = 20;
            var halfAngle = angle / 2;
            var stepF = angle / segmentsF;
            var prevPointF = null;

            var drawCenterF = new pc.Vec3(center.x, center.y + 0.1, center.z);

            for (var k = 0; k <= segmentsF; k++) {
                var currentAngle = -halfAngle + (stepF * k);
                
                var q = new pc.Quat().setFromEulerAngles(0, currentAngle, 0);
                var dir = new pc.Vec3();
                q.transformVector(forward, dir);
                
                var arcPointF = new pc.Vec3(
                    drawCenterF.x + dir.x * radius,
                    drawCenterF.y,
                    drawCenterF.z + dir.z * radius
                );

                if (k === 0 || k === segmentsF) {
                    if (this.app.renderLine) this.app.renderLine(drawCenterF, arcPointF, this.debugColor);
                    else if (this.app.drawLine) this.app.drawLine(drawCenterF, arcPointF, this.debugColor);
                }

                if (prevPointF) {
                    if (this.app.renderLine) this.app.renderLine(prevPointF, arcPointF, this.debugColor);
                    else if (this.app.drawLine) this.app.drawLine(prevPointF, arcPointF, this.debugColor);
                }
                prevPointF = arcPointF;
            }
        } else if (dbg.type === 'box') {
            var t = dbg.transform;
            var off = dbg.offset;
            var d = dbg.dims;
            var hw = d.w / 2;
            var hl = d.l / 2;

            var cornersLocal = [
                new pc.Vec3(off.x - hw, 0.1, off.z - hl),
                new pc.Vec3(off.x + hw, 0.1, off.z - hl),
                new pc.Vec3(off.x + hw, 0.1, off.z + hl),
                new pc.Vec3(off.x - hw, 0.1, off.z + hl)
            ];

            var cornersWorld = cornersLocal.map(function(p) {
                var w = new pc.Vec3();
                t.transformPoint(p, w);
                w.y = t.getTranslation().y + 0.1;
                return w;
            });

            for (var m = 0; m < 4; m++) {
                var p1 = cornersWorld[m];
                var p2 = cornersWorld[(m + 1) % 4];
                if (this.app.renderLine) this.app.renderLine(p1, p2, this.debugColor);
                else if (this.app.drawLine) this.app.drawLine(p1, p2, this.debugColor);
            }
        }
    }
};

// ====== 新增：怪物技能與玩家受擊系統 ======

SkillSystem.prototype.useMonsterSkill = function(monsterEntity, skillId) {
    if (!this.db || !monsterEntity) return;
    var skill = this.db.monster_skills[skillId];
    if (!skill) return;

    console.log(`[怪物 AI] ${monsterEntity.name} 發動了技能：${skill.name}`);

    if (skill.range_shapes) {
        for (var i = 0; i < skill.range_shapes.length; i++) {
            var shape = skill.range_shapes[i];
            // 根據 JSON 中的 damage_time 排程傷害判定
            setTimeout(function(sh) {
                if (!monsterEntity || !monsterEntity.parent) return; // 防止怪物已死但技能還爆出來
                this.checkMonsterCollision(monsterEntity, skillId, sh);
            }.bind(this, shape), shape.damage_time * 1000);
        }
    }
};

SkillSystem.prototype.checkMonsterCollision = function(monsterEntity, skillId, shape) {
    if (!this.playerEntity || this.playerHp <= 0) return;

    var monsterPos = monsterEntity.getPosition().clone();
    var monsterForward = monsterEntity.forward.clone();
    monsterForward.y = 0;
    monsterForward.normalize();

    var playerPos = this.playerEntity.getPosition().clone();
    var isHit = false;

    // 判定 1：扇形判定 (哥布林敲擊)
    if (shape.shape_type === 'fan') {
        if (this.debugDraw) this.addDebugFan(monsterPos.clone(), monsterForward.clone(), shape.radius, shape.angle, 0.5);
        
        var dist = monsterPos.distance(playerPos);
        if (dist <= shape.radius) {
            var dirToPlayer = new pc.Vec3().sub2(playerPos, monsterPos);
            dirToPlayer.y = 0;
            dirToPlayer.normalize();
            var dotProduct = monsterForward.dot(dirToPlayer);
            var angleReq = Math.cos((shape.angle / 2) * pc.math.DEG_TO_RAD);
            if (dotProduct >= angleReq) isHit = true;
        }
    } 
    // 判定 2：圓形範圍判定 (哥布林蓄力砸)
    else if (shape.shape_type === 'circle') {
        var center = monsterPos.clone();
        var offset = new pc.Vec3(shape.offset.x, 0, shape.offset.z);
        // 將局部 offset 轉為世界座標
        var q = monsterEntity.getRotation();
        q.transformVector(offset, offset);
        center.add(offset);
        
        if (this.debugDraw) this.addDebugCircle(center.clone(), shape.radius, 0.5);

        if (center.distance(playerPos) <= shape.radius) {
            isHit = true;
        }
    }

    if (isHit) {
        this.applyMonsterDamageToPlayer(monsterEntity, skillId);
    }
};

SkillSystem.prototype.applyMonsterDamageToPlayer = function(monsterEntity, skillId) {
    var monsterId = monsterEntity.script.monster.monsterId;
    var monsterStats = this.db.monsters[monsterId];
    var playerStats = this.db.classes[this.currentClass];
    var skill = this.db.monster_skills[skillId];

    var rawDamage = 0;
    if (skill.stat_scaling && skill.stat_scaling.strength) {
        rawDamage = monsterStats.strength * skill.stat_scaling.strength;
    }

    // 同樣套用減法公式：最終傷害 = 怪物力量 * 技能倍率 - 玩家防禦
    var finalDamage = Math.max(1, rawDamage - playerStats.defense);
    finalDamage = Math.floor(finalDamage);

    this.playerHp -= finalDamage;
    console.log(`[玩家受擊] 吃到 ${skill.name}，損失 ${finalDamage} 點血量。剩餘血量: ${this.playerHp}`);

    if (this.playerHp <= 0) {
        console.log("【玩家死亡！遊戲結束】");
        // 你可以在這裡加入 app.fire('game:over') 叫出死亡結算畫面
    }
};

SkillSystem.prototype.addDebugCircle = function(center, radius, duration) {
    this.debugDrawings.push({
        type: 'circle', center: center, radius: radius, timer: duration
    });
};
