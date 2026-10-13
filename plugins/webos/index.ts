// zinc:webos — HP webOS 3 (HP TouchPad): the system's services from a Zinc program (docs/reports/hardware/hp-touchpad-webos.md).
// A program installed as a webOS application talks to the Luna bus with the rights of its id. Elsewhere isWebOS() is false and the calls
// answer false, so one program runs on a desktop and on the tablet.
import W from './native/webos.spec';

/** True when the program runs on webOS. */
export function isWebOS(): boolean { return W.available(); }
/** Sends a request to a service of the Luna bus ('palm://com.palm.applicationManager/launch') with its parameters, a JSON object as text.
 *  The answer is not waited for. False when it could not be sent. */
export function serviceCall(uri: string, params: string): boolean { return W.call(uri, params); }
/** Why the last serviceCall or launch answered false. */
export function lastError(): string { return W.error(); }
/** Starts (or brings to the front) an installed application by its id, with launch parameters as a JSON object. */
export function launch(appId: string, params: string = '{}'): boolean {
  return W.call('palm://com.palm.applicationManager/launch', `{"id":${JSON.stringify(appId)},"params":${params}}`);
}
