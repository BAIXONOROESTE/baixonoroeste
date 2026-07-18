import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, Video as VideoIcon, X, RefreshCw, Check, Square, Circle } from "lucide-react";

type Mode = "photo" | "video";
const MAX_VIDEO_SECONDS = 60;

export function CameraCaptureModal({
  open,
  onClose,
  onCapture,
}: {
  open: boolean;
  onClose: () => void;
  onCapture: (blob: Blob, ext: "jpg" | "webm" | "mp4", type: "foto" | "video") => Promise<void> | void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  const [mode, setMode] = useState<Mode>("photo");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [preview, setPreview] = useState<{ url: string; blob: Blob; ext: "jpg" | "webm" | "mp4"; type: "foto" | "video" } | null>(null);
  const [uploading, setUploading] = useState(false);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const startStream = async () => {
    setError(null);
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: mode === "video",
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (e: any) {
      setError("Não foi possível acessar a câmera. Verifique as permissões do navegador.");
    } finally {
      setStarting(false);
    }
  };

  // (Re)start stream when modal opens or mode changes (audio track differs).
  useEffect(() => {
    if (!open) return;
    setPreview(null);
    stopStream();
    startStream();
    return () => {
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  // Cleanup on close
  useEffect(() => {
    if (!open) {
      stopStream();
      recorderRef.current?.state === "recording" && recorderRef.current?.stop();
      recorderRef.current = null;
      setRecording(false);
      setElapsed(0);
      setPreview(null);
      setError(null);
    }
  }, [open]);

  // Recording timer
  useEffect(() => {
    if (!recording) return;
    const started = Date.now();
    const t = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setElapsed(s);
      if (s >= MAX_VIDEO_SECONDS) {
        stopRecording();
      }
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording]);

  const takePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        setPreview({ url, blob, ext: "jpg", type: "foto" });
      },
      "image/jpeg",
      0.9,
    );
  };

  const pickVideoMime = (): { mimeType: string; ext: "webm" | "mp4" } => {
    const candidates: Array<{ mimeType: string; ext: "webm" | "mp4" }> = [
      { mimeType: "video/webm;codecs=vp9,opus", ext: "webm" },
      { mimeType: "video/webm;codecs=vp8,opus", ext: "webm" },
      { mimeType: "video/webm", ext: "webm" },
      { mimeType: "video/mp4", ext: "mp4" },
    ];
    for (const c of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c.mimeType)) return c;
    }
    return { mimeType: "", ext: "webm" };
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    const { mimeType, ext } = pickVideoMime();
    chunksRef.current = [];
    try {
      const rec = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
      recorderRef.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || "video/webm" });
        const url = URL.createObjectURL(blob);
        setPreview({ url, blob, ext, type: "video" });
        setRecording(false);
        setElapsed(0);
      };
      rec.start();
      setRecording(true);
      setElapsed(0);
    } catch {
      setError("Não foi possível iniciar a gravação de vídeo neste navegador.");
    }
  };

  const stopRecording = () => {
    const rec = recorderRef.current;
    if (rec && rec.state === "recording") rec.stop();
  };

  const retake = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const confirm = async () => {
    if (!preview) return;
    setUploading(true);
    try {
      await onCapture(preview.blob, preview.ext, preview.type);
      URL.revokeObjectURL(preview.url);
      setPreview(null);
      onClose();
    } finally {
      setUploading(false);
    }
  };

  const switchMode = (m: Mode) => {
    if (recording) return;
    if (preview) {
      URL.revokeObjectURL(preview.url);
      setPreview(null);
    }
    setMode(m);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="p-0 max-w-full w-screen h-[100dvh] sm:h-[100dvh] sm:max-w-full rounded-none border-0 bg-black text-white gap-0 [&>button]:hidden">
        <div className="relative w-full h-full flex flex-col">
          {/* Top bar */}
          <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between p-3" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="rounded-full bg-black/60 backdrop-blur h-10 w-10 flex items-center justify-center border border-white/20"
            >
              <X className="h-5 w-5" />
            </button>
            {recording && (
              <div className="rounded-full bg-red-600/90 px-3 py-1 text-xs font-medium flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")} / 01:00
              </div>
            )}
            <div className="w-10" />
          </div>

          {/* Body */}
          <div className="relative flex-1 overflow-hidden bg-black">
            {error ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm">{error}</p>
                <Button variant="secondary" onClick={startStream}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Tentar novamente
                </Button>
              </div>
            ) : preview ? (
              preview.type === "foto" ? (
                <img src={preview.url} alt="Prévia" className="absolute inset-0 w-full h-full object-contain bg-black" />
              ) : (
                <video ref={previewVideoRef} src={preview.url} controls playsInline className="absolute inset-0 w-full h-full object-contain bg-black" />
              )
            ) : (
              <>
                <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                {starting && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm opacity-80">
                    Abrindo câmera…
                  </div>
                )}
              </>
            )}
            <canvas ref={canvasRef} hidden />
          </div>

          {/* Bottom controls */}
          <div
            className="bg-black/85 backdrop-blur border-t border-white/10 px-4 pt-3 space-y-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}
          >
            {!preview && !error && (
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className={`bg-white/10 border border-white/20 text-white ${mode === "photo" ? "ring-2 ring-white" : ""}`}
                  onClick={() => switchMode("photo")}
                  disabled={recording}
                >
                  <Camera className="h-4 w-4 mr-1.5" /> Tirar Foto
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className={`bg-white/10 border border-white/20 text-white ${mode === "video" ? "ring-2 ring-white" : ""}`}
                  onClick={() => switchMode("video")}
                  disabled={recording}
                >
                  <VideoIcon className="h-4 w-4 mr-1.5" /> Gravar Vídeo
                </Button>
              </div>
            )}

            {preview ? (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" className="bg-white/10 border border-white/20 text-white" onClick={retake} disabled={uploading}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  {preview.type === "foto" ? "Tirar novamente" : "Gravar novamente"}
                </Button>
                <Button onClick={confirm} disabled={uploading}>
                  <Check className="h-4 w-4 mr-2" />
                  {uploading ? "Enviando…" : preview.type === "foto" ? "Usar esta foto" : "Usar este vídeo"}
                </Button>
              </div>
            ) : (
              !error && (
                <div className="flex items-center justify-center">
                  {mode === "photo" ? (
                    <button
                      onClick={takePhoto}
                      disabled={starting}
                      aria-label="Capturar"
                      className="h-16 w-16 rounded-full bg-white flex items-center justify-center ring-4 ring-white/30 active:scale-95 transition disabled:opacity-40"
                    >
                      <Circle className="h-10 w-10 text-black" />
                    </button>
                  ) : recording ? (
                    <button
                      onClick={stopRecording}
                      aria-label="Parar"
                      className="h-16 w-16 rounded-full bg-red-600 flex items-center justify-center ring-4 ring-red-500/40 active:scale-95 transition"
                    >
                      <Square className="h-7 w-7 fill-white text-white" />
                    </button>
                  ) : (
                    <button
                      onClick={startRecording}
                      disabled={starting}
                      aria-label="Gravar"
                      className="h-16 w-16 rounded-full bg-white flex items-center justify-center ring-4 ring-white/30 active:scale-95 transition disabled:opacity-40"
                    >
                      <span className="h-6 w-6 rounded-full bg-red-600" />
                    </button>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
