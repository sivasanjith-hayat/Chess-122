/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Chess, Color, PieceSymbol, Square } from 'chess.js';
import { BotMood } from '../engine/types';
import { RunnerUpEntry } from '../narrator/narrator';
import { createPieceMaterialSet, PieceGeometryLibrary, PieceMaterialSet } from './pieces';
import { createGhostShaderMaterial, createSquareGlowShaderMaterial } from './shaders';
import { ActiveHandMoveTarget, StarbucksCafeStage } from './cafeEnvironment';

export type CameraPreset = 'white' | 'black' | 'top' | 'cinematic' | 'cafe' | 'title';

export interface ProjectedGhostLabel {
  id: string;
  san: string;
  evalPawns: string;
  reason: string;
  quality: 'best' | 'fine' | 'risky' | 'blunder';
  x: number; // CSS px
  y: number; // CSS px
  visible: boolean;
}

interface ActivePieceAnim {
  group: THREE.Group;
  color: Color;
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  isKnight: boolean;
  elapsed: number;
  duration: number;
}

interface ShatterParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  rotVel: THREE.Vector3;
  life: number;
  maxLife: number;
}

export class ChessScene3D {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private isSoftwareGl: boolean;
  private disposed = false;
  private frameId = 0;

  private geoLib: PieceGeometryLibrary;
  private matSet: PieceMaterialSet;

  // Lighting
  private ambientLight: THREE.AmbientLight;
  private keyLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.SpotLight;
  private moodPointLight: THREE.PointLight;
  private envTexture: THREE.CanvasTexture;

  // Board, Cafe Environment & Squares
  private cafeStage!: StarbucksCafeStage;
  private boardGroup = new THREE.Group();
  private squareMeshes: THREE.Mesh[] = [];
  private squareMap = new Map<Square, THREE.Vector3>();

  // Pieces
  private piecesGroup = new THREE.Group();
  private pieceMeshes = new Map<Square, { group: THREE.Group; type: PieceSymbol; color: Color }>();
  private activeAnimations: ActivePieceAnim[] = [];
  private _activeHandMoveTarget: ActiveHandMoveTarget = {
    color: 'w',
    fromPos: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    piecePos: new THREE.Vector3(),
    isKnight: false,
    progress: 0,
  };

  // Highlights (Custom GLSL ShaderMaterials)
  private highlightsGroup = new THREE.Group();
  private ringShaderMat: THREE.ShaderMaterial;
  private lastMoveShaderMat: THREE.ShaderMaterial;
  private checkPulseShaderMat: THREE.ShaderMaterial;
  private highlightPlaneGeo: THREE.PlaneGeometry;

  // Ghost pieces & arrows
  private ghostsGroup = new THREE.Group();
  private ghostShaderMats: Record<'fine' | 'risky' | 'blunder' | 'regret', THREE.ShaderMaterial>;
  private ghostLabelsData: {
    id: string;
    san: string;
    evalPawns: string;
    reason: string;
    quality: 'best' | 'fine' | 'risky' | 'blunder';
    worldPos: THREE.Vector3;
  }[] = [];
  private onGhostLabelsUpdate?: (labels: ProjectedGhostLabel[]) => void;

  // Regret Moment state
  private regretArrowGroup = new THREE.Group();
  private regretIntensity = 0; // decays over time or stays while regret card active
  private botKingSquare: Square | null = null;

  // Checkmate topple state
  private toppledKingSquare: Square | null = null;
  private toppleProgress = 0;

  // 3D Eval Tower beside the board
  private evalTowerGroup = new THREE.Group();
  private evalWhiteBar!: THREE.Mesh;
  private evalBlackBar!: THREE.Mesh;
  private evalMarkerRing!: THREE.Mesh;
  private currentEvalWhitePawns = 0;
  private targetEvalWhitePawns = 0;

  // Pooled Shatter Shards (20 reusable shard meshes so 0 GC / 0 memory leaks)
  private shardGeo: THREE.DodecahedronGeometry;
  private shardPool: ShatterParticle[] = [];
  private shardMaterials: THREE.MeshPhysicalMaterial[] = [];

  // Camera transition targets
  private camTargetPos = new THREE.Vector3(0, 7.6, 8.8);
  private camTargetLook = new THREE.Vector3(0, 0.2, 0);
  private isTransitioningCam = false;
  private currentPreset: CameraPreset = 'white';
  private reducedMotion = false;
  private currentMood: BotMood = 'calm';
  private lastFrameTime = 0;
  private elapsedTime = 0;
  private journalOpenOnRight = true;

  // Reusable scratch vectors (Zero GC in loop)
  private _projVec = new THREE.Vector3();
  private _raycaster = new THREE.Raycaster();
  private _pointer = new THREE.Vector2();

  // Interaction callback
  private onSquareClick?: (sq: Square) => void;
  private resizeObserver: ResizeObserver;
  private boundHandleResize: () => void;
  private resizeTimers: number[] = [];
  private lastWidth = 0;
  private lastHeight = 0;

