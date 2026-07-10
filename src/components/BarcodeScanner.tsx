import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { X, Keyboard, Zap, ZapOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function BarcodeScanner({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIdx, setDeviceIdx] = useState(0);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [manual, setManual] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;

    (async () => {
      try {
        const list = await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelled) return;
        setDevices(list);
        const backIdx = list.findIndex((d) => /back|traseira|environment|rear/i.test(d.label));
        const idx = backIdx >= 0 ? backIdx : Math.min(deviceIdx, Math.max(list.length - 1, 0));
        setDeviceIdx(idx);
        const chosen = list[idx];

        const controls = await reader.decodeFromVideoDevice(chosen?.deviceId, videoRef.current!, (result) => {
          if (result) {
            setFlash(true);
            setTimeout(() => setFlash(false), 200);
            onScan(result.getText());
          }
        });
        controlsRef.current = { stop: () => controls.stop() };

        // Pega o stream para tentar ligar lanterna.
        const stream = videoRef.current?.srcObject as MediaStream | null;
        streamRef.current = stream;
        const track = stream?.getVideoTracks?.()[0];
        const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
        if (caps.torch) setTorchSupported(true);
      } catch (e) {
        console.error("[BarcodeScanner]", e);
      }
    })();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceIdx]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet & { torch?: boolean }] });
      setTorchOn(next);
    } catch (e) {
      console.warn("torch:", e);
    }
  };

  const switchCamera = () => {
    if (devices.length < 2) return;
    setDeviceIdx((i) => (i + 1) % devices.length);
  };

  const submitManual = () => {
    const code = manualCode.trim();
    if (!code) return;
    onScan(code);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col">
      {/* Botão fechar bem visível (safe area iOS) */}
      <button
        onClick={onClose}
        aria-label="Fechar"
        className="absolute z-20 rounded-full bg-black/60 backdrop-blur h-11 w-11 flex items-center justify-center border border-white/20"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)", right: "12px" }}
      >
        <X className="h-6 w-6" />
      </button>

      {/* Vídeo */}
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />

        {/* Moldura de mira */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={`w-[80%] max-w-sm aspect-[4/2] rounded-2xl border-2 transition-colors ${
              flash ? "border-success" : "border-white/70"
            }`}
            style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)" }}
          />
        </div>

        <div
          className="absolute left-0 right-0 text-center text-xs opacity-80 px-4"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 20px)" }}
        >
          Aponte para o código de barras
        </div>
      </div>

      {/* Barra inferior */}
      <div
        className="bg-black/80 backdrop-blur border-t border-white/10 px-3 pt-3 space-y-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
      >
        {manual ? (
          <div className="flex gap-2">
            <Input
              autoFocus
              inputMode="text"
              placeholder="Digite/cole o código"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitManual()}
              className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
            />
            <Button onClick={submitManual} disabled={!manualCode.trim()}>OK</Button>
            <Button variant="secondary" onClick={() => setManual(false)}>Cancelar</Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant="secondary"
              className="bg-white/10 hover:bg-white/20 border border-white/20 text-white"
              onClick={() => setManual(true)}
            >
              <Keyboard className="h-4 w-4 mr-2" /> Digitar
            </Button>
            <Button
              variant="secondary"
              className="bg-white/10 hover:bg-white/20 border border-white/20 text-white disabled:opacity-40"
              onClick={toggleTorch}
              disabled={!torchSupported}
            >
              {torchOn ? <ZapOff className="h-4 w-4 mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
              {torchOn ? "Off" : "Luz"}
            </Button>
            <Button
              variant="secondary"
              className="bg-white/10 hover:bg-white/20 border border-white/20 text-white disabled:opacity-40"
              onClick={switchCamera}
              disabled={devices.length < 2}
            >
              <RefreshCw className="h-4 w-4 mr-2" /> Câmera
            </Button>
          </div>
        )}
        <div className="text-[11px] text-white/60 text-center">
          A leitura é automática. Se não conseguir, use “Digitar”.
        </div>
      </div>
    </div>
  );
}
