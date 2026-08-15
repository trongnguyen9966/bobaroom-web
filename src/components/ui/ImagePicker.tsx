"use client";

import { useCallback, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";

interface ImagePickerProps {
  imageUrl: string | null;
  onImageSelected: (file: File) => void;
  onImageRemoved?: () => void;
  uploading?: boolean;
  size?: "sm" | "lg";
}

async function getCroppedBlob(imageSrc: string, crop: Area): Promise<Blob> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
    image.src = imageSrc;
  });

  const canvas = document.createElement("canvas");
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed"))),
      "image/jpeg",
      0.9,
    );
  });
}

export function ImagePicker({
  imageUrl,
  onImageSelected,
  onImageRemoved,
  uploading,
  size = "lg",
}: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Crop state
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const displayUrl = previewUrl || imageUrl;
  const isLarge = size === "lg";

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCropSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    e.target.value = "";
  };

  const handleCropConfirm = async () => {
    if (!cropSrc || !croppedAreaPixels) return;
    try {
      const blob = await getCroppedBlob(cropSrc, croppedAreaPixels);
      const file = new File([blob], "cropped.jpg", { type: "image/jpeg" });
      setPreviewUrl(URL.createObjectURL(blob));
      onImageSelected(file);
    } catch {
      // fallback: use original
    }
    URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  const handleCropCancel = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  const handleRemove = () => {
    setPreviewUrl(null);
    if (onImageRemoved) onImageRemoved();
  };

  return (
    <>
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`relative rounded-2xl overflow-hidden bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-300 hover:border-primary active:border-primary transition-colors ${
            isLarge ? "w-32 h-32" : "w-20 h-20"
          } ${uploading ? "opacity-60" : ""}`}
        >
          {displayUrl ? (
            <img
              src={displayUrl}
              alt="Product"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-1">
              <svg
                width={isLarge ? 32 : 20}
                height={isLarge ? 32 : 20}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-gray-400"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              {isLarge && (
                <span className="text-xs text-gray-400 font-medium">Thêm ảnh</span>
              )}
            </div>
          )}

          {uploading && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
              <div className="w-6 h-6 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </button>

        {displayUrl && !uploading && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-xs font-semibold text-primary px-3 py-1.5 rounded-lg hover:bg-blue-50 active:bg-blue-100"
            >
              Đổi ảnh
            </button>
            {onImageRemoved && (
              <button
                type="button"
                onClick={handleRemove}
                className="text-xs font-semibold text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-50 active:bg-red-100"
              >
                Xóa ảnh
              </button>
            )}
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleChange}
          className="hidden"
        />
      </div>

      {/* Crop modal */}
      {cropSrc && (
        <div className="fixed inset-0 z-[200] bg-black/80 flex flex-col">
          {/* Crop area */}
          <div className="flex-1 relative">
            <Cropper
              image={cropSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>

          {/* Zoom slider */}
          <div className="bg-black/60 px-6 py-3 flex items-center gap-4">
            <span className="text-white text-xs shrink-0">Thu nhỏ</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-primary h-2"
            />
            <span className="text-white text-xs shrink-0">Phóng to</span>
          </div>

          {/* Actions */}
          <div className="bg-black/60 px-4 pb-6 pt-2 flex gap-3 safe-area-bottom">
            <button
              onClick={handleCropCancel}
              className="flex-1 py-4 rounded-xl text-base font-bold text-white bg-gray-600 hover:bg-gray-500 active:bg-gray-400"
            >
              Hủy
            </button>
            <button
              onClick={handleCropConfirm}
              className="flex-1 py-4 rounded-xl text-base font-bold text-white bg-primary hover:bg-primary-hover active:bg-primary-hover"
            >
              Xác nhận
            </button>
          </div>
        </div>
      )}
    </>
  );
}
