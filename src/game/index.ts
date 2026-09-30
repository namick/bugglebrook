// Public surface of the sim core. The renderer imports from here.
export * from './commands';
export * from './constants';
export * from './events';
export { dizzySeconds } from './systems/bugAi';
export * from './sim';
export { EventBus } from './core/events';
export { FixedStepper, SIM_DT, SIM_HZ } from './core/loop';
export { Rng } from './core/rng';
export type { EntityId, EntityKind, BugMode, BugBrain, Needs } from './core/entities';
export { BUG_MODES } from './core/entities';
export { Terrain } from './world/terrain';
export { CONTENT, areaAt, worldWidth, validateContent } from './data';
export type { AreaDef, BugDef, ItemDef, NeedId, VoiceProfile } from './data';
export { SAVE_VERSION } from './save/schema';
export type { SaveFile, SaveMeta, ViewSave, WorldCounters, WorldSave } from './save/schema';
export { POCKET_SLOTS, STACK_MAX } from './systems/pocket';
export type { PocketState } from './systems/pocket';
export { loadSaveFile, SaveError } from './save/migrations';
