'use client';

import { useEffect, useState } from 'react';
import QRCodeLib from 'qrcode';

interface Props {
  value: string;
  size?: number;
}

export default function QRCode({ value, size = 160 }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    QRCodeLib.toDataURL(value, {
      width: size,
      margin: 1,
      color: {
        dark: '#f0eef5',
        light: '#00000000', // transparent background
      },
      errorCorrectionLevel: 'M',
    }).then(setDataUrl).catch(() => setDataUrl(null));
  }, [value, size]);

  if (!dataUrl) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- generated data: URL; next/image can't optimize it
    <img
      src={dataUrl}
      alt={`QR code for ${value}`}
      width={size}
      height={size}
      className="rounded-lg"
    />
  );
}
