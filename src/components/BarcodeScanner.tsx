import { useEffect, useRef } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { X } from "lucide-react";

export function BarcodeScanner({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let stop: (() => void) | null = null;
    (async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const back = devices.find((d) => /back|traseira|environment/i.test(d.label)) ?? devices[0];
        const controls = await reader.decodeFromVideoDevice(back?.deviceId, videoRef.current!, (result) => {
          if (result) { onScan(result.getText()); }
        });
        stop = () => controls.stop();
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { stop?.(); };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between p-3 text-white">
        <div className="text-sm">Aponte para o código de barras</div>
        <button onClick={onClose}><X className="h-6 w-6" /></button>
      </div>
      <video ref={videoRef} className="flex-1 w-full object-cover" />
      <div className="p-3 text-white text-xs text-center opacity-75">Segure firme; a leitura é automática.</div>
    </div>
  );
}
