import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";
import { CapsuleCollider, CapsuleColliderOptions } from "./Colliders";
import { RelativeSpringSimulator } from "./physics/SpringSimulation/RelativeSpringSimulator";
import { VectorSpringSimulator } from "./physics/SpringSimulation/VectorSpringSimulator";
import { Idle } from "./CharacterStates/Idle";
import * as CANNON from "cannon-es";
import Tile from "./Tile";
import { World } from "./World";
import * as Utils from "./Utils";
import { ICharacterState } from "./CharacterStates/ICharacterState";

const characterHeight = 0.6;

export class KeyBinding {
  public eventCodes: string[];
  public isPressed: boolean = false;
  public justPressed: boolean = false;
  public justReleased: boolean = false;

  constructor(...code: string[]) {
    this.eventCodes = code;
  }
}

export class Character extends THREE.Object3D {
  public state: ICharacterState;
  public mixer: THREE.AnimationMixer;
  public manager: THREE.LoadingManager;
  public actions: { [action: string]: KeyBinding };
  public animations: any[]; // Walk, Run, Idle
  public model: THREE.Group;
  public height: number = 0.6;

  // Movement
  public velocity: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public velocityTarget: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public velocityInfluence: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public acceleration: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public decceleration: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public input: any;

  public movementSpeed: number = 1.0;
  public angularVelocity: number = 0.0;
  public orientation: THREE.Vector3 = new THREE.Vector3(0, 0, 1);
  public orientationTarget: THREE.Vector3 = new THREE.Vector3(0, 0, 1);
  public collider: CapsuleCollider;
  public defaultVelocitySimulatorDamping: number = 0.8;
  public defaultVelocitySimulatorMass: number = 60;
  public defaultRotationSimulatorDamping: number = 0.5;
  public defaultRotationSimulatorMass: number = 10;
  public viewVector: THREE.Vector3;
  public velocityIsAdditive: boolean = false;
  public groundImpactData: THREE.Vector3 = new THREE.Vector3();

  // Raycasting
  public rayResult: CANNON.RaycastResult = new CANNON.RaycastResult();
  public rayHasHit: boolean = false;
  public rayCastlength: number = 0.5;
  public wantsTojump: boolean = false;
  public raycastBox: THREE.Mesh;

  public world: World;

  public physicsEnabled: boolean = true;
  public rotationSimulator: any;
  public velocitySimulator: any;

  constructor(world: World) {
    super();
    this.Init(world);
  }

  public Init(world: World): void {
    this.world = world;
    this.decceleration = new THREE.Vector3(-0.0005, -0.0001, -5.0);
    this.acceleration = new THREE.Vector3(1, 0.25, 50.0);

    this.velocitySimulator = new VectorSpringSimulator(
      60,
      this.defaultVelocitySimulatorMass,
      this.defaultVelocitySimulatorDamping
    );
    this.rotationSimulator = new RelativeSpringSimulator(
      60,
      this.defaultRotationSimulatorMass,
      this.defaultRotationSimulatorDamping
    );

    this.viewVector = new THREE.Vector3();

    this.actions = {
      up: new KeyBinding("KeyW"),
      down: new KeyBinding("KeyS"),
      left: new KeyBinding("KeyA"),
      right: new KeyBinding("KeyD"),
      jump: new KeyBinding("Space"),
      use: new KeyBinding("KeyE"),
      enter: new KeyBinding("KeyF"),
      primary: new KeyBinding("Mouse0"),
      secondary: new KeyBinding("Mouse1"),
    };

    this.collider = new CapsuleCollider(
      new CapsuleColliderOptions(1, new CANNON.Vec3(0, 10, 0), 0.6, 0.25, 0.3)
    );

    // Raycast debug
    const boxGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const boxMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    this.raycastBox = new THREE.Mesh(boxGeo, boxMat);
    this.raycastBox.visible = true;

    this.LoadModels();

    this.setPhysicsEnabled(true);

    this.setState(new Idle(this));
  }

  public LoadModels() {
    const loader = new FBXLoader();
    loader.setPath("./assets/models/zombie/");
    loader.load("mremireh_o_desbiens.fbx", (fbx) => {
      fbx.scale.setScalar(0.005);
      fbx.position.set(0, 10, 0);
      fbx.traverse(function (object: any) {
        if (object.isMesh) object.castShadow = true;
      });

      this.model = fbx;
      this.world.scene.add(this.model);

      this.mixer = new THREE.AnimationMixer(this.model);

      this.manager = new THREE.LoadingManager();

      const OnLoad = (animName: string, anim: any) => {
        const clip = anim.animations[0];
        const action = this.mixer.clipAction(clip);

        this.animations[animName] = {
          clip: clip,
          action: action,
        };
      };

      const loader = new FBXLoader(this.manager);
      loader.setPath("./assets/models/zombie/");
      loader.load("walk.fbx", (a) => {
        OnLoad("Walk", a);
      });
      loader.load("run.fbx", (a) => {
        OnLoad("Run", a);
      });
      loader.load("idle.fbx", (a) => {
        OnLoad("Idle", a);
      });
      loader.load("dance.fbx", (a) => {
        OnLoad("Dance", a);
      });
    });
  }

  public setPhysicsEnabled(enabled: boolean): void {
    this.physicsEnabled = enabled;

    if (enabled) {
      this.world.physicsWorld.addBody(this.collider.body);
    } else {
      this.world.physicsWorld.removeBody(this.collider.body);
    }
  }

