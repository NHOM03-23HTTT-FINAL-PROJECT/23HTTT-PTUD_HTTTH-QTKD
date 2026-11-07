import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from '@/components/button/Button';
import { Dialog } from '@/components/feedback/Dialog';
import { Icon } from '@/components/icon/Icon';
import './AreaCoordinatePickerModal.css';

const DEFAULT_CENTER: [number, number] = [10.76215, 106.78694]; // Tân Cảng Cát Lái
const DEFAULT_ZOOM = 15;

const PIN_SVG = `
<svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.35));">
  <path d="M16 0C7.16344 0 0 7.16344 0 16C0 28 16 42 16 42C16 42 32 28 32 16C32 7.16344 24.8366 0 16 0Z" fill="#EA580C"/>
  <circle cx="16" cy="16" r="6" fill="#FFFFFF"/>
  <circle cx="16" cy="16" r="3" fill="#EA580C"/>
</svg>
`;

export function parseCoordinates(val: string): [number, number] | null {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 2) {
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return [lat, lng];
    }
  }
  return null;
}

export function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export interface AreaCoordinatePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (coordinates: string) => void;
  initialCoordinates?: string | null;
  parentCoordinates?: string | null;
  parentName?: string | null;
}

export function AreaCoordinatePickerModal({
  isOpen,
  onClose,
  onConfirm,
  initialCoordinates,
  parentCoordinates,
  parentName,
}: AreaCoordinatePickerModalProps) {
  if (!isOpen) return null;

  return (
    <CoordinatePickerContent
      onClose={onClose}
      onConfirm={onConfirm}
      initialCoordinates={initialCoordinates}
      parentCoordinates={parentCoordinates}
      parentName={parentName}
    />
  );
}