  constructor(
    container: HTMLElement,
    options: {
      onSquareClick?: (sq: Square) => void;
      onGhostLabelsUpdate?: (labels: ProjectedGhostLabel[]) => void;
    }
  ) {
    this.container = container;
    this.onSquareClick = options.onSquareClick;
    this.onGhostLabelsUpdate = options.onGhostLabelsUpdate;

    // 1. Detect Software WebGL per threejs skill directive
    this.isSoftwareGl = (() => {
      try {
        const probe = document.createElement('canvas');
        const gl = probe.getContext('webgl2') || probe.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(320, container.clientWidth || window.innerWidth || 1024);
    const height = Math.max(240, container.clientHeight || window.innerHeight || 768);
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f172a);
    this.scene.fog = new THREE.FogExp2(0x0f172a, 0.012);

    // 2. Procedural Equirectangular Studio Environment Map (100% 8-bit safe across all GPUs)
    this.envTexture = this.createProceduralStudioEnvMap();
    this.scene.environment = this.envTexture;

    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    this.camera.position.set(0, 7.4, 8.8);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.07;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.04;
    this.controls.minDistance = 4.5;
    this.controls.maxDistance = 20;
    this.controls.target.set(0, 0.1, 0);
    this.controls.update();

    this.controls.addEventListener('start', () => {
      this.isTransitioningCam = false;
    });

    // 3. Studio Multi-Point Lighting Rig
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.95);

    this.keyLight = new THREE.DirectionalLight(0xfffbeb, 2.7);
    this.keyLight.position.set(6, 12, 8);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 2;
    this.keyLight.shadow.camera.far = 26;
    const d = 5.5;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;

    this.fillLight = new THREE.DirectionalLight(0xbae6fd, 1.35);
    this.fillLight.position.set(-6, 9, 6);

    this.hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x334155, 1.35);
    this.rimLight = new THREE.SpotLight(0x60a5fa, 2.5, 28, Math.PI / 3, 0.5);
    this.rimLight.position.set(-7, 8, -8);

    this.moodPointLight = new THREE.PointLight(0xf59e0b, 1.3, 18);
    this.moodPointLight.position.set(0, 5.8, 0);

    this.scene.add(
      this.ambientLight,
      this.keyLight,
      this.fillLight,
      this.hemiLight,
      this.rimLight,
      this.moodPointLight
    );

    // 4. Initialize Libraries & Shaders
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.geoLib = new PieceGeometryLibrary();
    this.matSet = createPieceMaterialSet(maxAniso);

    this.highlightPlaneGeo = new THREE.PlaneGeometry(0.92, 0.92);
    this.highlightPlaneGeo.rotateX(-Math.PI / 2);
    this.ringShaderMat = createSquareGlowShaderMaterial(0x38bdf8, 'ring');
    this.lastMoveShaderMat = createSquareGlowShaderMaterial(0xfbbf24, 'glow');
    this.checkPulseShaderMat = createSquareGlowShaderMaterial(0xef4444, 'pulse');

    this.ghostShaderMats = {
      fine: createGhostShaderMaterial(0x10b981), // Emerald green
      risky: createGhostShaderMaterial(0xf59e0b), // Amber orange
      blunder: createGhostShaderMaterial(0xef4444), // Crimson red
      regret: createGhostShaderMaterial(0xf43f5e), // Intense rose-red
    };

    // 5. Build Starbucks Cafe Environment, Chessboard, Eval Tower, and Pooled Shards
    this.cafeStage = new StarbucksCafeStage(this.isSoftwareGl);
    this.buildBoard(maxAniso);
    this.buildEvalTower();

    this.shardGeo = new THREE.DodecahedronGeometry(0.11, 0);
    for (let i = 0; i < 20; i++) {
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.15,
        metalness: 0.2,
        clearcoat: 0.9,
        transparent: true,
        opacity: 1,
      });
      this.shardMaterials.push(mat);
      const mesh = new THREE.Mesh(this.shardGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.shardPool.push({
        mesh,
        vel: new THREE.Vector3(),
        rotVel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
      });
    }

    this.scene.add(
      this.cafeStage.group,
      this.boardGroup,
      this.piecesGroup,
      this.highlightsGroup,
      this.ghostsGroup,
      this.regretArrowGroup,
      this.evalTowerGroup
    );

