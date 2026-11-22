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
    document.addEventListener('mousemove', (e) => { if (this.locked) { this.dx += e.movementX || 0; this.dy += e.movementY || 0; } });
    document.addEventListener('mousedown', (e) => { if (this.locked && e.button === 0) this.fire = true; });
    document.addEventListener('mouseup', (e) => { if (e.button === 0) this.fire = false; });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked; this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked) { this.fire = false; this.keys.clear(); if (this.onUnlock) this.onUnlock(); }
    });
    if (isMobile) this.setupTouch();
  }
  lock() {
    if (this.mobile) return Promise.resolve();
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) return p.catch(() => { try { return this.canvas.requestPointerLock(); } catch (e) { return null; } });
    } catch (e) { try { this.canvas.requestPointerLock(); } catch (e2) { /* */ } }
    return Promise.resolve();
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  consume(code) { if (this.pressed.has(code)) { this.pressed.delete(code); return true; } return false; }
  frameEnd() { this.pressed.clear(); this.dx = 0; this.dy = 0; }

  setupTouch() {
    const stick = document.getElementById('stick'), knob = document.getElementById('knob');
    let stickId = null, sx = 0, sy = 0; const R = 60;
    stick.addEventListener('touchstart', (e) => {
      e.preventDefault(); const t = e.changedTouches[0]; stickId = t.identifier;
      const r = stick.getBoundingClientRect(); sx = r.left + r.width / 2; sy = r.top + r.height / 2; this.updStick(t.clientX - sx, t.clientY - sy, knob, R);
    }, { passive: false });
    // aim: any touch that starts on the right half (not on a button)
    let aimId = null, ax = 0, ay = 0;
    addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.target.closest && t.target.closest('.tb, .stick, button, .scr')) continue;
        if (t.clientX > innerWidth * 0.4 && aimId === null) { aimId = t.identifier; ax = t.clientX; ay = t.clientY; }
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
        if (t.identifier === stickId) { stickId = null; this.move.x = this.move.y = 0; knob.style.transform = ''; }
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
