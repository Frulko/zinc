// Exit with live media workers: the native finish hook must join them before its registries disappear.
import { RTCPeerConnection, RemoteVideo, RemoteAudio } from 'zinc:webrtc';
import { navigator } from 'zinc:web';
import 'zinc:camera';
import 'zinc:microphone';
import { onFrame, quit } from 'zinc:gfx';

const sender = new RTCPeerConnection(), receiver = new RTCPeerConnection();
let video: RemoteVideo | null = null, audio: RemoteAudio | null = null;
sender.onicecandidate = e => { if (e.candidate !== null) receiver.addIceCandidate(e.candidate.toJSON()); };
receiver.onicecandidate = e => { if (e.candidate !== null) sender.addIceCandidate(e.candidate.toJSON()); };
receiver.ontrack = e => { if (e.track.kind === 'video') video = e.track.camera as RemoteVideo; else audio = e.track.microphone as RemoteAudio; };
async function start(): Promise<void> {
  const media = await navigator.mediaDevices.getUserMedia({ video: { width: 64, height: 48, frameRate: 15 }, audio: true });
  for (const track of media.getTracks()) sender.addTrack(track, media);
  const offer = await sender.createOffer(); await sender.setLocalDescription(offer); await receiver.setRemoteDescription(offer);
  const answer = await receiver.createAnswer(); await receiver.setLocalDescription(answer); await sender.setRemoteDescription(answer);
}
setTimeout(() => { throw new Error('No decoded media before shutdown'); }, 6000);
onFrame((_dt: number) => {
  const v = video, a = audio;
  if (v !== null && a !== null && v.frameIndex >= 4 && a.frameIndex > 0) {
    console.log('live video and audio; leaving peers open');
    quit();
  }
});
start();
