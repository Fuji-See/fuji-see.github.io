/**
 * Fuji See - Core Application Logic
 * Fetches real-time weather data for Mount Fuji area and calculates a precise visibility score.
 * Coordinates: Mount Fuji Summit (35.3606, 138.7273)
 */

document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------
    // Configuración y Constantes
    // ----------------------------------------------------
    const FUJI_LAT = 35.3606;
    const FUJI_LON = 138.7273;
    let activeLat = FUJI_LAT;
    let activeLon = FUJI_LON;

    // Miradores de referencia
    const VIEWPOINTS = [
        { name: 'Cumbre del Monte Fuji (Cima)', lat: 35.3606, lon: 138.7273, desc: 'Punto de medición principal en la cima.' },
        { name: 'Oishi Park (Lago Kawaguchiko)', lat: 35.5222, lon: 138.7490, desc: 'Clásica vista junto al lago y flores.' },
        { name: 'Chureito Pagoda (Fujiyoshida)', lat: 35.5011, lon: 138.8015, desc: 'Pagoda roja con el Fuji de fondo.' },
        { name: 'Panorama台 (Lago Yamanakako)', lat: 35.4223, lon: 138.9056, desc: 'Gran vista panorámica elevada.' },
        { name: 'Hakone (Mishima Skywalk)', lat: 35.1878, lon: 138.9715, desc: 'Vistas desde el puente colgante.' },
        { name: 'Estación Shinkansen Shin-Fuji', lat: 35.1422, lon: 138.6636, desc: 'Vista del tren bala cruzando.' }
    ];

    // Elementos del DOM
    const elLoading = document.getElementById('loading-state');
    const elMain = document.getElementById('main-content');
    const elBtnRefresh = document.getElementById('btn-refresh');
    
    // Elementos de la tarjeta de score principal
    const elTxtScore = document.getElementById('txt-score');
    const elBadgeStatus = document.getElementById('badge-status');
    const elBadgeDot = document.getElementById('badge-dot');
    const elBadgeText = document.getElementById('badge-text');
    const elTxtSummary = document.getElementById('txt-summary');
    
    // Componentes interactivos
    const elFactorsGrid = document.getElementById('factors-grid');
    const elTimelineContainer = document.getElementById('timeline-container');
    const elTxtBestWindow = document.getElementById('txt-best-window');
    
    // Geolocalización
    const elBtnGeolocate = document.getElementById('btn-geolocate');
    const elGeolocateText = document.getElementById('geolocate-text');
    const elViewpointsContainer = document.getElementById('viewpoints-container');

    // Overlay rápido
    const elBtnQuickLook = document.getElementById('btn-quick-look');
    const elQuickOverlay = document.getElementById('quick-overlay');
    const elQuickModalCard = document.getElementById('quick-modal-card');
    const elBtnCloseQuick = document.getElementById('btn-close-quick');
    const elBtnQuickOk = document.getElementById('btn-quick-ok');
    const elQuickIndicatorCircle = document.getElementById('quick-indicator-circle');
    const elQuickTitle = document.getElementById('quick-title');
    const elQuickResultBg = document.getElementById('quick-result-bg');
    const elQuickResultText = document.getElementById('quick-result-text');
    const elQuickPercent = document.getElementById('quick-percent');
    const elQuickTip = document.getElementById('quick-tip');

    // Estado global de la aplicación
    let weatherData = null;
    let currentScore = 0;
    let currentStatus = {};
    let userLocation = null;

    // Estado del mapa Leaflet
    let map = null;
    let mapMarkers = [];
    let userMapMarker = null;

    // Inicializar iconos de Lucide
    lucide.createIcons();

    // ----------------------------------------------------
    // Reloj local de Japón (Asia/Tokyo)
    // ----------------------------------------------------
    function updateJapanClock() {
        const elClock = document.getElementById('japan-clock');
        if (!elClock) return;
        const now = new Date();
        const opts = { timeZone: 'Asia/Tokyo', weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
        elClock.textContent = now.toLocaleString('es-ES', opts) + ' (JST)';
    }
    updateJapanClock();
    setInterval(updateJapanClock, 1000);

    // ----------------------------------------------------
    // Algoritmo de Cálculo de Visibilidad
    // ----------------------------------------------------
    function calculateFujiVisibility(cloudsTotal, cloudsLow, cloudsMid, cloudsHigh, humidity, pressure, windSpeed, hour) {
        let score = 100;

        // 1. Impacto fuerte de nubosidad baja (low clouds) - la capa que bloquea el monte directamente
        score -= (cloudsLow * 0.5);

        // 2. Impacto de nubosidad media (mid clouds)
        score -= (cloudsMid * 0.25);

        // 3. Impacto leve de nubosidad alta (high clouds)
        score -= (cloudsHigh * 0.1);

        // 4. Humedad ambiental alta (>70% genera bruma/niebla)
        if (humidity > 70) {
            const humidityDiff = humidity - 70;
            score -= (humidityDiff * 0.5); // Máximo -15 puntos
        }

        // 5. Presión atmosférica (alta presión = estabilidad y cielo despejado)
        if (pressure > 1015) {
            score += 5;
        } else if (pressure < 1008) {
            score -= 5;
        }

        // 6. Viento (viento moderado despeja las nubes del pico)
        if (windSpeed >= 12 && windSpeed <= 25) {
            score += 5;
        } else if (windSpeed > 40) {
            score -= 5; // Viento extremo = tormenta/nubes lenticulares densas
        }

        // 7. Ajuste de hora (por la mañana hay estadísticamente mayor probabilidad de ver el Fuji despejado)
        if (hour >= 5 && hour <= 9) {
            score += 8;
        } else if (hour >= 18 && hour <= 20) {
            score += 3; // Ocasionales atardeceres mágicos
        } else if (hour >= 11 && hour <= 15) {
            score -= 5; // A mediodía suele cubrirse por convección térmica local
        }

        // Limitar score entre 0 y 100
        score = Math.round(Math.max(0, Math.min(100, score)));
        return score;
    }

    function getStatusDetails(score) {
        if (score >= 81) {
            return {
                text: 'Excelente',
                class: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
                dotClass: 'bg-emerald-500',
                summary: '¡Visibilidad excelente! El monte está despejado en este momento. Es el mejor momento para fotos.',
                quickBg: 'bg-emerald-500 text-white',
                quickEmoji: '☀️🗻'
            };
        } else if (score >= 61) {
            return {
                text: 'Probable',
                class: 'bg-teal-100 text-teal-800 border border-teal-200',
                dotClass: 'bg-teal-500',
                summary: 'Buenas condiciones. Es muy probable que veas la silueta o el monte entero con algunas nubes dispersas.',
                quickBg: 'bg-teal-500 text-white',
                quickEmoji: '🌤️🗻'
            };
        } else if (score >= 31) {
            return {
                text: 'Dudoso',
                class: 'bg-amber-100 text-amber-800 border border-amber-200',
                dotClass: 'bg-amber-500',
                summary: 'Visibilidad inestable. Nubes medias o humedad alta podrían tapar parte o la totalidad de la cumbre.',
                quickBg: 'bg-amber-500 text-white',
                quickEmoji: '⛅🗻'
            };
        } else {
            return {
                text: 'Cubierto',
                class: 'bg-rose-100 text-rose-800 border border-rose-200',
                dotClass: 'bg-rose-500',
                summary: 'Fuji no visible. Gran cantidad de nubes bajas o humedad densa cubren por completo la montaña.',
                quickBg: 'bg-rose-500 text-white',
                quickEmoji: '☁️🗻'
            };
        }
    }

    // ----------------------------------------------------
    // Carga de Datos y Renderizado
    // ----------------------------------------------------
    async function fetchWeather() {
        try {
            elLoading.classList.remove('hidden');
            elMain.classList.add('hidden');

            const url = `https://api.open-meteo.com/v1/forecast?latitude=${activeLat}&longitude=${activeLon}&hourly=temperature_2m,relative_humidity_2m,pressure_msl,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m&timezone=Asia%2FTokyo&forecast_days=2`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('Error al conectar con la API de clima');
            
            weatherData = await res.json();
            processAndRenderData();
        } catch (error) {
            console.error(error);
            alert('No se pudo obtener el pronóstico actual. Por favor, comprueba tu conexión a internet.');
        } finally {
            elLoading.classList.add('hidden');
            elMain.classList.remove('hidden');
        }
    }

    function processAndRenderData() {
        if (!weatherData || !weatherData.hourly) return;

        const hourly = weatherData.hourly;
        const timeArray = hourly.time;

        // Obtener el índice actual más cercano basado en la hora actual
        const now = new Date();
        let currentIndex = 0;
        let minDiff = Infinity;

        for (let i = 0; i < timeArray.length; i++) {
            const timeObj = new Date(timeArray[i]);
            const diff = Math.abs(now - timeObj);
            if (diff < minDiff) {
                minDiff = diff;
                currentIndex = i;
            }
        }

        // Renderizar Timeline del día
        renderTimelineAndBestWindow(currentIndex);

        // Renderizar miradores iniciales
        renderViewpoints();

        // Mostrar datos climatológicos para el índice actual
        updateActiveHour(currentIndex);

        // Actualizar el nombre del mirador activo en la UI
        const currentVp = VIEWPOINTS.find(vp => vp.lat === activeLat && vp.lon === activeLon) || VIEWPOINTS[0];
        const elActiveVpName = document.getElementById('active-vp-name');
        if (elActiveVpName) {
            elActiveVpName.textContent = currentVp.name.split(' (')[0];
        }

        // Calcular mejores ventanas de todos los miradores
        computeAllBestWindows();

        // Inicializar mapa (solo la primera vez)
        initMap();
    }

    function updateActiveHour(index) {
        if (!weatherData || !weatherData.hourly) return;

        const hourly = weatherData.hourly;
        const timeArray = hourly.time;

        // Obtener variables meteorológicas del índice seleccionado
        const temp = hourly.temperature_2m[index];
        const hum = hourly.relative_humidity_2m[index];
        const press = hourly.pressure_msl[index];
        const cloudLow = hourly.cloud_cover_low[index];
        const cloudMid = hourly.cloud_cover_mid[index];
        const cloudHigh = hourly.cloud_cover_high[index];
        const cloudTotal = hourly.cloud_cover[index];
        const wind = hourly.wind_speed_10m[index];
        const currentHour = new Date(timeArray[index]).getHours();

        // Calcular el Score
        currentScore = calculateFujiVisibility(cloudTotal, cloudLow, cloudMid, cloudHigh, hum, press, wind, currentHour);
        currentStatus = getStatusDetails(currentScore);

        // Actualizar UI Score Principal
        elTxtScore.textContent = currentScore;
        elBadgeStatus.className = `inline-flex items-center gap-2 px-4 py-1.5 rounded-full font-bold text-xs uppercase tracking-wider shadow-sm mb-4 ${currentStatus.class}`;
        elBadgeDot.className = `w-2.5 h-2.5 rounded-full ${currentStatus.dotClass}`;
        elBadgeText.textContent = currentStatus.text;
        elTxtSummary.textContent = currentStatus.summary;

        // Renderizar Factores Meteorológicos
        renderFactors(temp, cloudLow, cloudMid, hum, press, wind);

        // Resaltar la columna horaria activa en el timeline
        const cols = elTimelineContainer.querySelectorAll('.timeline-col');
        cols.forEach(col => {
            const colIdx = parseInt(col.dataset.index);
            if (colIdx === index) {
                col.classList.remove('bg-white/40', 'border-slate-100/50');
                col.classList.add('bg-sky-100/80', 'border-sky-300', 'ring-2', 'ring-sky-200');
            } else {
                col.classList.add('bg-white/40', 'border-slate-100/50');
                col.classList.remove('bg-sky-100/80', 'border-sky-300', 'ring-2', 'ring-sky-200');
            }
        });
    }

    function renderFactors(temp, cloudLow, cloudMid, humidity, pressure, wind) {
        elFactorsGrid.innerHTML = '';

        // Determinamos gravedad del factor para asignar color
        const getLowCloudColor = (val) => val > 60 ? 'text-rose-500' : (val > 30 ? 'text-amber-500' : 'text-emerald-600');
        const getHumColor = (val) => val > 80 ? 'text-rose-500' : (val > 65 ? 'text-amber-500' : 'text-emerald-600');
        const getPressColor = (val) => val > 1013 ? 'text-emerald-600' : (val < 1008 ? 'text-rose-500' : 'text-amber-500');
        
        // Colores y descripción para la temperatura en el pico del Fuji (usualmente frío)
        const getTempColor = (val) => val < 0 ? 'text-sky-500' : (val < 10 ? 'text-teal-600' : 'text-amber-600');
        const getTempDesc = (val) => val < 0 ? 'Congelación (Bajo cero)' : (val < 10 ? 'Frío extremo / intenso' : 'Fresco / Templado');

        const factors = [
            {
                name: 'Temperatura',
                val: `${temp.toFixed(1)} °C`,
                desc: getTempDesc(temp),
                icon: 'thermometer',
                colorClass: getTempColor(temp),
                extraClass: 'col-span-2 bg-gradient-to-r from-sky-50/50 to-white/60'
            },
            {
                name: 'Nube Baja',
                val: `${cloudLow}%`,
                desc: cloudLow > 60 ? 'Bloqueo crítico' : (cloudLow > 30 ? 'Parcialmente cubierto' : 'Despejado'),
                icon: 'cloud',
                colorClass: getLowCloudColor(cloudLow)
            },
            {
                name: 'Humedad',
                val: `${humidity}%`,
                desc: humidity > 80 ? 'Bruma muy densa' : (humidity > 65 ? 'Neblina ligera' : 'Aire seco y limpio'),
                icon: 'droplets',
                colorClass: getHumColor(humidity)
            },
            {
                name: 'Presión',
                val: `${Math.round(pressure)} hPa`,
                desc: pressure > 1013 ? 'Alta (Estable)' : (pressure < 1008 ? 'Baja (Inestable)' : 'Presión normal'),
                icon: 'gauge',
                colorClass: getPressColor(pressure)
            },
            {
                name: 'Viento',
                val: `${Math.round(wind)} km/h`,
                desc: wind > 25 ? 'Limpieza rápida' : (wind < 8 ? 'Cielos estancados' : 'Viento suave'),
                icon: 'wind',
                colorClass: 'text-slate-600'
            }
        ];

        factors.forEach(f => {
            const card = document.createElement('div');
            card.className = `bg-white/60 p-3 rounded-2xl border border-slate-100 flex flex-col items-start gap-1.5 shadow-sm ${f.extraClass || ''}`;
            card.innerHTML = `
                <div class="flex items-center gap-1.5 text-slate-500 text-xs font-bold">
                    <i data-lucide="${f.icon}" class="w-3.5 h-3.5"></i>
                    <span>${f.name}</span>
                </div>
                <div class="flex flex-col mt-0.5">
                    <span class="text-lg font-black tracking-tight text-slate-900 leading-none">${f.val}</span>
                    <span class="text-[10px] font-medium mt-1 leading-none ${f.colorClass}">${f.desc}</span>
                </div>
            `;
            elFactorsGrid.appendChild(card);
        });

        lucide.createIcons();
    }

    function renderTimelineAndBestWindow(startIndex) {
        elTimelineContainer.innerHTML = '';
        const hourly = weatherData.hourly;
        
        let bestIndex = startIndex;
        let maxScore = -1;

        // Mostrar ventanas horarias clave a lo largo de las próximas 48 horas
        const offsets = [0, 3, 6, 9, 12, 18, 24, 30, 36, 42, 48];
        
        offsets.forEach(offset => {
            const idx = startIndex + offset;
            if (idx >= hourly.time.length) return;

            const timeStr = hourly.time[idx];
            const dateObj = new Date(timeStr);
            const isNewDay = offset > 0 && new Date(hourly.time[startIndex]).getDate() !== dateObj.getDate();
            const formattedTime = dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
            const label = offset === 0 ? 'Ahora' : (isNewDay ? `D+2 ${formattedTime}` : formattedTime);
            
            const cloudLow = hourly.cloud_cover_low[idx];
            const cloudMid = hourly.cloud_cover_mid[idx];
            const cloudHigh = hourly.cloud_cover_high[idx];
            const cloudTotal = hourly.cloud_cover[idx];
            const hum = hourly.relative_humidity_2m[idx];
            const press = hourly.pressure_msl[idx];
            const wind = hourly.wind_speed_10m[idx];
            const hr = dateObj.getHours();

            const score = calculateFujiVisibility(cloudTotal, cloudLow, cloudMid, cloudHigh, hum, press, wind, hr);
            
            // Buscar el máximo score en las próximas 48 horas para la ventana recomendada
            if (offset <= 48 && score > maxScore) {
                maxScore = score;
                bestIndex = idx;
            }

            // Colores del círculo del score
            let scoreColor = 'bg-rose-500';
            if (score >= 81) scoreColor = 'bg-emerald-500';
            else if (score >= 61) scoreColor = 'bg-teal-500';
            else if (score >= 31) scoreColor = 'bg-amber-500';

            const timelineCol = document.createElement('div');
            timelineCol.className = 'timeline-col flex flex-col items-center gap-1.5 shrink-0 py-2 px-2.5 rounded-2xl bg-white/40 border border-slate-100/50 shadow-sm cursor-pointer hover:bg-white/70 active:scale-95 transition-all duration-200';
            timelineCol.dataset.index = idx;
            timelineCol.innerHTML = `
                <span class="text-xs font-semibold text-slate-500 text-center leading-tight">${label}</span>
                <div class="w-12 h-12 rounded-full ${scoreColor} text-white flex flex-col items-center justify-center shadow-inner leading-none">
                    <span class="text-base font-black leading-none">${score}</span>
                    <span class="text-xs font-black opacity-90">%</span>
                </div>
                <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">${getStatusDetails(score).text}</span>
            `;
            timelineCol.addEventListener('click', () => {
                updateActiveHour(idx);
            });
            elTimelineContainer.appendChild(timelineCol);
        });

        // Actualizar la mejor ventana de visualización (solo del mirador activo en el timeline)
        const bestDate = new Date(hourly.time[bestIndex]);
        const bestTimeStr = bestDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const bestDay = bestDate.getDate() === new Date().getDate() ? 'Hoy' : 'Mañana';
        // (La recomendación global de todos los miradores se pinta en computeAllBestWindows)
    }

    // ------------------------------------------------------------------
    // Mejor ventana de TODOS los miradores (consultas paralelas a la API)
    // ------------------------------------------------------------------
    async function computeAllBestWindows() {
        const container = document.getElementById('best-windows-container');
        if (!container) return;
        container.innerHTML = '<p class="text-sm text-orange-800 animate-pulse">Consultando todos los miradores...</p>';

        const now = new Date();

        // Consultar la API para cada mirador en paralelo
        const results = await Promise.all(VIEWPOINTS.map(async (vp) => {
            try {
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${vp.lat}&longitude=${vp.lon}&hourly=temperature_2m,relative_humidity_2m,pressure_msl,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m&timezone=Asia%2FTokyo&forecast_days=2`;
                const res = await fetch(url);
                if (!res.ok) return null;
                const data = await res.json();
                const hourly = data.hourly;

                // Encontrar el índice actual
                let currentIndex = 0;
                let minDiff = Infinity;
                for (let i = 0; i < hourly.time.length; i++) {
                    const diff = Math.abs(now - new Date(hourly.time[i]));
                    if (diff < minDiff) { minDiff = diff; currentIndex = i; }
                }

                // Buscar el mejor score en las próximas 48 horas
                let bestScore = -1;
                let bestIdx = currentIndex;
                for (let offset = 0; offset <= 48; offset++) {
                    const idx = currentIndex + offset;
                    if (idx >= hourly.time.length) break;
                    const score = calculateFujiVisibility(
                        hourly.cloud_cover[idx],
                        hourly.cloud_cover_low[idx],
                        hourly.cloud_cover_mid[idx],
                        hourly.cloud_cover_high[idx],
                        hourly.relative_humidity_2m[idx],
                        hourly.pressure_msl[idx],
                        hourly.wind_speed_10m[idx],
                        new Date(hourly.time[idx]).getHours()
                    );
                    if (score > bestScore) { bestScore = score; bestIdx = idx; }
                }

                const bestDate = new Date(hourly.time[bestIdx]);
                return { vp, bestScore, bestDate };
            } catch {
                return null;
            }
        }));

        // Ordenar por mejor score descendente
        const sorted = results
            .filter(r => r !== null)
            .sort((a, b) => b.bestScore - a.bestScore);

        container.innerHTML = '';

        sorted.forEach(({ vp, bestScore, bestDate }) => {
            const isToday = bestDate.getDate() === now.getDate();
            const dayLabel = isToday ? 'Hoy' : 'Mañana';
            const timeLabel = bestDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });

            let scoreBg = 'bg-rose-500';
            let scoreText = 'text-rose-600';
            if (bestScore >= 81) { scoreBg = 'bg-emerald-500'; scoreText = 'text-emerald-700'; }
            else if (bestScore >= 61) { scoreBg = 'bg-teal-500'; scoreText = 'text-teal-700'; }
            else if (bestScore >= 31) { scoreBg = 'bg-amber-500'; scoreText = 'text-amber-700'; }

            const row = document.createElement('div');
            row.className = 'flex items-center gap-3 bg-white/50 rounded-xl px-3 py-2.5 border border-orange-100';
            row.innerHTML = `
                <div class="w-11 h-11 rounded-full ${scoreBg} text-white flex flex-col items-center justify-center shadow-sm shrink-0 leading-none">
                    <span class="text-sm font-black leading-none">${bestScore}</span>
                    <span class="text-xs font-black opacity-90">%</span>
                </div>
                <div class="flex-grow min-w-0">
                    <p class="text-xs font-bold text-slate-800 truncate">${vp.name}</p>
                    <p class="text-[11px] ${scoreText} font-semibold mt-0.5">${dayLabel} a las ${timeLabel} • ${getStatusDetails(bestScore).text}</p>
                </div>
            `;
            container.appendChild(row);
        });

        // Actualizar marcadores del mapa con los resultados calculados
        updateMapMarkers(sorted);
    }

    // ----------------------------------------------------
    // Mapa Leaflet Interactivo
    // ----------------------------------------------------
    function initMap() {
        if (map) { map.invalidateSize(); return; }

        map = L.map('fuji-map', {
            center: [35.5, 138.75],
            zoom: 9,
            zoomControl: true,
            scrollWheelZoom: true
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 18
        }).addTo(map);

        // Marcador especial de la cima del Fuji
        const fujiIcon = L.divIcon({
            className: '',
            html: `<div style="font-size:28px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));">🗻</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popupAnchor: [0, -20]
        });
        L.marker([FUJI_LAT, FUJI_LON], { icon: fujiIcon })
            .addTo(map)
            .bindPopup(`<div style="font-family:Outfit,sans-serif;text-align:center;">
                <p style="font-weight:900;font-size:14px;margin:0;">Monte Fuji 🗻</p>
                <p style="font-size:11px;color:#64748b;margin:4px 0 0;">Cima • 3.776 m de altitud</p>
            </div>`);
    }

    function updateMapMarkers(results) {
        if (!map) return;

        // Limpiar marcadores anteriores de miradores
        mapMarkers.forEach(m => map.removeLayer(m));
        mapMarkers = [];

        const now = new Date();

        results.forEach(({ vp, bestScore, bestDate }) => {
            // Saltar la cima (ya tiene su propio icono fijo)
            if (vp.lat === FUJI_LAT && vp.lon === FUJI_LON) return;

            // Color según score
            let color = '#f43f5e';
            if (bestScore >= 81)      color = '#10b981';
            else if (bestScore >= 61) color = '#14b8a6';
            else if (bestScore >= 31) color = '#f59e0b';

            const isToday = bestDate.getDate() === now.getDate();
            const dayLabel = isToday ? 'Hoy' : 'Mañana';
            const timeLabel = bestDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
            const dateLabel = bestDate.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Tokyo' });
            const statusLabel = getStatusDetails(bestScore).text;

            // Icono personalizado con score y %
            const icon = L.divIcon({
                className: '',
                html: `<div style="
                    background:${color};
                    width:48px;height:48px;
                    border-radius:50%;
                    display:flex;flex-direction:column;
                    align-items:center;justify-content:center;
                    border:3px solid white;
                    box-shadow:0 3px 12px rgba(0,0,0,0.35);
                    color:white;
                    font-family:'Outfit',sans-serif;
                    line-height:1;
                    cursor:pointer;
                ">
                    <span style="font-size:15px;font-weight:900;">${bestScore}</span>
                    <span style="font-size:10px;font-weight:800;opacity:0.9;">%</span>
                </div>`,
                iconSize: [48, 48],
                iconAnchor: [24, 24],
                popupAnchor: [0, -28]
            });

            const popup = `
                <div style="font-family:'Outfit',sans-serif;min-width:170px;">
                    <p style="font-weight:800;font-size:13px;margin:0 0 2px;color:#1e293b;">${vp.name}</p>
                    <p style="font-size:11px;color:#94a3b8;margin:0 0 8px;">${vp.desc}</p>
                    <div style="display:flex;align-items:center;gap:8px;background:${color}18;border-radius:10px;padding:8px 10px;border:1px solid ${color}30;">
                        <div style="background:${color};color:white;border-radius:50%;width:40px;height:40px;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;font-family:'Outfit',sans-serif;line-height:1;">
                            <span style="font-size:14px;font-weight:900;">${bestScore}</span>
                            <span style="font-size:9px;font-weight:800;opacity:0.9;">%</span>
                        </div>
                        <div>
                            <p style="font-size:12px;font-weight:800;color:#1e293b;margin:0;">${statusLabel}</p>
                            <p style="font-size:10px;color:#64748b;margin:2px 0 0;">${dayLabel} • ${dateLabel}</p>
                            <p style="font-size:11px;font-weight:700;color:${color};margin:2px 0 0;">⏰ ${timeLabel} (JST)</p>
                        </div>
                    </div>
                </div>`;

            const marker = L.marker([vp.lat, vp.lon], { icon })
                .addTo(map)
                .bindPopup(popup);
            mapMarkers.push(marker);
        });
    }

    function updateUserMapMarker() {
        if (!map || !userLocation) return;

        // Eliminar marcador anterior del usuario si existe
        if (userMapMarker) { map.removeLayer(userMapMarker); userMapMarker = null; }

        const userIcon = L.divIcon({
            className: '',
            html: `<div style="
                background:#3b82f6;
                width:18px;height:18px;
                border-radius:50%;
                border:3px solid white;
                box-shadow:0 0 0 4px rgba(59,130,246,0.3),0 2px 8px rgba(0,0,0,0.3);
            "></div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
            popupAnchor: [0, -12]
        });

        userMapMarker = L.marker([userLocation.lat, userLocation.lon], { icon: userIcon })
            .addTo(map)
            .bindPopup(`<div style="font-family:'Outfit',sans-serif;text-align:center;">
                <p style="font-weight:800;font-size:13px;margin:0;color:#1e293b;">Tú estás aquí 📍</p>
            </div>`);

        map.setView([userLocation.lat, userLocation.lon], 10);
    }

    // ----------------------------------------------------
    // Geolocalización y Distancias a Miradores
    // ----------------------------------------------------
    function calculateDistance(lat1, lon1, lat2, lon2) {
        // Fórmula de Haversine para calcular distancia en km sobre esfera
        const R = 6371; // Radio de la Tierra en km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    function renderViewpoints() {
        elViewpointsContainer.innerHTML = '';
        
        // Clonar y ordenar miradores por distancia si la ubicación del usuario está disponible
        let viewpointsToRender = [...VIEWPOINTS];
        
        if (userLocation) {
            viewpointsToRender.forEach(vp => {
                vp.distance = calculateDistance(userLocation.lat, userLocation.lon, vp.lat, vp.lon);
            });
            // Ordenar de más cercano a más lejano (pero manteniendo la Cumbre de primera si es la seleccionada, o simplemente ordenar)
            viewpointsToRender.sort((a, b) => a.distance - b.distance);
        }

        viewpointsToRender.forEach(vp => {
            const distanceText = vp.distance 
                ? `${vp.distance.toFixed(1)} km de ti` 
                : 'Distancia desconocida';

            // Distancia en línea recta desde este mirador hasta la cima del Fuji
            const distToFuji = calculateDistance(vp.lat, vp.lon, FUJI_LAT, FUJI_LON);
            const distToFujiText = vp.lat === FUJI_LAT && vp.lon === FUJI_LON
                ? '📍 Punto de referencia (Cima)'
                : `🗻 ${distToFuji.toFixed(1)} km hasta la cima`;

            const originParam = userLocation 
                ? `${userLocation.lat},${userLocation.lon}` 
                : 'current_location';
            
            const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${originParam}&destination=${vp.lat},${vp.lon}&travelmode=driving`;

            const isSelected = (vp.lat === activeLat && vp.lon === activeLon);

            const card = document.createElement('div');
            card.className = `transition-all p-4 rounded-2xl border flex items-center justify-between shadow-sm group cursor-pointer ${
                isSelected 
                    ? 'border-sky-500 bg-sky-50/40 ring-1 ring-sky-100' 
                    : 'bg-white/60 hover:bg-white/95 border-slate-100'
            }`;
            
            card.innerHTML = `
                <div class="flex-grow pr-4">
                    <h4 class="text-sm font-bold text-slate-800 leading-tight group-hover:text-sky-700 transition-colors">${vp.name}</h4>
                    <p class="text-[11px] text-slate-400 mt-0.5 leading-snug">${vp.desc}</p>
                    <div class="flex flex-col gap-1 mt-2">
                        ${userLocation ? `<div class="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                            <i data-lucide="navigation-2" class="w-3 h-3 text-slate-400"></i>
                            <span>${distanceText}</span>
                        </div>` : ''}
                        <div class="text-[10px] font-bold text-slate-500">${distToFujiText}</div>
                    </div>
                </div>
                <a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer" class="p-3 bg-sky-50 text-sky-600 rounded-xl hover:bg-sky-600 hover:text-white transition-all shrink-0 shadow-sm active:scale-95 flex items-center justify-center" title="Cómo llegar">
                    <i data-lucide="external-link" class="w-4 h-4"></i>
                </a>
            `;

            // Click listener para seleccionar el mirador
            card.addEventListener('click', (e) => {
                if (e.target.closest('a')) return; // No hacer nada si se hace clic en el enlace de mapas
                activeLat = vp.lat;
                activeLon = vp.lon;
                fetchWeather();
            });

            elViewpointsContainer.appendChild(card);
        });

        lucide.createIcons();
    }

    // Acción del botón Geolocalizar
    elBtnGeolocate.addEventListener('click', () => {
        if (!navigator.geolocation) {
            alert('La geolocalización no es compatible con este navegador.');
            return;
        }

        elGeolocateText.textContent = 'Buscando...';
        elBtnGeolocate.disabled = true;

        navigator.geolocation.getCurrentPosition(
            (position) => {
                userLocation = {
                    lat: position.coords.latitude,
                    lon: position.coords.longitude
                };
                elGeolocateText.textContent = 'GPS Activo';
                elBtnGeolocate.classList.remove('text-sky-600');
                elBtnGeolocate.classList.add('text-emerald-600');
                renderViewpoints();
                updateUserMapMarker();
            },
            (error) => {
                console.error(error);
                elGeolocateText.textContent = 'Error GPS';
                elBtnGeolocate.disabled = false;
                alert('No se pudo acceder a tu ubicación. Asegúrate de dar permisos de GPS a la aplicación.');
            },
            { enableHighAccuracy: true, timeout: 8000 }
        );
    });

    // ----------------------------------------------------
    // Interacciones Rápidas / Overlay Modal
    // ----------------------------------------------------
    elBtnQuickLook.addEventListener('click', () => {
        if (!weatherData) return;

        // Llenar datos de la respuesta rápida
        elQuickPercent.textContent = `${currentScore}%`;
        elQuickResultText.textContent = currentStatus.text;
        elQuickResultBg.className = `py-3 px-6 rounded-2xl w-full text-center ${currentStatus.quickBg}`;
        elQuickTip.textContent = currentStatus.summary;
        elQuickIndicatorCircle.innerHTML = currentStatus.quickEmoji;

        // Mostrar con animación limpia de iOS
        elQuickOverlay.classList.remove('opacity-0', 'pointer-events-none');
        elQuickModalCard.classList.remove('scale-90');
        elQuickModalCard.classList.add('scale-100');
    });

    function closeQuickModal() {
        elQuickOverlay.classList.add('opacity-0', 'pointer-events-none');
        elQuickModalCard.classList.remove('scale-100');
        elQuickModalCard.classList.add('scale-90');
    }

    elBtnCloseQuick.addEventListener('click', closeQuickModal);
    elBtnQuickOk.addEventListener('click', closeQuickModal);
    
    // Cerrar al pulsar fuera de la tarjeta
    elQuickOverlay.addEventListener('click', (e) => {
        if (e.target === elQuickOverlay) closeQuickModal();
    });

    // Botón refrescar
    elBtnRefresh.addEventListener('click', fetchWeather);

    // ----------------------------------------------------
    // Arranque Inicial
    // ----------------------------------------------------
    fetchWeather();
});
