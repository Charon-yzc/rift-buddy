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
