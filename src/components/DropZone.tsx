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
      className={`group flex cursor-pointer flex-col items-center gap-4 rounded-lg border-2 border-dashed bg-surface-container-low px-12 py-16 text-center transition-colors ${
        dragging
          ? 'border-secondary-container bg-surface-container'
          : 'border-outline-variant hover:border-secondary-container'
      }`}
    >
      <div
        className={`rounded-full p-6 transition-colors ${
          dragging
            ? 'bg-secondary-container/10 text-secondary-container'
            : 'bg-surface-variant text-on-surface-variant group-hover:bg-secondary-container/10 group-hover:text-secondary-container'
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
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-xl font-semibold text-on-surface">Drop a .gpx file here</p>
        <p className="text-on-surface-variant">or click to browse</p>
      </div>
      <div className="label-caps mt-2 flex items-center gap-2 rounded border border-primary/30 bg-primary-container/20 px-3 py-1 text-primary">
        <svg
          aria-hidden="true"
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        Parsed entirely in your browser
      </div>
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