  public setPosition(position: THREE.Vector3): void {
    this.model.position.copy(position);

    if (this.physicsEnabled)
      this.collider.body.position.copy(
        new CANNON.Vec3(position.x, position.y, position.z)
      );
  }

  public resetVelocity(): void {
    this.velocity = new THREE.Vector3(0, 0, 0);

    this.collider.body.velocity = new CANNON.Vec3(0, 0, 0);
  }

  public setVelocityTarget(velocity: THREE.Vector3): void {
    this.velocityTarget = velocity;
  }

  public setOrientationTarget(orientation: THREE.Vector3): void {
    this.orientationTarget = orientation;
  }

  public resetOrientation(): void {
    this.orientation = new THREE.Vector3(0, 0, 1);
  }

  public syncModel(): void {
    this.lookAt(
      this.position.x + this.orientation.x,
      this.position.y + this.orientation.y,
      this.position.z + this.orientation.z
    );
    this.model.translateX(this.collider.body.position.x - this.model.position.x);
    this.model.translateY(this.collider.body.position.y - this.model.position.y - characterHeight);
    this.model.translateZ(this.collider.body.position.z - this.model.position.z);
    console.log(this.model.position);
  }

  public jump(): void {
    this.wantsTojump = true;
  }

  public handleKeyboardEvent(
    event: KeyboardEvent,
    code: string,
    pressed: boolean
  ): void {
    for (const action in this.actions) {
      if (this.actions.hasOwnProperty(action)) {
        const binding = this.actions[action];
        if (binding.eventCodes.indexOf(code) !== -1)
          this.triggerAction(action, pressed);
      }
    }
  }

  public triggerAction(actionName: string, value: boolean): void {
    // Get action and set it's parameters
    let action = this.actions[actionName];

    if (action.isPressed !== value) {
      // Set value
      action.isPressed = value;

      // Reset the 'just' attributes
      action.justPressed = false;
      action.justReleased = false;

      // Set the 'just' attributes
      if (value) action.justPressed = true;
      else action.justReleased = true;

      // hande action
      this.state.onInputChange();

      // Reset the 'just' attributes
      action.justPressed = false;
      action.justReleased = false;
    }
  }

  public getFeetPosition(): THREE.Vector3 {
    return new THREE.Vector3(
      this.collider.body.position.x,
      this.collider.body.position.y - characterHeight,
      this.collider.body.position.z
    );
  }

  public distanceFromFeetToTopOfTileBelow(currentTile: Tile) {
    const topOfTile = new THREE.Vector3(
      currentTile.position.x,
      currentTile.position.y,
      currentTile.height + 0.5
    );
    const distance = this.getFeetPosition().distanceTo(topOfTile);
    return distance;
  }

  public update(timeInSeconds: number) {
    this.state?.update(timeInSeconds);

    if (this.physicsEnabled) {
      this.springMovement(timeInSeconds);
      this.springRotation(timeInSeconds);
      this.syncModel();
    }
    if (this.mixer !== undefined) this.mixer.update(timeInSeconds);

    // Sync physics/graphics
    if (this.physicsEnabled) {
      this.position.set(
        this.collider.body.interpolatedPosition.x,
        this.collider.body.interpolatedPosition.y,
        this.collider.body.interpolatedPosition.z
      );
    } else {
      let newPos = new THREE.Vector3();
      // this.getWorldPosition(newPos);

      this.collider.body.position.copy(
        new CANNON.Vec3(newPos.x, newPos.y, newPos.z)
      );
      this.collider.body.interpolatedPosition.copy(
        new CANNON.Vec3(newPos.x, newPos.y, newPos.z)
      );
    }

    this.updateMatrixWorld();
  }

  public springMovement(timeStep: number): void {
    // Simulator
    this.velocitySimulator.target.copy(this.velocityTarget);
    this.velocitySimulator.simulate(timeStep);

    // Update values
    this.velocity.copy(this.velocitySimulator.position);
    this.acceleration.copy(this.velocitySimulator.velocity);
  }

  public springRotation(timeStep: number): void {
    // Spring rotation
    // Figure out angle between current and target orientation
    let angle = Utils.getSignedAngleBetweenVectors(
      this.orientation,
      this.orientationTarget
    );

    // Simulator
    this.rotationSimulator.target = angle;
    this.rotationSimulator.simulate(timeStep);
    let rot = this.rotationSimulator.position;

    // Updating values
    this.orientation.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    this.angularVelocity = this.rotationSimulator.velocity;
  }

  public getLocalMovementDirection(): THREE.Vector3 {
    const positiveX = this.actions.right.isPressed ? -1 : 0;
    const negativeX = this.actions.left.isPressed ? 1 : 0;
    const positiveZ = this.actions.up.isPressed ? 1 : 0;
    const negativeZ = this.actions.down.isPressed ? -1 : 0;

    return new THREE.Vector3(
      positiveX + negativeX,
      0,
      positiveZ + negativeZ
    ).normalize();
  }

  public setState(state: ICharacterState): void {
    this.state = state;
    this.state.onInputChange();
  }

  public setVelocityInfluence(x: number, y: number = x, z: number = x): void {
    this.velocityInfluence.set(x, y, z);
  }

  public setAnimation(clipName: string, fadeIn: number): number {
    if (this.mixer !== undefined) {
      // gltf
      let clip = THREE.AnimationClip.findByName(this.animations, clipName);

      let action = this.mixer.clipAction(clip);
      if (action === null) {
        console.error(`Animation ${clipName} not found!`);
        return 0;
      }

      this.mixer.stopAllAction();
      action.fadeIn(fadeIn);
      action.play();

      return action.getClip().duration;
    }
    return -1;
  }
}
