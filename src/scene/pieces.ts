/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { PieceSymbol, Color } from 'chess.js';

export interface PieceMaterialSet {
  whitePrimary: THREE.MeshPhysicalMaterial;
  whiteTrim: THREE.MeshStandardMaterial;
  blackPrimary: THREE.MeshPhysicalMaterial;
  blackTrim: THREE.MeshStandardMaterial;
  contactShadowMat: THREE.MeshBasicMaterial;
  dispose: () => void;
}

function createMarbleTexture(isWhite: boolean, maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Base fill: bright warm ivory for White, rich slate-obsidian for Black
  ctx.fillStyle = isWhite ? '#fbf9f5' : '#263042';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle mineral veins
  ctx.strokeStyle = isWhite ? 'rgba(175, 160, 140, 0.30)' : 'rgba(130, 160, 210, 0.28)';
  ctx.lineWidth = 2.2;
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    let x = (i * 23) % 256;
    let y = 0;
    ctx.moveTo(x, y);
    while (y < 256) {
      y += 24;
      x += Math.sin(y * 0.05 + i) * 14;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  grad.addColorStop(0.6, 'rgba(0, 0, 0, 0.25)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createPieceMaterialSet(maxAnisotropy = 4): PieceMaterialSet {
  const whiteTex = createMarbleTexture(true, maxAnisotropy);
  const blackTex = createMarbleTexture(false, maxAnisotropy);
  const shadowTex = createContactShadowTexture();

  // Polished Carrara Marble (roughness 0.14, clearcoat 0.9)
  const whitePrimary = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: whiteTex,
    emissive: 0x26221a,
    emissiveIntensity: 0.18,
    roughness: 0.14,
    metalness: 0.05,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
  });

  // Brushed Warm Gold Collar Trim (roughness 0.42 -> >= 0.25 diff from primary!)
  const whiteTrim = new THREE.MeshStandardMaterial({
    color: 0xeab308,
    emissive: 0x3b2a06,
    emissiveIntensity: 0.22,
    roughness: 0.42,
    metalness: 0.8,
  });

  // Polished Volcanic Obsidian (roughness 0.12, clearcoat 1.0)
  const blackPrimary = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: blackTex,
    emissive: 0x131c2e,
    emissiveIntensity: 0.28,
    roughness: 0.14,
    metalness: 0.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
  });

  // Brushed Rose-Copper / Bronze Collar Trim (roughness 0.40 -> >= 0.25 diff from primary!)
  const blackTrim = new THREE.MeshStandardMaterial({
    color: 0xe08e55,
    emissive: 0x381d0a,
    emissiveIntensity: 0.25,
    roughness: 0.4,
    metalness: 0.8,
  });

  const contactShadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.45,
  });

  return {
    whitePrimary,
    whiteTrim,
    blackPrimary,
    blackTrim,
    contactShadowMat,
    dispose: () => {
      whiteTex.dispose();
      blackTex.dispose();
      shadowTex.dispose();
      whitePrimary.dispose();
      whiteTrim.dispose();
      blackPrimary.dispose();
      blackTrim.dispose();
      contactShadowMat.dispose();
    },
  };
}

export class PieceGeometryLibrary {
  private geometries: THREE.BufferGeometry[] = [];
  public readonly contactDiscGeo: THREE.CircleGeometry;
  public readonly trimRingGeo: THREE.TorusGeometry;
  public readonly feltPadGeo: THREE.CylinderGeometry;

  // Per-piece cached geometries
  private pawnLatheGeo: THREE.LatheGeometry;
  private pawnHeadGeo: THREE.SphereGeometry;

  private rookLatheGeo: THREE.LatheGeometry;
  private rookBattlementGeo: THREE.BoxGeometry;

  private knightBaseGeo: THREE.LatheGeometry;
  private knightHeadGeo: THREE.ExtrudeGeometry;
  private knightManeGeo: THREE.BoxGeometry;

  private bishopLatheGeo: THREE.LatheGeometry;
  private bishopMitreGeo: THREE.SphereGeometry;
  private bishopFinialGeo: THREE.SphereGeometry;

  private queenLatheGeo: THREE.LatheGeometry;
  private queenCrownSpikeGeo: THREE.ConeGeometry;
  private queenOrbGeo: THREE.SphereGeometry;

