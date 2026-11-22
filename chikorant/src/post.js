// Post-processing: world + viewmodel render, bloom on emissives/neon, ACES tone mapping,
// colour grade (golden "Main Character" grade + vignette), FXAA.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uGold: { value: 0 }, uVig: { value: 0.55 }, uHurt: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uGold, uVig, uHurt, uTime, uFlash; varying vec2 vUv;
    void main(){
      vec2 d = vUv - 0.5;
      float ca = uGold * 0.004;
      vec4 c = texture2D(tDiffuse, vUv);
      if (ca > 0.0) { c.r = texture2D(tDiffuse, vUv + d*ca*4.0).r; c.b = texture2D(tDiffuse, vUv - d*ca*4.0).b; }
      float l = dot(c.rgb, vec3(0.299,0.587,0.114));
      vec3 gold = mix(vec3(l), c.rgb, 1.35) * vec3(1.14, 1.0, 0.70) + vec3(0.05, 0.03, 0.0);
      gold = mix(gold, gold*gold*1.4 + 0.02, 0.25);
      c.rgb = mix(c.rgb, gold, uGold);
      float r = length(d * vec2(1.0, 1.2));
      float v = smoothstep(0.95, 0.3, r);
      c.rgb *= mix(1.0, v, uVig + uGold * 0.35);
      c.rgb += vec3(1.0, 0.75, 0.25) * uGold * smoothstep(0.45, 0.85, r) * 0.25;
      c.rgb = mix(c.rgb, vec3(0.9, 0.08, 0.15), uHurt * smoothstep(0.25, 0.85, r));
      c.rgb += uFlash;
      gl_FragColor = c;
    }`,
};

export class Post {
  constructor(renderer, scene, camera, vm) {
    this.renderer = renderer; this.scene = scene; this.camera = camera; this.vm = vm;
    const size = renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(renderer, rt);
    this.world = new RenderPass(scene, camera);
    this.weapon = new RenderPass(vm.scene, vm.camera); this.weapon.clear = false; this.weapon.clearDepth = true;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.45, 0.92);
    this.output = new OutputPass();
    this.grade = new ShaderPass(GradeShader);
    this.fxaa = new ShaderPass(FXAAShader);
    for (const p of [this.world, this.weapon, this.bloom, this.output, this.grade, this.fxaa]) this.composer.addPass(p);
    this.enabled = true;
  }
  setSize(w, h, pr) {
    this.composer.setPixelRatio(pr); this.composer.setSize(w, h);
    this.fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
  }
  render(dt) {
    this.grade.uniforms.uTime.value += dt;
    this.composer.render(dt);
  }
}
