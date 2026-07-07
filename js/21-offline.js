// ===== 🌙 離線掛機（哈魯版）— 設定 / 錨點 / 選角 UI / 讀檔離線結算 =====

const OFFLINE_CFG = {
    capHours: 24,
    heartbeatMs: 5000,
    overlayMinTicks: 3000,
    sliceMinMs: 28,
    sliceMaxMs: 250,
    sliceShortTicks: 3000,
    sliceLongTicks: 36000,
    keys: { ts: 'haru_afk_ts_', map: 'haru_afk_map_' }
};

let _offlineCatching = false;

function offlineCapMs() { return OFFLINE_CFG.capHours * 3600 * 1000; }

function offlineSliceFor(totalTicks) {
    if (totalTicks <= OFFLINE_CFG.sliceShortTicks) return OFFLINE_CFG.sliceMinMs;
    if (totalTicks >= OFFLINE_CFG.sliceLongTicks) return OFFLINE_CFG.sliceMaxMs;
    let f = (totalTicks - OFFLINE_CFG.sliceShortTicks) / (OFFLINE_CFG.sliceLongTicks - OFFLINE_CFG.sliceShortTicks);
    return Math.round(OFFLINE_CFG.sliceMinMs + f * (OFFLINE_CFG.sliceMaxMs - OFFLINE_CFG.sliceMinMs));
}

function offlineValidSlot(n) {
    n = (n != null) ? +n : +currentSlot;
    return Number.isInteger(n) && n >= 1 && n <= 8;
}
function offlineTsKey(slot) { return OFFLINE_CFG.keys.ts + slot; }
function offlineMapKey(slot) { return OFFLINE_CFG.keys.map + slot; }

function offlineReadTs(slot) {
    try { return +localStorage.getItem(offlineTsKey(slot)) || 0; } catch (e) { return 0; }
}
function offlineReadMap(slot) {
    try { return localStorage.getItem(offlineMapKey(slot)) || ''; } catch (e) { return ''; }
}

function offlineFmtIdle(ms) {
    if (ms < 0) ms = 0;
    let s = Math.floor(ms / 1000);
    if (s < 60) return '剛剛';
    let m = Math.floor(s / 60);
    if (m < 60) return m + ' 分鐘';
    let h = Math.floor(m / 60), rm = m % 60;
    if (h < 24) return rm ? (h + ' 小時 ' + rm + ' 分') : (h + ' 小時');
    let d = Math.floor(h / 24), rh = h % 24;
    return rh ? (d + ' 天 ' + rh + ' 小時') : (d + ' 天');
}

function offlineFmtCatchupTime(ticks) {
    let s = Math.round(ticks * TICK_MS / 1000);
    if (s < 60) return s + ' 秒';
    let m = Math.floor(s / 60);
    if (m < 60) return m + ' 分' + (s % 60 ? ' ' + (s % 60) + ' 秒' : '');
    let h = Math.floor(m / 60);
    return h + ' 小時' + (m % 60 ? ' ' + (m % 60) + ' 分' : '');
}

function offlineMapName(id) {
    if (!id) return '';
    let e = (typeof mapEntryOf === 'function') ? mapEntryOf(id) : null;
    if (e && e.t) return e.t;
    return id;
}

function offlineIsHuntMap(id) {
    if (!id || id.indexOf('town_') === 0) return false;
    if (typeof isSiegeArea === 'function' && isSiegeArea(id)) return false;
    if (id === 'rift_battle') return false;
    if (/^pride_\d+_\d+$/.test(id)) return false;
    if (id === 'oblivion_island' || id === 'oblivion_travel') return false;
    return true;
}

function offlineMapSettleOk(id) {
    if (!offlineIsHuntMap(id)) return false;
    if (typeof DB !== 'undefined' && DB.maps && DB.maps[id]) return true;
    if (typeof KING_ROOMS !== 'undefined' && KING_ROOMS[id]) return true;
    return false;
}

