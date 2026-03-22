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

    const days = ['Hoje', 'Amanhã', 'Depois de amanhã'];

    return forecast.slice(0, 3).map((day, i) => {
      const max  = parseInt(day.maxtempC);
      const min  = parseInt(day.mintempC);
      const desc = day.hourly?.[4]?.lang_pt?.[0]?.value
        || day.hourly?.[4]?.weatherDesc?.[0]?.value
        || '';
      const rain = Math.max(...(day.hourly || []).map(h => parseInt(h.chanceofrain || 0)));
      const emoji = getWeatherEmoji((max + min) / 2, desc, rain);

      return `${emoji} **${days[i] || day.date}**: ${max}°/${min}° — ${desc}${rain > 20 ? ` ☔${rain}%` : ''}`;
    }).join('\n');
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
    setDefaultCity,
    getDefaultCity,
    getWeatherEmoji
  };

})();

window.Weather = Weather;
console.log('[Gabriel] weather.js carregado ✓');
