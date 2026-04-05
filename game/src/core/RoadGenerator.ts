import {
  Scene,
  Mesh,
  MeshBuilder,
  StandardMaterial,
  Color3,
  DynamicTexture,
  Texture,
} from "@babylonjs/core";
import {
  ROAD_WIDTH,
  ROAD_Y,
  LANE_COUNT,
  LANE_WIDTH,
} from "../constants";
import { BiomeType } from "../types";

interface BiomeRoadColors {
  asphalt: string;       // hex fill for road texture
  laneMarkColor: string; // hex for lane markings
  edgeColor: Color3;     // road shoulder color
  dividerColor: Color3;  // lane divider color
  sceneryA: Color3;      // primary scenery color
  sceneryB: Color3;      // secondary scenery color
  groundColor: Color3;   // off-road ground plane diffuse
}

const BIOME_ROAD: Record<BiomeType, BiomeRoadColors> = {
  [BiomeType.ModernCity]: {
    asphalt: "#2C3E50",
    laneMarkColor: "#FFFFFF",
    edgeColor: new Color3(1, 0.917, 0),         // #FFEA00 yellow
    dividerColor: new Color3(0.9, 0.9, 0.9),    // white-ish
    sceneryA: new Color3(0.2, 0.7, 0.85),       // bright teal buildings
    sceneryB: new Color3(0, 0.898, 1),           // #00E5FF cyan accent
    groundColor: new Color3(0.25, 0.27, 0.3),   // dark charcoal
  },
  [BiomeType.DesertCanyon]: {
    asphalt: "#4A4036",
    laneMarkColor: "#FFD966",
    edgeColor: new Color3(1, 0.549, 0),          // #FF8C00 orange
    dividerColor: new Color3(0.7, 0.6, 0.35),   // faded yellow
    sceneryA: new Color3(0.1, 0.75, 0.4),       // vivid emerald cactus
    sceneryB: new Color3(0.886, 0.447, 0.357),  // #E2725B terra cotta
    groundColor: new Color3(0.75, 0.6, 0.35),   // warm sand
  },
  [BiomeType.CoastalHighway]: {
    asphalt: "#7F8C8D",
    laneMarkColor: "#FFFFFF",
    edgeColor: new Color3(0, 0.941, 1),          // #00F0FF aqua
    dividerColor: new Color3(0.9, 0.9, 0.9),    // white
    sceneryA: new Color3(0.1, 0.8, 0.3),        // tropical green palm
    sceneryB: new Color3(1.0, 0.55, 0.7),       // hot pink for pink palms
    groundColor: new Color3(0.7, 0.65, 0.45),   // beach sand
  },
};

/**
 * Static ground plane with scrolling asphalt texture and biome-specific scenery.
 *
 * One oversized ground plane stays fixed; its diffuse texture scrolls via
 * `vOffset` to simulate infinite forward movement. Roadside scenery is
 * object-pooled and recycled.
 */
export class RoadGenerator {
  private _scene: Scene;
  private _biome: BiomeType;

  // Ground
  private _groundPlane!: Mesh;
  private _groundMat!: StandardMaterial;
  private _gridTexture!: DynamicTexture;
  private _edgeLines: Mesh[] = [];

  // Curve offset
  private _curvePhase = 0;
  private _curveOffsetX = 0;

  // Scroll tracking
  private _totalScroll = 0;
  private static readonly GROUND_WIDTH = 300;
  private static readonly GROUND_DEPTH = 800;
  private static readonly V_SCALE = 20;

  // Roadside scenery pool
  private _sceneryMatA!: StandardMaterial;
  private _sceneryMatB!: StandardMaterial;
  private _sceneryMatC!: StandardMaterial;
  private _sceneryMatD!: StandardMaterial;
  private _activeScenery: { root: Mesh }[] = [];
  private _sceneryPool: Mesh[] = [];
  private _nextSceneryZ = 50;
  private static readonly SCENERY_SPACING = 8;
  private static readonly SCENERY_DESPAWN = -80;
  private static readonly SCENERY_SPAWN_AHEAD = 500;
  private static readonly BG_SPACING = 25;
  private _nextBgZ = 50;

  constructor(scene: Scene, biome: BiomeType = BiomeType.ModernCity) {
    this._scene = scene;
    this._biome = biome;
    this._createSceneryMaterials();
    this._createGround();
    this._createRoadEdges();
    this._preAllocateScenery(120);
  }

  /** Change biome colors (disposes and rebuilds ground + scenery). */
  setBiome(biome: BiomeType): void {
    if (biome === this._biome) return;
    this._biome = biome;
    // Rebuild visuals
    this._disposeVisuals();
    this._createSceneryMaterials();
    this._createGround();
    this._createRoadEdges();
    this._preAllocateScenery(120);
  }

