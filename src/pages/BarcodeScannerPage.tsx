import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { Camera, CameraOff, Keyboard, ScanBarcode, CheckCircle2, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useSettings } from '@/contexts/SettingsContext';
import { createScannedBook } from '@/lib/bookService';
import { isPossibleIsbn, lookupBookByIsbn, normalizeIsbn, type LookedUpBook } from '@/lib/bookLookupService';
import { toast } from 'sonner';

export function BarcodeScannerPage() {
  const { settings, refreshSettings } = useSettings();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const processingRef = useRef(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [isbn, setIsbn] = useState('');
  const [processing, setProcessing] = useState(false);
  const [lastBook, setLastBook] = useState<(LookedUpBook & { bookNumber: string }) | null>(null);

  const stopCamera = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraActive(false);
  };

  useEffect(() => () => controlsRef.current?.stop(), []);

  const findAndAdd = async (rawValue: string) => {
    if (!settings || processingRef.current) return;
    const normalized = normalizeIsbn(rawValue);
    if (!isPossibleIsbn(normalized)) {
      toast.error('This barcode is not a 10 or 13 digit ISBN.');
      return;
    }
    processingRef.current = true;
    setProcessing(true);
    setIsbn(normalized);
    stopCamera();
    try {
      const details = await lookupBookByIsbn(normalized, settings);
      if (!details) {
        toast.error('No book details were found for this ISBN. Try another provider or add the book manually.');
        return;
      }
      const result = await createScannedBook({
        isbn: details.isbn,
        name: details.title,
        author: details.authors.join(', ') || null,
        category: details.category,
        source_of_acquisition: null,
        shelf_number: null,
        row_number: null,
        price: null,
      });
      if (result.error || !result.bookNumber) throw new Error(result.error ?? 'The book could not be added.');
      setLastBook({ ...details, bookNumber: result.bookNumber });
      setIsbn('');
      await refreshSettings();
      toast.success(`Book ${result.bookNumber} added to the library.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The book could not be added.');
    } finally {
      processingRef.current = false;
      setProcessing(false);
    }
  };

  const startCamera = async () => {
    if (!videoRef.current) return;
    setLastBook(null);
    try {
      const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 250 });
      controlsRef.current = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (result && !processingRef.current) void findAndAdd(result.getText());
      });
      setCameraActive(true);
    } catch (error) {
      setCameraActive(false);
      toast.error(error instanceof Error ? error.message : 'Camera access was not available.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Add Books by Barcode Scanner</h1>
        <p className="text-sm text-slate-500 mt-1">
          Scan an ISBN barcode or type the ISBN. Book details are looked up and the book is added automatically.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] gap-6">
        <Card className="p-6 space-y-5">
          <div className="relative overflow-hidden rounded-xl bg-slate-950 aspect-video flex items-center justify-center">
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            {!cameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-300 bg-slate-950">
                <ScanBarcode size={54} className="mb-3 text-blue-400" />
                <p className="text-sm">Camera preview will appear here</p>
              </div>
            )}
            {cameraActive && <div className="pointer-events-none absolute inset-x-[12%] top-1/2 h-0.5 bg-red-500 shadow-[0_0_10px_#ef4444]" />}
          </div>
          <div className="flex flex-wrap gap-3">
            {!cameraActive ? (
              <Button onClick={startCamera} disabled={processing}>
                <Camera size={17} /> Open Camera
              </Button>
            ) : (
              <Button variant="outline" onClick={stopCamera}>
                <CameraOff size={17} /> Stop Camera
              </Button>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Camera scanning requires HTTPS (or localhost) and browser camera permission. Hold the ISBN barcode steady inside the preview.
          </p>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Keyboard size={19} className="text-blue-600" />
              <h2 className="font-semibold text-slate-800">Enter ISBN manually</h2>
            </div>
            <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void findAndAdd(isbn); }}>
              <Input
                label="ISBN-10 or ISBN-13"
                inputMode="numeric"
                placeholder="9781234567890"
                value={isbn}
                onChange={(event) => setIsbn(event.target.value)}
                disabled={processing}
              />
              <Button type="submit" disabled={processing || !isbn.trim()} className="w-full">
                <ScanBarcode size={17} /> {processing ? 'Looking up and adding...' : 'Find and Add Book'}
              </Button>
            </form>
            <div className="mt-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
              Next book number: <strong>{settings?.next_book_number ?? 1}</strong>
            </div>
          </Card>

          {lastBook && (
            <Card className="p-6 border-emerald-200 bg-emerald-50/40">
              <div className="flex items-center gap-2 text-emerald-700 mb-4">
                <CheckCircle2 size={20} />
                <h2 className="font-semibold">Added as book {lastBook.bookNumber}</h2>
              </div>
              <div className="flex gap-4">
                {lastBook.coverUrl && <img src={lastBook.coverUrl} alt="Book cover" className="h-32 w-24 rounded object-cover shadow" />}
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold text-slate-800">{lastBook.title}</p>
                  <p className="text-sm text-slate-600">{lastBook.authors.join(', ') || 'Author unavailable'}</p>
                  <p className="text-xs text-slate-500">ISBN {lastBook.isbn}</p>
                  {lastBook.publisher && <p className="text-xs text-slate-500">{lastBook.publisher}{lastBook.publishedDate ? ` · ${lastBook.publishedDate}` : ''}</p>}
                  <p className="inline-flex items-center gap-1 text-xs text-blue-700"><ExternalLink size={12} /> {lastBook.source}</p>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
