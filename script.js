// =====================================================
// Weather App
//
// How it works:
//   1. The user searches for a city (or clicks "Use my location").
//   2. We turn the city name into coordinates (Open-Meteo Geocoding API).
//   3. We ask Open-Meteo for the weather at those coordinates.
//   4. We draw the results on the page.
// =====================================================

// ---------- 1. Settings ----------
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
// Only used by the "Use my location" button, to turn coordinates into a city name
const REVERSE_GEOCODING_URL = "https://api.bigdatacloud.net/data/reverse-geocode-client";

const STORAGE_KEY = "weather-app-last-place";
const DEFAULT_CITY = "London"; // shown the very first time the app opens

// ---------- 2. Page elements ----------
const searchForm = document.getElementById("search-form");
const cityInput = document.getElementById("city-input");
const locationBtn = document.getElementById("location-btn");

const loadingBox = document.getElementById("loading");
const loadingText = document.getElementById("loading-text");
const errorBox = document.getElementById("error");
const errorText = document.getElementById("error-text");
const weatherSection = document.getElementById("weather");

const placeName = document.getElementById("place-name");
const placeRegion = document.getElementById("place-region");
const currentDate = document.getElementById("current-date");
const currentTime = document.getElementById("current-time");
const currentIcon = document.getElementById("current-icon");
const currentTemp = document.getElementById("current-temp");
const currentCondition = document.getElementById("current-condition");
const currentHigh = document.getElementById("current-high");
const currentLow = document.getElementById("current-low");
const statFeels = document.getElementById("stat-feels");
const statHumidity = document.getElementById("stat-humidity");
const statWind = document.getElementById("stat-wind");
const statVisibility = document.getElementById("stat-visibility");
const forecastGrid = document.getElementById("forecast-grid");

// ---------- 3. App state ----------
let requestId = 0;       // lets us ignore old requests if a newer one starts
let hasWeather = false;  // true once something is on screen

// An error whose message is friendly enough to show to the user
class AppError extends Error {}

// ---------- 4. Weather icons (inline SVG, no image files needed) ----------
const SUN = `
  <circle cx="32" cy="32" r="11" fill="#ffd54a"/>
  <path d="M48 32h6M43.3 43.3l4.3 4.3M32 48v6M20.7 43.3l-4.3 4.3M16 32h-6M20.7 20.7l-4.3-4.3M32 16v-6M43.3 20.7l4.3-4.3"
        stroke="#ffd54a" stroke-width="3.5" stroke-linecap="round" fill="none"/>`;

const MOON = `<path d="M30.35 12A20 20 0 1 0 47.81 41.1A17 17 0 0 1 30.35 12Z" fill="#f7efc4"/>`;

const STARS = `
  <circle cx="50" cy="16" r="2" fill="#f7efc4"/>
  <circle cx="56" cy="28" r="1.5" fill="#f7efc4"/>`;

// A cloud is three circles plus a rectangle to flatten the bottom
function cloud(fill, transform) {
  return `
    <g fill="${fill}" transform="${transform}">
      <circle cx="22" cy="40" r="8"/>
      <circle cx="33" cy="33" r="11"/>
      <circle cx="44" cy="39" r="9"/>
      <rect x="22" y="40" width="22" height="8"/>
    </g>`;
}

const ICONS = {
  "clear-day": SUN,
  "clear-night": MOON + STARS,
  "partly-day":
    `<g transform="translate(-2 -2) scale(0.7)">${SUN}</g>` + cloud("#ffffff", "translate(4 6)"),
  "partly-night":
    `<g transform="translate(-2 -4) scale(0.72)">${MOON}</g>` + cloud("#ffffff", "translate(4 6)"),
  cloudy:
    cloud("#aebccc", "translate(8 -8)") + cloud("#ffffff", "translate(-4 4)"),
  fog:
    cloud("#ffffff", "translate(0 -8)") +
    `<path d="M16 46h28M22 52h28M16 58h22" stroke="#ffffff" stroke-opacity="0.85"
           stroke-width="3" stroke-linecap="round"/>`,
  drizzle:
    cloud("#d5dde8", "translate(0 -8)") +
    `<path d="M24 46l-2 5M34 46l-2 5M44 46l-2 5M29 54l-2 5M39 54l-2 5"
           stroke="#8ec9ff" stroke-width="2.5" stroke-linecap="round"/>`,
  rain:
    cloud("#c3cedc", "translate(0 -8)") +
    `<path d="M24 45l-3 9M34 45l-3 9M44 45l-3 9"
           stroke="#7fc0ff" stroke-width="3.5" stroke-linecap="round"/>`,
  snow:
    cloud("#e4ebf3", "translate(0 -8)") +
    `<g fill="#ffffff">
       <circle cx="24" cy="48" r="2.5"/><circle cx="34" cy="50" r="2.5"/><circle cx="44" cy="48" r="2.5"/>
       <circle cx="29" cy="57" r="2.5"/><circle cx="39" cy="57" r="2.5"/>
     </g>`,
  storm:
    cloud("#9aa8ba", "translate(0 -10)") +
    `<polygon points="36,36 26,50 33,50 29,60 42,45 35,45 40,36" fill="#ffd54a"/>`
};

