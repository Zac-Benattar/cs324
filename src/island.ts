import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createNoise2D } from "simplex-noise";
import Item from "./items";
import Tile, { TileFeature, TileTop, TileType } from "./tile";

export enum Biome {
  Jungle,
  Forest,
  Desert,
  Alpine,
  Savana,
  Ocean,
  Mesa,
  Volcano,
  Tundra,
  Swamp,
  Plains,
  Taiga, // Less snowy than Alpine
  Beach,
  Meadow,
  MartianDesert,
}

export enum Weather {
  Sunny,
  Rainy,
  Snowy,
  Stormy,
  Clear,
}

class TileFeatureProbability {
  feature: TileFeature;
  probability: number;

  constructor(feature: TileFeature, probability: number) {
    this.feature = feature;
    this.probability = probability;
  }
}

class Layer {
  min_height: number;
  tileTypes: TileType[];
  features: TileFeatureProbability[];

  constructor(
    min_height: number,
    tileTypes: TileType[],
    features: TileFeatureProbability[]
  ) {
    this.min_height = min_height;
    this.tileTypes = tileTypes;
    this.features = features;
  }
}

class Parameters {
  max_height: number;
  height_variance: number;
  weather: Weather;
  clouds: boolean;
  clouds_min_height: number;
  water: boolean;
  layers: Layer[];
}

export default class Island {
  Biome: Biome;
  Parameters: Parameters;
  seed: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  tiles: Array<Tile>;
  items: Array<Item>;
  particles: THREE.Points<THREE.BufferGeometry> | null;

  constructor(
    biome: Biome,
    seed: number,
    radius: number,
    x: number,
    y: number,
    z: number
  ) {
    this.Biome = biome;
    this.seed = seed;
    this.radius = radius;
    this.x = x;
    this.y = y;
    this.z = z;
    this.tiles = [];
    this.items = [];

    switch (biome) {
      case Biome.Alpine:
        this.Parameters = {
          max_height: 14,
          height_variance: 1.5,
          weather: Weather.Snowy,
          clouds: true,
          clouds_min_height: 13,
          water: false,
          layers: [
            new Layer(
              8,
              [TileType.Stone],
              [
                new TileFeatureProbability(TileFeature.Rock, 0.1),
                new TileFeatureProbability(TileFeature.AlpineTree, 0.3),
              ]
            ),
            new Layer(
              7,
              [TileType.Dirt],
              [
                new TileFeatureProbability(TileFeature.AlpineTree, 0.2),
                new TileFeatureProbability(TileFeature.Snow, 0.8),
              ]
            ),
            new Layer(6, [TileType.Dirt], []),
            new Layer(4, [TileType.Grass], []),
            new Layer(1, [TileType.Grass], []),
          ],
        };
        break;
      case Biome.Desert:
        this.Parameters = {
          max_height: 3,
          height_variance: 0.5,
          weather: Weather.Sunny,
          clouds: false,
          clouds_min_height: 11,
          water: false,
          layers: [
            new Layer(
              1,
              [TileType.Sand],
              [
                new TileFeatureProbability(TileFeature.Rock, 0.2),
                new TileFeatureProbability(TileFeature.Tumbleweed, 0.2),
                new TileFeatureProbability(TileFeature.Cactus, 0.2),
              ]
            ),
          ],
        };
        break;
      case Biome.MartianDesert:
        this.Parameters = {
          max_height: 3,
          height_variance: 0.5,
          weather: Weather.Sunny,
          clouds: false,
          clouds_min_height: 11,
          water: false,
          layers: [
            new Layer(
              1,
              [TileType.MartianSand],
              [
                new TileFeatureProbability(TileFeature.Rock, 0.2),
                new TileFeatureProbability(TileFeature.Tumbleweed, 0.2),
                new TileFeatureProbability(TileFeature.Cactus, 0.2),
              ]
            ),
          ],
        };
        break;
      default:
        this.Parameters = new Parameters();
        break;
    }

    const noise2D = createNoise2D(this.randomFunction); // Create a seeded 2D noise function - gives values between -1 and 1

    for (let y = -radius; y < radius; y++) {
      for (let x = -radius; x < radius; x++) {
        let position = this.tileToPosition(x, y);
        if (position.length() > radius + 1) continue;

        if (position.length() + 1 > radius) continue;

        let noise = (noise2D(x * 0.1, y * 0.1) + 1) / 2; // Normalize noise to 0-1
        noise = Math.pow(noise, this.Parameters.height_variance); // Smooth out the noise
        let height = Math.min(
          noise * (this.Parameters.max_height - this.getMinHeight()) +
            this.getMinHeight(),
          this.Parameters.max_height
        );
        let feature: TileFeature = TileFeature.None;
        let item: Item = null;

        let tileLayer: Layer | undefined = this.Parameters.layers.find(
          (layer) => {
            return height >= layer.min_height;
          }
        );

        if (tileLayer === undefined) {
          console.log("No layer found for height " + height);
          continue;
        }

        // Pick a feature based on probability
        if (tileLayer.features.length > 0) {
          let featureProbability = Math.random();
          let cumulativeProbability = 0;
          for (let i = 0; i < tileLayer.features.length; i++) {
            cumulativeProbability += tileLayer.features[i].probability;
            if (featureProbability <= cumulativeProbability) {
              feature = tileLayer.features[i].feature;
              break;
            }
          }
        }

        let tileType: TileType =
          tileLayer.tileTypes[
            Math.floor(Math.random() * tileLayer.tileTypes.length)
          ];

        let tiletop: TileTop = TileTop.None;
        if (biome === Biome.Alpine) {
          tiletop = TileTop.Snow;
        }

        this.tiles.push(
          new Tile(height, position, tileType, feature, item, tiletop)
        );
      }
    }
  }

