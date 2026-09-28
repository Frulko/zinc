// PocketJS compatibility (@pocketjs/framework/solid/lifecycle)
import { onMount as solidOnMount, onCleanup as solidOnCleanup } from 'zinc:ui/solid';
export function onMount(fn: () => void): void { solidOnMount(fn); }
export function onCleanup(fn: () => void): void { solidOnCleanup(fn); }
