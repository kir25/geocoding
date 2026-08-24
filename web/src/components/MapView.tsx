import { useEffect } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import type { GeocodeResult } from '../api/types';

/**
 * Leaflet resolves its default marker images from a path that assumes a plain
 * <script> include, so under a bundler they 404.
 *
 * Defining an icon explicitly rather than patching Icon.Default: the default
 * prepends its auto-detected imagePath to whatever URL you give it, which
 * doubles up the bundled asset path and yields a broken image. A plain L.Icon
 * uses the URLs as given.
 */
const PIN = new L.Icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

/** Centre of the contiguous US, so the first view shows the whole dataset. */
const INITIAL_CENTER: [number, number] = [39.5, -98.35];
const INITIAL_ZOOM = 4;
const SELECTED_ZOOM = 12;

interface Props {
  selected: GeocodeResult | null;
  onMapClick: (lat: number, lng: number) => void;
}

/** Moves the view when the parent's selection changes. */
function PanTo({ selected }: { selected: GeocodeResult | null }) {
  const map = useMap();

  useEffect(() => {
    if (!selected) return;

    const { lat, lng } = selected.geometry.location;
    map.flyTo([lat, lng], Math.max(map.getZoom(), SELECTED_ZOOM), {
      duration: 0.8,
    });
  }, [selected, map]);

  return null;
}

function ClickHandler({ onMapClick }: { onMapClick: Props['onMapClick'] }) {
  useMapEvents({
    click: (event) => onMapClick(event.latlng.lat, event.latlng.lng),
  });

  return null;
}

export function MapView({ selected, onMapClick }: Props) {
  const location = selected?.geometry.location;

  return (
    <MapContainer
      className="map"
      center={INITIAL_CENTER}
      zoom={INITIAL_ZOOM}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <ClickHandler onMapClick={onMapClick} />
      <PanTo selected={selected} />

      {location && (
        <Marker position={[location.lat, location.lng]} icon={PIN}>
          <Popup>
            <strong>{selected?.formatted_address}</strong>
            {selected?.distance_meters !== undefined && (
              <>
                <br />
                <span className="popup__distance">
                  {formatDistance(selected.distance_meters)} from the point you
                  clicked
                </span>
              </>
            )}
          </Popup>
        </Marker>
      )}
    </MapContainer>
  );
}

function formatDistance(meters: number): string {
  return meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toFixed(1)} km`;
}
