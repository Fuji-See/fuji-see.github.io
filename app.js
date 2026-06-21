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

        // Renderizar Timeline del día y calcular el mejor momento
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

        // Queremos mostrar las próximas 6 ventanas horarias significativas (cada 3-4 horas)
        // Ejemplo: ahora, +3h, +6h, +9h, +12h, +18h, +24h
        const offsets = [0, 3, 6, 9, 12, 18, 24];
        
        offsets.forEach(offset => {
            const idx = startIndex + offset;
            if (idx >= hourly.time.length) return;

            const timeStr = hourly.time[idx];
            const dateObj = new Date(timeStr);
            const formattedTime = dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
            
            const cloudLow = hourly.cloud_cover_low[idx];
            const cloudMid = hourly.cloud_cover_mid[idx];
            const cloudHigh = hourly.cloud_cover_high[idx];
            const cloudTotal = hourly.cloud_cover[idx];
            const hum = hourly.relative_humidity_2m[idx];
            const press = hourly.pressure_msl[idx];
            const wind = hourly.wind_speed_10m[idx];
            const hr = dateObj.getHours();

            const score = calculateFujiVisibility(cloudTotal, cloudLow, cloudMid, cloudHigh, hum, press, wind, hr);
            
            // Buscar el máximo score en las próximas 24 horas para la ventana recomendada
            if (offset <= 24 && score > maxScore) {
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
                <span class="text-xs font-semibold text-slate-500">${offset === 0 ? 'Ahora' : formattedTime}</span>
                <div class="w-12 h-12 rounded-full ${scoreColor} text-white flex flex-col items-center justify-center shadow-inner leading-none">
                    <span class="text-base font-black leading-none">${score}</span>
                    <span class="text-[9px] font-bold opacity-80">%</span>
                </div>
                <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider">${getStatusDetails(score).text}</span>
            `;
            timelineCol.addEventListener('click', () => {
                updateActiveHour(idx);
            });
            elTimelineContainer.appendChild(timelineCol);
        });

        // Actualizar la mejor ventana de visualización recomendada
        const bestDate = new Date(hourly.time[bestIndex]);
        const bestTimeStr = bestDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const bestDay = bestDate.getDate() === new Date().getDate() ? 'Hoy' : 'Mañana';
        
        let recommendationText = '';
        if (maxScore >= 81) {
            recommendationText = `${bestDay} a las ${bestTimeStr} con un excelente ${maxScore}% de visibilidad. ¡Planifica tu viaje!`;
        } else if (maxScore >= 61) {
            recommendationText = `${bestDay} a las ${bestTimeStr} (${maxScore}% de visibilidad). Buenas condiciones de cielo despejado.`;
        } else if (maxScore >= 31) {
            recommendationText = `${bestDay} a las ${bestTimeStr} (${maxScore}%). Condiciones muy inestables. Ve con precaución.`;
        } else {
            recommendationText = 'No se esperan ventanas de buena visibilidad en las próximas 24 horas. El Fuji estará bastante nublado.';
        }

        elTxtBestWindow.textContent = recommendationText;
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
