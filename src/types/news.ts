export type CategoryId =
  | "hoy"
  | "youtube"
  | "ia"
  | "hardware"
  | "espacio"
  | "fisica"
  | "motor"
  | "futbol"
  | "videojuegos"
  | "cine";

export interface NewsSource {
  id: string;
  name: string;
  url: string;
  category: Exclude<CategoryId, "hoy">;
  language: "es" | "en";
  isTopSource?: boolean;
  isCustom?: boolean;
}

export interface NewsItem {
  id: string;
  title: string;
  link: string;
  snippet: string;
  source: string;
  sourceId: string;
  category: Exclude<CategoryId, "hoy">;
  language: "es" | "en";
  publishedAt: string; // ISO string
  imageUrl?: string;
  imageFallbackUrl?: string;
}

export interface TrendRelatedNews {
  title: string;
  url: string;
  source: string;
  picture?: string;
}

export interface TrendTopic {
  id: string;
  title: string;
  traffic: string;
  link: string;
  picture?: string;
  publishedAt: string;
  relatedNews: TrendRelatedNews[];
  source?: "google" | "x";
}

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  shortLabel: string;
  description: string;
  accentColor: string;
}

export type WeatherIconKind =
  | "sun"
  | "moon"
  | "cloud-sun"
  | "cloud"
  | "fog"
  | "rain"
  | "storm"
  | "snow";

export interface WeatherDayForecast {
  date: string; // YYYY-MM-DD
  tempMax: number;
  tempMin: number;
  precipProb: number;
  weatherCode: number;
  label: string;
  icon: WeatherIconKind;
}

export interface WeatherData {
  locationName: string;
  latitude: number;
  longitude: number;
  timezone: string;
  current: {
    temperature: number;
    apparentTemperature: number;
    windSpeed: number;
    isDay: boolean;
    weatherCode: number;
    label: string;
    icon: WeatherIconKind;
    tempMaxToday: number;
    tempMinToday: number;
    precipProbToday: number;
  };
  next7Days: WeatherDayForecast[];
}

export interface CitySearchResult {
  id: number;
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
}

export interface YouTubeChannel {
  channelId: string;
  title: string;
  thumbnail?: string;
}

export interface YouTubeVideo {
  id: string;
  videoId: string;
  title: string;
  link: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  thumbnail: string;
  views?: string;
  description?: string;
}

export interface YouTubeUserProfile {
  name: string;
  email?: string;
  picture?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO string or YYYY-MM-DD
  end?: string;
  allDay?: boolean;
  location?: string;
  htmlLink?: string;
  color?: "indigo" | "sky" | "emerald" | "amber" | "rose";
  source: "google" | "ical" | "local";
}

export type ProjectStatus = "en_curso" | "por_hacer" | "pausado" | "completado";
export type ProjectPriority = "alta" | "media" | "baja";

export interface PersonalProject {
  id: string;
  title: string;
  description?: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  progress: number;
  updatedAt: string;
}

export type DailyTaskResetMode = "daily" | "scheduled" | "persistent";

export interface DailyTaskItem {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: string | null;
  resetMode: DailyTaskResetMode;
  resetTime?: string; // "HH:MM" (24h) cuando resetMode === "scheduled"
  createdAt?: string;
}
