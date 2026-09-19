/** Pure local replay adapter: no inference, endpoint, credential, or network dependencies. */
import fs from 'node:fs';
import { createHash } from 'node:crypto';

export default class FrozenOutputReplayProvider {
  constructor(options = {}) {
    const body = fs.readFileSync(options.config.packetPath, 'utf8');
    const digest = createHash('sha256').update(body).digest('hex');
    if (digest !== options.config.packetHash) throw new Error('replay_packet_hash_mismatch');
    const packet = JSON.parse(body);
    this.records = new Map(packet.records.map((record) => [record.id, record]));
    if (this.records.size !== packet.records.length) throw new Error('duplicate_replay_record');
  }

  id() {
    return 'frozen-native-output-replay';
  }

  async callApi(_prompt, context = {}) {
    const record = this.records.get(context.vars?.replayId);
    if (!record) return { error: 'missing_frozen_replay_record' };
    const metadata = {
      replay: true,
      newModelCalls: 0,
      attackGeneration: false,
      originalRunId: record.originalRunId,
      originalRecordHash: record.originalRecordHash,
      originalRequestHash: record.requestHash,
      nativeRequestVersion: record.nativeRequestVersion,
      originalStatus: record.status,
      originalUsage: record.usage,
      originalLatencyMs: record.latencyMs,
      originalNativeValidationError: record.nativeValidationError,
    };
    if (record.status !== 'ok') return { error: record.error || record.status, metadata, cost: 0 };
    // Preserve null/malformed output too: Promptfoo must retain it as a failed row.
    return { output: record.output, metadata, cost: 0 };
  }
}
