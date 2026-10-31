/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

/**
 * Creates a custom GLSL ShaderMaterial for holographic translucent ghost pieces
 * with Fresnel edge glow and subtle vertical scanline shimmer.
 */
export function createGhostShaderMaterial(hexColor: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(hexColor) },
      uTime: { value: 0 },
      uOpacity: { value: 0.68 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vWorldPos;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        vec4 mvPosition = viewMatrix * worldPosition;
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uOpacity;

      varying vec3 vNormal;
      varying vec3 vViewPosition;
      varying vec3 vWorldPos;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        float fresnel = pow(1.0 - abs(dot(normal, viewDir)), 2.0);

        float scanline = 0.85 + 0.15 * sin(vWorldPos.y * 28.0 - uTime * 4.0);
        vec3 finalColor = mix(uColor * 0.8, uColor * 1.5, fresnel) * scanline;
        float alpha = clamp((0.32 + fresnel * 0.65) * uOpacity, 0.22, 0.9);

        gl_FragColor = vec4(finalColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/**
 * Creates a custom GLSL ShaderMaterial for board square highlights
 * (last-move glow, legal-move rings, and check pulse).
 * Uses float uMode for universal WebGL1/WebGL2 compatibility.
 */
export function createSquareGlowShaderMaterial(
  hexColor: number,
  mode: 'ring' | 'glow' | 'pulse'
): THREE.ShaderMaterial {
  const modeFloat = mode === 'ring' ? 0.0 : mode === 'glow' ? 1.0 : 2.0;
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(hexColor) },
      uTime: { value: 0 },
      uMode: { value: modeFloat },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uMode;
      varying vec2 vUv;

      void main() {
        vec2 centered = vUv - vec2(0.5);
        float dist = length(centered) * 2.0;
        float alpha = 0.0;

        if (uMode < 0.5) {
          // Crisp legal move target ring + inner dot
          float ring = smoothstep(0.70, 0.58, dist) * smoothstep(0.36, 0.48, dist);
          float dotCenter = smoothstep(0.28, 0.18, dist);
          alpha = max(ring * 0.9, dotCenter * 0.95);
        } else if (uMode < 1.5) {
          // Last-move edge frame glow
          vec2 edgeDist = abs(centered) * 2.0;
          float maxEdge = max(edgeDist.x, edgeDist.y);
          float border = smoothstep(0.62, 0.95, maxEdge);
          alpha = 0.26 + border * 0.52;
        } else {
          // Check danger pulse
          float pulse = 0.65 + 0.35 * sin(uTime * 6.0);
          float radial = smoothstep(1.05, 0.15, dist);
          alpha = radial * 0.82 * pulse;
        }

        gl_FragColor = vec4(uColor, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}
