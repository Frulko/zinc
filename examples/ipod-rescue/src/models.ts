export class Device {
  id: string = ''; name: string = ''; mode: string = ''; connection: string = '';
  filesystem: string = ''; scheme: string = ''; size: number = 0; blockSize: number = 0;
  model: string = ''; firmware: string = ''; identity: string = ''; physical: string = '';
  evidence: string[] = []; warnings: string[] = [];
}
export class RecoveryPlan {
  filesystem: string = ''; firmware: string = ''; sha256: string = '';
  executable: boolean = false; simulated: boolean = false;
  blockers: string[] = []; notes: string[] = [];
}
export class Firmware {
  name: string = ''; sha256: string = ''; size: number = 0; warning: string = ''; entries: i32 = 0;
}
export class LogEntry {
  stage: string; message: string; level: string; elapsed: string; detail: string;
  constructor(stage: string, message: string, level: string, elapsed: string, detail: string = '') {
    this.stage = stage; this.message = message; this.level = level; this.elapsed = elapsed; this.detail = detail;
  }
}
export class RecoveryStep {
  id: string; title: string; status: string = 'pending';
  constructor(id: string, title: string) { this.id = id; this.title = title; }
}
export function steps(): RecoveryStep[] {
  return [new RecoveryStep('identify', 'Identifier la cible'), new RecoveryStep('backup', 'Protéger les données'),
    new RecoveryStep('inputs', 'Valider les images'), new RecoveryStep('dfu', 'Attendre le DFU'),
    new RecoveryStep('wtf', 'Premier étage'), new RecoveryStep('recovery', 'Mode disque de secours'),
    new RecoveryStep('firmware', 'Réinstaller le firmware'), new RecoveryStep('format', 'Recréer le volume'),
    new RecoveryStep('verify', 'Vérifier le démarrage')];
}