  /** Scroll the road texture and update scenery each frame. */
  update(dt: number, scrollSpeed: number): void {
    const moveZ = scrollSpeed * dt;
    this._totalScroll += moveZ;

    // Curves (smooth lateral road shifts)
    const prevOffset = this._curveOffsetX;
    this._curvePhase += dt * (0.35 + scrollSpeed * 0.002);
    const curve = Math.sin(this._curvePhase) * 3.2 + Math.sin(this._curvePhase * 0.5) * 1.6;
    const t = 1 - Math.exp(-1.5 * dt);
    this._curveOffsetX += (curve - this._curveOffsetX) * t;
    const deltaOffset = this._curveOffsetX - prevOffset;

    // Scroll the asphalt texture
    this._gridTexture.vOffset -=
      moveZ * RoadGenerator.V_SCALE / RoadGenerator.GROUND_DEPTH;

    // Shift road geometry and scenery with curve offset
    this._groundPlane.position.x = this._curveOffsetX;
    for (const edge of this._edgeLines) {
      const baseX = (edge.metadata?.baseX as number) ?? edge.position.x;
      edge.position.x = baseX + this._curveOffsetX;
    }
    if (Math.abs(deltaOffset) > 0.0001) {
      for (const s of this._activeScenery) {
        s.root.position.x += deltaOffset;
      }
    }

    // Move scenery toward the player
    for (let i = this._activeScenery.length - 1; i >= 0; i--) {
      const s = this._activeScenery[i];
      s.root.position.z -= moveZ;
      if (s.root.position.z < RoadGenerator.SCENERY_DESPAWN) {
        this._recycleScenery(i);
      }
    }

    // Spawn new scenery items ahead (roadside layer)
    while (this._nextSceneryZ < RoadGenerator.SCENERY_SPAWN_AHEAD) {
      this._spawnSceneryPair(this._nextSceneryZ);
      this._nextSceneryZ += RoadGenerator.SCENERY_SPACING + Math.random() * 8;
    }
    this._nextSceneryZ -= moveZ;

    // Spawn background layer (further from road, larger objects)
    while (this._nextBgZ < RoadGenerator.SCENERY_SPAWN_AHEAD) {
      this._spawnBgPair(this._nextBgZ);
      this._nextBgZ += RoadGenerator.BG_SPACING + Math.random() * 15;
    }
    this._nextBgZ -= moveZ;
  }

  get totalScrolled(): number {
    return this._totalScroll;
  }

  get roadOffsetX(): number {
    return this._curveOffsetX;
  }

  setVisible(visible: boolean): void {
    this._groundPlane?.setEnabled(visible);
    for (const edge of this._edgeLines) {
      edge.setEnabled(visible);
    }
    for (const s of this._activeScenery) {
      s.root.setEnabled(visible);
    }
  }

  reset(): void {
    this._totalScroll = 0;
    this._gridTexture.vOffset = 0;
    this._curvePhase = 0;
    this._curveOffsetX = 0;
    this._groundPlane.position.x = 0;
    for (let i = this._activeScenery.length - 1; i >= 0; i--) {
      this._recycleScenery(i);
    }
    this._nextSceneryZ = 50;
    this._nextBgZ = 50;
  }

  dispose(): void {
    this._disposeVisuals();
  }

  private _disposeVisuals(): void {
    this._groundPlane?.dispose();
    this._gridTexture?.dispose();
    this._groundMat?.dispose();
    this._edgeLines.forEach((m) => m.dispose());
    this._edgeLines = [];
    this._activeScenery.forEach((s) => {
      s.root.getChildMeshes().forEach((c) => c.dispose());
      s.root.dispose();
    });
    this._activeScenery = [];
    this._sceneryPool.forEach((m) => {
      m.getChildMeshes().forEach((c) => c.dispose());
      m.dispose();
    });
    this._sceneryPool = [];
    this._sceneryMatA?.dispose();
    this._sceneryMatB?.dispose();
    this._sceneryMatC?.dispose();
    this._sceneryMatD?.dispose();
  }

  // ─────────────── Ground ───────────────

  private _createGround(): void {
    const W = RoadGenerator.GROUND_WIDTH;
    const D = RoadGenerator.GROUND_DEPTH;

    this._groundPlane = MeshBuilder.CreateGround("roadGround", {
      width: W,
      height: D,
      subdivisions: 1,
    }, this._scene);
    this._groundPlane.position.set(0, ROAD_Y, D / 2 - 100);
    this._groundPlane.receiveShadows = true;
    this._groundPlane.isPickable = false;

    this._gridTexture = this._createRoadTexture();

    const colors = BIOME_ROAD[this._biome];
    this._groundMat = new StandardMaterial("roadGroundMat", this._scene);
    this._groundMat.diffuseTexture = this._gridTexture;
    this._groundMat.specularColor = new Color3(0.1, 0.1, 0.1);
    this._groundMat.specularPower = 8;
    this._groundPlane.material = this._groundMat;
  }

