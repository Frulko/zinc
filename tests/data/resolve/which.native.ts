// a platform file that imports its own stem gets the generic one, and wraps it
import { which as generic } from './which';
export const which: string = 'which.native.ts+' + generic;