    // Pointer listener for square selection
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);

    // ResizeObserver + Window resize + delayed layout stabilization ticks
    this.boundHandleResize = () => this.handleResize();
    this.resizeObserver = new ResizeObserver(this.boundHandleResize);
    this.resizeObserver.observe(this.container);
    window.addEventListener('resize', this.boundHandleResize);

    for (const delay of [50, 250, 800]) {
      this.resizeTimers.push(window.setTimeout(this.boundHandleResize, delay));
    }

    this.startLoop();
  }

  private createProceduralStudioEnvMap(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Soft studio dome gradient
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#e0f2fe');
    grad.addColorStop(0.42, '#94a3b8');
    grad.addColorStop(0.5, '#f8fafc');
    grad.addColorStop(0.58, '#475569');
    grad.addColorStop(1, '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);

    // Studio softbox highlights
    ctx.fillStyle = 'rgba(255, 250, 235, 0.85)';
    ctx.fillRect(60, 28, 140, 55);
    ctx.fillStyle = 'rgba(186, 230, 253, 0.75)';
    ctx.fillRect(310, 36, 130, 50);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.mapping = THREE.EquirectangularReflectionMapping;
    return tex;
  }

  private buildBoard(maxAniso: number) {
    // Outer inlaid walnut/ebony plinth frame resting on the Starbucks walnut cafe table
    const frameGeo = new THREE.BoxGeometry(9.2, 0.36, 9.2);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x241c18,
      roughness: 0.32,
      metalness: 0.18,
    });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    frameMesh.position.y = -0.19;
    frameMesh.receiveShadow = !this.isSoftwareGl;
    this.boardGroup.add(frameMesh);

    // Thin inlaid brushed brass trim border around the 8x8 grid
    const inlayGeo = new THREE.BoxGeometry(8.26, 0.37, 8.26);
    const inlayMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      emissive: 0x332606,
      emissiveIntensity: 0.2,
      roughness: 0.26,
      metalness: 0.85,
    });
    const inlayMesh = new THREE.Mesh(inlayGeo, inlayMat);
    inlayMesh.position.y = -0.188;
    this.boardGroup.add(inlayMesh);

    // 64 Squares (High-contrast warm ivory vs slate sapphire-ebony)
    const sqGeo = new THREE.BoxGeometry(0.98, 0.08, 0.98);
    const lightSqMat = new THREE.MeshPhysicalMaterial({
      color: 0xf4efe6,
      emissive: 0x1c1914,
      emissiveIntensity: 0.12,
      roughness: 0.2,
      metalness: 0.02,
      clearcoat: 0.45,
    });
    const darkSqMat = new THREE.MeshPhysicalMaterial({
      color: 0x3b4d6b,
      emissive: 0x0f172a,
      emissiveIntensity: 0.18,
      roughness: 0.24,
      metalness: 0.08,
      clearcoat: 0.5,
    });

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const isLight = (r + c) % 2 === 0;
        const sqMesh = new THREE.Mesh(sqGeo, isLight ? lightSqMat : darkSqMat);
        const x = c - 3.5;
        const z = r - 3.5;
        sqMesh.position.set(x, -0.04, z);
        sqMesh.receiveShadow = !this.isSoftwareGl;

        const file = String.fromCharCode(97 + c);
        const rank = String(8 - r);
        const sqName = `${file}${rank}` as Square;
        sqMesh.userData.square = sqName;

        this.squareMeshes.push(sqMesh);
        this.squareMap.set(sqName, new THREE.Vector3(x, 0, z));
        this.boardGroup.add(sqMesh);
      }
    }

    // File (a-h) and Rank (1-8) inlaid brass coordinate plaques on the frame
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

    for (let i = 0; i < 8; i++) {
      const fileFront = this.createCoordinatePlaque(files[i].toUpperCase(), maxAniso);
      fileFront.position.set(i - 3.5, 0.004, 4.34);
      this.boardGroup.add(fileFront);

      const fileBack = this.createCoordinatePlaque(files[i].toUpperCase(), maxAniso);
      fileBack.position.set(i - 3.5, 0.004, -4.34);
      fileBack.rotation.z = Math.PI;
      this.boardGroup.add(fileBack);

      const rankLeft = this.createCoordinatePlaque(ranks[i], maxAniso);
      rankLeft.position.set(-4.34, 0.004, i - 3.5);
      this.boardGroup.add(rankLeft);

      const rankRight = this.createCoordinatePlaque(ranks[i], maxAniso);
      rankRight.position.set(4.34, 0.004, i - 3.5);
      this.boardGroup.add(rankRight);
    }
  }

  private createCoordinatePlaque(text: string, maxAniso: number): THREE.Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 64, 64);
    ctx.font = 'bold 40px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e5c158';
    ctx.fillText(text, 32, 34);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAniso;
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const geo = new THREE.PlaneGeometry(0.32, 0.32);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    return mesh;
  }

  /**
   * Builds the 3D Evaluation Tower standing beside the board at X = -5.4.
   * White light rises from the bottom, Black obsidian descends from the top,
   * with a glowing brass equilibrium ring at the midpoint.
   */
  private buildEvalTower() {
    this.evalTowerGroup.position.set(-5.35, 0, 0);

    // Base pedestal
    const baseGeo = new THREE.CylinderGeometry(0.38, 0.44, 0.18, 24);
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.3,
      metalness: 0.85,
    });
    const base = new THREE.Mesh(baseGeo, brassMat);
    base.position.y = -0.09;
    this.evalTowerGroup.add(base);

    // Top cap
    const cap = new THREE.Mesh(baseGeo, brassMat);
    cap.position.y = 3.25;
    this.evalTowerGroup.add(cap);

    // White advantage bar (grows upward from y = 0)
    const barGeo = new THREE.CylinderGeometry(0.24, 0.24, 1.0, 24);
    barGeo.translate(0, 0.5, 0); // pivot at bottom
    const whiteBarMat = new THREE.MeshPhysicalMaterial({
      color: 0xf8fafc,
      emissive: 0xfff3d1,
      emissiveIntensity: 0.35,
      roughness: 0.15,
      clearcoat: 0.9,
    });
    this.evalWhiteBar = new THREE.Mesh(barGeo, whiteBarMat);
    this.evalWhiteBar.scale.y = 1.6;
    this.evalTowerGroup.add(this.evalWhiteBar);

    // Black advantage bar (grows downward from y = 3.2)
    const blackBarGeo = new THREE.CylinderGeometry(0.24, 0.24, 1.0, 24);
    blackBarGeo.translate(0, -0.5, 0); // pivot at top
    const blackBarMat = new THREE.MeshPhysicalMaterial({
      color: 0x1e293b,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.18,
      roughness: 0.15,
      clearcoat: 0.9,
    });
    this.evalBlackBar = new THREE.Mesh(blackBarGeo, blackBarMat);
    this.evalBlackBar.position.y = 3.2;
    this.evalBlackBar.scale.y = 1.6;
    this.evalTowerGroup.add(this.evalBlackBar);

    // Equilibrium / Split indicator ring
    const ringGeo = new THREE.TorusGeometry(0.31, 0.035, 12, 24);
    ringGeo.rotateX(Math.PI / 2);
    this.evalMarkerRing = new THREE.Mesh(ringGeo, brassMat);
    this.evalMarkerRing.position.y = 1.6;
    this.evalTowerGroup.add(this.evalMarkerRing);
  }

  private handlePointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    this._pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this._pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    this._raycaster.setFromCamera(this._pointer, this.camera);
    const hits = this._raycaster.intersectObjects(this.squareMeshes, false);
    if (hits.length > 0) {
      const sq = hits[0].object.userData.square as Square | undefined;
      if (sq && this.onSquareClick) {
        this.onSquareClick(sq);
      }
    }
  };

  public syncBoardFromFen(
    fen: string,
    lastMove?: { from: Square; to: Square; captured?: boolean },
    animateMove = true
  ) {
    const chess = new Chess(fen);
    const board = chess.board();

    // If a capture happened at `lastMove.to`, trigger shatter effect at `lastMove.to`!
    if (lastMove?.captured && !this.reducedMotion) {
      const targetPos = this.squareMap.get(lastMove.to);
      if (targetPos) {
        const capturedColor: Color = chess.turn(); // Turn after move is the captured piece's color
        this.triggerShatter(targetPos, capturedColor);
      }
    }

    // Clear previous piece meshes
    for (const entry of this.pieceMeshes.values()) {
      this.piecesGroup.remove(entry.group);
    }
    this.pieceMeshes.clear();
    this.activeAnimations = [];
    this.botKingSquare = null;
    this.toppledKingSquare = null;
    this.toppleProgress = 0;

    const isCheckmate = chess.isCheckmate();
    const turnColor = chess.turn();

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const cell = board[r][c];
        if (!cell) continue;

        const sqPos = this.squareMap.get(cell.square as Square)!;
        const pieceGroup = this.geoLib.createPieceGroup(cell.type, cell.color, this.matSet);

        if (cell.type === 'k' && cell.color === 'b') {
          this.botKingSquare = cell.square as Square;
        }

        if (isCheckmate && cell.type === 'k' && cell.color === turnColor) {
          this.toppledKingSquare = cell.square as Square;
        }

        // Check if this piece just moved from `lastMove.from` -> `lastMove.to`
        if (animateMove && !this.reducedMotion && lastMove && cell.square === lastMove.to) {
          const fromPos = this.squareMap.get(lastMove.from);
          if (fromPos) {
            pieceGroup.position.copy(fromPos);
            this.activeAnimations.push({
              group: pieceGroup,
              color: cell.color,
              fromPos: fromPos.clone(),
              toPos: sqPos.clone(),
              isKnight: cell.type === 'n',
              elapsed: 0,
              duration: 0.74, // Smooth 3-phase human hand reach -> grasp & carry -> release cycle
            });
          } else {
            pieceGroup.position.copy(sqPos);
          }
        } else {
          pieceGroup.position.copy(sqPos);
        }

        this.piecesGroup.add(pieceGroup);
        this.pieceMeshes.set(cell.square as Square, {
          group: pieceGroup,
          type: cell.type,
          color: cell.color,
        });
      }
    }

    // If checkmate, smoothly push camera in toward the defeated king
    if (this.toppledKingSquare && !this.reducedMotion) {
      const kingPos = this.squareMap.get(this.toppledKingSquare);
      if (kingPos) {
        this.camTargetLook.copy(kingPos);
        this.camTargetPos.set(kingPos.x + 2.6, 3.4, kingPos.z + 3.2);
        this.isTransitioningCam = true;
      }
    }
  }

  public updateHighlights(params: {
    selectedSquare: Square | null;
    legalTargets: Square[];
    lastMove?: { from: Square; to: Square };
    inCheckKingSquare?: Square | null;
  }) {
    while (this.highlightsGroup.children.length > 0) {
      this.highlightsGroup.remove(this.highlightsGroup.children[0]);
    }

    const addSqPlane = (sq: Square, mat: THREE.Material, yOffset = 0.015) => {
      const pos = this.squareMap.get(sq);
      if (!pos) return;
      const mesh = new THREE.Mesh(this.highlightPlaneGeo, mat);
      mesh.position.set(pos.x, yOffset, pos.z);
      this.highlightsGroup.add(mesh);
    };

    if (params.selectedSquare) {
      addSqPlane(params.selectedSquare, this.lastMoveShaderMat, 0.016);
    }

    if (params.lastMove) {
      addSqPlane(params.lastMove.from, this.lastMoveShaderMat, 0.014);
      addSqPlane(params.lastMove.to, this.lastMoveShaderMat, 0.014);
    }

    for (const targetSq of params.legalTargets) {
      addSqPlane(targetSq, this.ringShaderMat, 0.018);
    }

    if (params.inCheckKingSquare) {
      addSqPlane(params.inCheckKingSquare, this.checkPulseShaderMat, 0.02);
    }
  }

  /**
   * Renders translucent holographic ghost pieces and glowing 3D trajectory arrows
   * for the bot's "Almost Played" runner-up moves (or What-If Rewind moves).
   */
  public setGhostMoves(
    fenBeforeMove: string,
    runnerUps: RunnerUpEntry[],
    showGhosts: boolean
  ) {
    // Clear existing ghost meshes and dispose temporary arrow geometries
    this.clearGhostGroup(this.ghostsGroup);
    this.ghostLabelsData = [];

    if (!showGhosts || runnerUps.length === 0) {
      this.onGhostLabelsUpdate?.([]);
      return;
    }

    const chess = new Chess(fenBeforeMove);

    runnerUps.forEach((entry, idx) => {
      const fromSq = entry.move.from as Square;
      const toSq = entry.move.to as Square;
      const fromPos = this.squareMap.get(fromSq);
      const toPos = this.squareMap.get(toSq);
      if (!fromPos || !toPos) return;

      const movingPiece = chess.get(fromSq);
      const pieceType: PieceSymbol = movingPiece ? movingPiece.type : 'p';
      const pieceColor: Color = movingPiece ? movingPiece.color : 'b';

      const shaderKey =
        entry.quality === 'blunder'
          ? 'blunder'
          : entry.quality === 'risky'
          ? 'risky'
          : 'fine';
      const ghostMat = this.ghostShaderMats[shaderKey];

      // 1. Holographic Ghost Piece at destination square (slightly offset if multiple ghosts land on same square)
      const ghostPiece = this.geoLib.createPieceGroup(pieceType, pieceColor, this.matSet, ghostMat);
      const offsetAngle = idx * 0.6;
      const offsetRadius = idx > 0 ? 0.06 : 0;
      ghostPiece.position.set(
        toPos.x + Math.cos(offsetAngle) * offsetRadius,
        0.02,
        toPos.z + Math.sin(offsetAngle) * offsetRadius
      );
      this.ghostsGroup.add(ghostPiece);

      // 2. Glowing 3D Arc Arrow from `fromPos` to `toPos`
      const arrowHex =
        entry.quality === 'blunder'
          ? 0xef4444
          : entry.quality === 'risky'
          ? 0xf59e0b
          : 0x10b981;
      const arrowMeshGroup = this.createArcArrow(fromPos, toPos, arrowHex, 0.42 + idx * 0.14);
      this.ghostsGroup.add(arrowMeshGroup);

      // 3. Register floating label anchor above the ghost piece
      this.ghostLabelsData.push({
        id: `${entry.san}-${idx}`,
        san: entry.san,
        evalPawns: entry.evalPawns,
        reason: entry.rejectionLine,
        quality: entry.quality,
        worldPos: new THREE.Vector3(toPos.x, 1.35 + idx * 0.22, toPos.z),
      });
    });

    this.projectGhostLabels();
  }

  /**
   * Triggers the signature REGRET MOMENT:
   * - Scene dims
   * - Bot's king piece trembles
   * - Glowing crimson "regret" arrow points at the move the bot SHOULD have made
   */
  public triggerRegretMoment(
    fenBeforeBotMove: string,
    betterMoveSan?: string
  ) {
    this.clearGhostGroup(this.regretArrowGroup);
    if (!betterMoveSan) {
      this.regretIntensity = 0;
      return;
    }

    this.regretIntensity = 1.0;

    try {
      const chess = new Chess(fenBeforeBotMove);
      const moveObj = chess.move(betterMoveSan);
      if (moveObj) {
        const fromPos = this.squareMap.get(moveObj.from as Square);
        const toPos = this.squareMap.get(moveObj.to as Square);
        if (fromPos && toPos) {
          const arrow = this.createArcArrow(fromPos, toPos, 0xf43f5e, 0.75, 0.055);
          this.regretArrowGroup.add(arrow);

          const ghostPiece = this.geoLib.createPieceGroup(
            moveObj.piece,
            moveObj.color,
            this.matSet,
            this.ghostShaderMats.regret
          );
          ghostPiece.position.copy(toPos);
          this.regretArrowGroup.add(ghostPiece);
        }
      }
    } catch {
      // Ignore invalid SAN
    }
  }

  public clearRegretMoment() {
    this.regretIntensity = 0;
    this.clearGhostGroup(this.regretArrowGroup);
  }

  private createArcArrow(
    fromPos: THREE.Vector3,
    toPos: THREE.Vector3,
    hexColor: number,
    arcHeight = 0.5,
    tubeRadius = 0.036
  ): THREE.Group {
    const group = new THREE.Group();
    const mid = new THREE.Vector3().addVectors(fromPos, toPos).multiplyScalar(0.5);
    mid.y = arcHeight;

    const start = new THREE.Vector3(fromPos.x, 0.14, fromPos.z);
    const end = new THREE.Vector3(toPos.x, 0.18, toPos.z);

    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const tubeGeo = new THREE.TubeGeometry(curve, 20, tubeRadius, 8, false);
    const mat = new THREE.MeshStandardMaterial({
      color: hexColor,
      emissive: hexColor,
      emissiveIntensity: 0.75,
      roughness: 0.2,
      transparent: true,
      opacity: 0.88,
    });
    const tubeMesh = new THREE.Mesh(tubeGeo, mat);
    tubeMesh.userData.disposableGeo = tubeGeo;
    tubeMesh.userData.disposableMat = mat;
    group.add(tubeMesh);

    // Arrowhead cone at `end`
    const coneGeo = new THREE.ConeGeometry(tubeRadius * 2.8, 0.22, 12);
    coneGeo.rotateX(Math.PI / 2);
    const coneMesh = new THREE.Mesh(coneGeo, mat);
    coneMesh.position.copy(end);
    const tangent = curve.getTangent(0.98);
    coneMesh.lookAt(end.clone().add(tangent));
    coneMesh.userData.disposableGeo = coneGeo;
    group.add(coneMesh);

    return group;
  }

  private clearGhostGroup(group: THREE.Group) {
    for (const child of group.children) {
      child.traverse((obj) => {
        if (obj.userData.disposableGeo) {
          (obj.userData.disposableGeo as THREE.BufferGeometry).dispose();
        }
        if (obj.userData.disposableMat) {
          (obj.userData.disposableMat as THREE.Material).dispose();
        }
      });
    }
    group.clear();
  }

  private triggerShatter(pos: THREE.Vector3, capturedColor: Color) {
    const hex = capturedColor === 'w' ? 0xf5f2eb : 0x1e2530;
    for (let i = 0; i < this.shardPool.length; i++) {
      const p = this.shardPool[i];
      const mat = this.shardMaterials[i];
      mat.color.setHex(hex);
      mat.opacity = 1;

      p.mesh.visible = true;
      p.mesh.position.set(
        pos.x + (Math.random() - 0.5) * 0.3,
        0.25 + Math.random() * 0.55,
        pos.z + (Math.random() - 0.5) * 0.3
      );
      p.mesh.scale.setScalar(0.7 + Math.random() * 0.7);

      const angle = (i / this.shardPool.length) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 1.4 + Math.random() * 2.4;
      p.vel.set(Math.cos(angle) * speed, 2.2 + Math.random() * 2.2, Math.sin(angle) * speed);
      p.rotVel.set(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10
      );
      p.life = 0;
      p.maxLife = 0.65 + Math.random() * 0.35;
    }
  }

  public setEvalScoreWhiteCp(evalWhiteCp: number) {
    this.targetEvalWhitePawns = Math.max(-8, Math.min(8, evalWhiteCp / 100));
  }

  public setBotMood(mood: BotMood) {
    this.currentMood = mood;
  }

  public setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced;
  }

  public setJournalOpenOffset(isOpen: boolean) {
    this.journalOpenOnRight = isOpen;
    this.setCameraPreset(this.currentPreset, false);
  }

  public setCameraPreset(preset: CameraPreset, immediate = false) {
    this.currentPreset = preset;
    const width = Math.max(320, this.container.clientWidth || window.innerWidth || 1024);
    const height = Math.max(240, this.container.clientHeight || window.innerHeight || 768);
    const aspect = width / height;

    // Pull camera back proportionally on narrower/portrait viewports so all 8 files + Eval Tower fit cleanly
    const distScale = aspect < 0.8 ? 1.48 : aspect < 1.15 ? 1.28 : aspect < 1.45 ? 1.12 : 1.0;
    // Shift camera + lookAt X together to +1.15 on desktop when right-side journal is open so the board centers in the left/center area
    const panX =
      width >= 1024 && this.journalOpenOnRight && preset !== 'title'
        ? 1.15
        : width >= 768 && this.journalOpenOnRight && preset !== 'title'
        ? 1.35
        : 0;

    if (preset === 'white') {
      this.camTargetPos.set(panX, 8.2 * distScale, 10.6 * distScale);
      this.camTargetLook.set(panX, 0.0, 0.15);
    } else if (preset === 'black') {
      this.camTargetPos.set(-panX, 8.2 * distScale, -10.6 * distScale);
      this.camTargetLook.set(-panX, 0.0, -0.15);
    } else if (preset === 'top') {
      this.camTargetPos.set(panX, 13.8 * distScale, 0.01);
      this.camTargetLook.set(panX, 0, 0);
    } else if (preset === 'cinematic') {
      this.camTargetPos.set(panX + 7.8 * distScale, 5.2 * distScale, 8.2 * distScale);
      this.camTargetLook.set(panX * 0.6, 0.15, 0);
    } else if (preset === 'cafe') {
      this.camTargetPos.set(panX - 11.4 * distScale, 5.6 * distScale, 6.2 * distScale);
      this.camTargetLook.set(panX * 0.4, 0.25, -0.4);
    } else if (preset === 'title') {
      this.camTargetPos.set(6.4 * distScale, 5.8 * distScale, 9.2 * distScale);
      this.camTargetLook.set(0, 0.1, 0);
    }

    if (
      immediate ||
      this.reducedMotion ||
      !Number.isFinite(this.camera.position.x) ||
      !Number.isFinite(this.camera.position.y) ||
      !Number.isFinite(this.camera.position.z)
    ) {
      this.camera.position.copy(this.camTargetPos);
      this.controls.target.copy(this.camTargetLook);
      this.controls.update();
      this.isTransitioningCam = false;
    } else {
      this.isTransitioningCam = true;
    }
  }

  private projectGhostLabels() {
    if (!this.onGhostLabelsUpdate) return;
    if (this.ghostLabelsData.length === 0) {
      this.onGhostLabelsUpdate([]);
      return;
    }

    const width = Math.max(320, this.container.clientWidth || window.innerWidth || 1024);
    const height = Math.max(240, this.container.clientHeight || window.innerHeight || 768);
    const rightSafeBound =
      width >= 768 && this.journalOpenOnRight ? width - 535 : width - 115;

    const projected: ProjectedGhostLabel[] = this.ghostLabelsData.map((item) => {
      this._projVec.copy(item.worldPos);
      this._projVec.project(this.camera);

      const visible = this._projVec.z >= -1 && this._projVec.z <= 1;
      const rawX = (this._projVec.x * 0.5 + 0.5) * width;
      const rawY = (-(this._projVec.y * 0.5) + 0.5) * height;
      const x = Math.max(115, Math.min(rightSafeBound, rawX));
      const y = Math.max(95, Math.min(height - 95, rawY));

      return {
        id: item.id,
        san: item.san,
        evalPawns: item.evalPawns,
        reason: item.reason,
        quality: item.quality,
        x: Math.round(x),
        y: Math.round(y),
        visible,
      };
    });

    // Screen-space de-overlapping so adjacent ghost labels never collide
    for (let i = 1; i < projected.length; i++) {
      for (let j = 0; j < i; j++) {
        const dx = Math.abs(projected[i].x - projected[j].x);
        const dy = Math.abs(projected[i].y - projected[j].y);
        if (dx < 175 && dy < 46) {
          projected[i].y = Math.max(95, projected[j].y - 48);
        }
      }
    }

    this.onGhostLabelsUpdate(projected);
  }

  private handleResize() {
    if (this.disposed) return;
    const width = Math.max(320, this.container.clientWidth || window.innerWidth || 1024);
    const height = Math.max(240, this.container.clientHeight || window.innerHeight || 768);
    if (width === this.lastWidth && height === this.lastHeight) return;
    this.lastWidth = width;
    this.lastHeight = height;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.render(this.scene, this.camera);
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private startLoop() {
    this.lastFrameTime = performance.now();
    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      const rawDt = (now - this.lastFrameTime) / 1000;
      this.lastFrameTime = now;
      const dt = Math.min(rawDt, 0.05);
      this.elapsedTime += dt;

      this.updateSimulation(dt, this.elapsedTime);
      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    this.frameId = requestAnimationFrame(tick);
  }

  private updateSimulation(dt: number, elapsed: number) {
    // 1. Update shader uniforms
    this.ringShaderMat.uniforms.uTime.value = elapsed;
    this.lastMoveShaderMat.uniforms.uTime.value = elapsed;
    this.checkPulseShaderMat.uniforms.uTime.value = elapsed;
    for (const mat of Object.values(this.ghostShaderMats)) {
      mat.uniforms.uTime.value = elapsed;
    }

    // 2. Smooth camera preset transitions
    if (this.currentPreset === 'title' && !this.reducedMotion) {
      const orbitAngle = elapsed * 0.18;
      this.camera.position.x = Math.cos(orbitAngle) * 7.8;
      this.camera.position.z = Math.sin(orbitAngle) * 7.8;
      this.camera.position.y = 5.4 + Math.sin(elapsed * 0.35) * 0.4;
      this.controls.target.set(0, 0.25, 0);
      this.controls.update();
    } else if (this.isTransitioningCam) {
      const k = 7.5;
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.camTargetPos.x, k, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, this.camTargetPos.y, k, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, this.camTargetPos.z, k, dt);

      this.controls.target.x = THREE.MathUtils.damp(this.controls.target.x, this.camTargetLook.x, k, dt);
      this.controls.target.y = THREE.MathUtils.damp(this.controls.target.y, this.camTargetLook.y, k, dt);
      this.controls.target.z = THREE.MathUtils.damp(this.controls.target.z, this.camTargetLook.z, k, dt);
      this.controls.update();

      if (this.camera.position.distanceTo(this.camTargetPos) < 0.03) {
        this.isTransitioningCam = false;
      }
    } else if (this.controls.enableDamping) {
      this.controls.update();
    }

    // 3. Synchronized 3-Phase Piece & Human Hand Move Animation
    //    Phase 1 (0.00 -> 0.22): Human hand reaches from table rest to grasp piece at `fromPos`
    //    Phase 2 (0.22 -> 0.80): Hand pinches and lifts/carries piece along smooth arc to `toPos`
    //    Phase 3 (0.80 -> 1.00): Piece settles at `toPos` while hand releases and glides back to rest
    let activeHandTarget: ActiveHandMoveTarget | null = null;

    for (let i = this.activeAnimations.length - 1; i >= 0; i--) {
      const anim = this.activeAnimations[i];
      anim.elapsed += dt;
      const t = Math.min(1, anim.elapsed / anim.duration);

      if (t < 0.22) {
        anim.group.position.copy(anim.fromPos);
        anim.group.rotation.set(0, 0, 0);
      } else if (t <= 0.8) {
        const carryT = (t - 0.22) / 0.58;
        const eased = carryT * carryT * (3 - 2 * carryT);
        anim.group.position.lerpVectors(anim.fromPos, anim.toPos, eased);
        const peakHeight = anim.isKnight ? 1.18 : 0.54;
        anim.group.position.y = Math.sin(carryT * Math.PI) * peakHeight;

        if (anim.isKnight) {
          anim.group.rotation.x = Math.sin(carryT * Math.PI) * 0.26;
        } else {
          // Subtle natural hand-carried tilt
          anim.group.rotation.x = Math.sin(carryT * Math.PI) * 0.1;
        }
      } else {
        anim.group.position.copy(anim.toPos);
        anim.group.rotation.set(0, 0, 0);
      }

      this._activeHandMoveTarget.color = anim.color;
      this._activeHandMoveTarget.fromPos.copy(anim.fromPos);
      this._activeHandMoveTarget.toPos.copy(anim.toPos);
      this._activeHandMoveTarget.piecePos.copy(anim.group.position);
      this._activeHandMoveTarget.isKnight = anim.isKnight;
      this._activeHandMoveTarget.progress = t;
      activeHandTarget = this._activeHandMoveTarget;

      if (t >= 1) {
        anim.group.position.copy(anim.toPos);
        anim.group.rotation.set(0, 0, 0);
        this.activeAnimations.splice(i, 1);
      }
    }

    // Update Starbucks Cafe steam wisps, seated human players, and IK arm/hand reach
    this.cafeStage.update(
      dt,
      elapsed,
      this.currentMood,
      this.regretIntensity,
      activeHandTarget,
      this.reducedMotion
    );

    // 4. Pooled Shatter Shard Physics
    for (const p of this.shardPool) {
      if (!p.mesh.visible) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.mesh.visible = false;
        continue;
      }
      p.vel.y -= 9.8 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.05) {
        p.mesh.position.y = 0.05;
        p.vel.y *= -0.45;
        p.vel.x *= 0.7;
        p.vel.z *= 0.7;
      }
      p.mesh.rotation.x += p.rotVel.x * dt;
      p.mesh.rotation.y += p.rotVel.y * dt;
      p.mesh.rotation.z += p.rotVel.z * dt;
      (p.mesh.material as THREE.MeshPhysicalMaterial).opacity = Math.max(0, 1 - p.life / p.maxLife);
    }

    // 5. 3D Eval Tower Eased Animation
    this.currentEvalWhitePawns = THREE.MathUtils.damp(
      this.currentEvalWhitePawns,
      this.targetEvalWhitePawns,
      5.5,
      dt
    );
    // Map [-8, +8] pawns to [0.25, 2.95] height out of 3.2 total
    const whiteShare = THREE.MathUtils.clamp(0.5 + this.currentEvalWhitePawns / 16, 0.08, 0.92);
    const whiteH = whiteShare * 3.2;
    const blackH = 3.2 - whiteH;
    this.evalWhiteBar.scale.y = whiteH;
    this.evalBlackBar.scale.y = blackH;
    this.evalMarkerRing.position.y = whiteH;

    // 6. Mood-based Lighting & Regret Moment King Tremble
    this.updateMoodAndRegretLighting(dt, elapsed);

    // 7. Checkmate King Topple
    if (this.toppledKingSquare) {
      const entry = this.pieceMeshes.get(this.toppledKingSquare);
      if (entry) {
        this.toppleProgress = Math.min(1, this.toppleProgress + dt * 1.4);
        const easedTopple = 1 - Math.pow(1 - this.toppleProgress, 2);
        entry.group.rotation.z = easedTopple * (Math.PI * 0.44);
        entry.group.position.y = easedTopple * 0.14;
      }
    }

    // 8. Project floating 3D ghost labels to 2D overlay
    if (this.ghostLabelsData.length > 0) {
      this.projectGhostLabels();
    }
  }

  private updateMoodAndRegretLighting(dt: number, elapsed: number) {
    if (this.regretIntensity > 0) {
      // Decay regret intensity slowly over 8 seconds
      this.regretIntensity = Math.max(0, this.regretIntensity - dt * 0.12);
    }

    // Tremble bot's king during a Regret Moment
    if (this.botKingSquare && this.botKingSquare !== this.toppledKingSquare) {
      const kingEntry = this.pieceMeshes.get(this.botKingSquare);
      const basePos = this.squareMap.get(this.botKingSquare);
      if (kingEntry && basePos && this.activeAnimations.length === 0) {
        if (this.regretIntensity > 0.05 && !this.reducedMotion) {
          const shake = 0.045 * this.regretIntensity;
          kingEntry.group.position.x = basePos.x + Math.sin(elapsed * 45) * shake;
          kingEntry.group.position.z = basePos.z + Math.cos(elapsed * 52) * shake;
          kingEntry.group.rotation.z = Math.sin(elapsed * 38) * 0.08 * this.regretIntensity;
        } else {
          kingEntry.group.position.copy(basePos);
          kingEntry.group.rotation.set(0, 0, 0);
        }
      }
    }

    // Mood-driven lighting colors & intensities
    const dimFactor = 1 - this.regretIntensity * 0.45;
    if (this.currentMood === 'confident') {
      this.keyLight.color.setHex(0xffe8b8);
      this.keyLight.intensity = 2.5 * dimFactor;
      this.rimLight.color.setHex(0xf59e0b);
      this.moodPointLight.color.setHex(0xfbbf24);
      this.moodPointLight.intensity = 1.6 * dimFactor;
    } else if (this.currentMood === 'calm') {
      this.keyLight.color.setHex(0xfff4e0);
      this.keyLight.intensity = 2.2 * dimFactor;
      this.rimLight.color.setHex(0x60a5fa);
      this.moodPointLight.color.setHex(0x38bdf8);
      this.moodPointLight.intensity = 1.0 * dimFactor;
    } else if (this.currentMood === 'nervous') {
      const flicker = this.reducedMotion ? 1.0 : 0.88 + 0.12 * Math.sin(elapsed * 19.0);
      this.keyLight.color.setHex(0xcbe2ff);
      this.keyLight.intensity = 1.85 * flicker * dimFactor;
      this.rimLight.color.setHex(0x38bdf8);
      this.moodPointLight.color.setHex(0x0ea5e9);
      this.moodPointLight.intensity = 1.35 * flicker;
    } else {
      // panicking
      const pulse = this.reducedMotion ? 1.0 : 0.85 + 0.15 * Math.sin(elapsed * 10.0);
      this.keyLight.color.setHex(0xffd6d6);
      this.keyLight.intensity = 1.65 * dimFactor;
      this.rimLight.color.setHex(0xef4444);
      this.rimLight.intensity = 3.2 * pulse;
      this.moodPointLight.color.setHex(0xf43f5e);
      this.moodPointLight.intensity = 2.1 * pulse;
    }

    if (this.regretIntensity > 0.1) {
      this.moodPointLight.color.setHex(0xf43f5e);
      this.moodPointLight.intensity = 2.4;
    }
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    for (const timer of this.resizeTimers) {
      clearTimeout(timer);
    }
    this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.boundHandleResize);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    this.controls.dispose();
    this.clearGhostGroup(this.ghostsGroup);
    this.clearGhostGroup(this.regretArrowGroup);
    this.cafeStage.dispose();
    this.geoLib.dispose();
    this.matSet.dispose();
    this.envTexture.dispose();
    this.highlightPlaneGeo.dispose();
    this.ringShaderMat.dispose();
    this.lastMoveShaderMat.dispose();
    this.checkPulseShaderMat.dispose();
    for (const mat of Object.values(this.ghostShaderMats)) {
      mat.dispose();
    }
    this.shardGeo.dispose();
    for (const mat of this.shardMaterials) {
      mat.dispose();
    }
    this.renderer.dispose();
  }
}