function offlineHomeTown() {
    try { return (typeof getHomeTown === 'function') ? getHomeTown() : 'town_silver_knight'; }
    catch (e) { return 'town_silver_knight'; }
}

function offlineGotoMap(mapKey) {
    try {
        if (typeof setMapSelectors === 'function') setMapSelectors(mapKey);
        let sel = document.getElementById('map-select');
        if (sel) {
            if (!Array.from(sel.options).some(o => o.value === mapKey)) {
                let o = document.createElement('option');
                o.value = mapKey;
                o.textContent = offlineMapName(mapKey);
                sel.appendChild(o);
            }
            sel.value = mapKey;
        }
        if (typeof changeMap === 'function') changeMap(true);
    } catch (e) { console.warn('[離線] gotoMap 失敗:', e); }
}

function offlineStamp() {
    try {
        if (!offlineValidSlot()) return;
        let gs = document.getElementById('game-screen');
        if (!gs || gs.classList.contains('hidden')) return;
        if (typeof state === 'undefined' || !state || !state.running) return;
        let slot = +currentSlot;
        localStorage.setItem(offlineTsKey(slot), String(Date.now()));
        if (typeof mapState !== 'undefined' && mapState && mapState.current)
            localStorage.setItem(offlineMapKey(slot), mapState.current);
    } catch (e) {}
}

function offlineSnapshot() {
    let inv = {};
    try { (player.inv || []).forEach(i => { if (i && i.id) inv[i.id] = (inv[i.id] || 0) + (i.cnt || 1); }); } catch (e) {}
    return { gold: player.gold || 0, exp: player.exp || 0, lv: player.lv || 0, inv: inv };
}

function offlineFmtNum(n) {
    try { return (n || 0).toLocaleString(); } catch (e) { return '' + (n || 0); }
}

function offlineExpTotal(lv, exp) {
    let t = exp || 0;
    if (typeof getExpReq === 'function') {
        for (let i = 1; i < (lv || 1); i++) {
            let r = getExpReq(i);
            if (!isFinite(r)) break;
            t += r;
        }
    }
    return t;
}

function offlineSummarize(before, after, doneTicks, died, huntMap) {
    let mins = Math.round(doneTicks * TICK_MS / 60000);
    let dGold = (after.gold || 0) - (before.gold || 0);
    let dExp = offlineExpTotal(after.lv, after.exp) - offlineExpTotal(before.lv, before.exp);
    if (dExp < 0) dExp = 0;
    let dLv = (after.lv || 0) - (before.lv || 0);
    let items = [], ids = {};
    for (let k in before.inv) ids[k] = 1;
    for (let k2 in after.inv) ids[k2] = 1;
    for (let id in ids) {
        let delta = (after.inv[id] || 0) - (before.inv[id] || 0);
        if (delta > 0) {
            let nm = (typeof DB !== 'undefined' && DB.items && DB.items[id]) ? DB.items[id].n : id;
            items.push({ n: nm, d: delta });
        }
    }
    items.sort((a, b) => b.d - a.d);
    let itemStr = items.map(it => it.n + '×' + it.d).join('、');
    let timeStr = mins < 60 ? (mins + ' 分鐘')
        : (Math.floor(mins / 60) + ' 小時' + (mins % 60 ? ' ' + (mins % 60) + ' 分鐘' : ''));
    let line = `<span class="text-sky-300 font-bold">🌙 離線掛機 ${timeStr}</span>（在 <b>${offlineMapName(huntMap)}</b>），獲得：`;
    let parts = [];
    if (dGold > 0) parts.push(`<span class="text-yellow-400 font-bold">${offlineFmtNum(dGold)} 金幣</span>`);
    if (dLv > 0) parts.push(`<span class="text-green-400 font-bold">升 ${dLv} 級</span>`);
    if (dExp > 0) parts.push(`<span class="text-purple-400 font-bold">${offlineFmtNum(dExp)} 經驗</span>`);
    if (itemStr) parts.push(itemStr);
    line += parts.length ? parts.join('、') : '（無明顯收益）';
    line += '。';
    try { logSys(line); } catch (e) { console.log('[離線]', line.replace(/<[^>]+>/g, '')); }
    if (died) {
        try { logSys('<span class="text-red-500 font-bold">離線期間角色陣亡，進度已結算至死亡前。</span>'); }
        catch (e) {}
    }
}

