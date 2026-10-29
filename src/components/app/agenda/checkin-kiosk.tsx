'use client';
import * as React from 'react';
import { Camera, CameraOff, CheckCircle2, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { checkInByToken, checkInByPin } from '@/lib/actions/schedule';
import { PatientPicker, type PickedPatient } from './patient-picker';

type Done = { patient: string; at: string };

export function CheckinKiosk() {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = React.useState(false);
  const [supported, setSupported] = React.useState(true);
  const [last, setLast] = React.useState<Done | null>(null);
  const [history, setHistory] = React.useState<Done[]>([]);
  const [picked, setPicked] = React.useState<PickedPatient[]>([]);
  const [pin, setPin] = React.useState('');
  const busy = React.useRef(false);

  const success = (name: string) => {
    const d = { patient: name, at: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) };
    setLast(d); setHistory((h) => [d, ...h].slice(0, 20));
    toast.success(`Check-in de ${name} registrado.`);
    setTimeout(() => setLast(null), 4000);
  };

  React.useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    const BD = (window as any).BarcodeDetector;
    if (!BD) { setSupported(false); setScanning(false); return; }
    const detector = new BD({ formats: ['qr_code'] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        const loop = async () => {
          if (videoRef.current && !busy.current) {
            try {
              const codes = await detector.detect(videoRef.current);
              const raw = codes?.[0]?.rawValue as string | undefined;
              if (raw && raw.startsWith('pilatesflow:checkin:')) {
                busy.current = true;
                const r = await checkInByToken(raw);
                if (r.ok) success(r.data!.patient); else toast.error(r.error);
                setTimeout(() => { busy.current = false; }, 2500);
              }
            } catch { /* quadro sem código */ }
          }
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        toast.error('Não foi possível acessar a câmera. Verifique a permissão do navegador.');
        setScanning(false);
      }
    })();
    return () => { cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); };
  }, [scanning]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border bg-card p-5 shadow-soft">
        <h2 className="mb-3 font-semibold">QR Code</h2>
        {!supported && <p className="mb-3 rounded-lg bg-warning-soft p-3 text-sm">Este navegador não suporta leitura de QR Code pela câmera. Use o Chrome/Edge atualizado ou o PIN.</p>}
        <div className="relative aspect-video overflow-hidden rounded-xl bg-muted">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline aria-label="Câmera para leitura do QR Code" />
          {!scanning && <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Câmera desligada</div>}
          {last && <div className="absolute inset-0 flex flex-col items-center justify-center bg-success/90 text-white" role="status"><CheckCircle2 className="h-12 w-12" /><p className="mt-2 text-xl font-semibold">{last.patient}</p><p>Bom treino!</p></div>}
        </div>
        <Button className="mt-3" variant={scanning ? 'outline' : 'default'} onClick={() => setScanning((s) => !s)}>{scanning ? <><CameraOff /> Desligar câmera</> : <><Camera /> Ler QR Code</>}</Button>
      </section>
      <section className="space-y-6">
        <div className="rounded-2xl border bg-card p-5 shadow-soft">
          <h2 className="mb-3 font-semibold">PIN</h2>
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            if (!picked[0]) { toast.error('Selecione o aluno.'); return; }
            const r = await checkInByPin(picked[0].id, pin);
            if (r.ok) { success(r.data!.patient); setPicked([]); setPin(''); } else toast.error(r.error);
          }}>
            <PatientPicker value={picked} onChange={setPicked} multiple={false} />
            <Field label="PIN do aluno" htmlFor="ck-pin"><Input id="ck-pin" inputMode="numeric" maxLength={6} type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} /></Field>
            <Button type="submit"><KeyRound /> Fazer check-in</Button>
          </form>
        </div>
        <div className="rounded-2xl border bg-card p-5 shadow-soft">
          <h2 className="mb-3 font-semibold">Check-ins desta sessão</h2>
          {history.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum ainda.</p> : <ul className="space-y-1 text-sm">{history.map((h, i) => <li key={i}>{h.at} — {h.patient}</li>)}</ul>}
        </div>
      </section>
    </div>
  );
}