// Wraps an icon in an <svg> element
function getIcon(key) {
  return `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">${ICONS[key]}</svg>`;
}

// ---------- 5. Weather codes ----------
// Open-Meteo describes the weather with a numeric WMO code.
// This table turns each code into a label and an icon type.
const WEATHER_CODES = {
  0:  { label: "Clear Sky",           type: "clear" },
  1:  { label: "Mostly Clear",        type: "clear" },
  2:  { label: "Partly Cloudy",       type: "partly" },
  3:  { label: "Overcast",            type: "cloudy" },
  45: { label: "Foggy",               type: "fog" },
  48: { label: "Freezing Fog",        type: "fog" },
  51: { label: "Light Drizzle",       type: "drizzle" },
  53: { label: "Drizzle",             type: "drizzle" },
  55: { label: "Heavy Drizzle",       type: "drizzle" },
  56: { label: "Freezing Drizzle",    type: "drizzle" },
  57: { label: "Freezing Drizzle",    type: "drizzle" },
  61: { label: "Light Rain",          type: "rain" },
  63: { label: "Rain",                type: "rain" },
  65: { label: "Heavy Rain",          type: "rain" },
  66: { label: "Freezing Rain",       type: "rain" },
  67: { label: "Freezing Rain",       type: "rain" },
  71: { label: "Light Snow",          type: "snow" },
  73: { label: "Snow",                type: "snow" },
  75: { label: "Heavy Snow",          type: "snow" },
  77: { label: "Snow Grains",         type: "snow" },
  80: { label: "Light Showers",       type: "rain" },
  81: { label: "Rain Showers",        type: "rain" },
  82: { label: "Heavy Showers",       type: "rain" },
  85: { label: "Snow Showers",        type: "snow" },
  86: { label: "Heavy Snow Showers",  type: "snow" },
  95: { label: "Thunderstorm",        type: "storm" },
  96: { label: "Thunderstorm & Hail", type: "storm" },
  99: { label: "Thunderstorm & Hail", type: "storm" }
};

// Returns { label, icon, sky } for a weather code
function getWeatherInfo(code, isDay) {
  const entry = WEATHER_CODES[code] || { label: "Unknown", type: "cloudy" };
  const timeOfDay = isDay ? "day" : "night";
  const hasDayNightIcon = entry.type === "clear" || entry.type === "partly";

  const icon = hasDayNightIcon ? `${entry.type}-${timeOfDay}` : entry.type;

  // "sky" decides the background colour (see style.css)
  let sky = entry.type;
  if (hasDayNightIcon) sky = `clear-${timeOfDay}`;
  if (entry.type === "drizzle") sky = "rain";

  return { label: entry.label, icon: icon, sky: sky };
}

// ---------- 6. Talking to the APIs ----------

// Step 1: city name -> coordinates
async function findCity(query) {
  // Lets people type "Paris, France" - the part after the comma narrows the match
  const parts = query.split(",").map(function (part) { return part.trim(); });
  const cityPart = parts[0];
  const regionPart = parts[1];

  const params = new URLSearchParams({
    name: cityPart,
    count: 10,
    language: "en",
    format: "json"
  });
  const response = await fetch(`${GEOCODING_URL}?${params}`);
  if (!response.ok) throw new Error("Geocoding request failed");
  const data = await response.json();

  // When nothing matches, the API leaves "results" out completely
  if (!data.results || data.results.length === 0) {
    throw new AppError(
      `We couldn't find a city called "${query}". Check the spelling or try a nearby city.`
    );
  }

  let match = data.results[0];
  if (regionPart) {
    const wanted = regionPart.toLowerCase();
    const better = data.results.find(function (result) {
      return [result.country, result.country_code, result.admin1].some(function (value) {
        return value && value.toLowerCase().startsWith(wanted);
      });
    });
    if (better) match = better;
  }

  return {
    name: match.name,
    region: match.admin1 || "",
    country: match.country || "",
    latitude: match.latitude,
    longitude: match.longitude
  };
}

