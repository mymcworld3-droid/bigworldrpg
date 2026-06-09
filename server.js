const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
// 讓前端靜態檔案可以直接被訪問
app.use(express.static(path.join(__dirname, 'public')));

// 核心：乘區分離傷害計算 API
app.post('/api/calculate-damage', (req, requireResponse) => {
    const { attacker, defender, skillMultiplier } = req.body;

    // 基礎乘區：(攻擊 - 防禦) * 技能係數
    const baseDamage = Math.max(1, (attacker.atk - defender.def)) * skillMultiplier;
    
    // 天賦乘區 (例如 SSS 級無限火力或增傷)
    const talentBonus = 1 + (attacker.talentMultiplier || 0);
    
    // 裝備增傷乘區
    const gearBonus = 1 + (attacker.gearMultiplier || 0);
    
    // 暴擊判定
    const isCrit = Math.random() < (attacker.critRate || 0);
    const critBonus = isCrit ? (attacker.critDamage || 1.5) : 1;

    // 最終公式：各乘區相乘
    const finalDamage = Math.round(baseDamage * talentBonus * gearBonus * critBonus);

    res.json({
        damage: finalDamage,
        isCrit: isCrit
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