  private kingLatheGeo: THREE.LatheGeometry;
  private kingCrossVertGeo: THREE.BoxGeometry;
  private kingCrossHorizGeo: THREE.BoxGeometry;

  constructor() {
    this.contactDiscGeo = new THREE.CircleGeometry(0.44, 24);
    this.contactDiscGeo.rotateX(-Math.PI / 2);

    this.feltPadGeo = new THREE.CylinderGeometry(0.36, 0.37, 0.04, 24);
    this.feltPadGeo.translate(0, 0.02, 0);

    this.trimRingGeo = new THREE.TorusGeometry(0.27, 0.024, 12, 28);
    this.trimRingGeo.rotateX(Math.PI / 2);

    // 1. PAWN
    const pawnPts = [
      new THREE.Vector2(0.0, 0.04),
      new THREE.Vector2(0.35, 0.04),
      new THREE.Vector2(0.33, 0.14),
      new THREE.Vector2(0.24, 0.22),
      new THREE.Vector2(0.16, 0.56),
      new THREE.Vector2(0.22, 0.62),
      new THREE.Vector2(0.13, 0.68),
      new THREE.Vector2(0.0, 0.70),
    ];
    this.pawnLatheGeo = new THREE.LatheGeometry(pawnPts, 28);
    this.pawnHeadGeo = new THREE.SphereGeometry(0.19, 24, 20);
    this.pawnHeadGeo.translate(0, 0.84, 0);

    // 2. ROOK
    const rookPts = [
      new THREE.Vector2(0.0, 0.04),
      new THREE.Vector2(0.37, 0.04),
      new THREE.Vector2(0.35, 0.16),
      new THREE.Vector2(0.27, 0.25),
      new THREE.Vector2(0.23, 0.78),
      new THREE.Vector2(0.30, 0.86),
      new THREE.Vector2(0.30, 0.98),
      new THREE.Vector2(0.18, 0.98),
      new THREE.Vector2(0.18, 0.90),
      new THREE.Vector2(0.0, 0.90),
    ];
    this.rookLatheGeo = new THREE.LatheGeometry(rookPts, 28);
    this.rookBattlementGeo = new THREE.BoxGeometry(0.10, 0.14, 0.10);

    // 3. KNIGHT (Lathe pedestal + Extruded & beveled horse silhouette + sculpted mane accents)
    const knightBasePts = [
      new THREE.Vector2(0.0, 0.04),
      new THREE.Vector2(0.37, 0.04),
      new THREE.Vector2(0.35, 0.16),
      new THREE.Vector2(0.26, 0.26),
      new THREE.Vector2(0.0, 0.28),
    ];
    this.knightBaseGeo = new THREE.LatheGeometry(knightBasePts, 28);

    const horseShape = new THREE.Shape();
    horseShape.moveTo(-0.20, 0.24);
    horseShape.lineTo(0.20, 0.24);
    horseShape.quadraticCurveTo(0.24, 0.45, 0.15, 0.65);
    // Snout / jaw
    horseShape.lineTo(0.28, 0.72);
    horseShape.lineTo(0.25, 0.84);
    horseShape.lineTo(0.10, 0.92);
    // Ears
    horseShape.lineTo(0.08, 1.12);
    horseShape.lineTo(-0.02, 1.02);
    // Arching neck / mane back
    horseShape.quadraticCurveTo(-0.26, 0.86, -0.22, 0.50);
    horseShape.closePath();

    this.knightHeadGeo = new THREE.ExtrudeGeometry(horseShape, {
      steps: 2,
      depth: 0.18,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.04,
      bevelSegments: 3,
    });
    this.knightHeadGeo.translate(0, 0, -0.09);
    // Orient knight along Z axis
    this.knightHeadGeo.rotateY(Math.PI / 2);

    this.knightManeGeo = new THREE.BoxGeometry(0.06, 0.12, 0.08);

    // 4. BISHOP
    const bishopPts = [
      new THREE.Vector2(0.0, 0.04),
      new THREE.Vector2(0.37, 0.04),
      new THREE.Vector2(0.35, 0.16),
      new THREE.Vector2(0.25, 0.26),
      new THREE.Vector2(0.17, 0.72),
      new THREE.Vector2(0.24, 0.78),
      new THREE.Vector2(0.16, 0.84),
      new THREE.Vector2(0.0, 0.86),
    ];
    this.bishopLatheGeo = new THREE.LatheGeometry(bishopPts, 28);
    this.bishopMitreGeo = new THREE.SphereGeometry(0.21, 24, 20);
    this.bishopMitreGeo.scale(0.88, 1.38, 0.88);
    this.bishopMitreGeo.translate(0, 1.04, 0);
    this.bishopFinialGeo = new THREE.SphereGeometry(0.055, 16, 16);
    this.bishopFinialGeo.translate(0, 1.34, 0);

    // 5. QUEEN
    const queenPts = [
      new THREE.Vector2(0.0, 0.04),
      new THREE.Vector2(0.39, 0.04),
      new THREE.Vector2(0.37, 0.16),
      new THREE.Vector2(0.27, 0.28),
      new THREE.Vector2(0.18, 0.86),
      new THREE.Vector2(0.26, 0.94),
      new THREE.Vector2(0.20, 1.02),
      new THREE.Vector2(0.28, 1.22),
      new THREE.Vector2(0.16, 1.18),
      new THREE.Vector2(0.0, 1.20),
    ];
    this.queenLatheGeo = new THREE.LatheGeometry(queenPts, 32);
    this.queenCrownSpikeGeo = new THREE.ConeGeometry(0.045, 0.16, 12);
    this.queenOrbGeo = new THREE.SphereGeometry(0.075, 16, 16);
    this.queenOrbGeo.translate(0, 1.30, 0);

    // 6. KING
    const kingPts = [
      new THREE.Vector2(0.0, 0.04),
      new THREE.Vector2(0.40, 0.04),
      new THREE.Vector2(0.38, 0.18),
      new THREE.Vector2(0.28, 0.30),
      new THREE.Vector2(0.19, 0.92),
      new THREE.Vector2(0.28, 1.00),
      new THREE.Vector2(0.21, 1.08),
      new THREE.Vector2(0.29, 1.30),
      new THREE.Vector2(0.0, 1.32),
    ];
    this.kingLatheGeo = new THREE.LatheGeometry(kingPts, 32);
    this.kingCrossVertGeo = new THREE.BoxGeometry(0.07, 0.26, 0.07);
    this.kingCrossVertGeo.translate(0, 1.44, 0);
    this.kingCrossHorizGeo = new THREE.BoxGeometry(0.20, 0.07, 0.07);
    this.kingCrossHorizGeo.translate(0, 1.47, 0);

    this.geometries.push(
      this.contactDiscGeo,
      this.feltPadGeo,
      this.trimRingGeo,
      this.pawnLatheGeo,
      this.pawnHeadGeo,
      this.rookLatheGeo,
      this.rookBattlementGeo,
      this.knightBaseGeo,
      this.knightHeadGeo,
      this.knightManeGeo,
      this.bishopLatheGeo,
      this.bishopMitreGeo,
      this.bishopFinialGeo,
      this.queenLatheGeo,
      this.queenCrownSpikeGeo,
      this.queenOrbGeo,
      this.kingLatheGeo,
      this.kingCrossVertGeo,
      this.kingCrossHorizGeo
    );
  }

