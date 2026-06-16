var AttackButton = pc.createScript('attackButton');

AttackButton.attributes.add('html', { type: 'asset', title: 'HTML' });
AttackButton.attributes.add('css', { type: 'asset', title: 'CSS' });
// 新增：引入 combatConfig.json 以便抓取技能名稱
AttackButton.attributes.add('configData', { type: 'asset', title: '數值設定檔(JSON)' }); 

AttackButton.prototype.initialize = function() {
    // 1. 解析技能設定檔
    this.db = null;
    if (this.configData) {
        if (typeof this.configData.resource === 'string') {
            this.db = JSON.parse(this.configData.resource);
        } else {
            this.db = this.configData.resource;
        }
    }

    var style = document.createElement('style');
    style.innerHTML = this.css.resource || '';
    document.head.appendChild(style);

    this.div = document.createElement('div');
    this.div.innerHTML = this.html.resource || '';
    document.body.appendChild(this.div);

    // 2. 核心：定義各個插槽目前「裝備」了什麼技能 (可由存檔或系統動態修改)
    this.equippedSkills = {
        'slot-atk': 'basic_attack',
        'slot-1':   'combo_attack',
        'slot-2':   'dash_slash',
        'slot-3':   'whirlwind'
    };

    this.slotsData = {};

    // 3. 動態初始化所有插槽按鈕
    var slotIds = Object.keys(this.equippedSkills);
    for (var i = 0; i < slotIds.length; i++) {
        var slotId = slotIds[i];
        this.initSlot(slotId, this.equippedSkills[slotId]);
    }

    // 監聽來自技能系統的成功釋放事件 (觸發 CD)
    this.app.on('skill:started', this.startCooldown, this);
};

// 初始化單一插槽
AttackButton.prototype.initSlot = function(slotId, skillId) {
    var btnEl = document.getElementById(slotId);
    var nameEl = document.getElementById('name-' + slotId);

    if (this.db && this.db.skills[skillId]) {
        var skillConfig = this.db.skills[skillId];
        document.getElementById('name-' + slotId).innerText = skillConfig.name;
        // 讓按鈕動態顯示技能圖標
        document.getElementById(slotId).style.backgroundImage = "url('" + skillConfig.icon + "')";
        document.getElementById(slotId).style.backgroundSize = "cover";
    }
    
    this.slotsData[slotId] = {
        btn: btnEl,
        cd: 0
    };

    // 綁定點擊事件，傳送的參數是「插槽名稱」
    btnEl.addEventListener('touchstart', this.onCast.bind(this, slotId), { passive: false });
    btnEl.addEventListener('mousedown', this.onCast.bind(this, slotId));
};

AttackButton.prototype.onCast = function(slotId, e) {
    e.preventDefault();
    e.stopPropagation();
    
    var skillId = this.equippedSkills[slotId];
    if (!skillId || this.slotsData[slotId].cd > 0) return;

    // 將該插槽對應的技能 ID 傳送給攻擊系統
    this.app.fire('skill:cast', skillId);
};

// 開啟冷卻 UI：比對是哪個插槽裝備了這個技能
AttackButton.prototype.startCooldown = function(skillId, duration) {
    for (var slotId in this.equippedSkills) {
        if (this.equippedSkills[slotId] === skillId) {
            this.slotsData[slotId].cd = duration;
            this.updateButtonUI(slotId);
        }
    }
};

AttackButton.prototype.update = function(dt) {
    for (var slotId in this.slotsData) {
        var data = this.slotsData[slotId];
        if (data.cd > 0) {
            data.cd -= dt;
            if (data.cd < 0) data.cd = 0;
            this.updateButtonUI(slotId);
        }
    }
};

AttackButton.prototype.updateButtonUI = function(slotId) {
    var data = this.slotsData[slotId];
    var cdText = data.btn.querySelector('.cd-text');

    if (data.cd > 0) {
        data.btn.classList.add('on-cd');
        cdText.innerText = data.cd.toFixed(1);
    } else {
        data.btn.classList.remove('on-cd');
        cdText.innerText = '';
    }
};

// 【擴充功能】提供給外部呼叫：讓玩家可以在遊戲中自由切換按鍵裝備的技能
AttackButton.prototype.changeSkillBinding = function(slotId, newSkillId) {
    if (this.equippedSkills[slotId] !== undefined) {
        this.equippedSkills[slotId] = newSkillId;
        if (this.db && this.db.skills[newSkillId]) {
            document.getElementById('name-' + slotId).innerText = this.db.skills[newSkillId].name;
        }
    }
};