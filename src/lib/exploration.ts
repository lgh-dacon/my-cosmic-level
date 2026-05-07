import exifr from "exifr";

export interface PhotoRecord {
  id: string;
  url: string;
  thumbnailUrl?: string; // Base64 JPEG — DB 저장용, 세션 간 복원
  fileName: string;
  takenAt?: number; // epoch ms
  lat?: number;
  lon?: number;
  city?: string;
  country?: string;
  continent?: string;
  zodiacId?: string; // 별자리 ID (aries, cancer, ...)
}

export interface ExplorationStats {
  level: number;          // 1..100
  coverage: number;       // 0..100 (%)
  score: number;          // unbounded score (점수)
  citiesCount: number;
  countriesCount: number;
  continentsCount: number;
  distanceKm: number;
  globalRank: number;     // mock rank
  topPercent: number;     // mock top %
}

/* ---------- Thumbnail (Canvas → Base64 JPEG) ---------- */
function generateThumbnail(blob: Blob, maxSize = 200): Promise<string> {
  return new Promise((resolve, reject) => {
    const blobUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(blobUrl);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error("thumbnail 생성 실패")); };
    img.src = blobUrl;
  });
}

/* ---------- HEIC conversion ---------- */
function isHeicByName(file: File): boolean {
  return (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    /\.(heic|heif)$/i.test(file.name)
  );
}

async function toJpeg(file: File): Promise<Blob> {
  const { heicTo, isHeic } = await import("heic-to");
  // Magic-byte check — more reliable than MIME/extension
  const confirmed = await isHeic(file).catch(() => false);
  if (!confirmed && !isHeicByName(file)) return file;
  return await heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
}

/* ---------- EXIF extraction ---------- */
export async function extractPhotoMeta(file: File): Promise<PhotoRecord> {
  const id = `${file.name}-${file.size}-${file.lastModified}`;

  let displayBlob: Blob = file;
  if (isHeicByName(file)) {
    try {
      displayBlob = await toJpeg(file);
      if (import.meta.env.DEV) console.log("[HEIC] 변환 성공", file.name, displayBlob.type, displayBlob.size);
    } catch (err) {
      const detail = err instanceof Error
        ? { message: err.message, name: err.name, stack: err.stack }
        : { value: String(err) };
      if (import.meta.env.DEV) console.warn("[HEIC] 변환 실패", file.name, detail);
    }
  }

  const url = URL.createObjectURL(displayBlob);

  let thumbnailUrl: string | undefined;
  try {
    thumbnailUrl = await generateThumbnail(displayBlob);
  } catch {
    // 썸네일 생성 실패 시 무시 — url은 현재 세션에서만 동작
  }

  let lat: number | undefined;
  let lon: number | undefined;
  let takenAt: number | undefined;

  try {
    // Dedicated GPS parse — most reliable across formats
    const gps = await exifr.gps(file).catch(() => null);
    if (gps && typeof gps.latitude === "number" && typeof gps.longitude === "number") {
      lat = gps.latitude;
      lon = gps.longitude;
    }

    // Full parse for date + fallback GPS fields
    const data = await exifr
      .parse(file, [
        "latitude",
        "longitude",
        "GPSLatitude",
        "GPSLongitude",
        "GPSLatitudeRef",
        "GPSLongitudeRef",
        "DateTimeOriginal",
        "CreateDate",
        "ModifyDate",
      ])
      .catch(() => null);

    if (data) {
      if (lat == null && typeof data.latitude === "number") lat = data.latitude;
      if (lon == null && typeof data.longitude === "number") lon = data.longitude;

      // Manual conversion if only raw DMS arrays are present
      if ((lat == null || lon == null) && Array.isArray(data.GPSLatitude) && Array.isArray(data.GPSLongitude)) {
        const toDec = (dms: number[], ref?: string) => {
          const [d = 0, m = 0, s = 0] = dms;
          const sign = ref === "S" || ref === "W" ? -1 : 1;
          return sign * (d + m / 60 + s / 3600);
        };
        lat = toDec(data.GPSLatitude, data.GPSLatitudeRef);
        lon = toDec(data.GPSLongitude, data.GPSLongitudeRef);
      }

      const dt = data.DateTimeOriginal || data.CreateDate || data.ModifyDate;
      if (dt instanceof Date) takenAt = dt.getTime();
    }

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("[EXIF]", file.name, { lat, lon, hasGps: !!gps, raw: data });
    }
  } catch (err) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn("[EXIF] parse failed", file.name, err);
    }
  }

  const rec: PhotoRecord = { id, url, thumbnailUrl, fileName: file.name, lat, lon, takenAt };
  if (lat != null && lon != null) {
    const geo = await reverseGeocode(lat, lon);
    rec.city = geo.city;
    rec.country = geo.country;
    rec.continent = geo.continent;
  }
  return rec;
}

