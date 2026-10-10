// Worker-side relay wiring (CHA-31): the Durable Object lives in relay/worker.js
// and needs exactly two values that cannot live in the entry module. The
// protocol itself is shared with the desktop client, so it lives in
// src/core/room-relay.mjs (which ships in the installer; this directory does
// not) and is re-exported here for the Worker and its tests.

import {MAX_RELAY_MEMBERS} from '../src/core/room-relay.mjs';

export {MAX_RELAY_MEMBERS,hashPin,validateRelayHello,relayWelcome,relayJoin,relayLeave,sanitizeRelayState,frameTooLarge} from '../src/core/room-relay.mjs';
export {RELAY_PING,RELAY_PONG} from '../src/core/room-relay.mjs';

export const MAX_SOCKETS=MAX_RELAY_MEMBERS+8;
export const HANDSHAKE_TIMEOUT_MS=10000;
// Per connection; store the returned bucket in the hibernation attachment.
// The burst permits all late-join announcements, then bounds sustained fan-out.
export const RELAY_BURST_FRAMES=16,RELAY_FRAMES_PER_SECOND=4;
export const RELAY_BURST_BYTES=16*65536,RELAY_BYTES_PER_SECOND=2*65536;
export function takeRelayBudget(previous,bytes,now=Date.now()){
 const elapsed=previous?Math.max(0,now-previous.at)/1000:0;
 const frames=Math.min(RELAY_BURST_FRAMES,(previous?.frames??RELAY_BURST_FRAMES)+elapsed*RELAY_FRAMES_PER_SECOND);
 const remaining=Math.min(RELAY_BURST_BYTES,(previous?.bytes??RELAY_BURST_BYTES)+elapsed*RELAY_BYTES_PER_SECOND);
 return frames>=1&&remaining>=bytes?{at:now,frames:frames-1,bytes:remaining-bytes}:null;
}
