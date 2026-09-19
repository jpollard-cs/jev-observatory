/** Preloaded only in the replay child process: make any accidental network path fail closed. */
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { syncBuiltinESMExports } from 'node:module';

let blockedAttempts = 0;
const blockedCallSites = [];
let localIpcConnections = 0;
const blocked = () => {
  blockedAttempts++;
  if (blockedCallSites.length < 10)
    blockedCallSites.push(new Error().stack.split('\n').slice(2, 10));
  throw new Error('OFFLINE_REPLAY_NETWORK_DISABLED');
};
globalThis.fetch = blocked;
http.request = http.get = https.request = https.get = blocked;
tls.connect = blocked;
const originalSocketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const normalized = Array.isArray(args[0]) ? args[0] : args;
  const endpoint = normalized[0];
  const socketPath = typeof endpoint === 'string' ? endpoint : endpoint?.path;
  if (typeof socketPath === 'string' && socketPath.startsWith('/')) {
    localIpcConnections++;
    return originalSocketConnect.apply(this, args);
  }
  return blocked();
};
syncBuiltinESMExports();
process.on('exit', () => {
  const unexpectedAttempts = blockedCallSites.filter(
    (site) => !site.some((line) => line.includes('/telemetry-')),
  ).length;
  if (process.env.REPLAY_NETWORK_AUDIT)
    fs.writeFileSync(
      process.env.REPLAY_NETWORK_AUDIT,
      JSON.stringify({
        networkDisabled: true,
        blockedAttempts,
        unexpectedAttempts,
        localIpcConnections,
        blockedCallSites,
      }) + '\n',
    );
});