  private _createRoadTexture(): DynamicTexture {
    const S = 512;
    const tex = new DynamicTexture("roadTex", S, this._scene, false);
    const ctx = tex.getContext();
    const colors = BIOME_ROAD[this._biome];

    // Asphalt background
    ctx.fillStyle = colors.asphalt;
    ctx.fillRect(0, 0, S, S);

    // Add subtle noise/grain to asphalt
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    for (let i = 0; i < 300; i++) {
      const x = Math.random() * S;
      const y = Math.random() * S;
      ctx.fillRect(x, y, 2, 2);
    }
    // Lighter grain for texture depth
    ctx.fillStyle = "rgba(255,255,255,0.03)";
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * S;
      const y = Math.random() * S;
      ctx.fillRect(x, y, 2, 2);
    }

    // Lane dashes (vertical lines in texture = forward dashes on road)
    ctx.strokeStyle = colors.laneMarkColor;
    ctx.lineWidth = 3;
    ctx.setLineDash([30, 20]);
    const roadFraction = ROAD_WIDTH / RoadGenerator.GROUND_WIDTH;
    const roadStartPx = (0.5 - roadFraction / 2) * S;
    const roadEndPx = (0.5 + roadFraction / 2) * S;
    const laneWidthPx = (roadEndPx - roadStartPx) / LANE_COUNT;