/* ---------- Reverse geocoding (Nominatim) ---------- */
function continentFromCoords(lat: number, lon: number): string {
  if (lat > 35 && lon > -10 && lon < 60) return "유럽";
  if (lat > -10 && lat < 55 && lon >= 60 && lon < 180) return "아시아";
  if (lat > 15 && lon < -50) return "북아메리카";
  if (lat <= 15 && lat > -60 && lon < -30) return "남아메리카";
  if (lat < 35 && lon > -20 && lon < 55) return "아프리카";
  if (lat < 0 && lon > 110) return "오세아니아";
  return "기타";
}

export async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<{ city: string; country: string; continent: string }> {
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&zoom=10&lat=${lat}&lon=${lon}&accept-language=ko`,
    );
    if (resp.ok) {
      const data = await resp.json();
      const addr = data.address ?? {};

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log("[Geocode]", { lat, lon, addr, display: data.display_name });
      }

      // Priority: city-level admin units, then sub-areas. Skip POI names (amenity).
      const city =
        addr.city ?? addr.town ?? addr.village ?? addr.municipality ??
        addr.city_district ?? addr.borough ?? addr.suburb ??
        addr.neighbourhood ?? addr.quarter ??
        addr.county ?? addr.state ??
        `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
      const country = addr.country ?? "—";
      return { city, country, continent: continentFromCoords(lat, lon) };
    }
  } catch (err) {
    if (import.meta.env.DEV) console.warn("[Geocode] failed", err);
  }
  return {
    city: `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
    country: "—",
    continent: continentFromCoords(lat, lon),
  };
}

/* ---------- Distance ---------- */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ---------- Coverage scoring ----------
 * Combines unique cities, country diversity, continent diversity, and total distance.
 */
export function computeStats(photos: PhotoRecord[]): ExplorationStats {
  const located = photos.filter((p) => p.lat != null && p.lon != null);
  const cities = new Set(located.map((p) => p.city).filter(Boolean) as string[]);
  const countries = new Set(located.map((p) => p.country).filter(Boolean) as string[]);
  const continents = new Set(located.map((p) => p.continent).filter(Boolean) as string[]);

  // total distance: sum nearest-neighbor distances ordered by takenAt
  const ordered = [...located].sort((a, b) => (a.takenAt ?? 0) - (b.takenAt ?? 0));
  let distanceKm = 0;
  for (let i = 1; i < ordered.length; i++) {
    distanceKm += haversineKm(ordered[i - 1].lat!, ordered[i - 1].lon!, ordered[i].lat!, ordered[i].lon!);
  }

  // Coverage: weighted, capped 0..100
  const cityScore = Math.min(cities.size / 20, 1) * 35;        // up to 35
  const countryScore = Math.min(countries.size / 10, 1) * 25;  // up to 25
  const continentScore = Math.min(continents.size / 6, 1) * 25;// up to 25
  const distScore = Math.min(distanceKm / 40000, 1) * 15;      // up to 15
  const coverage = Math.round(cityScore + countryScore + continentScore + distScore);

  const level = Math.max(1, Math.min(100, Math.round(coverage)));
  // 1000점 만점 점수 체계
  // - 도시 다양성: 50개 = 250점 (도시당 5점)
  // - 국가 다양성: 30개 = 300점 (국가당 10점)
  // - 대륙 다양성: 6개 거주 대륙 = 250점 (대륙당 ~42점)
  // - 이동 거리: 40,000km(지구 둘레) = 200점
  const cityPts = Math.min(cities.size / 50, 1) * 250;
  const countryPts = Math.min(countries.size / 30, 1) * 300;
  const continentPts = Math.min(continents.size / 6, 1) * 250;
  const distancePts = Math.min(distanceKm / 40000, 1) * 200;
  const score = Math.round(cityPts + countryPts + continentPts + distancePts);
  // Mock global rank inversely correlated with coverage
  const globalRank = Math.max(1, Math.round(50000 * (1 - coverage / 100) + 50));
  const topPercent = Math.max(1, Math.round(100 - coverage));

  return {
    level,
    coverage,
    score,
    citiesCount: cities.size,
    countriesCount: countries.size,
    continentsCount: continents.size,
    distanceKm: Math.round(distanceKm),
    globalRank,
    topPercent,
  };
}