function offlineRaf() {
    return new Promise(resolve => {
        let done = false;
        let fin = () => { if (!done) { done = true; resolve(); } };
        try { requestAnimationFrame(fin); } catch (e) {}
        setTimeout(fin, 50);
    });
}

let _offlineOverlay = null, _offlineOverlayBar = null, _offlineOverlayTxt = null;
function offlineShowOverlay(totalTicks) {
    if (_offlineOverlay) return;
    _offlineOverlay = document.createElement('div');
    _offlineOverlay.setAttribute('style', 'position:fixed;inset:0;z-index:99999;background:rgba(2,6,23,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;font-family:system-ui,sans-serif;color:#e2e8f0');
    let title = document.createElement('div');
    title.textContent = '離線掛機結算中…';
    title.setAttribute('style', 'font-size:20px;font-weight:bold;color:#fcd34d');
    let barWrap = document.createElement('div');
    barWrap.setAttribute('style', 'width:min(70vw,420px);height:14px;background:#1e293b;border-radius:8px;overflow:hidden;border:1px solid #334155');
    _offlineOverlayBar = document.createElement('div');
    _offlineOverlayBar.setAttribute('style', 'height:100%;width:0%;background:linear-gradient(90deg,#22c55e,#86efac)');
    barWrap.appendChild(_offlineOverlayBar);
    _offlineOverlayTxt = document.createElement('div');
    _offlineOverlayTxt.setAttribute('style', 'font-size:13px;color:#94a3b8');
    _offlineOverlayTxt.textContent = '0%';
    _offlineOverlay.appendChild(title);
    _offlineOverlay.appendChild(barWrap);
    _offlineOverlay.appendChild(_offlineOverlayTxt);
    document.body.appendChild(_offlineOverlay);
}
function offlineUpdateOverlay(frac, done, total) {
    if (!_offlineOverlayBar) return;
    let pct = Math.min(100, Math.round(frac * 100));
    _offlineOverlayBar.style.width = pct + '%';
    _offlineOverlayTxt.textContent = pct + '%　已結算 ' + offlineFmtCatchupTime(done) + ' / 共 ' + offlineFmtCatchupTime(total);
}
function offlineRemoveOverlay() {
    if (_offlineOverlay && _offlineOverlay.parentNode) _offlineOverlay.parentNode.removeChild(_offlineOverlay);
    _offlineOverlay = _offlineOverlayBar = _offlineOverlayTxt = null;
}