    for (let lane = 1; lane < LANE_COUNT; lane++) {
      const x = roadStartPx + lane * laneWidthPx;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, S);
      ctx.stroke();
    }

    // Solid edge lines (thicker for visibility)
    ctx.setLineDash([]);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(roadStartPx, 0);
    ctx.lineTo(roadStartPx, S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(roadEndPx, 0);
    ctx.lineTo(roadEndPx, S);
    ctx.stroke();

    // Colored shoulder strips (10px bands outside road edges)
    const edgeHex = colors.edgeColor;
    ctx.fillStyle = `rgb(${Math.floor(edgeHex.r * 255)},${Math.floor(edgeHex.g * 255)},${Math.floor(edgeHex.b * 255)})`;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(roadStartPx - 12, 0, 10, S);
    ctx.fillRect(roadEndPx + 2, 0, 10, S);
    ctx.globalAlpha = 1.0;

    // Center line (double yellow for desert, white for others)
    const centerX = (roadStartPx + roadEndPx) / 2;
    if (this._biome === BiomeType.DesertCanyon) {
      ctx.strokeStyle = "#FFD966";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(centerX - 2, 0);
      ctx.lineTo(centerX - 2, S);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(centerX + 2, 0);
      ctx.lineTo(centerX + 2, S);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 2;
      ctx.setLineDash([40, 30]);
      ctx.beginPath();
      ctx.moveTo(centerX, 0);
      ctx.lineTo(centerX, S);
      ctx.stroke();
    }

    tex.update();
    tex.wrapU = Texture.WRAP_ADDRESSMODE;
    tex.wrapV = Texture.WRAP_ADDRESSMODE;
    tex.uScale = 1;
    tex.vScale = RoadGenerator.V_SCALE;
    return tex;
  }

  /** Road-edge and lane-divider 3D lines spanning the full ground length. */
  private _createRoadEdges(): void {
    const depth = RoadGenerator.GROUND_DEPTH;
    const zCenter = RoadGenerator.GROUND_DEPTH / 2 - 100;
    const colors = BIOME_ROAD[this._biome];

    // Road shoulder lines
    const edgeMat = new StandardMaterial("roadEdgeMat", this._scene);
    edgeMat.diffuseColor = colors.edgeColor;
    edgeMat.emissiveColor = colors.edgeColor.scale(0.2);
    edgeMat.specularColor = Color3.Black();
    edgeMat.freeze();

    for (const side of [-1, 1]) {
      const x = side * (ROAD_WIDTH / 2);
      const edge = MeshBuilder.CreateBox("roadEdge", {
        width: 0.2, height: 0.03, depth: depth,
      }, this._scene);
      edge.position.set(x, ROAD_Y + 0.02, zCenter);
      edge.metadata = { baseX: x };
      edge.material = edgeMat;
      edge.isPickable = false;
      this._edgeLines.push(edge);
    }

    // Lane dividers
    const laneMat = new StandardMaterial("laneDivMat", this._scene);
    laneMat.diffuseColor = colors.dividerColor;
    laneMat.emissiveColor = colors.dividerColor.scale(0.1);
    laneMat.specularColor = Color3.Black();
    laneMat.freeze();

    for (let lane = 1; lane < LANE_COUNT; lane++) {
      const x = (lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH - LANE_WIDTH / 2;
      const div = MeshBuilder.CreateBox("laneDivider", {
        width: 0.08, height: 0.02, depth: depth,
      }, this._scene);
      div.position.set(x, ROAD_Y + 0.015, zCenter);
      div.metadata = { baseX: x };
      div.material = laneMat;
      div.isPickable = false;
      this._edgeLines.push(div);
    }
  }

  // ─────────────── Scenery Materials ───────────────

  private _createSceneryMaterials(): void {
    const colors = BIOME_ROAD[this._biome];

    this._sceneryMatA = new StandardMaterial("sceneryMatA", this._scene);
    this._sceneryMatA.diffuseColor = colors.sceneryA;
    this._sceneryMatA.emissiveColor = colors.sceneryA.scale(0.3);
    this._sceneryMatA.specularColor = new Color3(0.25, 0.25, 0.25);
    this._sceneryMatA.freeze();

    this._sceneryMatB = new StandardMaterial("sceneryMatB", this._scene);
    this._sceneryMatB.diffuseColor = colors.sceneryB;
    this._sceneryMatB.emissiveColor = colors.sceneryB.scale(0.3);
    this._sceneryMatB.specularColor = new Color3(0.25, 0.25, 0.25);
    this._sceneryMatB.freeze();

    this._sceneryMatC = new StandardMaterial("sceneryMatC", this._scene);
    this._sceneryMatC.diffuseColor = colors.groundColor;
    this._sceneryMatC.emissiveColor = colors.groundColor.scale(0.15);
    this._sceneryMatC.specularColor = Color3.Black();
    this._sceneryMatC.freeze();

    // Accent / glow material for streetlights, umbrellas, etc.
    this._sceneryMatD = new StandardMaterial("sceneryMatD", this._scene);
    this._sceneryMatD.diffuseColor = new Color3(1.0, 0.95, 0.7);
    this._sceneryMatD.emissiveColor = new Color3(1.0, 0.92, 0.6);
    this._sceneryMatD.specularColor = new Color3(0.5, 0.5, 0.4);
    this._sceneryMatD.freeze();
  }

  // ─────────────── Scenery Pool ───────────────

  private _preAllocateScenery(count: number): void {
    for (let i = 0; i < count; i++) {
      const mesh = this._createSceneryItem();
      mesh.setEnabled(false);
      mesh.position.set(0, -999, 0);
      this._sceneryPool.push(mesh);
    }
  }

  private _createSceneryItem(): Mesh {
    const r = Math.random();
    switch (this._biome) {
      case BiomeType.ModernCity:
        if (r < 0.22) return this._createBuilding();
        if (r < 0.38) return this._createStreetLight();
        if (r < 0.50) return this._createBillboard();
        if (r < 0.60) return this._createSign();
        if (r < 0.72) return this._createCityTree();
        if (r < 0.82) return this._createBench();
        if (r < 0.92) return this._createTrafficCone();
        return this._createHedge();
      case BiomeType.DesertCanyon:
        if (r < 0.20) return this._createCactus();
        if (r < 0.35) return this._createRock();
        if (r < 0.50) return this._createMesa();
        if (r < 0.65) return this._createCactusCluster();
        if (r < 0.80) return this._createDeadTree();
        return this._createShrub();
      case BiomeType.CoastalHighway:
        if (r < 0.22) return this._createPalmTree();
        if (r < 0.38) return this._createPinkPalm();
        if (r < 0.50) return this._createBeachUmbrella();
        if (r < 0.60) return this._createGuardrail();
        if (r < 0.72) return this._createRock();
        if (r < 0.84) return this._createDriftwood();
        return this._createLifeguardTower();
    }
  }

  /** Create a background-layer item (larger, further from road). */
  private _createBgItem(): Mesh {
    const r = Math.random();
    switch (this._biome) {
      case BiomeType.ModernCity:
        if (r < 0.6) return this._createTallBuilding();
        return this._createBuildingCluster();
      case BiomeType.DesertCanyon:
        if (r < 0.5) return this._createMesa();
        return this._createDistantRock();
      case BiomeType.CoastalHighway:
        if (r < 0.4) return this._createPalmTree();
        if (r < 0.7) return this._createPinkPalm();
        return this._createDistantRock();
    }
  }

  // ── Modern City scenery ──

  private _createBuilding(): Mesh {
    const h = 5 + Math.random() * 14;
    const w = 2 + Math.random() * 4;
    const d = 2 + Math.random() * 4;
    const box = MeshBuilder.CreateBox("building", {
      width: w, height: h, depth: d,
    }, this._scene);
    box.material = this._sceneryMatA;
    box.metadata = { yOffset: h / 2 };

    // Window strip detail — thin emissive stripe
    if (h > 8) {
      const stripe = MeshBuilder.CreateBox("windowStripe", {
        width: w * 1.01, height: 0.15, depth: d * 1.01,
      }, this._scene);
      stripe.position.y = h * 0.3;
      stripe.parent = box;
      stripe.material = this._sceneryMatD;
    }

    return box;
  }

  private _createSign(): Mesh {
    const poleH = 3;
    const pole = MeshBuilder.CreateCylinder("signPole", {
      diameter: 0.1, height: poleH, tessellation: 6,
    }, this._scene);
    pole.material = this._sceneryMatC;
    pole.metadata = { yOffset: poleH / 2 };

    const board = MeshBuilder.CreateBox("signBoard", {
      width: 1.5, height: 0.8, depth: 0.1,
    }, this._scene);
    board.position.y = poleH * 0.45;
    board.parent = pole;
    board.material = this._sceneryMatB;
    return pole;
  }

  private _createStreetLight(): Mesh {
    const poleH = 5 + Math.random() * 2;
    const pole = MeshBuilder.CreateCylinder("streetLightPole", {
      diameterTop: 0.08, diameterBottom: 0.15, height: poleH, tessellation: 6,
    }, this._scene);
    pole.material = this._sceneryMatC;
    pole.metadata = { yOffset: poleH / 2 };

    // Horizontal arm at top
    const arm = MeshBuilder.CreateBox("streetLightArm", {
      width: 1.5, height: 0.06, depth: 0.06,
    }, this._scene);
    arm.position.y = poleH * 0.48;
    arm.parent = pole;
    arm.material = this._sceneryMatC;

    // Emissive light bulb
    const bulb = MeshBuilder.CreateSphere("streetLightBulb", {
      diameter: 0.4, segments: 8,
    }, this._scene);
    bulb.position.set(0.65, poleH * 0.48, 0);
    bulb.parent = pole;
    bulb.material = this._sceneryMatD;

    return pole;
  }

  private _createBillboard(): Mesh {
    const poleH = 7 + Math.random() * 3;
    const pole = MeshBuilder.CreateCylinder("billboardPole", {
      diameter: 0.2, height: poleH, tessellation: 6,
    }, this._scene);
    pole.material = this._sceneryMatC;
    pole.metadata = { yOffset: poleH / 2 };

    // Large sign face
    const face = MeshBuilder.CreateBox("billboardFace", {
      width: 4, height: 2, depth: 0.15,
    }, this._scene);
    face.position.y = poleH * 0.46;
    face.parent = pole;
    face.material = Math.random() < 0.5 ? this._sceneryMatB : this._sceneryMatD;

    return pole;
  }

  // ── Desert Canyon scenery ──

  private _createCactus(): Mesh {
    const h = 2 + Math.random() * 4;
    const trunk = MeshBuilder.CreateCylinder("cactus", {
      diameterTop: 0.3, diameterBottom: 0.5, height: h, tessellation: 8,
    }, this._scene);
    trunk.material = this._sceneryMatA;
    trunk.metadata = { yOffset: h / 2 };

    // Optional arm
    if (Math.random() < 0.6) {
      const arm = MeshBuilder.CreateCylinder("cactusArm", {
        diameter: 0.25, height: 1.5, tessellation: 6,
      }, this._scene);
      arm.position.set(0.5, h * 0.2, 0);
      arm.rotation.z = -Math.PI / 3;
      arm.parent = trunk;
      arm.material = this._sceneryMatA;
    }
    // Second arm on other side
    if (Math.random() < 0.3) {
      const arm2 = MeshBuilder.CreateCylinder("cactusArm2", {
        diameter: 0.22, height: 1.2, tessellation: 6,
      }, this._scene);
      arm2.position.set(-0.45, h * 0.35, 0);
      arm2.rotation.z = Math.PI / 3;
      arm2.parent = trunk;
      arm2.material = this._sceneryMatA;
    }
    return trunk;
  }

  private _createRock(): Mesh {
    const s = 0.8 + Math.random() * 2;
    const rock = MeshBuilder.CreateBox("rock", {
      width: s * 1.4, height: s * 0.8, depth: s * 1.1,
    }, this._scene);
    rock.material = this._sceneryMatB;
    rock.rotation.y = Math.random() * Math.PI;
    rock.metadata = { yOffset: s * 0.4 };
    return rock;
  }

  private _createMesa(): Mesh {
    const w = 3 + Math.random() * 5;
    const h = 4 + Math.random() * 6;
    const d = 2 + Math.random() * 3;
    const mesa = MeshBuilder.CreateBox("mesa", {
      width: w, height: h, depth: d,
    }, this._scene);
    mesa.material = this._sceneryMatB;
    mesa.rotation.y = Math.random() * Math.PI * 0.3;
    mesa.metadata = { yOffset: h / 2 };

    // Flat cap slightly wider
    const cap = MeshBuilder.CreateBox("mesaCap", {
      width: w * 1.15, height: h * 0.06, depth: d * 1.15,
    }, this._scene);
    cap.position.y = h * 0.47;
    cap.parent = mesa;
    cap.material = this._sceneryMatC;

    return mesa;
  }

  private _createCactusCluster(): Mesh {
    const root = MeshBuilder.CreateBox("clusterRoot", {
      width: 0.01, height: 0.01, depth: 0.01,
    }, this._scene);
    root.isVisible = false;
    root.metadata = { yOffset: 0 };

    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const h = 1 + Math.random() * 2.5;
      const c = MeshBuilder.CreateCylinder(`clusterCactus_${i}`, {
        diameterTop: 0.15, diameterBottom: 0.3, height: h, tessellation: 6,
      }, this._scene);
      c.position.set(
        (Math.random() - 0.5) * 2,
        h / 2,
        (Math.random() - 0.5) * 2
      );
      c.parent = root;
      c.material = this._sceneryMatA;
    }
    return root;
  }

  // ── Coastal Highway scenery ──

  private _createPalmTree(): Mesh {
    const trunkH = 6 + Math.random() * 2;
    const trunk = MeshBuilder.CreateCylinder("palm", {
      diameterTop: 0.12, diameterBottom: 0.25, height: trunkH, tessellation: 6,
    }, this._scene);
    trunk.material = this._sceneryMatC;
    trunk.metadata = { yOffset: trunkH / 2 };

    const leafCount = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < leafCount; i++) {
      const leaf = MeshBuilder.CreateCylinder(`leaf_${i}`, {
        diameterTop: 0, diameterBottom: 1.4, height: 2.8, tessellation: 4,
      }, this._scene);
      leaf.position.y = trunkH * 0.48;
      leaf.rotation.x = 0.8 + Math.random() * 0.4;
      leaf.rotation.y = (Math.PI * 2 / leafCount) * i + Math.random() * 0.2;
      leaf.parent = trunk;
      leaf.material = this._sceneryMatA;
    }
    return trunk;
  }

  private _createPinkPalm(): Mesh {
    const trunkH = 5 + Math.random() * 3;
    const trunk = MeshBuilder.CreateCylinder("pinkPalm", {
      diameterTop: 0.1, diameterBottom: 0.22, height: trunkH, tessellation: 6,
    }, this._scene);
    trunk.material = this._sceneryMatC;
    trunk.metadata = { yOffset: trunkH / 2 };

    const leafCount = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < leafCount; i++) {
      const leaf = MeshBuilder.CreateCylinder(`pinkLeaf_${i}`, {
        diameterTop: 0, diameterBottom: 1.3, height: 2.5, tessellation: 4,
      }, this._scene);
      leaf.position.y = trunkH * 0.48;
      leaf.rotation.x = 0.85 + Math.random() * 0.35;
      leaf.rotation.y = (Math.PI * 2 / leafCount) * i + Math.random() * 0.2;
      leaf.parent = trunk;
      leaf.material = this._sceneryMatB; // pink color
    }
    return trunk;
  }

  private _createBeachUmbrella(): Mesh {
    const poleH = 2.5;
    const pole = MeshBuilder.CreateCylinder("umbrellaPole", {
      diameter: 0.08, height: poleH, tessellation: 6,
    }, this._scene);
    pole.material = this._sceneryMatC;
    pole.metadata = { yOffset: poleH / 2 };

    // Canopy — wide flat cone
    const canopy = MeshBuilder.CreateCylinder("umbrellaCanopy", {
      diameterTop: 0.1, diameterBottom: 2.2, height: 0.4, tessellation: 8,
    }, this._scene);
    canopy.position.y = poleH * 0.45;
    canopy.parent = pole;
    canopy.material = Math.random() < 0.5 ? this._sceneryMatD : this._sceneryMatB;

    return pole;
  }

  private _createGuardrail(): Mesh {
    const rail = MeshBuilder.CreateBox("guardrail", {
      width: 0.15, height: 0.8, depth: 6,
    }, this._scene);
    rail.material = this._sceneryMatB;
    rail.metadata = { yOffset: 0.4 };
    return rail;
  }

  // ── Shared / new scenery types ──

  private _createCityTree(): Mesh {
    const trunkH = 2 + Math.random() * 1.5;
    const trunk = MeshBuilder.CreateCylinder("cityTree", {
      diameterTop: 0.12, diameterBottom: 0.2, height: trunkH, tessellation: 6,
    }, this._scene);
    trunk.material = this._sceneryMatC;
    trunk.metadata = { yOffset: trunkH / 2 };

    const crownH = 2 + Math.random() * 2;
    const crown = MeshBuilder.CreateSphere("treeCrown", {
      diameterX: 1.8 + Math.random(), diameterY: crownH, diameterZ: 1.8 + Math.random(),
      segments: 6,
    }, this._scene);
    crown.position.y = trunkH * 0.4 + crownH * 0.3;
    crown.parent = trunk;
    crown.material = this._sceneryMatA;
    return trunk;
  }

  private _createBench(): Mesh {
    const seat = MeshBuilder.CreateBox("bench", {
      width: 1.6, height: 0.1, depth: 0.5,
    }, this._scene);
    seat.material = this._sceneryMatC;
    seat.metadata = { yOffset: 0.45 };

    // Legs
    for (const xOff of [-0.6, 0.6]) {
      const leg = MeshBuilder.CreateBox("benchLeg", {
        width: 0.08, height: 0.4, depth: 0.4,
      }, this._scene);
      leg.position.set(xOff, -0.25, 0);
      leg.parent = seat;
      leg.material = this._sceneryMatC;
    }

    // Backrest
    const back = MeshBuilder.CreateBox("benchBack", {
      width: 1.6, height: 0.6, depth: 0.08,
    }, this._scene);
    back.position.set(0, 0.3, -0.2);
    back.parent = seat;
    back.material = this._sceneryMatC;
    return seat;
  }

  private _createTrafficCone(): Mesh {
    const cone = MeshBuilder.CreateCylinder("trafficCone", {
      diameterTop: 0.05, diameterBottom: 0.35, height: 0.6, tessellation: 6,
    }, this._scene);
    cone.material = this._sceneryMatB;
    cone.metadata = { yOffset: 0.3 };
    return cone;
  }

  private _createHedge(): Mesh {
    const w = 1.5 + Math.random() * 3;
    const h = 0.8 + Math.random() * 0.6;
    const hedge = MeshBuilder.CreateBox("hedge", {
      width: w, height: h, depth: 0.8,
    }, this._scene);
    hedge.material = this._sceneryMatA;
    hedge.metadata = { yOffset: h / 2 };
    return hedge;
  }

  private _createDeadTree(): Mesh {
    const trunkH = 3 + Math.random() * 3;
    const trunk = MeshBuilder.CreateCylinder("deadTree", {
      diameterTop: 0.06, diameterBottom: 0.25, height: trunkH, tessellation: 5,
    }, this._scene);
    trunk.material = this._sceneryMatC;
    trunk.metadata = { yOffset: trunkH / 2 };

    // A couple of bare branches
    for (let i = 0; i < 2; i++) {
      const branchH = 1 + Math.random() * 1.5;
      const branch = MeshBuilder.CreateCylinder(`deadBranch_${i}`, {
        diameterTop: 0.02, diameterBottom: 0.06, height: branchH, tessellation: 4,
      }, this._scene);
      branch.position.y = trunkH * (0.2 + i * 0.25);
      branch.rotation.z = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.6);
      branch.parent = trunk;
      branch.material = this._sceneryMatC;
    }
    return trunk;
  }

  private _createShrub(): Mesh {
    const s = 0.4 + Math.random() * 0.6;
    const shrub = MeshBuilder.CreateSphere("shrub", {
      diameterX: s * 1.5, diameterY: s, diameterZ: s * 1.5, segments: 5,
    }, this._scene);
    shrub.material = this._sceneryMatA;
    shrub.metadata = { yOffset: s * 0.4 };
    return shrub;
  }

  private _createDriftwood(): Mesh {
    const len = 1.5 + Math.random() * 2;
    const log = MeshBuilder.CreateCylinder("driftwood", {
      diameterTop: 0.12, diameterBottom: 0.2, height: len, tessellation: 5,
    }, this._scene);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = Math.random() * Math.PI;
    log.material = this._sceneryMatC;
    log.metadata = { yOffset: 0.12 };
    return log;
  }

  private _createLifeguardTower(): Mesh {
    const h = 3.5;
    const base = MeshBuilder.CreateBox("lgBase", {
      width: 0.01, height: 0.01, depth: 0.01,
    }, this._scene);
    base.isVisible = false;
    base.metadata = { yOffset: 0 };

    // Four legs
    for (const xOff of [-0.5, 0.5]) {
      for (const zOff of [-0.5, 0.5]) {
        const leg = MeshBuilder.CreateCylinder("lgLeg", {
          diameter: 0.08, height: h, tessellation: 4,
        }, this._scene);
        leg.position.set(xOff, h / 2, zOff);
        leg.parent = base;
        leg.material = this._sceneryMatC;
      }
    }

    // Platform
    const platform = MeshBuilder.CreateBox("lgPlatform", {
      width: 1.4, height: 0.1, depth: 1.4,
    }, this._scene);
    platform.position.y = h * 0.85;
    platform.parent = base;
    platform.material = this._sceneryMatB;

    // Roof
    const roof = MeshBuilder.CreateCylinder("lgRoof", {
      diameterTop: 0.1, diameterBottom: 2.0, height: 0.6, tessellation: 4,
    }, this._scene);
    roof.position.y = h * 0.85 + 0.8;
    roof.parent = base;
    roof.material = this._sceneryMatD;

    return base;
  }

  // ── Background layer items ──

  private _createTallBuilding(): Mesh {
    const h = 15 + Math.random() * 25;
    const w = 4 + Math.random() * 6;
    const d = 4 + Math.random() * 6;
    const box = MeshBuilder.CreateBox("tallBuilding", {
      width: w, height: h, depth: d,
    }, this._scene);
    box.material = this._sceneryMatA;
    box.metadata = { yOffset: h / 2 };

    // Window rows
    const rows = Math.floor(h / 3);
    for (let i = 0; i < Math.min(rows, 5); i++) {
      const stripe = MeshBuilder.CreateBox("bgWindowStripe", {
        width: w * 1.01, height: 0.12, depth: d * 1.01,
      }, this._scene);
      stripe.position.y = -h * 0.4 + (i / rows) * h * 0.8;
      stripe.parent = box;
      stripe.material = this._sceneryMatD;
    }
    return box;
  }

  private _createBuildingCluster(): Mesh {
    const root = MeshBuilder.CreateBox("bgClusterRoot", {
      width: 0.01, height: 0.01, depth: 0.01,
    }, this._scene);
    root.isVisible = false;
    root.metadata = { yOffset: 0 };

    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const h = 8 + Math.random() * 18;
      const w = 3 + Math.random() * 4;
      const b = MeshBuilder.CreateBox(`bgClusterBldg_${i}`, {
        width: w, height: h, depth: 3 + Math.random() * 3,
      }, this._scene);
      b.position.set(
        (Math.random() - 0.5) * 8,
        h / 2,
        (Math.random() - 0.5) * 6,
      );
      b.parent = root;
      b.material = Math.random() < 0.5 ? this._sceneryMatA : this._sceneryMatC;
    }
    return root;
  }

  private _createDistantRock(): Mesh {
    const s = 2 + Math.random() * 4;
    const rock = MeshBuilder.CreateBox("distantRock", {
      width: s * 1.6, height: s * 0.9, depth: s * 1.3,
    }, this._scene);
    rock.material = this._sceneryMatB;
    rock.rotation.y = Math.random() * Math.PI;
    rock.metadata = { yOffset: s * 0.45 };
    return rock;
  }

  private _acquireScenery(): Mesh | null {
    if (this._sceneryPool.length > 0) {
      const mesh = this._sceneryPool.pop()!;
      mesh.setEnabled(true);
      return mesh;
    }
    return this._createSceneryItem();
  }

  private _spawnSceneryPair(z: number): void {
    for (const side of [-1, 1]) {
      const mesh = this._acquireScenery();
      if (!mesh) continue;
      const x = side * (ROAD_WIDTH / 2 + 4 + Math.random() * 6) + this._curveOffsetX;
      const yOffset = (mesh.metadata?.yOffset as number) ?? 3;
      mesh.position.set(x, ROAD_Y + yOffset, z);
      this._activeScenery.push({ root: mesh });
    }
  }

  /** Spawn a background item further from the road on each side. */
  private _spawnBgPair(z: number): void {
    for (const side of [-1, 1]) {
      const mesh = this._acquireScenery();
      if (!mesh) continue;
      const x = side * (ROAD_WIDTH / 2 + 20 + Math.random() * 25) + this._curveOffsetX;
      const yOffset = (mesh.metadata?.yOffset as number) ?? 5;
      mesh.position.set(x, ROAD_Y + yOffset, z);
      this._activeScenery.push({ root: mesh });
    }
  }

  private _recycleScenery(index: number): void {
    const s = this._activeScenery[index];
    s.root.setEnabled(false);
    s.root.position.set(0, -999, 0);
    this._sceneryPool.push(s.root);
    // Swap-remove for O(1)
    this._activeScenery[index] = this._activeScenery[this._activeScenery.length - 1];
    this._activeScenery.pop();
  }
}
