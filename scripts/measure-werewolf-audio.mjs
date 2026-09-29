import { fileURLToPath } from 'node:url';
import { WEREWOLF_VOICE_CATALOG } from '../packages/shared/src/game/werewolfVoiceManifest.ts';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const VOICE_DIR = path.resolve('packages/client/public/werewolf-voice');
const OUTPUT_JSON = path.resolve('output/werewolf-audio-manifest.json');

/**
 * Parse RIFF/WAV format cleanly without assuming 44-byte header.
 * Skips unknown chunks and respects word alignment.
 */
export function parseWav(buffer) {
  if (buffer.length < 12) throw new Error('File too short for RIFF header');
  const riff = buffer.toString('ascii', 0, 4);
  const wave = buffer.toString('ascii', 8, 12);
  if (riff !== 'RIFF' || wave !== 'WAVE') {
    throw new Error(`Not a valid RIFF/WAVE file: ${riff}/${wave}`);
  }

  let offset = 12;
  let fmt = null;
  let dataSize = null;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkDataOffset = offset + 8;

    if (chunkId === 'fmt ') {
      const audioFormat = buffer.readUInt16LE(chunkDataOffset);
      const numChannels = buffer.readUInt16LE(chunkDataOffset + 2);
      const sampleRate = buffer.readUInt32LE(chunkDataOffset + 4);
      const byteRate = buffer.readUInt32LE(chunkDataOffset + 8);
      const blockAlign = buffer.readUInt16LE(chunkDataOffset + 12);
      const bitsPerSample = buffer.readUInt16LE(chunkDataOffset + 14);
      fmt = { audioFormat, numChannels, sampleRate, byteRate, blockAlign, bitsPerSample };
    } else if (chunkId === 'data') {
      // 0xFFFFFFFF or out-of-bounds indicates streaming WAV where data extends to EOF
      if (chunkSize === 0xffffffff || chunkDataOffset + chunkSize > buffer.length) {
        dataSize = buffer.length - chunkDataOffset;
      } else {
        dataSize = chunkSize;
      }
    }

    // RIFF chunks are 2-byte aligned
    const paddedSize = chunkSize + (chunkSize % 2);
    offset = chunkDataOffset + paddedSize;
  }

  if (!fmt || dataSize === null) {
    throw new Error('Missing fmt or data chunk in WAV file');
  }

  const durationMs = Math.round((dataSize / fmt.byteRate) * 1000);
  return { ...fmt, dataSize, durationMs };
}

function getSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Public cue mappings to relative file paths.
 * Private cues (such as seer result, witch death/cure/poison target, day death announcements)
 * are strictly prohibited from this public manifest.
 */
const PUBLIC_CUE_FILES = Object.fromEntries(Object.values(WEREWOLF_VOICE_CATALOG).map(e => [e.cue,e.file]));

function main() {
  if (!fs.existsSync(VOICE_DIR)) {
    console.error(`Voice directory not found: ${VOICE_DIR}`);
    process.exit(1);
  }

  const manifest = {
    measuredAt: new Date().toISOString(),
    baseDir: 'packages/client/public/werewolf-voice',
    publicCues: {},
  };

  for (const [cueKey, relPath] of Object.entries(PUBLIC_CUE_FILES)) {
    const fullPath = path.join(VOICE_DIR, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Public cue file missing: ${fullPath} (cue: ${cueKey})`);
    }
    const buf = fs.readFileSync(fullPath);
    const wavInfo = parseWav(buf);
    const hash = getSha256(buf);

    manifest.publicCues[cueKey] = {
      cue: cueKey,
      file: relPath.replace(/\\/g, '/'),
      sha256: hash,
      durationMs: wavInfo.durationMs,
      sampleRate: wavInfo.sampleRate,
      channels: wavInfo.numChannels,
    };
  }

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`Measured ${Object.keys(manifest.publicCues).length} catalog recordings (including disabled assets).`);
  console.log(`Manifest written to: ${OUTPUT_JSON}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
