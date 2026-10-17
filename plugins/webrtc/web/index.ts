// zinc:webrtc in the browser (docs/targets/web.md, "Plugins"): the module is the page's own WebRTC. RTCPeerConnection, RTCDataChannel, RTCRtpSender and the rest
// are the browser's classes under the names index.ts gives them, so a program that runs on a desktop runs here, with the browser's codecs, its echo
// cancellation and its hardware encoders. What Zinc adds to the Web API stays: the video and audio tracks of a call read like a camera and a microphone
// (`track.camera` is a RemoteVideo, `track.microphone` a RemoteAudio), which zinc:camera and zinc:microphone install on MediaStreamTrack.
// A browser without WebRTC loads the module all the same; constructing one of its classes throws ZnUnsupported.
import 'zinc:camera';
import 'zinc:microphone';

const g: any = globalThis;
function api(name: string): any {
  if (g[name]) return g[name];
  return function () { throw new g.ZnUnsupported(name, 'this browser has no WebRTC'); };
}

export const RTCPeerConnection = api('RTCPeerConnection'), RTCSessionDescription = api('RTCSessionDescription'), RTCIceCandidate = api('RTCIceCandidate');
export const RTCPeerConnectionIceEvent = api('RTCPeerConnectionIceEvent'), RTCDataChannelEvent = api('RTCDataChannelEvent'), RTCTrackEvent = api('RTCTrackEvent');
export const RTCDataChannel = api('RTCDataChannel'), RTCRtpSender = api('RTCRtpSender'), RTCRtpReceiver = api('RTCRtpReceiver'), RTCRtpTransceiver = api('RTCRtpTransceiver');
// the stats of getStats() are the browser's report (a Map of dictionaries with the W3C field names); these names are types in Zinc
export const RTCStats = undefined, RTCRtpCodec = undefined, RTCRtpCapabilities = undefined, RTCRtpEncodingParameters = undefined, RTCRtpSendParameters = undefined;
export const RTCRtpReceiveParameters = undefined, RTCRtpTransceiverInit = undefined, RTCIceServer = undefined, RTCConfiguration = undefined, RTCSessionDescriptionInit = undefined;
export const RTCIceCandidateInit = undefined, RTCDataChannelInit = undefined;
/** The peer's video and audio as `track.camera` and `track.microphone` read them (zinc:camera's Camera, zinc:microphone's Microphone). */
export const RemoteVideo = undefined, RemoteAudio = undefined;
