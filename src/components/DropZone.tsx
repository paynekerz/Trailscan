import { useRef, useState } from 'react';

interface Props {
  onFile: (xml: string, fileName: string) => void;
  onError: (message: string) => void;
}

export function DropZone({ onFile, onError }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const process = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.gpx')) {
      onError(`"${file.name}" is not a .gpx file.`);
      return;
    }
    const xml = await file.text();
    onFile(xml, file.name);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const onDragLeave = () => setDragging(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) process(file);
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) process(file);
    e.target.value = '';
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Drop a GPX file or click to browse"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-12 py-16 text-center transition-colors ${
        dragging
          ? 'border-primary bg-surface-elevated'
          : 'border-border-subtle hover:border-primary/50 hover:bg-surface-elevated/50'
      }`}
    >
      <svg
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-on-surface-variant"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      <p className="font-medium text-on-surface">Drop a .gpx file here</p>
      <p className="text-sm text-on-surface-variant">or click to browse</p>
      <input
        ref={inputRef}
        type="file"
        accept=".gpx,application/gpx+xml"
        className="sr-only"
        onChange={onChange}
        aria-hidden="true"
        tabIndex={-1}
      />
    </div>
  );
}