function CoordinatePickerContent({
  onClose,
  onConfirm,
  initialCoordinates,
  parentCoordinates,
  parentName,
}: Omit<AreaCoordinatePickerModalProps, 'isOpen'>) {
  const [inputValue, setInputValue] = useState(() => initialCoordinates?.trim() || '');
  const [isTyping, setIsTyping] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const skipPanSyncRef = useRef(false);

  const parsedCurrent = parseCoordinates(inputValue);
  const parsedParent = parentCoordinates ? parseCoordinates(parentCoordinates) : null;

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initialCenter = parsedCurrent || parsedParent || DEFAULT_CENTER;
    const initialZoom = parsedCurrent ? 16 : parsedParent ? 15 : DEFAULT_ZOOM;

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    const pinIcon = L.divIcon({
      className: 'area-map-marker-pin',
      html: PIN_SVG,
      iconSize: [32, 42],
      iconAnchor: [16, 42],
    });

    function createOrUpdateMarker(coords: [number, number]) {
      if (markerRef.current) {
        markerRef.current.setLatLng(coords);
      } else {
        const marker = L.marker(coords, {
          icon: pinIcon,
          draggable: true,
        }).addTo(map);

        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          const text = formatCoordinates(pos.lat, pos.lng);
          skipPanSyncRef.current = true;
          setInputValue(text);
        });

        markerRef.current = marker;
      }
    }

    // Place initial marker if initialCoordinates is valid
    if (parsedCurrent) {
      createOrUpdateMarker(parsedCurrent);
    }

    // Map click event
    map.on('click', (e: L.LeafletMouseEvent) => {
      const coords: [number, number] = [e.latlng.lat, e.latlng.lng];
      const text = formatCoordinates(coords[0], coords[1]);
      skipPanSyncRef.current = true;
      setInputValue(text);
      createOrUpdateMarker(coords);
    });

    mapInstanceRef.current = map;

    // Fix map rendering in modal
    const invalidateTimer = window.setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      window.clearTimeout(invalidateTimer);
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync typed/pasted coordinate back to map (debounced)
  useEffect(() => {
    if (skipPanSyncRef.current) {
      skipPanSyncRef.current = false;
      return;
    }

    setIsTyping(true);
    const debounceTimer = window.setTimeout(() => {
      setIsTyping(false);
      const coords = parseCoordinates(inputValue);
      const map = mapInstanceRef.current;
      if (!coords || !map) return;

      if (markerRef.current) {
        markerRef.current.setLatLng(coords);
      } else {
        const pinIcon = L.divIcon({
          className: 'area-map-marker-pin',
          html: PIN_SVG,
          iconSize: [32, 42],
          iconAnchor: [16, 42],
        });
        const marker = L.marker(coords, {
          icon: pinIcon,
          draggable: true,
        }).addTo(map);

        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          const text = formatCoordinates(pos.lat, pos.lng);
          skipPanSyncRef.current = true;
          setInputValue(text);
        });

        markerRef.current = marker;
      }

      map.flyTo(coords, Math.max(map.getZoom(), 15), { duration: 0.5 });
    }, 400);

    return () => {
      window.clearTimeout(debounceTimer);
    };
  }, [inputValue]);

  function handleClear() {
    setInputValue('');
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
  }

  function handleConfirm() {
    const trimmed = inputValue.trim();
    if (trimmed) {
      const valid = parseCoordinates(trimmed);
      if (valid) {
        onConfirm(formatCoordinates(valid[0], valid[1]));
        onClose();
      }
    } else {
      onConfirm('');
      onClose();
    }
  }

  const isInvalid = inputValue.trim() !== '' && !parsedCurrent;
  const canConfirm = !isInvalid;

  return (
    <Dialog
      title="Chọn tọa độ trên bản đồ"
      icon="map-pin"
      tone="info"
      width={760}
      initialFocus="last"
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          {inputValue && (
            <Button variant="secondary" onClick={handleClear}>
              Xóa ghim
            </Button>
          )}
          <Button disabled={!canConfirm} onClick={handleConfirm}>
            {parsedCurrent ? 'Xác nhận & Điền tọa độ' : 'Để trống & Đóng'}
          </Button>
        </>
      }
    >
      <div className="coordinate-picker__intro">
        <p className="coordinate-picker__instructions">
          Nhấp chuột trực tiếp trên bản đồ hoặc kéo chốt vị trí màu cam để lấy tọa độ. Bạn cũng có thể dán hoặc gõ tọa độ vào ô bên dưới để bản đồ tự chuyển tới vị trí.
        </p>

        <div className="coordinate-picker__input-bar">
          <div className="coordinate-picker__input-wrap">
            <input
              type="text"
              className="coordinate-picker__input"
              value={inputValue}
              placeholder="VD: 10.76215, 106.78694"
              onChange={(e) => setInputValue(e.target.value)}
              aria-label="Tọa độ GPS"
            />
            {inputValue && (
              <button
                type="button"
                className="coordinate-picker__clear-btn"
                title="Xóa tọa độ đang nhập"
                onClick={handleClear}
              >
                <Icon name="x" size={14} />
              </button>
            )}
          </div>

          {parsedCurrent ? (
            <p className="coordinate-picker__status coordinate-picker__status--valid">
              <Icon name="check" size={14} />
              <span>
                {isTyping ? 'Đang cập nhật vị trí…' : `Tọa độ hợp lệ: Vĩ độ ${parsedCurrent[0].toFixed(5)}, Kinh độ ${parsedCurrent[1].toFixed(5)}`}
              </span>
            </p>
          ) : isInvalid ? (
            <p className="coordinate-picker__status coordinate-picker__status--invalid">
              <Icon name="alert" size={14} />
              <span>Định dạng tọa độ không hợp lệ. Vui lòng nhập: [Vĩ độ, Kinh độ] (VD: 10.76215, 106.78694)</span>
            </p>
          ) : parsedParent ? (
            <p className="coordinate-picker__status coordinate-picker__status--info">
              <Icon name="info" size={14} />
              <span>Đang hiển thị vị trí gần khu vực cha ({parentName || 'Cấp cha'}). Nhấp vào bản đồ để chọn tọa độ mới.</span>
            </p>
          ) : (
            <p className="coordinate-picker__status coordinate-picker__status--hint">
              <Icon name="info" size={14} />
              <span>Đang hiển thị trung tâm tại Tân Cảng Cát Lái. Nhấp vào bản đồ để chọn vị trí.</span>
            </p>
          )}
        </div>
      </div>

      <div className="coordinate-picker__map-wrap">
        <div ref={mapContainerRef} className="coordinate-picker__map" />
        <div className="coordinate-picker__map-badge">
          <Icon name="map-pin" size={14} />
          <span>Click hoặc kéo ghim để chọn vị trí</span>
        </div>
      </div>
    </Dialog>
  );
}

