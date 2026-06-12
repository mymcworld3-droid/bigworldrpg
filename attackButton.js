var AttackButton = pc.createScript('attackButton');

AttackButton.attributes.add('html', { type: 'asset', title: 'HTML' });
AttackButton.attributes.add('css', { type: 'asset', title: 'CSS' });

AttackButton.prototype.initialize = function() {
    var style = document.createElement('style');
    style.innerHTML = this.css.resource || '';
    document.head.appendChild(style);

    this.div = document.createElement('div');
    this.div.innerHTML = this.html.resource || '';
    document.body.appendChild(this.div);

    // 取得所有按鍵 DOM 元素
    this.btnAttack = document.getElementById('attack-btn');
    this.btnSkillA = document.getElementById('skill-a-btn');
    this.btnSkillB = document.getElementById('skill-b-btn');
    this.btnSkillC = document.getElementById('skill-c-btn');

    this.bindEvents();
};

AttackButton.prototype.bindEvents = function() {
    // 綁定普攻 (ID: basic_attack)
    this.btnAttack.addEventListener('touchstart', this.onCastSkill.bind(this, 'basic_attack'), { passive: false });
    this.btnAttack.addEventListener('mousedown', this.onCastSkill.bind(this, 'basic_attack'));

    // 綁定技能 A: 三連擊 (ID: combo_attack)
    this.btnSkillA.addEventListener('touchstart', this.onCastSkill.bind(this, 'combo_attack'), { passive: false });
    this.btnSkillA.addEventListener('mousedown', this.onCastSkill.bind(this, 'combo_attack'));

    // 綁定技能 B: 突進斬 (ID: dash_slash)
    this.btnSkillB.addEventListener('touchstart', this.onCastSkill.bind(this, 'dash_slash'), { passive: false });
    this.btnSkillB.addEventListener('mousedown', this.onCastSkill.bind(this, 'dash_slash'));

    // 綁定技能 C: 旋風斬 (ID: whirlwind)
    this.btnSkillC.addEventListener('touchstart', this.onCastSkill.bind(this, 'whirlwind'), { passive: false });
    this.btnSkillC.addEventListener('mousedown', this.onCastSkill.bind(this, 'whirlwind'));
};

AttackButton.prototype.onCastSkill = function(skillId, e) {
    e.preventDefault();
    e.stopPropagation();
    
    // 將對應的技能 ID 傳送給系統
    this.app.fire('skill:cast', skillId);
};