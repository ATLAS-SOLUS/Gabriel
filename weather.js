// ============================================================
// weather.js — Motor de Clima (wttr.in — sem autenticação)
// Gabriel PWA
// ============================================================

const Weather = (() => {

  const BASE_URL    = 'https://wttr.in';
  const CACHE_KEY   = 'gabriel_weather_cache';
  const CACHE_TTL   = 30 * 60 * 1000; // 30 minutos

  // ── Cache local ──────────────────────────────────────────

  function getCache(city) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const cache = JSON.parse(raw);
      const entry = cache[normalizeCity(city)];
      if (!entry) return null;
      if (Date.now() - entry.timestamp > CACHE_TTL) return null;
      return entry.data;
    } catch {
      return null;
    }
  }

  function setCache(city, data) {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const cache = raw ? JSON.parse(raw) : {};
      cache[normalizeCity(city)] = { data, timestamp: Date.now() };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
      console.warn('[Weather] Erro ao salvar cache:', e);
    }
  }

  function normalizeCity(city) {
    if (!city) return 'auto';
    return city.toLowerCase().trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '+');
  }

  // ── Buscar dados brutos ──────────────────────────────────

  async function fetchRaw(city) {
    const cached = getCache(city);
    if (cached) {
      console.log('[Weather] Retornando do cache.');
      return cached;
    }

    const cityParam = city ? encodeURIComponent(city) : '';
    const url = `${BASE_URL}/${cityParam}?format=j1&lang=pt`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Erro wttr.in: ${response.status}`);

    const data = await response.json();
    setCache(city, data);
    return data;
  }

  // ── Parsear dados ────────────────────────────────────────

  function parse(data) {
    try {
      const current = data.current_condition?.[0];
      const area    = data.nearest_area?.[0];
      const weather = data.weather?.[0];

      if (!current) throw new Error('Dados inválidos');

      // Localização
      const city    = area?.areaName?.[0]?.value || 'Localização desconhecida';
      const country = area?.country?.[0]?.value || '';
      const region  = area?.region?.[0]?.value || '';

      // Condição atual
      const tempC      = parseInt(current.temp_C);
      const feelsLike  = parseInt(current.FeelsLikeC);
      const humidity   = parseInt(current.humidity);
      const windKmph   = parseInt(current.windspeedKmph);
      const windDir    = current.winddir16Point || '';
      const visibility = parseInt(current.visibility);
      const uvIndex    = parseInt(current.uvIndex);
      const descPt     = current.lang_pt?.[0]?.value || current.weatherDesc?.[0]?.value || '';

      // Previsão hoje
      const maxTemp = weather ? parseInt(weather.maxtempC) : null;
      const minTemp = weather ? parseInt(weather.mintempC) : null;

      // Chuva
      const chanceOfRain = weather?.hourly
        ? Math.max(...weather.hourly.map(h => parseInt(h.chanceofrain || 0)))
        : 0;

      // Ícone de emoji
      const icon = getWeatherEmoji(tempC, descPt, chanceOfRain);

      return {
        city, country, region,
        temp: tempC,
        feelsLike,
        humidity,
        windKmph,
        windDir,
        visibility,
        uvIndex,
        description: descPt,
        maxTemp,
        minTemp,
        chanceOfRain,
        icon,
        raw: data
      };

    } catch (err) {
      throw new Error('Não foi possível interpretar os dados do clima.');
    }
  }

  // ── Emoji por condição ───────────────────────────────────

  function getWeatherEmoji(temp, desc, rainChance) {
    const d = (desc || '').toLowerCase();

    if (d.includes('neve'))          return '❄️';
    if (d.includes('granizo'))       return '🌨️';
    if (d.includes('trovoada') || d.includes('tempestade')) return '⛈️';
    if (rainChance > 70)             return '🌧️';
    if (rainChance > 30)             return '🌦️';
    if (d.includes('nublado') || d.includes('encoberto')) return '☁️';
    if (d.includes('nuvem') || d.includes('parcialmente')) return '⛅';
    if (temp >= 30)                  return '🌞';
    if (temp >= 20)                  return '☀️';
    if (temp >= 10)                  return '🌤️';
    return '🌡️';
  }

  // ── Formatar resposta para o chat ────────────────────────

  function format(parsed) {
    const loc = [parsed.city, parsed.region, parsed.country]
      .filter(Boolean).join(', ');

    const lines = [
      `${parsed.icon} **${loc}**`,
      `🌡️ ${parsed.temp}°C (sensação ${parsed.feelsLike}°C)`,
      `📋 ${parsed.description}`,
    ];

    if (parsed.maxTemp !== null && parsed.minTemp !== null) {
      lines.push(`🔆 Máx ${parsed.maxTemp}°C · Mín ${parsed.minTemp}°C`);
    }

    lines.push(`💧 Umidade ${parsed.humidity}%`);
    lines.push(`💨 Vento ${parsed.windKmph} km/h ${parsed.windDir}`);

    if (parsed.chanceOfRain > 0) {
      lines.push(`☔ Chuva: ${parsed.chanceOfRain}% de chance`);
    }

    if (parsed.uvIndex >= 3) {
      const uvLabel = parsed.uvIndex >= 8 ? 'Muito alto ⚠️'
        : parsed.uvIndex >= 6 ? 'Alto'
        : parsed.uvIndex >= 3 ? 'Moderado'
        : 'Baixo';
      lines.push(`☀️ UV: ${parsed.uvIndex} (${uvLabel})`);
    }

    return lines.join('\n');
  }

  // ── Previsão dos próximos dias ───────────────────────────

  function formatForecast(data) {
    const forecast = data.weather || [];
    if (forecast.length === 0) return 'Previsão indisponível.';
    const dayNames = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    const today = new Date();
    return forecast.slice(0, 7).map((day, i) => {
      const max  = parseInt(day.maxtempC);
      const min  = parseInt(day.mintempC);
      const desc = day.hourly?.[4]?.lang_pt?.[0]?.value || day.hourly?.[4]?.weatherDesc?.[0]?.value || '';
      const rain = Math.max(...(day.hourly || []).map(h => parseInt(h.chanceofrain || 0)));
      const emoji = getWeatherEmoji((max + min) / 2, desc, rain);
      const date = new Date(today); date.setDate(today.getDate() + i);
      const label = i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : dayNames[date.getDay()];
      return `${emoji} **${label}**: ${max}°/${min}°${rain > 20 ? ` ☔${rain}%` : ''} — ${desc}`;
    }).join('\n');
  }

  function formatForecastDashboard(data) {
    const forecast = data.weather || [];
    if (forecast.length === 0) return [];
    const dayNames = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    const today = new Date();
    return forecast.slice(0, 7).map((day, i) => {
      const max  = parseInt(day.maxtempC);
      const min  = parseInt(day.mintempC);
      const desc = day.hourly?.[4]?.lang_pt?.[0]?.value || day.hourly?.[4]?.weatherDesc?.[0]?.value || '';
      const rain = Math.max(...(day.hourly || []).map(h => parseInt(h.chanceofrain || 0)));
      const emoji = getWeatherEmoji((max + min) / 2, desc, rain);
      const date = new Date(today); date.setDate(today.getDate() + i);
      const label = i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : dayNames[date.getDay()];
      return { label, max, min, desc, rain, emoji };
    });
  }

  // ── API principal ────────────────────────────────────────

  async function get(city = '') {
    try {
      const data   = await fetchRaw(city);
      const parsed = parse(data);
      return format(parsed);
    } catch (err) {
      console.error('[Weather] Erro:', err);
      return `Não consegui obter o clima${city ? ' de ' + city : ''} agora. Tente novamente em instantes.`;
    }
  }

  async function getForecast(city = '') {
    try {
      const data = await fetchRaw(city);
      return formatForecast(data);
    } catch (err) {
      return 'Previsão indisponível no momento.';
    }
  }

  async function getParsed(city = '') {
    const data = await fetchRaw(city);
    return parse(data);
  }

  // ── Clima para o Dashboard ───────────────────────────────

  async function getForDashboard(city = '') {
    try {
      const data   = await fetchRaw(city);
      const parsed = parse(data);

      return {
        icon:        parsed.icon,
        temp:        parsed.temp,
        feelsLike:   parsed.feelsLike,
        description: parsed.description,
        city:        parsed.city,
        humidity:    parsed.humidity,
        windKmph:    parsed.windKmph,
        chanceOfRain: parsed.chanceOfRain,
        maxTemp:     parsed.maxTemp,
        minTemp:     parsed.minTemp,
        formatted:   format(parsed)
      };
    } catch (err) {
      return null;
    }
  }

  // ── Detectar cidade automaticamente (IP) ────────────────

  async function detectCity() {
    try {
      const res  = await fetch('https://ipapi.co/json/');
      const data = await res.json();
      return data.city || '';
    } catch {
      return '';
    }
  }

  // ── Geolocalização GPS real ──────────────────────────────

  async function getLocationCity() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(''); return; }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          // Salva coordenadas no DB para uso no wttr.in
          await GabrielDB.Settings.set('weather_coords', JSON.stringify({ latitude, longitude }));
          // Reverse geocode via nominatim
          try {
            const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
            const data = await res.json();
            const city = data.address?.city || data.address?.town || data.address?.village || '';
            if (city) await setDefaultCity(city);
            resolve(city);
          } catch {
            resolve(`${latitude},${longitude}`);
          }
        },
        () => resolve(''),
        { timeout: 8000, maximumAge: 300000 }
      );
    });
  }

  // ── Auto-detectar cidade (GPS > IP) ─────────────────────

  async function autoDetectCity() {
    // Tenta GPS primeiro
    const gpsCity = await getLocationCity();
    if (gpsCity) return gpsCity;
    // Fallback para IP
    return await detectCity();
  }

  // ── Salvar cidade padrão ─────────────────────────────────

  async function setDefaultCity(city) {
    await GabrielDB.Settings.set('weather_city', city);
  }

  async function getDefaultCity() {
    return await GabrielDB.Settings.get('weather_city') || '';
  }

  // ── API Pública ──────────────────────────────────────────
  return {
    get,
    getForecast,
    getParsed,
    getForDashboard,
    detectCity,
    getLocationCity,
    autoDetectCity,
    setDefaultCity,
    getDefaultCity,
    getWeatherEmoji,
    formatForecastDashboard
  };

})();

window.Weather = Weather;
console.log('[Gabriel] weather.js carregado ✓');
