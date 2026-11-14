import { NextRequest, NextResponse } from "next/server";
import {
  CitySearchResult,
  WeatherData,
  WeatherDayForecast,
  WeatherIconKind,
} from "@/types/news";

export const dynamic = "force-dynamic";

function mapWmoWeather(
  code: number,
  isDay = true
): { label: string; icon: WeatherIconKind } {
  if (code === 0) {
    return { label: "Despejado", icon: isDay ? "sun" : "moon" };
  }
  if (code === 1 || code === 2) {
    return { label: "Poco nuboso", icon: isDay ? "cloud-sun" : "cloud" };
  }
  if (code === 3) {
    return { label: "Nublado", icon: "cloud" };
  }
  if (code === 45 || code === 48) {
    return { label: "Niebla", icon: "fog" };
  }
  if ([51, 53, 55, 56, 57].includes(code)) {
    return { label: "Llovizna", icon: "rain" };
  }
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return { label: "Lluvia", icon: "rain" };
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return { label: "Nieve", icon: "snow" };
  }
  if ([95, 96, 99].includes(code)) {
    return { label: "Tormenta", icon: "storm" };
  }
  return { label: "Variable", icon: "cloud-sun" };
}

async function resolveLocationName(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=es`,
      {
        headers: {
          "User-Agent": "HolaRoberDashboard/1.0",
        },
        signal: AbortSignal.timeout(2500),
        cache: "no-store",
      }
    );
    if (!res.ok) return "Tu ubicación";
    const data = (await res.json()) as {
      address?: {
        city?: string;
        town?: string;
        village?: string;
        municipality?: string;
        state?: string;
      };
    };
    const addr = data.address;
    return (
      addr?.city ||
      addr?.town ||
      addr?.village ||
      addr?.municipality ||
      addr?.state ||
      "Tu ubicación"
    );
  } catch {
    return "Tu ubicación";
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");

  // City search mode
  if (query !== null) {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return NextResponse.json({ results: [] });
    }
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          trimmed
        )}&count=6&language=es&format=json`,
        { signal: AbortSignal.timeout(4500), cache: "no-store" }
      );
      if (!res.ok) return NextResponse.json({ results: [] });
      const data = (await res.json()) as { results?: CitySearchResult[] };
      return NextResponse.json({ results: data.results || [] });
    } catch {
      return NextResponse.json({ results: [] });
    }
  }

  // Forecast mode (default Madrid if no coords given)
  const rawLat = Number(searchParams.get("lat"));
  const rawLon = Number(searchParams.get("lon"));
  const hasCoords = Number.isFinite(rawLat) && Number.isFinite(rawLon) && searchParams.has("lat");

  const lat = hasCoords ? rawLat : 40.4168;
  const lon = hasCoords ? rawLon : -3.7038;
  const providedName = searchParams.get("name")?.trim();

  try {
    const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=8`;

    const [weatherRes, resolvedName] = await Promise.all([
      fetch(forecastUrl, {
        signal: AbortSignal.timeout(5500),
        cache: "no-store",
      }),
      providedName
        ? Promise.resolve(providedName)
        : hasCoords
          ? resolveLocationName(lat, lon)
          : Promise.resolve("Madrid"),
    ]);

    if (!weatherRes.ok) {
      return NextResponse.json(
        { error: "No se pudo obtener el clima" },
        { status: 502 }
      );
    }

    const raw = (await weatherRes.json()) as {
      timezone?: string;
      current: {
        temperature_2m: number;
        apparent_temperature: number;
        weather_code: number;
        wind_speed_10m: number;
        is_day: number;
      };
      daily: {
        time: string[];
        weather_code: number[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_probability_max: number[];
      };
    };

    const isDay = raw.current.is_day === 1;
    const currentMapped = mapWmoWeather(raw.current.weather_code, isDay);

    const next7Days: WeatherDayForecast[] = raw.daily.time
      .slice(1, 8)
      .map((dateStr, idx) => {
        const i = idx + 1;
        const code = raw.daily.weather_code[i] ?? 0;
        const mapped = mapWmoWeather(code, true);
        return {
          date: dateStr,
          tempMax: Math.round(raw.daily.temperature_2m_max[i] ?? 0),
          tempMin: Math.round(raw.daily.temperature_2m_min[i] ?? 0),
          precipProb: Math.round(raw.daily.precipitation_probability_max[i] ?? 0),
          weatherCode: code,
          label: mapped.label,
          icon: mapped.icon,
        };
      });

    const payload: WeatherData = {
      locationName: resolvedName,
      latitude: lat,
      longitude: lon,
      timezone: raw.timezone || "Europe/Madrid",
      current: {
        temperature: Math.round(raw.current.temperature_2m),
        apparentTemperature: Math.round(raw.current.apparent_temperature),
        windSpeed: Math.round(raw.current.wind_speed_10m),
        isDay,
        weatherCode: raw.current.weather_code,
        label: currentMapped.label,
        icon: currentMapped.icon,
        tempMaxToday: Math.round(raw.daily.temperature_2m_max[0] ?? raw.current.temperature_2m),
        tempMinToday: Math.round(raw.daily.temperature_2m_min[0] ?? raw.current.temperature_2m),
        precipProbToday: Math.round(raw.daily.precipitation_probability_max[0] ?? 0),
      },
      next7Days,
    };

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { error: "Error conectando con el servicio meteorológico" },
      { status: 500 }
    );
  }
}
