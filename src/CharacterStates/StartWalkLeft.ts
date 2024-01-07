/*
 	Slightly modified version of StartWalkLeft.ts byswift502.
	https://github.com/swift502/Sketchbook/blob/master/src/ts/characters/character_states/StartWalkLeft.ts
	Licensed under MIT License.
*/

import { StartWalkBase } from "./_stateLibrary";
import { Character } from "../Character";

export class StartWalkLeft extends StartWalkBase {
  constructor(character: Character) {
    super(character);
    this.animationLength = character.setAnimation("run_fwd", 0.1);
  }
}
