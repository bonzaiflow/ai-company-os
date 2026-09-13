import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "@huggingface/transformers";
import wavefile from "wavefile";

/** Default: tiny multilingual Whisper (ONNX via Hugging Face Hub). Override with WHISPER_MODEL. */
const DEFAULT_MODEL = "Xenova/whisper-tiny";

type AsrPipeline = (
  audio: Float32Array,
  opts?: Record<string, unknown>
) => Promise<{ text?: string } | string>;

let transcriberPromise: Promise<AsrPipeline> | null = null;

function modelId(): string {
  return (process.env.WHISPER_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
}

async function getTranscriber(): Promise<AsrPipeline> {
  if (!transcriberPromise) {
    const id = modelId();
    transcriberPromise = pipeline("automatic-speech-recognition", id, {
      dtype: "q8",
    }).then((p) => p as unknown as AsrPipeline);
  }
  return transcriberPromise;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr?.on("data", (d) => {
      err += String(d);
    });
    child.on("error", (e) => {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            "ffmpeg not found — install it (e.g. brew install ffmpeg) to convert mic audio for local Whisper"
          )
        );
      } else reject(e);
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${code}): ${err.slice(-400)}`));
    });
  });
}

/** Decode arbitrary mic blob (webm/mp4/…) → 16 kHz mono Float32 for Whisper. */
async function audioToFloat32(buf: Buffer, mime: string): Promise<Float32Array> {
  const ext =
    mime.includes("mp4") || mime.includes("m4a")
      ? "mp4"
      : mime.includes("ogg")
        ? "ogg"
        : mime.includes("wav")
          ? "wav"
          : "webm";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-co-asr-"));
  const input = path.join(dir, `in.${ext}`);
  const output = path.join(dir, "out.wav");
  try {
    fs.writeFileSync(input, buf);
    if (ext === "wav") {
      // still normalize rate/channels via ffmpeg when available; else wavefile alone
      try {
        await runFfmpeg(["-y", "-i", input, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", output]);
      } catch {
        fs.copyFileSync(input, output);
      }
    } else {
      await runFfmpeg(["-y", "-i", input, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", output]);
    }
    const wavBuf = fs.readFileSync(output);
    const wav = new wavefile.WaveFile(wavBuf);
    wav.toBitDepth("32f");
    wav.toSampleRate(16000);
    const raw = wav.getSamples(false) as Float32Array | Float64Array | (Float32Array | Float64Array)[];
    let channel: Float32Array | Float64Array;
    if (Array.isArray(raw)) {
      if (raw.length > 1) {
        const a = raw[0]!;
        const b = raw[1]!;
        const scale = Math.SQRT1_2;
        for (let i = 0; i < a.length; i++) a[i] = scale * (Number(a[i]) + Number(b[i] ?? 0));
      }
      channel = raw[0]!;
    } else {
      channel = raw;
    }
    if (channel instanceof Float32Array) return channel;
    return Float32Array.from(channel);
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

export async function transcribeLocal(opts: {
  audio: Buffer;
  mimeType?: string;
}): Promise<{ text: string; model: string }> {
  const mime = (opts.mimeType ?? "audio/webm").split(";")[0]!.trim() || "audio/webm";
  const samples = await audioToFloat32(opts.audio, mime);
  if (!samples.length) throw new Error("empty audio after decode");
  const asr = await getTranscriber();
  const out = await asr(samples, {
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  const text = typeof out === "string" ? out : String(out?.text ?? "");
  return { text: text.trim(), model: modelId() };
}
