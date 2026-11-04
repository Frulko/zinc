import { startLive } from '../figma-live/viewer';
import { Scene } from '../figma-live/scene';
import { HouseController } from './controller';
startLive((scene: Scene): void => { new HouseController(scene); });
