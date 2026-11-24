// Keyboard/mouse with pointer lock, plus mobile touch: left joystick, right-half drag to aim, buttons.
export class Input {
  constructor(canvas, isMobile) {
    this.canvas = canvas; this.mobile = isMobile;
    this.keys = new Set(); this.pressed = new Set();
    this.dx = 0; this.dy = 0; this.fire = false; this.locked = false;
    this.move = { x: 0, y: 0 }; this.touchFire = false; this.enabled = false;
    this.onUnlock = null; this.onPauseKey = null;
    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.fire = false; });
    // Mouse look. Chrome's pointer lock (without raw input) sometimes reports a single huge
    // movementX/Y jump, and the first event after locking can carry the cursor's warp; both
    // would snap the view. Drop isolated outliers that are far bigger than the recent motion.
    this.rawInput = false; this.moveAvg = 0; this.lockT = 0; this.spikes = 0; this.dropped = false;
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const mx = e.movementX || 0, my = e.movementY || 0, m = Math.abs(mx) + Math.abs(my);
      if (performance.now() - this.lockT < 60 && m > 40) { this.spikes++; return; } // warp right after locking
      // a spike is one isolated event: never drop two in a row, so a genuine fast flick loses at most one sample
      if (!this.dropped && m > (this.rawInput ? 1500 : 220) && m > this.moveAvg * 8 + 60) { this.spikes++; this.dropped = true; return; }
      this.dropped = false; this.moveAvg += (m - this.moveAvg) * 0.3;
      this.dx += mx; this.dy += my;
    });
    // fireTap latches a click that goes down and up between two frames, so a quick tap never gets lost
    this.fireTap = false;
    document.addEventListener('mousedown', (e) => { if (this.locked && e.button === 0) { this.fire = true; this.fireTap = true; } });
    document.addEventListener('mouseup', (e) => { if (e.button === 0) this.fire = false; });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked; this.locked = document.pointerLockElement === canvas;
      if (this.locked && !was) { this.lockT = performance.now(); this.moveAvg = 0; }
      if (was && !this.locked) { this.fire = false; this.keys.clear(); if (this.onUnlock) this.onUnlock(); }
    });
    if (isMobile) this.setupTouch();
  }
  lock() {
    if (this.mobile) return Promise.resolve();
    try {
      // raw (unaccelerated) input when the browser supports it: 1 mouse count = the same turn everywhere
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.then) return p.then(() => { this.rawInput = true; }, () => { this.rawInput = false; try { return this.canvas.requestPointerLock(); } catch (e) { return null; } });
    } catch (e) { try { this.canvas.requestPointerLock(); } catch (e2) { /* */ } }
    return Promise.resolve();
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  consume(code) { if (this.pressed.has(code)) { this.pressed.delete(code); return true; } return false; }
  frameEnd() { this.pressed.clear(); this.dx = 0; this.dy = 0; this.fireTap = false; }

  setupTouch() {
    const stick = document.getElementById('stick'), knob = document.getElementById('knob');
    let stickId = null, sx = 0, sy = 0; const R = 56;
    const home = { l: stick.style.left, b: stick.style.bottom };
    const grab = (t, cx, cy) => {
      stickId = t.identifier; sx = cx; sy = cy; this.updStick(t.clientX - sx, t.clientY - sy, knob, R);
    };
    stick.addEventListener('touchstart', (e) => {
      e.preventDefault(); if (stickId !== null) return; const t = e.changedTouches[0];
      const r = stick.getBoundingClientRect(); grab(t, r.left + r.width / 2, r.top + r.height / 2);
    }, { passive: false });
    // Aim: any touch that starts on the right 60% and not on a button. A touch that starts on a
    // button (or the stick, or a screen) never aims. The empty left 40% spawns a floating stick.
    let aimId = null, ax = 0, ay = 0;
    addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.target.closest && t.target.closest('.tb, .stick, button, .scr, input, select')) continue;
        if (t.clientX > innerWidth * 0.4) { if (aimId === null) { aimId = t.identifier; ax = t.clientX; ay = t.clientY; } }
        else if (stickId === null) {
          const half = stick.offsetWidth / 2; stick.style.left = `${Math.max(half, t.clientX) - half}px`; stick.style.bottom = `${Math.max(8, innerHeight - t.clientY - half)}px`;
          stick.classList.add('float'); const r = stick.getBoundingClientRect(); grab(t, r.left + r.width / 2, r.top + r.height / 2);
        }
      }
    }, { passive: true });
    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) { e.preventDefault(); this.updStick(t.clientX - sx, t.clientY - sy, knob, R); }
        else if (t.identifier === aimId || t.identifier === this.fireTouchId) {
          const lx = t.identifier === aimId ? ax : this.fx, ly = t.identifier === aimId ? ay : this.fy;
          this.dx += (t.clientX - lx) * 2.2; this.dy += (t.clientY - ly) * 2.2;
          if (t.identifier === aimId) { ax = t.clientX; ay = t.clientY; } else { this.fx = t.clientX; this.fy = t.clientY; }
        }
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) { stickId = null; this.move.x = this.move.y = 0; knob.style.transform = ''; stick.style.left = home.l; stick.style.bottom = home.b; stick.classList.remove('float'); }
        if (t.identifier === aimId) aimId = null;
      }
    };
    addEventListener('touchend', end); addEventListener('touchcancel', end);
    const btn = (id, down, up) => {
      const el = document.getElementById(id);
      el.addEventListener('touchstart', (e) => { e.preventDefault(); el.classList.add('on'); down(e); }, { passive: false });
      const u = (e) => { el.classList.remove('on'); if (up) up(e); };
      el.addEventListener('touchend', u); el.addEventListener('touchcancel', u);
    };
    // FIRE also acts as an aim pad (drag while firing), like most mobile shooters
    btn('tFire', (e) => { this.touchFire = true; const t = e.changedTouches[0]; this.fireTouchId = t.identifier; this.fx = t.clientX; this.fy = t.clientY; }, () => { this.touchFire = false; this.fireTouchId = null; });
    btn('tJump', () => this.pressed.add('Space'));
    btn('tR', () => this.pressed.add('KeyR'));
    btn('tQ', () => this.pressed.add('KeyQ'));
    btn('tE', () => this.pressed.add('KeyE'));
    btn('tX', () => this.pressed.add('KeyX'));
    btn('tF', () => this.keys.add('KeyF'), () => this.keys.delete('KeyF'));
  }
  updStick(x, y, knob, R) {
    const L = Math.hypot(x, y); if (L > R) { x = x / L * R; y = y / L * R; }
    knob.style.transform = `translate(${x}px, ${y}px)`;
    this.move.x = x / R; this.move.y = -y / R;
  }
  get firing() { return this.fire || this.touchFire; }
}
