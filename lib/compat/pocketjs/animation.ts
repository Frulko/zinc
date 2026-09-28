// PocketJS compatibility (@pocketjs/framework/animation)
import { NodeRef, AnimateOptions, animate as uiAnimate, createNodeRef as uiRef } from 'zinc:ui/solid';
export function createNodeRef(): NodeRef { return uiRef(); }
export function animate(ref: NodeRef, prop: string, to: number, opts: AnimateOptions): Promise<void> { return uiAnimate(ref, prop, to, opts); }
