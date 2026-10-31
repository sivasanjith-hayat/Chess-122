/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { BotMood } from '../engine/types';

export interface ActiveHandMoveTarget {
  color: 'w' | 'b';
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  piecePos: THREE.Vector3;
  isKnight: boolean;
  progress: number; // 0..1 across the full hand reach -> carry -> return cycle
}

interface SteamParticle {
  mesh: THREE.Mesh;
  baseX: number;
  baseZ: number;
  phase: number;
  speed: number;
}

interface HumanPlayerRig {
  color: 'w' | 'b';
  root: THREE.Group;
  torso: THREE.Group;
  headGroup: THREE.Group;
  // Right Playing Arm & Hand (IK driven)
  rightShoulderWorld: THREE.Vector3;
  upperArmMesh: THREE.Mesh;
  elbowJointMesh: THREE.Mesh;
  forearmGroup: THREE.Group;
  handGroup: THREE.Group;
  thumbGroup: THREE.Group;
  fingersGroup: THREE.Group;
  restHandWorldPos: THREE.Vector3;
  currentHandWorldPos: THREE.Vector3;
  currentPinchAmount: number;
}

function createWoodGrainTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Rich roasted walnut cafe table wood
  ctx.fillStyle = '#4a2e1b';
  ctx.fillRect(0, 0, 512, 512);

  // Butcher-block planks & warm wood grain lines
  const plankColors = ['#4f311d', '#432816', '#563620', '#3d2414'];
  for (let p = 0; p < 8; p++) {
    ctx.fillStyle = plankColors[p % plankColors.length];
    ctx.fillRect(0, p * 64, 512, 63);
    ctx.fillStyle = 'rgba(20, 10, 4, 0.35)';
    ctx.fillRect(0, p * 64 + 62, 512, 2);
  }

  ctx.strokeStyle = 'rgba(28, 14, 6, 0.24)';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 60; i++) {
    ctx.beginPath();
    const yBase = (i * 9) % 512;
    ctx.moveTo(0, yBase);
    for (let x = 0; x <= 512; x += 32) {
      ctx.lineTo(x, yBase + Math.sin(x * 0.02 + i) * 3.5);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createStarbucksCupTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Warm white paper cup
  ctx.fillStyle = '#f8f6f0';
  ctx.fillRect(0, 0, 256, 256);

  // Kraft cardboard sleeve band in the middle
  ctx.fillStyle = '#b5895a';
  ctx.fillRect(0, 82, 256, 92);
  ctx.strokeStyle = '#8c643b';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 82, 256, 92);

  // Iconic Starbucks green circular emblem on front & back
  [64, 192].forEach((cx) => {
    const cy = 128;
    ctx.beginPath();
    ctx.arc(cx, cy, 32, 0, Math.PI * 2);
    ctx.fillStyle = '#006241';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, 27, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Stylized white crown & twin-tail wave emblem
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy - 8);
    ctx.lineTo(cx - 5, cy - 18);
    ctx.lineTo(cx, cy - 11);
    ctx.lineTo(cx + 5, cy - 18);
    ctx.lineTo(cx + 10, cy - 8);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy + 2, 7, 0, Math.PI * 2);
    ctx.fill();

    // Twin siren waves
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    [-1, 1].forEach((dir) => {
      ctx.beginPath();
      ctx.moveTo(cx + dir * 8, cy + 12);
      ctx.quadraticCurveTo(cx + dir * 18, cy + 4, cx + dir * 16, cy - 6);
      ctx.stroke();
    });
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createMenuBoardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0c1f17';
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#d4af37';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, 496, 240);

  ctx.fillStyle = '#00704a';
  ctx.fillRect(20, 20, 472, 44);

  ctx.font = 'bold 24px "Cinzel", Georgia, serif';
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.fillText('STARBUCKS RESERVE · CHESS LOUNGE', 256, 50);

  ctx.font = '600 18px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e2c778';
  const items = [
    ['CAFFÈ VERONA ESPRESSO', '4.45'],
    ['CARAMEL MACCHIATO', '5.65'],
    ['PIKE PLACE ROAST', '3.95'],
    ['MATCHA GREEN TEA LATTE', '5.45'],
    ['BUTTER CROISSANT', '4.25'],
  ];
  items.forEach(([name, price], idx) => {
    const y = 98 + idx * 30;
    ctx.fillStyle = '#f1f5f9';
    ctx.fillText(name, 36, y);
    ctx.fillStyle = '#d4af37';
    ctx.fillText(price, 430, y);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class StarbucksCafeStage {
  public readonly group = new THREE.Group();
  private whitePlayer!: HumanPlayerRig;
  private blackPlayer!: HumanPlayerRig;
  private steamParticles: SteamParticle[] = [];
  private disposableTextures: THREE.Texture[] = [];
  private disposableGeometries: THREE.BufferGeometry[] = [];
  private disposableMaterials: THREE.Material[] = [];

  // Reusable scratch vectors for 2-bone analytical arm IK
  private _shoulderToTarget = new THREE.Vector3();
  private _elbowWorld = new THREE.Vector3();
  private _midPoint = new THREE.Vector3();
  private _armDir = new THREE.Vector3();
  private _bendNormal = new THREE.Vector3();
  private _upVec = new THREE.Vector3(0, 1, 0);
  private _quat = new THREE.Quaternion();

  constructor(isSoftwareGl: boolean) {
    const woodTex = createWoodGrainTexture();
    const cupTex = createStarbucksCupTexture();
    const menuTex = createMenuBoardTexture();
    this.disposableTextures.push(woodTex, cupTex, menuTex);

    this.buildCafeTableAndProps(woodTex, cupTex, isSoftwareGl);
    this.buildCafeInterior(woodTex, menuTex, isSoftwareGl);

    // Build the 2 realistic human players seated across the cafe table
    this.whitePlayer = this.buildHumanPlayer('w', isSoftwareGl);
    this.blackPlayer = this.buildHumanPlayer('b', isSoftwareGl);
    this.group.add(this.whitePlayer.root, this.blackPlayer.root);

    // Position arms at initial table rest pose
    this.updatePlayerArmIK(this.whitePlayer, this.whitePlayer.restHandWorldPos, 0, 0);
    this.updatePlayerArmIK(this.blackPlayer, this.blackPlayer.restHandWorldPos, 0, 0);
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.disposableGeometries.push(geo);
    return geo;
  }

  private trackMat<T extends THREE.Material>(mat: T): T {
    this.disposableMaterials.push(mat);
    return mat;
  }

  private buildCafeTableAndProps(
    woodTex: THREE.CanvasTexture,
    cupTex: THREE.CanvasTexture,
    isSoftwareGl: boolean
  ) {
    // 1. Thick Walnut Butcher-Block Cafe Tabletop directly beneath the chessboard
    const tableTopGeo = this.trackGeo(new THREE.CylinderGeometry(7.5, 7.35, 0.46, 64));
    const tableTopMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: woodTex,
        color: 0xd9b38c,
        roughness: 0.34,
        metalness: 0.06,
      })
    );
    const tableTop = new THREE.Mesh(tableTopGeo, tableTopMat);
    tableTop.position.set(0, -0.6, 0);
    tableTop.receiveShadow = !isSoftwareGl;
    this.group.add(tableTop);

    // Brushed bronze cafe table edge band
    const rimGeo = this.trackGeo(new THREE.TorusGeometry(7.46, 0.09, 16, 64));
    rimGeo.rotateX(Math.PI / 2);
    const rimMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x9a7b3e,
        roughness: 0.35,
        metalness: 0.78,
      })
    );
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.position.set(0, -0.45, 0);
    this.group.add(rimMesh);

    // Cast-iron central cafe table pedestal & 4-prong base
    const ironMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1e242b,
        roughness: 0.5,
        metalness: 0.65,
      })
    );
    const columnGeo = this.trackGeo(new THREE.CylinderGeometry(0.65, 0.85, 6.4, 24));
    const columnMesh = new THREE.Mesh(columnGeo, ironMat);
    columnMesh.position.set(0, -3.9, 0);
    this.group.add(columnMesh);

    const basePlateGeo = this.trackGeo(new THREE.CylinderGeometry(3.2, 3.5, 0.28, 32));
    const basePlate = new THREE.Mesh(basePlateGeo, ironMat);
    basePlate.position.set(0, -7.05, 0);
    this.group.add(basePlate);

    // 2. Two Signature Starbucks Cups on Coasters + Rising Steam Wisps
    this.buildStarbucksCup(new THREE.Vector3(5.25, -0.37, 3.65), cupTex, 0.4);
    this.buildStarbucksCup(new THREE.Vector3(5.05, -0.37, -3.65), cupTex, -2.4);

    // 3. Cafe Ceramic Plate with Golden Butter Croissant on table corner
    const plateGroup = new THREE.Group();
    plateGroup.position.set(-5.35, -0.37, 3.85);
    const plateGeo = this.trackGeo(new THREE.CylinderGeometry(0.82, 0.62, 0.08, 28));
    const plateMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.18, metalness: 0.05 })
    );
    const plateMesh = new THREE.Mesh(plateGeo, plateMat);
    plateMesh.position.y = 0.04;
    plateGroup.add(plateMesh);

    // Layered crescent croissant
    const croissantMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd98a3c,
        emissive: 0x2b1604,
        emissiveIntensity: 0.15,
        roughness: 0.48,
      })
    );
    const croissantGeo = this.trackGeo(new THREE.TorusGeometry(0.32, 0.16, 14, 24, Math.PI * 1.25));
    croissantGeo.rotateX(Math.PI / 2);
    const croissant = new THREE.Mesh(croissantGeo, croissantMat);
    croissant.position.set(0, 0.16, 0.05);
    croissant.scale.set(1.15, 0.85, 1.0);
    plateGroup.add(croissant);
    this.group.add(plateGroup);

    // 4. Leather Chess Notebook & Brass Pen on Black player's corner
    const bookGroup = new THREE.Group();
    bookGroup.position.set(5.35, -0.37, -1.85);
    bookGroup.rotation.y = -0.28;
    const bookGeo = this.trackGeo(new THREE.BoxGeometry(1.15, 0.12, 1.55));
    const bookMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x006241, roughness: 0.55 })
    );
    const bookMesh = new THREE.Mesh(bookGeo, bookMat);
    bookMesh.position.y = 0.06;
    bookGroup.add(bookMesh);

    const penGeo = this.trackGeo(new THREE.CylinderGeometry(0.03, 0.025, 1.2, 12));
    penGeo.rotateZ(Math.PI / 2);
    const penMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.25, metalness: 0.85 })
    );
    const penMesh = new THREE.Mesh(penGeo, penMat);
    penMesh.position.set(0.1, 0.14, 0);
    penMesh.rotation.y = 0.25;
    bookGroup.add(penMesh);
    this.group.add(bookGroup);
  }

  private buildStarbucksCup(pos: THREE.Vector3, cupTex: THREE.CanvasTexture, rotY: number) {
    const cupGroup = new THREE.Group();
    cupGroup.position.copy(pos);
    cupGroup.rotation.y = rotY;

    // Cork coaster
    const coasterGeo = this.trackGeo(new THREE.CylinderGeometry(0.62, 0.62, 0.04, 24));
    const coasterMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x9c7248, roughness: 0.85 })
    );
    const coaster = new THREE.Mesh(coasterGeo, coasterMat);
    coaster.position.y = 0.02;
    cupGroup.add(coaster);

    // Tapered Tall Starbucks Cup with Green Medallion Sleeve
    const cupGeo = this.trackGeo(new THREE.CylinderGeometry(0.46, 0.33, 1.32, 32));
    const cupMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: cupTex,
        roughness: 0.35,
        metalness: 0.02,
      })
    );
    const cupMesh = new THREE.Mesh(cupGeo, cupMat);
    cupMesh.position.y = 0.7;
    cupGroup.add(cupMesh);

    // White traveler sipper lid
    const lidRimGeo = this.trackGeo(new THREE.CylinderGeometry(0.485, 0.475, 0.12, 32));
    const lidMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.22 })
    );
    const lidRim = new THREE.Mesh(lidRimGeo, lidMat);
    lidRim.position.y = 1.38;
    cupGroup.add(lidRim);

    const lidTopGeo = this.trackGeo(new THREE.CylinderGeometry(0.43, 0.47, 0.08, 32));
    const lidTop = new THREE.Mesh(lidTopGeo, lidMat);
    lidTop.position.y = 1.46;
    cupGroup.add(lidTop);

    // Dark espresso sipper hole
    const holeGeo = this.trackGeo(new THREE.BoxGeometry(0.12, 0.03, 0.06));
    const holeMat = this.trackMat(new THREE.MeshBasicMaterial({ color: 0x1c130c }));
    const hole = new THREE.Mesh(holeGeo, holeMat);
    hole.position.set(0, 1.505, 0.32);
    cupGroup.add(hole);

    this.group.add(cupGroup);

    // 3 Rising Steam Puff Rings above each cup
    const steamGeo = this.trackGeo(new THREE.TorusGeometry(0.14, 0.035, 8, 16));
    steamGeo.rotateX(Math.PI / 2);
    for (let i = 0; i < 3; i++) {
      const steamMat = this.trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
        })
      );
      const puff = new THREE.Mesh(steamGeo, steamMat);
      puff.position.set(pos.x, pos.y + 1.6 + i * 0.35, pos.z);
      this.group.add(puff);
      this.steamParticles.push({
        mesh: puff,
        baseX: pos.x,
        baseZ: pos.z,
        phase: i * 2.1 + rotY,
        speed: 0.55 + i * 0.08,
      });
    }
  }

  private buildCafeInterior(
    woodTex: THREE.CanvasTexture,
    menuTex: THREE.CanvasTexture,
    isSoftwareGl: boolean
  ) {
    // 1. Warm Oak Cafe Floor
    const floorGeo = this.trackGeo(new THREE.CircleGeometry(28, 48));
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x2b1d14,
        roughness: 0.65,
        metalness: 0.08,
      })
    );
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = -7.18;
    floorMesh.receiveShadow = !isSoftwareGl;
    this.group.add(floorMesh);

    // 2. Back Starbucks Espresso Bar & Counter (Z = -15.5)
    const barGroup = new THREE.Group();
    barGroup.position.set(0, -7.18, -15.5);

    // Signature Starbucks Forest-Green Bar Front
    const counterGeo = this.trackGeo(new THREE.BoxGeometry(20, 3.6, 2.4));
    const greenBarMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x00593b,
        roughness: 0.45,
        metalness: 0.12,
      })
    );
    const counterMesh = new THREE.Mesh(counterGeo, greenBarMat);
    counterMesh.position.y = 1.8;
    barGroup.add(counterMesh);

    // Carrara Marble Countertop
    const topGeo = this.trackGeo(new THREE.BoxGeometry(20.4, 0.24, 2.7));
    const topMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.22, metalness: 0.05 })
    );
    const topMesh = new THREE.Mesh(topGeo, topMat);
    topMesh.position.y = 3.72;
    barGroup.add(topMesh);

    // Chrome 2-Group Commercial Espresso Machine on the counter
    const chromeMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xdbe2ea, roughness: 0.18, metalness: 0.88 })
    );
    const espGeo = this.trackGeo(new THREE.BoxGeometry(2.8, 1.45, 1.4));
    const espMesh = new THREE.Mesh(espGeo, chromeMat);
    espMesh.position.set(-2.5, 4.55, 0);
    barGroup.add(espMesh);

    // Glass Pastry Case on the right of the counter
    const glassMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfef3c7,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.28,
        transparent: true,
        opacity: 0.55,
        roughness: 0.15,
      })
    );
    const caseGeo = this.trackGeo(new THREE.BoxGeometry(3.4, 1.6, 1.5));
    const caseMesh = new THREE.Mesh(caseGeo, glassMat);
    caseMesh.position.set(3.2, 4.6, 0);
    barGroup.add(caseMesh);

    // Back Wall & Illuminated Menu Board
    const wallGeo = this.trackGeo(new THREE.BoxGeometry(26, 14, 0.6));
    const wallMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0x1c1613, roughness: 0.75 })
    );
    const backWall = new THREE.Mesh(wallGeo, wallMat);
    backWall.position.set(0, 7.0, -2.2);
    barGroup.add(backWall);

    const menuGeo = this.trackGeo(new THREE.PlaneGeometry(8.8, 4.4));
    const menuMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        map: menuTex,
      })
    );
    const menuMesh = new THREE.Mesh(menuGeo, menuMat);
    menuMesh.position.set(0, 8.6, -1.85);
    barGroup.add(menuMesh);

    // 3 Overhead Warm Edison Pendant Lamps hanging over the chess table & bar
    const cordMat = this.trackMat(new THREE.MeshBasicMaterial({ color: 0x111827 }));
    const shadeMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x292524,
        emissive: 0x78350f,
        emissiveIntensity: 0.35,
        roughness: 0.4,
        metalness: 0.7,
      })
    );
    const bulbMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffedd5,
      })
    );

    [
      new THREE.Vector3(-4.5, 9.2, -6.5),
      new THREE.Vector3(4.5, 9.2, -6.5),
      new THREE.Vector3(0, 9.8, 0),
    ].forEach((lampPos) => {
      const lampGroup = new THREE.Group();
      lampGroup.position.copy(lampPos);

      const cord = new THREE.Mesh(
        this.trackGeo(new THREE.CylinderGeometry(0.03, 0.03, 4.0, 8)),
        cordMat
      );
      cord.position.y = 2.0;
      lampGroup.add(cord);

      const shade = new THREE.Mesh(
        this.trackGeo(new THREE.ConeGeometry(0.85, 0.75, 24, 1, true)),
        shadeMat
      );
      lampGroup.add(shade);

      const bulb = new THREE.Mesh(this.trackGeo(new THREE.SphereGeometry(0.22, 16, 16)), bulbMat);
      bulb.position.y = -0.2;
      lampGroup.add(bulb);

      this.group.add(lampGroup);
    });

    // Potted Cafe Plants flanking the table area
    [-9.5, 9.5].forEach((px) => {
      const plantGroup = new THREE.Group();
      plantGroup.position.set(px, -7.18, -9.2);

      const potMat = this.trackMat(
        new THREE.MeshStandardMaterial({ color: 0x9a4a2b, roughness: 0.65 })
      );
      const pot = new THREE.Mesh(
        this.trackGeo(new THREE.CylinderGeometry(1.05, 0.78, 1.8, 20)),
        potMat
      );
      pot.position.y = 0.9;
      plantGroup.add(pot);

      const leafMat = this.trackMat(
        new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.5 })
      );
      for (let l = 0; l < 7; l++) {
        const angle = (l / 7) * Math.PI * 2;
        const leaf = new THREE.Mesh(
          this.trackGeo(new THREE.SphereGeometry(0.85, 12, 12)),
          leafMat
        );
        leaf.scale.set(1.2, 0.35, 0.7);
        leaf.position.set(Math.cos(angle) * 0.85, 2.2 + (l % 3) * 0.45, Math.sin(angle) * 0.85);
        leaf.rotation.y = -angle;
        leaf.rotation.z = 0.35;
        plantGroup.add(leaf);
      }
      this.group.add(plantGroup);
    });

    this.group.add(barGroup);
  }

  /**
   * Builds a realistic articulated 3D human chess player seated at the cafe table,
   * complete with cafe armchair, breathing torso, expressive head, and an IK-driven
   * right arm + sculpted multi-finger hand that reaches out to move chess pieces.
   */
  private buildHumanPlayer(color: 'w' | 'b', isSoftwareGl: boolean): HumanPlayerRig {
    const isWhite = color === 'w';
    const dirZ = isWhite ? 1 : -1;
    const seatZ = dirZ * 8.15;

    const root = new THREE.Group();

    // Skin, Hair, & Clothing Materials
    const skinMat = this.trackMat(
      new THREE.MeshPhysicalMaterial({
        color: isWhite ? 0xe8b896 : 0xc68b63,
        emissive: 0x261108,
        emissiveIntensity: 0.14,
        roughness: 0.38,
        metalness: 0.02,
        clearcoat: 0.15,
      })
    );

    const jacketMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: isWhite ? 0x1e3a5f : 0x1f2937, // Tailored navy sweater for White, charcoal blazer for Black
        roughness: 0.68,
        metalness: 0.05,
      })
    );

    const shirtMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: isWhite ? 0xf8fafc : 0x006241, // Crisp white collar vs Starbucks reserve green shirt
        roughness: 0.55,
      })
    );

    const hairMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: isWhite ? 0x3b2314 : 0x141418,
        roughness: 0.72,
      })
    );

    const chairLeatherMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x5c341d,
        roughness: 0.45,
        metalness: 0.08,
      })
    );

    // 1. Curved Cafe Armchair
    const chairGroup = new THREE.Group();
    chairGroup.position.set(0, 0, seatZ);
    if (!isWhite) chairGroup.rotation.y = Math.PI;

    const backrestGeo = this.trackGeo(new THREE.CylinderGeometry(2.3, 2.2, 4.4, 24, 1, true, -Math.PI * 0.42, Math.PI * 0.84));
    const backrest = new THREE.Mesh(backrestGeo, chairLeatherMat);
    backrest.position.set(0, -1.6, 0.35);
    chairGroup.add(backrest);

    const seatCushionGeo = this.trackGeo(new THREE.CylinderGeometry(2.15, 2.15, 0.45, 24));
    const seatCushion = new THREE.Mesh(seatCushionGeo, chairLeatherMat);
    seatCushion.position.set(0, -3.7, 0);
    chairGroup.add(seatCushion);
    root.add(chairGroup);

    // 2. Seated Human Torso & Shoulders
    const torso = new THREE.Group();
    torso.position.set(0, -1.55, seatZ);
    if (!isWhite) torso.rotation.y = Math.PI;

    const chestGeo = this.trackGeo(new THREE.CapsuleGeometry(1.18, 1.85, 12, 24));
    const chestMesh = new THREE.Mesh(chestGeo, jacketMat);
    chestMesh.scale.set(1.22, 1.0, 0.72);
    chestMesh.castShadow = !isSoftwareGl;
    torso.add(chestMesh);

    // Shirt collar / neck
    const collarGeo = this.trackGeo(new THREE.CylinderGeometry(0.55, 0.68, 0.45, 20));
    const collarMesh = new THREE.Mesh(collarGeo, shirtMat);
    collarMesh.position.set(0, 1.38, -0.05);
    torso.add(collarMesh);

    const neckGeo = this.trackGeo(new THREE.CylinderGeometry(0.38, 0.44, 0.55, 20));
    const neckMesh = new THREE.Mesh(neckGeo, skinMat);
    neckMesh.position.set(0, 1.68, -0.08);
    torso.add(neckMesh);

    // 3. Expressive Human Head, Hair, Eyes & Glasses
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 2.38, -0.15);
    headGroup.rotation.x = 0.28; // Looking down toward the chessboard

    const skullGeo = this.trackGeo(new THREE.SphereGeometry(0.78, 24, 24));
    const skullMesh = new THREE.Mesh(skullGeo, skinMat);
    skullMesh.scale.set(0.88, 1.08, 0.95);
    skullMesh.castShadow = !isSoftwareGl;
    headGroup.add(skullMesh);

    // Styled Hair Cap
    const hairGeo = this.trackGeo(new THREE.SphereGeometry(0.82, 24, 20));
    const hairMesh = new THREE.Mesh(hairGeo, hairMat);
    hairMesh.scale.set(0.9, 1.02, 0.98);
    hairMesh.position.set(0, 0.14, 0.06);
    headGroup.add(hairMesh);

    // Nose & Ears
    const noseGeo = this.trackGeo(new THREE.ConeGeometry(0.11, 0.32, 12));
    noseGeo.rotateX(-Math.PI / 2);
    const noseMesh = new THREE.Mesh(noseGeo, skinMat);
    noseMesh.position.set(0, -0.02, -0.76);
    headGroup.add(noseMesh);

    [-0.7, 0.7].forEach((ex) => {
      const ear = new THREE.Mesh(
        this.trackGeo(new THREE.SphereGeometry(0.16, 12, 12)),
        skinMat
      );
      ear.scale.set(0.5, 1.0, 0.7);
      ear.position.set(ex, 0, -0.05);
      headGroup.add(ear);
    });

    // Eyes & Eyebrows
    const eyeWhiteMat = this.trackMat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const pupilMat = this.trackMat(new THREE.MeshBasicMaterial({ color: 0x1e293b }));
    [-0.26, 0.26].forEach((eyeX) => {
      const sclera = new THREE.Mesh(
        this.trackGeo(new THREE.SphereGeometry(0.095, 12, 12)),
        eyeWhiteMat
      );
      sclera.position.set(eyeX, 0.1, -0.68);
      headGroup.add(sclera);

      const pupil = new THREE.Mesh(
        this.trackGeo(new THREE.SphereGeometry(0.05, 10, 10)),
        pupilMat
      );
      pupil.position.set(eyeX, 0.08, -0.75);
      headGroup.add(pupil);
    });

    // Bot player wears sleek gold-rimmed cafe glasses
    if (!isWhite) {
      const frameMat = this.trackMat(
        new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.25, metalness: 0.85 })
      );
      [-0.27, 0.27].forEach((gx) => {
        const rim = new THREE.Mesh(
          this.trackGeo(new THREE.TorusGeometry(0.16, 0.02, 8, 20)),
          frameMat
        );
        rim.position.set(gx, 0.1, -0.74);
        headGroup.add(rim);
      });
    }

    torso.add(headGroup);

    // 4. Left Arm resting naturally on the cafe table edge
    const leftUpperArm = new THREE.Mesh(
      this.trackGeo(new THREE.CapsuleGeometry(0.31, 1.55, 10, 16)),
      jacketMat
    );
    leftUpperArm.position.set(-1.62, 0.48, -0.45);
    leftUpperArm.rotation.set(0.62, 0, -0.35);
    torso.add(leftUpperArm);

    const leftForearm = new THREE.Mesh(
      this.trackGeo(new THREE.CapsuleGeometry(0.25, 1.45, 10, 16)),
      jacketMat
    );
    leftForearm.position.set(-1.95, 0.86, -1.65);
    leftForearm.rotation.set(1.52, 0.18, 0.12);
    torso.add(leftForearm);

    const leftHand = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.27, 16, 16)),
      skinMat
    );
    leftHand.scale.set(0.95, 0.52, 1.25);
    leftHand.position.set(-1.78, 0.94, -2.55);
    torso.add(leftHand);

    root.add(torso);

    // 5. Articulated Right Playing Arm & Sculpted Hand (World-Space IK Driven)
    // Right shoulder world position (naturally above tabletop height)
    const rightShoulderWorld = new THREE.Vector3(
      isWhite ? 1.52 : -1.52,
      0.38,
      isWhite ? 7.55 : -7.55
    );

    const upperArmGeo = this.trackGeo(new THREE.CylinderGeometry(0.32, 0.28, 1.0, 16));
    upperArmGeo.translate(0, 0.5, 0); // pivot at shoulder
    upperArmGeo.rotateX(Math.PI / 2); // align +Z with lookAt
    const upperArmMesh = new THREE.Mesh(upperArmGeo, jacketMat);
    upperArmMesh.castShadow = !isSoftwareGl;
    root.add(upperArmMesh);

    const elbowJointMesh = new THREE.Mesh(
      this.trackGeo(new THREE.SphereGeometry(0.29, 14, 14)),
      jacketMat
    );
    root.add(elbowJointMesh);

    // Forearm group (sleeve + wrist cuff + wristwatch + skin wrist)
    const forearmGroup = new THREE.Group();
    const forearmSleeveGeo = this.trackGeo(new THREE.CylinderGeometry(0.27, 0.22, 0.78, 16));
    forearmSleeveGeo.translate(0, 0.39, 0);
    forearmSleeveGeo.rotateX(Math.PI / 2);
    const forearmSleeve = new THREE.Mesh(forearmSleeveGeo, jacketMat);
    forearmSleeve.castShadow = !isSoftwareGl;
    forearmGroup.add(forearmSleeve);

    const wristSkinGeo = this.trackGeo(new THREE.CylinderGeometry(0.21, 0.18, 0.24, 16));
    wristSkinGeo.translate(0, 0.88, 0);
    wristSkinGeo.rotateX(Math.PI / 2);
    const wristSkin = new THREE.Mesh(wristSkinGeo, skinMat);
    forearmGroup.add(wristSkin);

    // Classic wristwatch on the wrist
    const watchStrapGeo = this.trackGeo(new THREE.CylinderGeometry(0.225, 0.225, 0.08, 20));
    watchStrapGeo.translate(0, 0.81, 0);
    watchStrapGeo.rotateX(Math.PI / 2);
    const watchMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.25, metalness: 0.85 })
    );
    const watchMesh = new THREE.Mesh(watchStrapGeo, watchMat);
    forearmGroup.add(watchMesh);

    root.add(forearmGroup);

    // 6. Sculpted Multi-Fingered Right Hand (Palm + Articulated Thumb + Index/Middle/Ring Fingers)
    const handGroup = new THREE.Group();

    const palmGeo = this.trackGeo(new THREE.BoxGeometry(0.42, 0.15, 0.46));
    const palmMesh = new THREE.Mesh(palmGeo, skinMat);
    palmMesh.position.set(0, 0.04, -0.18 * dirZ);
    palmMesh.castShadow = !isSoftwareGl;
    handGroup.add(palmMesh);

    // Articulated Thumb (pinches inward when grasping a chess piece)
    const thumbGroup = new THREE.Group();
    thumbGroup.position.set(isWhite ? -0.22 : 0.22, 0.0, -0.22 * dirZ);
    const thumbProximal = new THREE.Mesh(
      this.trackGeo(new THREE.CapsuleGeometry(0.068, 0.22, 8, 12)),
      skinMat
    );
    thumbProximal.position.set(0, -0.1, -0.08 * dirZ);
    thumbProximal.rotation.x = 0.55 * dirZ;
    thumbGroup.add(thumbProximal);
    handGroup.add(thumbGroup);

    // Articulated Index, Middle, Ring & Pinky Fingers (curl downward to pinch the piece crown)
    const fingersGroup = new THREE.Group();
    fingersGroup.position.set(0, 0.02, -0.38 * dirZ);
    const fingerOffsets = [-0.14, -0.045, 0.05, 0.14];
    const fingerLengths = [0.28, 0.32, 0.29, 0.22];

    fingerOffsets.forEach((fx, idx) => {
      const fLen = fingerLengths[idx];
      const fingerMesh = new THREE.Mesh(
        this.trackGeo(new THREE.CapsuleGeometry(0.056, fLen, 8, 12)),
        skinMat
      );
      fingerMesh.position.set(fx, -fLen * 0.48, -0.08 * dirZ);
      fingerMesh.rotation.x = 0.48 * dirZ;
      fingerMesh.castShadow = !isSoftwareGl;
      fingersGroup.add(fingerMesh);
    });
    handGroup.add(fingersGroup);

    root.add(handGroup);

    const restHandWorldPos = new THREE.Vector3(
      isWhite ? 2.55 : -2.55,
      0.14,
      isWhite ? 5.05 : -5.05
    );

    return {
      color,
      root,
      torso,
      headGroup,
      rightShoulderWorld,
      upperArmMesh,
      elbowJointMesh,
      forearmGroup,
      handGroup,
      thumbGroup,
      fingersGroup,
      restHandWorldPos,
      currentHandWorldPos: restHandWorldPos.clone(),
      currentPinchAmount: 0,
    };
  }

  /**
   * Solves smooth 2-bone analytical Inverse Kinematics for the player's right arm
   * from `rightShoulderWorld` -> `elbowWorld` -> `handTargetWorld`, and articulates
   * the thumb & fingers to pinch the chess piece during movement.
   */
  private updatePlayerArmIK(
    rig: HumanPlayerRig,
    handTargetWorld: THREE.Vector3,
    pinchAmount: number,
    elapsed: number
  ) {
    const isWhite = rig.color === 'w';
    const dirZ = isWhite ? 1 : -1;

    // Position the sculpted hand slightly above the piece's crown grip point
    rig.handGroup.position.copy(handTargetWorld);
    // Subtle natural wrist tilt
    rig.handGroup.rotation.set(
      dirZ * (0.12 + pinchAmount * 0.18),
      0,
      (isWhite ? -1 : 1) * 0.08
    );

    // Articulate fingers and thumb to pinch around the piece
    rig.thumbGroup.rotation.z = (isWhite ? -1 : 1) * (0.2 + pinchAmount * 0.52);
    rig.fingersGroup.rotation.x = dirZ * (0.15 + pinchAmount * 0.48);

    // Compute wrist attachment point in world space
    const wristWorld = this._shoulderToTarget
      .copy(handTargetWorld)
      .addScaledVector(this._upVec, 0.08);
    wristWorld.z += dirZ * 0.12;

    const shoulder = rig.rightShoulderWorld;
    const dist = shoulder.distanceTo(wristWorld);

    // Dynamically size upper arm & forearm lengths so the reach across all 8 ranks is always anatomically seamless
    const L1 = Math.max(2.05, dist * 0.53);
    const L2 = Math.max(2.05, dist * 0.53);
    const clampedDist = Math.min(dist, (L1 + L2) * 0.995);

    // Law of cosines for elbow bend height
    const cosAngle =
      (L1 * L1 + clampedDist * clampedDist - L2 * L2) / (2 * L1 * Math.max(0.001, clampedDist));
    const angle = Math.acos(THREE.MathUtils.clamp(cosAngle, -1, 1));
    const alongDist = Math.cos(angle) * L1;
    const bendHeight = Math.sin(angle) * L1;

    this._armDir.subVectors(wristWorld, shoulder).normalize();
    this._midPoint.copy(shoulder).addScaledVector(this._armDir, alongDist);

    // Elbow bends naturally outward to the side and rests near tabletop level
    this._bendNormal.set(isWhite ? 0.92 : -0.92, -0.18, dirZ * 0.35).normalize();
    this._elbowWorld.copy(this._midPoint).addScaledVector(this._bendNormal, bendHeight);
    // Keep elbow comfortably between tabletop plane and mid-chest height
    this._elbowWorld.y = THREE.MathUtils.clamp(this._elbowWorld.y, 0.06, 0.58);

    // Orient & scale Upper Arm (shoulder -> elbow)
    const actualL1 = shoulder.distanceTo(this._elbowWorld);
    rig.upperArmMesh.position.copy(shoulder);
    rig.upperArmMesh.scale.set(1, 1, actualL1);
    rig.upperArmMesh.lookAt(this._elbowWorld);

    // Position Elbow Joint
    rig.elbowJointMesh.position.copy(this._elbowWorld);

    // Orient & scale Forearm (elbow -> wrist)
    const actualL2 = this._elbowWorld.distanceTo(wristWorld);
    rig.forearmGroup.position.copy(this._elbowWorld);
    rig.forearmGroup.scale.set(1, 1, actualL2);
    rig.forearmGroup.lookAt(wristWorld);

    // Subtle head gaze tracking toward the active hand or board center
    const lookX = THREE.MathUtils.clamp(handTargetWorld.x * 0.08, -0.35, 0.35);
    rig.headGroup.rotation.y = isWhite
      ? -lookX + Math.sin(elapsed * 0.7) * 0.04
      : lookX + Math.sin(elapsed * 0.8 + 1.2) * 0.04;
  }

  /**
   * Updates rising coffee steam, player breathing & mood body language,
   * and the smooth 3-phase human hand piece-moving animation.
   */
  public update(
    dt: number,
    elapsed: number,
    botMood: BotMood,
    regretIntensity: number,
    activeMove: ActiveHandMoveTarget | null,
    reducedMotion: boolean
  ) {
    // 1. Animate rising coffee steam wisps above both Starbucks cups
    if (!reducedMotion) {
      for (const s of this.steamParticles) {
        const t = (elapsed * s.speed + s.phase) % 1.0;
        s.mesh.position.y = -0.37 + 1.55 + t * 1.35;
        s.mesh.position.x = s.baseX + Math.sin(elapsed * 1.8 + s.phase) * 0.12 * t;
        s.mesh.position.z = s.baseZ + Math.cos(elapsed * 1.5 + s.phase) * 0.12 * t;
        const scale = 0.65 + t * 1.45;
        s.mesh.scale.set(scale, scale, 1);
        const mat = s.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.sin(t * Math.PI) * 0.24;
      }
    }

    // 2. Subtle human breathing & Bot Mood body language
    const breathW = reducedMotion ? 0 : Math.sin(elapsed * 1.9) * 0.025;
    const breathB = reducedMotion ? 0 : Math.sin(elapsed * 2.2 + 1.4) * 0.028;
    this.whitePlayer.torso.position.y = -0.88 + breathW;
    this.blackPlayer.torso.position.y = -0.88 + breathB;

    if (!reducedMotion) {
      if (regretIntensity > 0.1 || botMood === 'panicking') {
        // Bot shakes head in disbelief during a Regret Moment
        this.blackPlayer.headGroup.rotation.z = Math.sin(elapsed * 14) * 0.09;
        this.blackPlayer.headGroup.rotation.x = 0.36;
      } else if (botMood === 'nervous') {
        this.blackPlayer.headGroup.rotation.z = Math.sin(elapsed * 4.5) * 0.04;
        this.blackPlayer.headGroup.rotation.x = 0.32;
      } else if (botMood === 'confident') {
        this.blackPlayer.headGroup.rotation.z = 0;
        this.blackPlayer.headGroup.rotation.x = 0.22;
      } else {
        this.blackPlayer.headGroup.rotation.z = 0;
        this.blackPlayer.headGroup.rotation.x = 0.28;
      }
    }

    // 3. Update Both Players' Hands (Reach -> Pinch & Carry Piece -> Release & Return to Rest)
    for (const rig of [this.whitePlayer, this.blackPlayer]) {
      if (activeMove && activeMove.color === rig.color) {
        const p = activeMove.progress;
        const gripHeight = 1.05; // Crown height of piece

        if (p < 0.22) {
          // Phase 1: Hand glides smoothly from table rest pose to top of piece at `fromPos`
          const u = p / 0.22;
          const eased = 1 - Math.pow(1 - u, 3);
          rig.currentHandWorldPos.lerpVectors(
            rig.restHandWorldPos,
            new THREE.Vector3(
              activeMove.fromPos.x,
              activeMove.fromPos.y + gripHeight,
              activeMove.fromPos.z
            ),
            eased
          );
          rig.currentPinchAmount = eased;
        } else if (p <= 0.8) {
          // Phase 2: Hand pinches and carries the piece along its smooth arc to `toPos`
          rig.currentHandWorldPos.set(
            activeMove.piecePos.x,
            activeMove.piecePos.y + gripHeight,
            activeMove.piecePos.z
          );
          rig.currentPinchAmount = 1.0;
        } else {
          // Phase 3: Hand releases the piece at `toPos` and glides smoothly back to table rest pose
          const u = (p - 0.8) / 0.2;
          const eased = u * u * (3 - 2 * u);
          rig.currentHandWorldPos.lerpVectors(
            new THREE.Vector3(
              activeMove.toPos.x,
              activeMove.toPos.y + gripHeight,
              activeMove.toPos.z
            ),
            rig.restHandWorldPos,
            eased
          );
          rig.currentPinchAmount = 1.0 - eased;
        }
      } else {
        // Smoothly damp hand back to resting pose on the cafe table edge
        rig.currentHandWorldPos.lerp(rig.restHandWorldPos, Math.min(1, dt * 8));
        if (!reducedMotion && rig.color === 'b' && botMood === 'nervous') {
          // Nervous finger tap on the table
          rig.currentHandWorldPos.y =
            rig.restHandWorldPos.y + Math.max(0, Math.sin(elapsed * 11)) * 0.06;
        }
        rig.currentPinchAmount = THREE.MathUtils.lerp(
          rig.currentPinchAmount,
          0,
          Math.min(1, dt * 10)
        );
      }

      this.updatePlayerArmIK(rig, rig.currentHandWorldPos, rig.currentPinchAmount, elapsed);
    }
  }

  public dispose() {
    for (const tex of this.disposableTextures) tex.dispose();
    for (const geo of this.disposableGeometries) geo.dispose();
    for (const mat of this.disposableMaterials) mat.dispose();
  }
}