// Step 2: coordinates -> weather
async function fetchWeather(place) {
  const params = new URLSearchParams({
    latitude: place.latitude,
    longitude: place.longitude,
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m",
    hourly: "visibility",
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    timezone: "auto",   // times are returned in the city's own time zone
    forecast_days: 6    // today + the next 5 days
  });
  const response = await fetch(`${FORECAST_URL}?${params}`);
  if (!response.ok) throw new Error("Weather request failed");
  return response.json();
}

// Used by "Use my location": coordinates -> a readable place name.
// If this fails we simply fall back to showing the coordinates.
async function reverseGeocode(latitude, longitude) {
  try {
    const params = new URLSearchParams({ latitude, longitude, localityLanguage: "en" });
    const response = await fetch(`${REVERSE_GEOCODING_URL}?${params}`);
    if (!response.ok) throw new Error("Reverse geocoding failed");
    const data = await response.json();
    const name = data.city || data.locality || data.principalSubdivision;
    if (name) {
      return { name: name, region: data.principalSubdivision || "", country: data.countryName || "" };
    }
  } catch (error) {
    // ignore - we use the fallback below
  }
  return {
    name: "Your location",
    region: `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
    country: ""
  };
}

// Asks the browser for the user's position, as a Promise
function getCurrentPosition() {
  return new Promise(function (resolve, reject) {
    if (!navigator.geolocation) {
      reject(new AppError("Your browser doesn't support location access. Try searching for a city instead."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, function (error) {
      if (error.code === 1) { // 1 = the user said no
        reject(new AppError("Location access is blocked. Allow it in your browser settings, or search for a city instead."));
      } else {
        reject(new AppError("We couldn't work out your location. Try searching for a city instead."));
      }
    }, { timeout: 10000 });
  });
}

async function getLocationPlace() {
  const position = await getCurrentPosition();
  const latitude = position.coords.latitude;
  const longitude = position.coords.longitude;
  const info = await reverseGeocode(latitude, longitude);
  return { name: info.name, region: info.region, country: info.country, latitude: latitude, longitude: longitude };
}

// ---------- 7. Small helpers ----------

// Turns "2026-10-05" or "2026-10-05T14:30" into a Date WITHOUT time-zone shifts,
// so the date we show always matches the city's own calendar.
function parseLocalTime(text) {
  const parts = text.split("T");
  const date = parts[0].split("-").map(Number);
  const time = (parts[1] || "00:00").split(":").map(Number);
  return new Date(date[0], date[1] - 1, date[2], time[0], time[1]);
}

// Visibility is hourly data, so we pick the value for the current hour
function getCurrentVisibility(data) {
  const hour = data.current.time.slice(0, 13); // e.g. "2026-10-05T14"
  let index = data.hourly.time.findIndex(function (t) { return t.startsWith(hour); });
  if (index < 0) index = 0;
  return data.hourly.visibility[index];
}

function formatVisibility(meters) {
  if (meters === undefined || meters === null) return "--";
  const km = meters / 1000;
  return (km >= 10 ? Math.round(km) : km.toFixed(1)) + " km";
}

// "Lagos State, Nigeria" (skips the region when it just repeats the city name)
function getRegionText(place) {
  const parts = [];
  if (place.region && place.region !== place.name) parts.push(place.region);
  if (place.country) parts.push(place.country);
  return parts.join(", ");
}

function degrees(value) {
  return Math.round(value) + "°";
}

// ---------- 8. Showing things on the page ----------
function renderWeather(place, data) {
  const now = data.current;
  const isDay = now.is_day === 1;
  const info = getWeatherInfo(now.weather_code, isDay);

  // Background colour follows the weather. At night, non-clear skies get darkened.
  document.body.dataset.sky = info.sky;
  document.body.dataset.night = String(!isDay && info.sky !== "clear-night");
  document.title = `Weather in ${place.name}`;

  // Location, date and local time (textContent keeps names safe from HTML injection)
  placeName.textContent = place.name;
  placeRegion.textContent = getRegionText(place);
  placeRegion.hidden = placeRegion.textContent === "";

  const localTime = parseLocalTime(now.time);
  currentDate.textContent = localTime.toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric"
  });
  currentTime.textContent = "Local time " + localTime.toLocaleTimeString(undefined, {
    hour: "numeric", minute: "2-digit"
  });

  // Main conditions
  currentIcon.innerHTML = getIcon(info.icon);
  currentTemp.textContent = Math.round(now.temperature_2m);
  currentCondition.textContent = info.label;
  currentHigh.textContent = degrees(data.daily.temperature_2m_max[0]);
  currentLow.textContent = degrees(data.daily.temperature_2m_min[0]);

  // Details
  statFeels.textContent = degrees(now.apparent_temperature);
  statHumidity.textContent = Math.round(now.relative_humidity_2m) + "%";
  statWind.textContent = Math.round(now.wind_speed_10m) + " km/h";
  statVisibility.textContent = formatVisibility(getCurrentVisibility(data));

  renderForecast(data.daily);

  weatherSection.hidden = false;
  hasWeather = true;
}

// Builds the five forecast cards (index 0 is today, so we start at 1)
function renderForecast(daily) {
  forecastGrid.innerHTML = "";

  for (let i = 1; i <= 5; i++) {
    const date = parseLocalTime(daily.time[i]);
    const info = getWeatherInfo(daily.weather_code[i], true);

    const card = document.createElement("li");
    card.className = "card forecast-card";
    card.style.setProperty("--i", i - 1); // used for the staggered entrance

    card.innerHTML = `
      <p class="fc-day">${date.toLocaleDateString(undefined, { weekday: "long" })}</p>
      <p class="fc-date">${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
      <div class="fc-icon">${getIcon(info.icon)}</div>
      <p class="fc-condition">${info.label}</p>
      <p class="fc-temps">
        <span class="fc-high"><span class="visually-hidden">High </span>${degrees(daily.temperature_2m_max[i])}</span>
        <span class="fc-low"><span class="visually-hidden">Low </span>${degrees(daily.temperature_2m_min[i])}</span>
      </p>`;

    forecastGrid.appendChild(card);
  }
}

function startLoading(message) {
  requestId += 1;
  loadingText.textContent = message;
  errorBox.hidden = true;
  weatherSection.hidden = true;
  loadingBox.hidden = false;
  return requestId;
}

function showError(message) {
  errorText.textContent = message;
  errorBox.hidden = false;
}

function getErrorMessage(error) {
  if (error instanceof AppError) return error.message;
  console.error(error);
  if (error instanceof TypeError) { // fetch() throws a TypeError when offline
    return "We couldn't reach the weather service. Check your internet connection and try again.";
  }
  return "Something went wrong while loading the weather. Please try again.";
}

// ---------- 9. Putting it together ----------

// getPlace is a function that returns (a Promise of) a place: { name, latitude, ... }
async function loadWeather(getPlace, loadingMessage) {
  const id = startLoading(loadingMessage);
  try {
    const place = await getPlace();
    const data = await fetchWeather(place);
    if (id !== requestId) return; // a newer search has replaced this one
    renderWeather(place, data);
    savePlace(place);
    return true; // success
  } catch (error) {
    if (id !== requestId) return;
    showError(getErrorMessage(error));
    // Keep showing the previous city if there was one
    if (hasWeather) weatherSection.hidden = false;
    return false;
  } finally {
    if (id === requestId) loadingBox.hidden = true;
  }
}

// Remember the last place so it's shown again next time
function savePlace(place) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(place));
  } catch (error) {
    // storage not available - no problem
  }
}

function loadSavedPlace() {
  try {
    const place = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (place && typeof place.latitude === "number" && typeof place.longitude === "number") {
      return place;
    }
  } catch (error) {
    // ignore bad data
  }
  return null;
}

// ---------- 10. Events ----------
searchForm.addEventListener("submit", function (event) {
  event.preventDefault(); // stop the page from reloading
  const query = cityInput.value.trim();

  if (query === "") {
    showError("Please enter a city name to search.");
    cityInput.focus();
    return;
  }

  loadWeather(function () { return findCity(query); }, "Fetching weather…")
    .then(function (success) {
      if (success) cityInput.value = ""; // clear the box after a successful search
    });
});

locationBtn.addEventListener("click", function () {
  loadWeather(getLocationPlace, "Finding your location…");
});

// ---------- 11. Start the app ----------
const savedPlace = loadSavedPlace();
if (savedPlace) {
  loadWeather(async function () { return savedPlace; }, "Fetching weather…");
} else {
  loadWeather(function () { return findCity(DEFAULT_CITY); }, "Fetching weather…");
}