  public update(): void {
    this.updateParticles();
  }

  private getMinHeight(): number {
    return this.Parameters.layers.reduce((min, layer) => {
      return Math.min(min, layer.min_height);
    }, this.Parameters.max_height);
  }

  private tileToPosition(tileX, tileY): THREE.Vector2 {
    return new THREE.Vector2((tileX + (tileY % 2) * 0.5) * 1.77, tileY * 1.535);
  }

  private randomFunction(): number {
    return Math.random();
  }

  public getClouds(): THREE.Mesh<
    THREE.BufferGeometry<THREE.NormalBufferAttributes>,
    THREE.MeshStandardMaterial,
    THREE.Object3DEventMap
  > {
    let geo: THREE.BufferGeometry = new THREE.SphereGeometry(0, 0, 0);
    let min_clouds = 0;
    if (this.Parameters.weather !== Weather.Clear) {
      min_clouds = 3;
    }
    let count = Math.max(
      Math.floor(Math.pow(Math.random() * 5, 0.8)),
      min_clouds
    );

    for (let i = 0; i < count; i++) {
      const puff1 = new THREE.SphereGeometry(1.2, 7, 7);
      const puff2 = new THREE.SphereGeometry(1.5, 7, 7);
      const puff3 = new THREE.SphereGeometry(0.9, 7, 7);

      puff1.translate(-1.85, Math.random() * 0.3, 0);
      puff2.translate(0, Math.random() * 0.3, 0);
      puff3.translate(1.85, Math.random() * 0.3, 0);

      const cloudGeo = BufferGeometryUtils.mergeGeometries([
        puff1,
        puff2,
        puff3,
      ]);
      cloudGeo.translate(
        Math.random() * this.radius - 5,
        Math.random() * 5 + this.Parameters.clouds_min_height,
        Math.random() * this.radius - 5
      );
      cloudGeo.rotateY(Math.random() * Math.PI * 2);

      geo = BufferGeometryUtils.mergeGeometries([geo, cloudGeo]);
    }

    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        flatShading: true,
        transparent: true,
        opacity: 0.9,
      })
    );

    return mesh;
  }

  public getSnow() {
    let particles;
    let positions: number[] = [];
    let velocities: number[] = [];
    const particleCount = 250;
    const geo = new THREE.BufferGeometry();
    const textureLoader = new THREE.TextureLoader();

    for (let i = 0; i < particleCount; i++) {
      positions.push(
        Math.floor((Math.random() - 0.5) * (this.radius * 1.7)),
        Math.floor(Math.random() * 5 + this.Parameters.clouds_min_height),
        Math.floor((Math.random() - 0.5) * (this.radius * 1.7))
      );
      velocities.push(
        (Math.random() - 0.5) * 0.05,
        (Math.random() - 0.05) * -0.05 - 0.01,
        (Math.random() - 0.5) * 0.05
      );
    }

    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geo.setAttribute(
      "velocity",
      new THREE.Float32BufferAttribute(velocities, 3)
    );

    // Create a basic white square particle
    const material = new THREE.PointsMaterial({
      size: 0.5,
      map: textureLoader.load("assets/snowflake.png"),
      blending: THREE.AdditiveBlending,
      depthTest: false,
      transparent: true,
      opacity: 0.8,
    });

    particles = new THREE.Points(geo, material);
    return particles;
  }

  private updateParticles() {
    const min_height = this.getMinHeight();
    if (this.particles) {
      for (
        let i = 0;
        i < this.particles.geometry.attributes.position.count;
        i++
      ) {
        let x = this.particles.geometry.attributes.position.array[i * 3];
        let y = this.particles.geometry.attributes.position.array[i * 3 + 1];
        let z = this.particles.geometry.attributes.position.array[i * 3 + 2];

        if (
          y < min_height ||
          Math.abs(x) > this.radius - 1 ||
          Math.abs(z) > this.radius - 1
        ) {
          this.particles.geometry.attributes.position.array[i * 3] = Math.floor(
            (Math.random() - 0.5) * (this.radius * 1.7)
          );
          this.particles.geometry.attributes.position.array[i * 3 + 1] =
            Math.floor(Math.random() * 5 + this.Parameters.clouds_min_height);
          this.particles.geometry.attributes.position.array[i * 3 + 2] =
            Math.floor((Math.random() - 0.5) * (this.radius * 1.7));
          this.particles.geometry.attributes.velocity.array[i * 3] =
            (Math.random() - 0.5) * 0.05;
          this.particles.geometry.attributes.velocity.array[i * 3 + 1] =
            (Math.random() - 0.05) * -0.05 - 0.01;
          this.particles.geometry.attributes.velocity.array[i * 3 + 2] =
            (Math.random() - 0.5) * 0.05;
          this.particles.geometry.attributes.position.needsUpdate = true;
          continue;
        }

        this.particles.geometry.attributes.position.array[i * 3] =
          x + this.particles.geometry.attributes.velocity.array[i * 3];
        this.particles.geometry.attributes.position.array[i * 3 + 1] =
          y + this.particles.geometry.attributes.velocity.array[i * 3 + 1];
        this.particles.geometry.attributes.position.array[i * 3 + 2] =
          z + this.particles.geometry.attributes.velocity.array[i * 3 + 2];

        this.particles.geometry.attributes.position.needsUpdate = true;
      }
    }
  }

  public addToScene(scene): void {
    let stoneGeo: THREE.BufferGeometry = new THREE.BoxGeometry(0, 0, 0);
    let dirtGeo: THREE.BufferGeometry = new THREE.BoxGeometry(0, 0, 0);
    let dirt2Geo: THREE.BufferGeometry = new THREE.BoxGeometry(0, 0, 0);
    let sandGeo: THREE.BufferGeometry = new THREE.BoxGeometry(0, 0, 0);
    let grassGeo: THREE.BufferGeometry = new THREE.BoxGeometry(0, 0, 0);
    let martianSandGeo: THREE.BufferGeometry = new THREE.BoxGeometry(0, 0, 0);
    let snowGeo: THREE.BufferGeometry = new THREE.BoxGeometry(0, 0, 0);
    let features: THREE.Group = new THREE.Group();
    let items: THREE.Group = new THREE.Group();

    for (let i = 0; i < this.tiles.length; i++) {
      let tileGeometries = this.tiles[i].getHexTileGeometry();
      stoneGeo = BufferGeometryUtils.mergeGeometries([
        stoneGeo,
        tileGeometries[0],
      ]);
      dirtGeo = BufferGeometryUtils.mergeGeometries([
        dirtGeo,
        tileGeometries[1],
      ]);
      dirt2Geo = BufferGeometryUtils.mergeGeometries([
        dirt2Geo,
        tileGeometries[2],
      ]);
      sandGeo = BufferGeometryUtils.mergeGeometries([
        sandGeo,
        tileGeometries[3],
      ]);
      grassGeo = BufferGeometryUtils.mergeGeometries([
        grassGeo,
        tileGeometries[4],
      ]);
      martianSandGeo = BufferGeometryUtils.mergeGeometries([
        martianSandGeo,
        tileGeometries[5],
      ]);
      snowGeo = BufferGeometryUtils.mergeGeometries([
        snowGeo,
        tileGeometries[6],
      ]);

      features.add(tileGeometries[7]);
      items.add(tileGeometries[8]);
    }

    let stoneMesh = new THREE.Mesh(
      stoneGeo,
      new THREE.MeshStandardMaterial({
        color: 0x888888,
        flatShading: true,
      })
    );

    let dirtMesh = new THREE.Mesh(
      dirtGeo,
      new THREE.MeshStandardMaterial({
        color: 0x8b4513,
        flatShading: true,
      })
    );

    let dirt2Mesh = new THREE.Mesh(
      dirt2Geo,
      new THREE.MeshStandardMaterial({
        color: 0x8b4543,
        flatShading: true,
      })
    );

    let sandMesh = new THREE.Mesh(
      sandGeo,
      new THREE.MeshStandardMaterial({
        color: 0xfada5e,
        flatShading: true,
      })
    );

    let grassMesh = new THREE.Mesh(
      grassGeo,
      new THREE.MeshStandardMaterial({
        color: 0x85bb65,
        flatShading: true,
      })
    );

    let martianSandMesh = new THREE.Mesh(
      martianSandGeo,
      new THREE.MeshStandardMaterial({
        color: 0xf4a460,
        flatShading: true,
      })
    );

    let snowMesh = new THREE.Mesh(
      snowGeo,
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        flatShading: true,
      })
    );

    let waterMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(17, 17, this.Parameters.max_height * 0.2, 50),
      new THREE.MeshPhysicalMaterial({
        color: 0x55aaff,
        transparent: true,
        transmission: 0.9,
        opacity: 0.5,
        ior: 1.4,
        reflectivity: 0.5,
        metalness: 0.02,
        roughness: 1,
        thickness: 1.5,
      })
    );
    waterMesh.receiveShadow = true;
    waterMesh.position.set(0, this.Parameters.max_height * 0.11, 0);

    let islandContainerMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(
        this.radius + 2,
        this.radius + 2,
        this.Parameters.max_height * 0.25,
        1,
        6,
        true
      ),
      new THREE.MeshPhysicalMaterial({
        color: 0x888888,
        roughness: 1,
        side: THREE.DoubleSide,
      })
    );
    islandContainerMesh.receiveShadow = true;
    islandContainerMesh.position.set(0, this.Parameters.max_height * 0.125, 0);

    let islandFloorMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(
        this.radius + 2,
        this.radius + 2,
        this.Parameters.max_height * 0.1,
        6
      ),
      new THREE.MeshStandardMaterial({
        color: 0x888888,
        flatShading: true,
        side: THREE.DoubleSide,
      })
    );
    islandFloorMesh.receiveShadow = true;
    islandFloorMesh.position.set(0, this.Parameters.max_height * 0.02, 0);

    let island = new THREE.Group();
    island.add(
      stoneMesh,
      dirtMesh,
      dirt2Mesh,
      sandMesh,
      grassMesh,
      martianSandMesh,
      snowMesh,
      islandContainerMesh,
      islandFloorMesh,
      features,
      items
    );

    if (this.Parameters.water) {
      island.add(waterMesh);
    }

    if (this.Parameters.clouds) {
      island.add(this.getClouds());
    }

    if (this.Parameters.weather === Weather.Snowy) {
      this.particles = this.getSnow();
      island.add(this.particles);
    }

    scene.add(island);
  }

  distanceToPoint(x, y, z): number {
    return Math.sqrt(
      Math.pow(this.x - x, 2) +
        Math.pow(this.y - y, 2) +
        Math.pow(this.z - z, 2)
    );
  }
}