async function offlineRunCatchUp(totalTicks, huntMap, withOverlay) {
    if (_offlineCatching || !(totalTicks > 0) || typeof runCatchUpTicks !== 'function') return { ran: 0, died: false };
    _offlineCatching = true;
    let sliceMs = offlineSliceFor(totalTicks);
    let isKing = (typeof KING_ROOMS !== 'undefined') && !!KING_ROOMS[huntMap];
    let kingLeftRoom = false;

    try { if (typeof _gameLoopId !== 'undefined' && _gameLoopId !== null) { clearInterval(_gameLoopId); _gameLoopId = null; } } catch (e) {}

    offlineGotoMap(huntMap);
    let before = offlineSnapshot();
    if (withOverlay) offlineShowOverlay(totalTicks);

    let done = 0, died = false;
    try {
        while (done < totalTicks && !died && state.running) {
            let remain = totalTicks - done;
            let chunk = Math.min(remain, Math.max(60, Math.floor(sliceMs * 4)));
            let r = runCatchUpTicks(chunk, { batch: true, refreshUi: false });
            done += r.ran;
            died = r.died;
            if (r.ran <= 0) break;
            if (isKing && mapState && mapState.current !== huntMap) kingLeftRoom = true;
            if (withOverlay) offlineUpdateOverlay(done / totalTicks, done, totalTicks);
            await offlineRaf();
        }
    } catch (e) {
        console.error('[離線] 補跑例外:', e);
    } finally {
        settleDeadMobs();
    }

    let after = offlineSnapshot();

    player.dead = false;
    if (!died && huntMap) {
        if (isKing && kingLeftRoom) offlineGotoMap(offlineHomeTown());
        else {
            if (player.mhp) player.hp = player.mhp;
            if (player.mmp) player.mp = player.mmp;
            offlineGotoMap(huntMap);
        }
    } else {
        offlineGotoMap(offlineHomeTown());
    }

    try { if (typeof startGameTimers === 'function') startGameTimers(); } catch (e) {}
    try { if (typeof saveGame === 'function') saveGame(); } catch (e) {}
    if (done > 0) {
        offlineSummarize(before, after, done, died, huntMap);
        _awayAcc = { ticks: 0, gold: 0, items: {} };
    }
    try { updateUI(); renderMobs(); renderTabs(); } catch (e) {}
    offlineRemoveOverlay();
    offlineStamp();
    _offlineCatching = false;
    return { ran: done, died: died };
}

function offlineMaybeCatchup(slot, preTs, preMap) {
    if (!offlineValidSlot(slot) || typeof state === 'undefined' || !state || !state.running) return;
    let savedMap = preMap;
    if (!savedMap) {
        try {
            let raw = (typeof _lzGet === 'function') ? _lzGet('lineage_idle_save_' + slot) : localStorage.getItem('lineage_idle_save_' + slot);
            if (raw && typeof _saveUnwrap === 'function') raw = _saveUnwrap(raw).payload;
            if (raw) savedMap = (JSON.parse(raw).ms || {}).current || '';
        } catch (e) {}
    }
    offlineStamp();
    if (!preTs) return;
    if (!offlineMapSettleOk(savedMap)) {
        if (savedMap && savedMap.indexOf('town_') === 0) console.info('[離線] 關閉時在村莊，無離線戰鬥收益。');
        return;
    }
    let gap = Date.now() - preTs;
    if (gap < TICK_MS) return;
    let ms = Math.min(gap, offlineCapMs());
    let ticks = Math.floor(ms / TICK_MS);
    if (ticks <= 0) return;
    offlineRunCatchUp(ticks, savedMap, ticks > OFFLINE_CFG.overlayMinTicks).catch(e => console.warn('[離線] catchup:', e));
}

// ----- 選角掛機資訊 UI -----
function offlineSlotInfoRead(slot) {
    let save = null;
    try {
        let _raw = (typeof _lzGet === 'function') ? _lzGet('lineage_idle_save_' + slot) : localStorage.getItem('lineage_idle_save_' + slot);
        if (_raw && typeof _saveUnwrap === 'function') _raw = _saveUnwrap(_raw).payload;
        if (_raw) save = JSON.parse(_raw);
    } catch (e) {}

    let mapId = offlineReadMap(slot);
    if (!mapId && save && save.ms) mapId = save.ms.current || '';
    let mapName = mapId ? offlineMapName(mapId) : '';
    let inTown = mapId && !offlineIsHuntMap(mapId);

    let ts = offlineReadTs(slot);
    let idleText = '';
    if (ts > 0) {
        let idleMs = Date.now() - ts;
        if (inTown) idleText = '⏱ 安全區（無離線戰鬥收益）';
        else {
            idleText = '⏱ 已掛機 ' + offlineFmtIdle(idleMs);
            if (idleMs >= offlineCapMs()) idleText += '（收益上限 ' + OFFLINE_CFG.capHours + ' 小時）';
        }
    }

    let p = save && save.p;
    let sherine = p ? (p.sherineMad ? 'mad' : (p.sherineWorld ? 'world' : '')) : '';
    return { mapName: mapName, idleText: idleText, sherine: sherine, inTown: inTown };
}

