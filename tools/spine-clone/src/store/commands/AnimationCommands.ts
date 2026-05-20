// Create / Delete / Rename animation commands.
// Deletion preserves the full Animation object for undo restoration.

import type { Command } from './Command.js';
import type { DocumentStore } from '../DocumentStore.js';
import type { Animation } from '../../core/types.js';

export class CreateAnimationCommand implements Command {
  readonly label: string;
  readonly createdAt = performance.now();

  constructor(readonly name: string) {
    this.label = `Create animation "${name}"`;
  }

  do(store: DocumentStore): void {
    if (store.skeleton.animations[this.name]) {
      throw new Error(`animation already exists: ${this.name}`);
    }
    store.skeleton.animations[this.name] = {
      name: this.name, duration: 0, bones: {}, slots: {},
    };
    store._emitAnimationChanged();
  }

  undo(store: DocumentStore): void {
    delete store.skeleton.animations[this.name];
    if (store.currentAnimation === this.name) {
      store._setCurrentAnimationInternal(undefined);
    }
    store._emitAnimationChanged();
  }
}

export class DeleteAnimationCommand implements Command {
  readonly label: string;
  readonly createdAt = performance.now();
  private snapshot: Animation | undefined;
  private wasCurrent = false;

  constructor(readonly name: string) {
    this.label = `Delete animation "${name}"`;
  }

  do(store: DocumentStore): void {
    const anim = store.skeleton.animations[this.name];
    if (!anim) throw new Error(`animation not found: ${this.name}`);
    this.snapshot = JSON.parse(JSON.stringify(anim));
    this.wasCurrent = store.currentAnimation === this.name;
    delete store.skeleton.animations[this.name];
    if (this.wasCurrent) store._setCurrentAnimationInternal(undefined);
    store._emitAnimationChanged();
  }

  undo(store: DocumentStore): void {
    if (!this.snapshot) return;
    store.skeleton.animations[this.name] = JSON.parse(JSON.stringify(this.snapshot));
    if (this.wasCurrent) store._setCurrentAnimationInternal(this.name);
    store._emitAnimationChanged();
  }
}

export class RenameAnimationCommand implements Command {
  readonly label: string;
  readonly createdAt = performance.now();
  private wasCurrent = false;

  constructor(readonly fromName: string, readonly toName: string) {
    this.label = `Rename "${fromName}" → "${toName}"`;
  }

  do(store: DocumentStore): void {
    const anim = store.skeleton.animations[this.fromName];
    if (!anim) throw new Error(`animation not found: ${this.fromName}`);
    if (store.skeleton.animations[this.toName]) {
      throw new Error(`animation already exists: ${this.toName}`);
    }
    anim.name = this.toName;
    store.skeleton.animations[this.toName] = anim;
    delete store.skeleton.animations[this.fromName];
    this.wasCurrent = store.currentAnimation === this.fromName;
    if (this.wasCurrent) store._setCurrentAnimationInternal(this.toName);
    store._emitAnimationChanged();
  }

  undo(store: DocumentStore): void {
    const anim = store.skeleton.animations[this.toName];
    if (!anim) return;
    anim.name = this.fromName;
    store.skeleton.animations[this.fromName] = anim;
    delete store.skeleton.animations[this.toName];
    if (this.wasCurrent) store._setCurrentAnimationInternal(this.fromName);
    store._emitAnimationChanged();
  }
}