  /**
   * Builds a composite 4–10 part THREE.Group for the specified chess piece,
   * grounded at bottom-center (y = 0) with a soft contact shadow disc.
   */
  public createPieceGroup(
    type: PieceSymbol,
    color: Color,
    materials: PieceMaterialSet,
    customOverrideMaterial?: THREE.Material
  ): THREE.Group {
    const group = new THREE.Group();
    const primaryMat = customOverrideMaterial || (color === 'w' ? materials.whitePrimary : materials.blackPrimary);
    const trimMat = customOverrideMaterial || (color === 'w' ? materials.whiteTrim : materials.blackTrim);
    const enableShadows = !customOverrideMaterial;

    // 1. Soft radial contact shadow disc at y = 0.015 (if not ghost)
    if (!customOverrideMaterial) {
      const contactDisc = new THREE.Mesh(this.contactDiscGeo, materials.contactShadowMat);
      contactDisc.position.y = 0.012;
      group.add(contactDisc);
    }

    // 2. Base felt/collar pad
    const pad = new THREE.Mesh(this.feltPadGeo, trimMat);
    pad.castShadow = enableShadows;
    pad.receiveShadow = enableShadows;
    group.add(pad);

    // 3. Metallic pedestal collar ring
    const baseRing = new THREE.Mesh(this.trimRingGeo, trimMat);
    baseRing.position.y = 0.22;
    baseRing.castShadow = enableShadows;
    group.add(baseRing);

    if (type === 'p') {
      const body = new THREE.Mesh(this.pawnLatheGeo, primaryMat);
      const head = new THREE.Mesh(this.pawnHeadGeo, primaryMat);
      const neckRing = new THREE.Mesh(this.trimRingGeo, trimMat);
      neckRing.scale.setScalar(0.68);
      neckRing.position.y = 0.62;
      body.castShadow = head.castShadow = enableShadows;
      body.receiveShadow = head.receiveShadow = enableShadows;
      group.add(body, head, neckRing);
    } else if (type === 'r') {
      const body = new THREE.Mesh(this.rookLatheGeo, primaryMat);
      body.castShadow = body.receiveShadow = enableShadows;
      group.add(body);

      // 6 crenellation battlements around turret rim
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI * 2) / 6;
        const merlon = new THREE.Mesh(this.rookBattlementGeo, i % 2 === 0 ? primaryMat : trimMat);
        merlon.position.set(Math.cos(angle) * 0.23, 1.03, Math.sin(angle) * 0.23);
        merlon.rotation.y = -angle;
        merlon.castShadow = enableShadows;
        group.add(merlon);
      }
    } else if (type === 'n') {
      const base = new THREE.Mesh(this.knightBaseGeo, primaryMat);
      const head = new THREE.Mesh(this.knightHeadGeo, primaryMat);
      base.castShadow = head.castShadow = enableShadows;
      base.receiveShadow = head.receiveShadow = enableShadows;
      if (color === 'w') {
        head.rotation.y = Math.PI; // White knights face Black (-Z)
      }
      group.add(base, head);

      // 3 Metallic mane plates along the crest
      const zSign = color === 'w' ? 1 : -1;
      for (let i = 0; i < 3; i++) {
        const mane = new THREE.Mesh(this.knightManeGeo, trimMat);
        mane.position.set(0, 0.54 + i * 0.16, zSign * 0.18);
        mane.castShadow = enableShadows;
        group.add(mane);
      }
    } else if (type === 'b') {
      const body = new THREE.Mesh(this.bishopLatheGeo, primaryMat);
      const mitre = new THREE.Mesh(this.bishopMitreGeo, primaryMat);
      const finial = new THREE.Mesh(this.bishopFinialGeo, trimMat);
      const collar = new THREE.Mesh(this.trimRingGeo, trimMat);
      collar.scale.setScalar(0.75);
      collar.position.y = 0.78;
      body.castShadow = mitre.castShadow = finial.castShadow = enableShadows;
      body.receiveShadow = mitre.receiveShadow = enableShadows;
      group.add(body, mitre, finial, collar);
    } else if (type === 'q') {
      const body = new THREE.Mesh(this.queenLatheGeo, primaryMat);
      const orb = new THREE.Mesh(this.queenOrbGeo, trimMat);
      const collar = new THREE.Mesh(this.trimRingGeo, trimMat);
      collar.scale.setScalar(0.82);
      collar.position.y = 0.94;
      body.castShadow = orb.castShadow = enableShadows;
      body.receiveShadow = enableShadows;
      group.add(body, orb, collar);

      // 8 radial coronet spikes
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI * 2) / 8;
        const spike = new THREE.Mesh(this.queenCrownSpikeGeo, trimMat);
        spike.position.set(Math.cos(angle) * 0.22, 1.24, Math.sin(angle) * 0.22);
        spike.castShadow = enableShadows;
        group.add(spike);
      }
    } else if (type === 'k') {
      const body = new THREE.Mesh(this.kingLatheGeo, primaryMat);
      const crossV = new THREE.Mesh(this.kingCrossVertGeo, trimMat);
      const crossH = new THREE.Mesh(this.kingCrossHorizGeo, trimMat);
      const collar = new THREE.Mesh(this.trimRingGeo, trimMat);
      collar.scale.setScalar(0.88);
      collar.position.y = 1.0;
      body.castShadow = crossV.castShadow = crossH.castShadow = enableShadows;
      body.receiveShadow = enableShadows;
      group.add(body, crossV, crossH, collar);
    }

    return group;
  }

  public dispose() {
    for (const geo of this.geometries) {
      geo.dispose();
    }
  }
}