function offlineAppendSlotInfo() {
    let list = document.getElementById('slot-list');
    if (!list) return;
    for (let i = 0; i < list.children.length; i++) {
        let row = list.children[i];
        let btn = row && row.children[0];
        if (!btn || btn.tagName !== 'BUTTON' || btn.querySelector('.haru-slot-extra')) continue;
        let info = offlineSlotInfoRead(i + 1);
        if (!info.mapName && !info.idleText && !info.sherine) continue;
        btn.style.flexWrap = 'wrap';
        let box = document.createElement('span');
        box.className = 'haru-slot-extra';
        box.style.cssText = 'flex-basis:100%;width:100%;display:flex;flex-direction:column;gap:1px;margin-top:3px;font-size:.8rem;font-weight:400;color:#94a3b8;line-height:1.3;text-align:left;';
        if (info.sherine) {
            let s = document.createElement('span');
            s.textContent = info.sherine === 'mad' ? '🔥 瘋狂的席琳世界' : '🔮 席琳的世界';
            s.style.cssText = 'font-weight:700;color:' + (info.sherine === 'mad' ? '#fb7185' : '#4ade80') + ';';
            box.appendChild(s);
        }
        if (info.mapName) {
            let a = document.createElement('span');
            a.textContent = '📍 ' + info.mapName + (info.inTown ? '（安全區）' : '');
            box.appendChild(a);
        }
        if (info.idleText) {
            let b = document.createElement('span');
            b.textContent = info.idleText;
            box.appendChild(b);
        }
        btn.appendChild(box);
    }
}

function offlineWrapOpenSlotSelect() {
    if (typeof openSlotSelect !== 'function' || openSlotSelect._haruOfflineSlotInfo) return;
    let _orig = openSlotSelect;
    openSlotSelect = function () {
        _orig.apply(this, arguments);
        try { offlineAppendSlotInfo(); } catch (e) {}
    };
    openSlotSelect._haruOfflineSlotInfo = true;
}

function offlineWrapSaveGame() {
    if (typeof saveGame !== 'function' || saveGame._haruOfflineStamp) return;
    let _orig = saveGame;
    saveGame = function () {
        let r = _orig.apply(this, arguments);
        offlineStamp();
        return r;
    };
    saveGame._haruOfflineStamp = true;
}

function offlineWrapChangeMap() {
    if (typeof changeMap !== 'function' || changeMap._haruOfflineStamp) return;
    let _orig = changeMap;
    changeMap = function () {
        let r = _orig.apply(this, arguments);
        offlineStamp();
        return r;
    };
    changeMap._haruOfflineStamp = true;
}

function offlineWrapLoadGame() {
    if (typeof loadGame !== 'function' || loadGame._haruOfflineCatchup) return;
    let _orig = loadGame;
    loadGame = function () {
        let slot = +currentSlot;
        let preTs = offlineReadTs(slot);
        let preMap = offlineReadMap(slot);
        _orig.apply(this, arguments);
        try {
            if (state && state.running) offlineMaybeCatchup(slot, preTs, preMap);
        } catch (e) { console.warn('[離線] maybeCatchup:', e); }
    };
    loadGame._haruOfflineCatchup = true;
}

function offlineInitHooks() {
    offlineWrapOpenSlotSelect();
    offlineWrapSaveGame();
    offlineWrapChangeMap();
    offlineWrapLoadGame();
    setInterval(function () {
        if (typeof state !== 'undefined' && state && state.running && !_offlineCatching) offlineStamp();
    }, OFFLINE_CFG.heartbeatMs);
    window.addEventListener('beforeunload', offlineStamp);
    window.addEventListener('pagehide', offlineStamp);
}

window.HARU_OFFLINE = {
    cfg: OFFLINE_CFG,
    stamp: offlineStamp,
    readSlot: offlineSlotInfoRead,
    mapName: offlineMapName,
    runCatchUp: offlineRunCatchUp
};

offlineInitHooks();
