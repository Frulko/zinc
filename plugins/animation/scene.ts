/** Optional scene bridge: static scene readers do not link animation just to load a model. */
import { Node, mat4 } from 'zinc:3d';
import { SceneRevision, SceneRecord, SceneAsset } from 'zinc:3d/scene';
import { SkinnedModel, AnimationPlayer, JointSocket, AnimationEvent } from 'zinc:animation';

export class AnimatedScene extends SceneRevision {
  animations = new Map<string, AnimationPlayer>();
  sockets = new Map<string, JointSocket>();
  private prepared = new Map<string, AnimationPlayer>();
  private preparedSockets = new Map<string, JointSocket>();
  constructor() {
    super();
    this.skinFactory = (record: SceneRecord, asset: SceneAsset, file: string): Node => {
      const model = new SkinnedModel(file);
      try {
        const events: AnimationEvent[] = [];
        if (asset.events !== undefined) for (const event of asset.events) events.push(event);
        const player = new AnimationPlayer(model,events);
        player.pose();
        if (asset.sockets !== undefined) for (const source of asset.sockets) {
          const socket = new JointSocket(model,source.joint);
          if (!model.joint(source.joint,mat4())) throw new Error('animation: missing socket joint '+source.joint);
          socket.position=source.translation.slice(); model.add(socket);
          this.preparedSockets.set(record.id+'/'+source.name,socket);
        }
        this.prepared.set(record.id,player);
        return model;
      } catch(e) { model.dispose(); throw e; }
    };
    this.skinDisposer = (node: Node): void => { (node as SkinnedModel).dispose(); };
  }
  override reload(text: string, base: string): boolean {
    this.prepared=new Map<string,AnimationPlayer>(); this.preparedSockets=new Map<string,JointSocket>();
    const sceneId=this.document===null?'':this.document.id;
    const identities = new Map<string,string>();
    if (this.document !== null) for (const n of this.document.nodes) if(n.asset !== null) identities.set(n.id,n.asset);
    if (!super.reload(text,base)) { this.prepared.clear(); this.preparedSockets.clear(); return false; }
    const current = this.document;
    if (current !== null && current.id===sceneId) for (const n of current.nodes) {
      const old=this.animations.has(n.id)?this.animations.get(n.id):undefined, next=this.prepared.has(n.id)?this.prepared.get(n.id):undefined;
      if (old !== undefined && next !== undefined && identities.get(n.id)===n.asset) {
        old.replace(next.model); old.events=next.events; this.prepared.set(n.id,old);
      }
    }
    this.animations=this.prepared; this.sockets=this.preparedSockets;
    return true;
  }
  override dispose(): void { super.dispose(); this.animations.clear(); this.sockets.clear(); this.prepared.clear(); this.preparedSockets.clear(); }
}
